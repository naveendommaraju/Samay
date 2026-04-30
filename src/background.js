// ============================================================
// Samay — Background Service Worker
// ============================================================
// समय (Samay) — "time" in Sanskrit/Hindi
//
// Tracks cumulative website usage time across all tabs.
// Enforces a configurable daily limit per domain.
// Resets counters at midnight every day.
// Logs each video/page visited with URL, title, and duration.
// ============================================================

const DEFAULT_CONFIG = {
  dailyLimitMinutes: 30,
  passwordHash: null,       // SHA-256 hash of the settings password
  enabled: true,
};

// -----------------------------------------------------------
// Initialization
// -----------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(['config', 'todayStats']);

  if (!existing.config) {
    await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  }

  if (!existing.todayStats || existing.todayStats.date !== getTodayDateStr()) {
    await resetDailyStats();
  }

  scheduleMidnightReset();
});

chrome.runtime.onStartup.addListener(async () => {
  const { todayStats } = await chrome.storage.local.get('todayStats');
  if (!todayStats || todayStats.date !== getTodayDateStr()) {
    await resetDailyStats();
  }
  scheduleMidnightReset();
});

// -----------------------------------------------------------
// Alarm: midnight daily reset
// -----------------------------------------------------------
function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const delayMs = midnight.getTime() - now.getTime();

  chrome.alarms.create('midnightReset', {
    when: Date.now() + delayMs,
    periodInMinutes: 1440
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'midnightReset') {
    await resetDailyStats();
    notifyAllTrackedTabs({ action: 'resetDay' });
  }
});

async function resetDailyStats() {
  const { todayStats, history } = await chrome.storage.local.get(['todayStats', 'history']);

  let updatedHistory = history || [];
  if (todayStats && todayStats.date && todayStats.totalPlaySeconds > 0) {
    updatedHistory.push({
      date: todayStats.date,
      totalPlaySeconds: todayStats.totalPlaySeconds,
      videosWatched: todayStats.videosWatched || [],
      blocked: todayStats.blocked || false
    });
    if (updatedHistory.length > 30) {
      updatedHistory = updatedHistory.slice(-30);
    }
  }

  await chrome.storage.local.set({
    todayStats: {
      date: getTodayDateStr(),
      totalPlaySeconds: 0,
      videosWatched: [],
      blocked: false,
      lastActiveTabId: null,
    },
    history: updatedHistory
  });
}

// -----------------------------------------------------------
// Message handling from content scripts
// -----------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true;
});

