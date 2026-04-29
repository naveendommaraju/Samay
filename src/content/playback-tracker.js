// ============================================================
// Samay — Playback Tracker
// ============================================================
// समय (Samay) — "time" in Sanskrit/Hindi
//
// Injected into video sites (currently YouTube).
// Monitors <video> element play/pause state.
// Reports actual playback seconds to background every 5 sec.
// Shows a blocking overlay when daily limit is reached.
// ============================================================

(function () {
  'use strict';

  if (window.__samayInjected) return;
  window.__samayInjected = true;

  // -----------------------------------------------------------
  // State
  // -----------------------------------------------------------
  let isPlaying = false;
  let lastTickTime = null;
  let accumulatedSeconds = 0;
  let blocked = false;
  let overlayElement = null;
  let tickInterval = null;
  let videoElement = null;
  let observer = null;

  const REPORT_INTERVAL_MS = 5000;

  // -----------------------------------------------------------
  // Initialize
  // -----------------------------------------------------------
  init();

  async function init() {
    const status = await sendMessage({ action: 'getStatus' });
    if (status && status.blocked) {
      blocked = true;
      showOverlay();
      pauseVideo();
    }

    findAndMonitorVideo();
    observeNavigation();

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'block') {
        blocked = true;
        showOverlay();
        pauseVideo();
      } else if (msg.action === 'unblock' || msg.action === 'resetDay') {
        blocked = false;
        hideOverlay();
        accumulatedSeconds = 0;
      }
    });
  }

  // -----------------------------------------------------------
  // Video monitoring
  // -----------------------------------------------------------
  function findAndMonitorVideo() {
    const check = () => {
      const vid = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (vid && vid !== videoElement) {
        videoElement = vid;
        attachVideoListeners(vid);
      }
    };

    check();

    if (observer) observer.disconnect();
    observer = new MutationObserver(() => check());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function attachVideoListeners(vid) {
    vid.addEventListener('play', onVideoPlay);
    vid.addEventListener('playing', onVideoPlay);
    vid.addEventListener('pause', onVideoPause);
    vid.addEventListener('ended', onVideoPause);
    vid.addEventListener('waiting', onVideoPause);
    vid.addEventListener('emptied', onVideoPause);

    if (!vid.paused && !vid.ended) {
      onVideoPlay();
    }
  }

  function onVideoPlay() {
    if (blocked) {
      pauseVideo();
      return;
    }
    if (!isPlaying) {
      isPlaying = true;
      lastTickTime = Date.now();
      startTicking();
    }
  }

  function onVideoPause() {
    if (isPlaying) {
      isPlaying = false;
      const now = Date.now();
      if (lastTickTime) {
        accumulatedSeconds += (now - lastTickTime) / 1000;
        lastTickTime = null;
      }
      reportTime();
    }
  }

  function pauseVideo() {
    try {
      const vid = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (vid && !vid.paused) {
        vid.pause();
      }
    } catch (_) {}
  }

  // -----------------------------------------------------------
  // Time tracking & reporting
  // -----------------------------------------------------------
  function startTicking() {
    if (tickInterval) return;
    tickInterval = setInterval(() => {
      if (!isPlaying) {
        clearInterval(tickInterval);
        tickInterval = null;
        return;
      }

      const now = Date.now();
      if (lastTickTime) {
        accumulatedSeconds += (now - lastTickTime) / 1000;
      }
      lastTickTime = now;

      reportTime();
    }, REPORT_INTERVAL_MS);
  }

  async function reportTime() {
    if (accumulatedSeconds < 1) return;

    const seconds = Math.round(accumulatedSeconds);
    accumulatedSeconds = 0;

    const videoInfo = getVideoInfo();

    const response = await sendMessage({
      action: 'reportPlayTime',
      seconds: seconds,
      videoInfo: videoInfo
    });

    if (response && response.blocked) {
      blocked = true;
      showOverlay();
      pauseVideo();
    }
  }

  function getVideoInfo() {
    try {
      const url = window.location.href;
      const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent
        || document.querySelector('#title h1')?.textContent
        || document.querySelector('h1.title')?.textContent
        || document.title.replace(' - YouTube', '');
      const channel = document.querySelector('#channel-name a')?.textContent
        || document.querySelector('ytd-channel-name a')?.textContent
        || '';
      return { url, title: title?.trim(), channel: channel?.trim() };
    } catch (_) {
      return { url: window.location.href, title: document.title, channel: '' };
    }
  }

  // -----------------------------------------------------------
  // SPA navigation observer
  // -----------------------------------------------------------
  function observeNavigation() {
    let lastUrl = location.href;
    const navObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => {
          findAndMonitorVideo();
          if (blocked) {
            showOverlay();
            pauseVideo();
          }
        }, 1000);
      }
    });
    navObserver.observe(document.body, { childList: true, subtree: true });
  }

  // -----------------------------------------------------------
  // Block overlay — minimal, clean message
  // -----------------------------------------------------------
  function showOverlay() {
    if (overlayElement) return;

    overlayElement = document.createElement('div');
    overlayElement.id = 'samay-overlay';
    overlayElement.innerHTML = `
      <div class="samay-overlay-inner">
        <div class="samay-message">Screen time limit reached</div>
      </div>
    `;

    document.body.appendChild(overlayElement);
    hideYouTubePlayer();
  }

  function hideOverlay() {
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
    showYouTubePlayer();
  }

  function hideYouTubePlayer() {
    const player = document.getElementById('movie_player');
    if (player) {
      player.style.setProperty('visibility', 'hidden', 'important');
    }
    const mini = document.querySelector('ytd-miniplayer');
    if (mini) {
      mini.style.setProperty('display', 'none', 'important');
    }
  }

  function showYouTubePlayer() {
    const player = document.getElementById('movie_player');
    if (player) {
      player.style.removeProperty('visibility');
    }
    const mini = document.querySelector('ytd-miniplayer');
    if (mini) {
      mini.style.removeProperty('display');
    }
  }

  // -----------------------------------------------------------
  // Messaging helper
  // -----------------------------------------------------------
  function sendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

})();
