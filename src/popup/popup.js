// ============================================================
// Samay — Popup Script
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  checkPasswordAndInit();
});

// -----------------------------------------------------------
// SHA-256 hashing utility
// -----------------------------------------------------------
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// -----------------------------------------------------------
// Password check on popup open
// -----------------------------------------------------------
async function checkPasswordAndInit() {
  const response = await chrome.runtime.sendMessage({ action: 'verifyPassword' });

  if (response && !response.noPassword) {
    document.getElementById('lockScreen').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';

    const lockInput = document.getElementById('lockPassword');
    lockInput.focus();

    document.getElementById('unlockBtn').addEventListener('click', async () => {
      const pw = lockInput.value;
      if (!pw) return;
      const hash = await hashPassword(pw);
      const verify = await chrome.runtime.sendMessage({
        action: 'verifyPassword',
        passwordHash: hash
      });
      if (verify && verify.valid) {
        document.getElementById('lockScreen').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        window.__currentPasswordHash = hash;
        loadData();
      } else {
        document.getElementById('lockError').textContent = 'Wrong password';
        lockInput.value = '';
        lockInput.focus();
      }
    });

    lockInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('unlockBtn').click();
    });
  } else {
    document.getElementById('lockScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    window.__currentPasswordHash = null;
    loadData();
  }
}

// -----------------------------------------------------------
// Load and display all data
// -----------------------------------------------------------
async function loadData() {
  const data = await chrome.runtime.sendMessage({ action: 'getFullData' });
  if (!data) return;

  const config = data.config || {};
  const stats = data.todayStats || { totalPlaySeconds: 0, videosWatched: [], blocked: false };
  const limitMinutes = config.dailyLimitMinutes || 30;
  const limitSeconds = limitMinutes * 60;

  const totalSec = stats.totalPlaySeconds || 0;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.round(totalSec % 60);
  document.getElementById('timeMinutes').textContent = mins;
  document.getElementById('timeSeconds').textContent = String(secs).padStart(2, '0');

  const pct = Math.min(100, (totalSec / limitSeconds) * 100);
  const bar = document.getElementById('progressBar');
  bar.style.width = pct + '%';
  bar.className = 'progress-bar ' + (pct < 60 ? 'safe' : pct < 85 ? 'warning' : 'danger');

  const remaining = Math.max(0, limitSeconds - totalSec);
  const remMins = Math.floor(remaining / 60);
  const remSecs = Math.round(remaining % 60);
  document.getElementById('remainingText').textContent =
    remaining > 0 ? `${remMins}m ${remSecs}s remaining` : 'Limit reached!';
  document.getElementById('limitText').textContent = `Limit: ${limitMinutes}m`;

  const badge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  if (!config.enabled) {
    badge.className = 'status-badge disabled';
    statusText.textContent = 'Disabled';
  } else if (stats.blocked || remaining <= 0) {
    badge.className = 'status-badge blocked';
    statusText.textContent = 'Blocked';
  } else {
    badge.className = 'status-badge active';
    statusText.textContent = 'Tracking';
  }

  const videosList = document.getElementById('videosList');
  const videos = stats.videosWatched || [];
  if (videos.length === 0) {
    videosList.innerHTML = '<div class="no-videos">No videos watched yet today</div>';
  } else {
    videosList.innerHTML = videos.map(v => {
      const vMins = Math.floor((v.playSeconds || 0) / 60);
      const vSecs = Math.round((v.playSeconds || 0) % 60);
      return `
        <div class="video-item">
          <div class="video-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
          <div class="video-meta">
            <span>${escapeHtml(v.channel)}</span>
            <span>${vMins}m ${vSecs}s played</span>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('limitInput').value = limitMinutes;
  document.getElementById('enabledToggle').checked = config.enabled !== false;

  bindEvents();
}

// -----------------------------------------------------------
// Event bindings
// -----------------------------------------------------------
function bindEvents() {
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const newConfig = {
      dailyLimitMinutes: parseInt(document.getElementById('limitInput').value, 10) || 30,
      enabled: document.getElementById('enabledToggle').checked,
    };

    const response = await chrome.runtime.sendMessage({
      action: 'updateConfig',
      newConfig,
      passwordHash: window.__currentPasswordHash
    });

    if (response && response.error) {
      alert(response.error);
    } else {
      const btn = document.getElementById('saveBtn');
      btn.textContent = '✓ Saved';
      setTimeout(() => { btn.textContent = 'Save Settings'; }, 1500);
      loadData();
    }
  });

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!confirm('Reset today\'s watch time to zero?')) return;

    const response = await chrome.runtime.sendMessage({
      action: 'manualReset',
      passwordHash: window.__currentPasswordHash
    });

    if (response && response.error) {
      alert(response.error);
    } else {
      loadData();
    }
  });

  document.getElementById('setPasswordBtn').addEventListener('click', async () => {
    const newPw = document.getElementById('newPassword').value;
    const confirmPw = document.getElementById('confirmPassword').value;
    const msgEl = document.getElementById('passwordMsg');

    if (newPw && newPw !== confirmPw) {
      msgEl.className = 'password-msg error';
      msgEl.textContent = 'Passwords do not match';
      return;
    }

    const newHash = newPw ? await hashPassword(newPw) : null;

    const response = await chrome.runtime.sendMessage({
      action: 'setPassword',
      oldPasswordHash: window.__currentPasswordHash,
      newPasswordHash: newHash
    });

    if (response && response.error) {
      msgEl.className = 'password-msg error';
      msgEl.textContent = response.error;
    } else {
      msgEl.className = 'password-msg success';
      if (newHash) {
        msgEl.textContent = 'Password set. Required for next access.';
        window.__currentPasswordHash = newHash;
      } else {
        msgEl.textContent = 'Password removed.';
        window.__currentPasswordHash = null;
      }
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    }
  });
}

// -----------------------------------------------------------
// Utility
// -----------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