async function handleMessage(msg, sender) {
  const { config } = await chrome.storage.local.get('config');
  const cfg = config || DEFAULT_CONFIG;

  switch (msg.action) {

    case 'reportPlayTime': {
      if (!cfg.enabled) return { status: 'disabled' };

      const { todayStats } = await chrome.storage.local.get('todayStats');
      const stats = todayStats || { date: getTodayDateStr(), totalPlaySeconds: 0, videosWatched: [], blocked: false };

      if (stats.date !== getTodayDateStr()) {
        await resetDailyStats();
        return { status: 'ok', blocked: false, remainingSeconds: cfg.dailyLimitMinutes * 60 };
      }

      stats.totalPlaySeconds += msg.seconds || 0;

      if (msg.videoInfo && msg.videoInfo.url) {
        const exists = stats.videosWatched.find(v => v.url === msg.videoInfo.url);
        if (exists) {
          exists.playSeconds += msg.seconds || 0;
          exists.lastSeen = Date.now();

          // Refresh metadata if a later report has better data than what was first captured.
          // YouTube loads the channel name asynchronously after the video starts, so the
          // first report often misses it.
          if (msg.videoInfo.title && msg.videoInfo.title !== 'Unknown'
              && (!exists.title || exists.title === 'Unknown')) {
            exists.title = msg.videoInfo.title;
          }
          if (msg.videoInfo.channel && msg.videoInfo.channel !== 'Unknown'
              && (!exists.channel || exists.channel === 'Unknown' || exists.channel === '')) {
            exists.channel = msg.videoInfo.channel;
          }
        } else {
          stats.videosWatched.push({
            url: msg.videoInfo.url,
            title: msg.videoInfo.title || 'Unknown',
            channel: msg.videoInfo.channel || 'Unknown',
            startedAt: Date.now(),
            lastSeen: Date.now(),
            playSeconds: msg.seconds || 0
          });
        }
      }

      const limitSeconds = cfg.dailyLimitMinutes * 60;
      const remaining = limitSeconds - stats.totalPlaySeconds;

      if (remaining <= 0) {
        stats.blocked = true;
      }

      await chrome.storage.local.set({ todayStats: stats });

      return {
        status: 'ok',
        blocked: stats.blocked,
        remainingSeconds: Math.max(0, remaining),
        totalPlaySeconds: stats.totalPlaySeconds,
        limitSeconds: limitSeconds
      };
    }

    case 'getStatus': {
      const { todayStats } = await chrome.storage.local.get('todayStats');
      const stats = todayStats || { date: getTodayDateStr(), totalPlaySeconds: 0, blocked: false };

      if (stats.date !== getTodayDateStr()) {
        await resetDailyStats();
        return { blocked: false, remainingSeconds: cfg.dailyLimitMinutes * 60, totalPlaySeconds: 0 };
      }

      const limitSeconds = cfg.dailyLimitMinutes * 60;
      const remaining = limitSeconds - stats.totalPlaySeconds;

      return {
        blocked: stats.blocked || remaining <= 0,
        remainingSeconds: Math.max(0, remaining),
        totalPlaySeconds: stats.totalPlaySeconds,
        limitSeconds: limitSeconds,
        enabled: cfg.enabled
      };
    }

    case 'getFullData': {
      const data = await chrome.storage.local.get(['config', 'todayStats', 'history']);
      return data;
    }

    case 'updateConfig': {
      const { config: currentConfig } = await chrome.storage.local.get('config');
      const cur = currentConfig || DEFAULT_CONFIG;

      if (cur.passwordHash && msg.passwordHash !== cur.passwordHash) {
        return { error: 'Invalid password' };
      }

      const newConfig = { ...cur, ...msg.newConfig };
      await chrome.storage.local.set({ config: newConfig });

      if (msg.newConfig.dailyLimitMinutes !== undefined) {
        const { todayStats } = await chrome.storage.local.get('todayStats');
        if (todayStats) {
          const newLimit = newConfig.dailyLimitMinutes * 60;
          todayStats.blocked = todayStats.totalPlaySeconds >= newLimit;
          await chrome.storage.local.set({ todayStats });
          if (todayStats.blocked) {
            notifyAllTrackedTabs({ action: 'block' });
          } else {
            notifyAllTrackedTabs({ action: 'unblock' });
          }
        }
      }

      return { status: 'ok' };
    }

    case 'setPassword': {
      const { config: curConfig } = await chrome.storage.local.get('config');
      const c = curConfig || DEFAULT_CONFIG;

      if (c.passwordHash && msg.oldPasswordHash !== c.passwordHash) {
        return { error: 'Invalid current password' };
      }

      c.passwordHash = msg.newPasswordHash;
      await chrome.storage.local.set({ config: c });
      return { status: 'ok' };
    }

    case 'verifyPassword': {
      const { config: cc } = await chrome.storage.local.get('config');
      if (!cc || !cc.passwordHash) return { valid: true, noPassword: true };
      return { valid: msg.passwordHash === cc.passwordHash, noPassword: false };
    }

    case 'manualReset': {
      const { config: rc } = await chrome.storage.local.get('config');
      if (rc && rc.passwordHash && msg.passwordHash !== rc.passwordHash) {
        return { error: 'Invalid password' };
      }

      // Manual reset clears the time counter so the user can keep watching,
      // but preserves the videos-watched list (it's a journal of today's
      // activity, not part of the limit accounting).
      const { todayStats } = await chrome.storage.local.get('todayStats');
      const stats = todayStats || {
        date: getTodayDateStr(),
        totalPlaySeconds: 0,
        videosWatched: [],
        blocked: false,
      };
      stats.date = getTodayDateStr();
      stats.totalPlaySeconds = 0;
      stats.blocked = false;
      stats.lastActiveTabId = null;
      await chrome.storage.local.set({ todayStats: stats });

      notifyAllTrackedTabs({ action: 'resetDay' });
      return { status: 'ok' };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// -----------------------------------------------------------
// Utilities
// -----------------------------------------------------------
function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function notifyAllTrackedTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (_) {}
    }
  } catch (_) {}
}
