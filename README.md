# समय · Samay

> Time tracking for the web. Built to teach moderation, not to enforce it loudly.

A Chrome extension that tracks **actual time spent** on websites and enforces daily limits. Originally built as a quiet parental control for YouTube, designed from the ground up to extend to any site.

**Samay** (समय) means "time" in Sanskrit and Hindi.

---

## Why Samay?

Most "screen time" tools count time the tab is open. Samay counts time you're **actually using** the site — for video sites, that means real playback seconds, not idle browsing or buffering. When the daily limit hits, the page shows a clean "Screen time limit reached" message instead of an obvious parental-control popup.

Built for parents who want their kids to learn moderation organically, without making restrictions feel like restrictions.

## Features

- ⏱️ **Real playback tracking** — counts active video time, not idle tabs
- 🌐 **Per-domain limits** — currently YouTube, generic architecture for any site
- 🎬 **SPA-aware** — handles YouTube's client-side navigation correctly
- 🔒 **Password-protected settings** — limits can't be changed without auth
- 🎭 **Minimal block overlay** — clean "Screen time limit reached" message
- 📊 **Daily history** — last 30 days of usage stats kept locally
- 🔄 **Auto-reset at midnight** — fresh quota every day
- 💾 **100% local** — no servers, no analytics, no telemetry

## Installation

### Developer mode (current)

1. Clone this repo or download the latest release zip
2. Open `chrome://extensions/`
3. Toggle **Developer mode** ON (top right)
4. Click **Load unpacked**
5. Select the `samay` folder
6. Click the extension icon → set your daily limit → set a password

### Chrome Web Store

*Not yet published — coming after the multi-domain config UI lands.*

## Configuration

Click the extension icon to open the popup. After unlocking with your password (if set):

| Setting | Default | Description |
|---------|---------|-------------|
| Daily Limit | 30 min | Minutes of playback allowed per day |
| Enabled | ON | Master switch — disables all tracking when off |
| Password | None | SHA-256 hashed, locks the settings popup |

## How tracking works

### Playback mode (current — for YouTube)

The content script monitors the `<video>` HTML element's `play`, `pause`, `ended`, and `waiting` events. It accumulates active playback seconds and reports to the background service worker every 5 seconds. Buffering, ads, and pause states do not count toward the limit.

### Active mode (planned — for any site)

Will count time when the tab is in focus and the user has interacted within the last 60 seconds. Idle tabs and unfocused tabs will not count.

### Daily reset

A Chrome alarm fires at midnight every day, archiving the previous day's stats to history (last 30 days kept) and zeroing the counter. All tracked tabs are notified to unblock.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Service Worker (background.js)                          │
│ • Maintains daily counter & block state                 │
│ • Schedules midnight reset alarm                        │
│ • Routes messages between popup and content scripts     │
│ • Persists config + stats to chrome.storage.local       │
└─────────────────────────────────────────────────────────┘
            ▲                              ▲
            │ messages                     │ messages
            ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ Content Script           │   │ Popup UI                 │
│ (playback-tracker.js)    │   │ (popup.html / popup.js)  │
│ • Watches <video> events │   │ • Stats display          │
│ • Reports playback time  │   │ • Settings + password    │
│ • Renders block overlay  │   │ • SHA-256 auth           │
└──────────────────────────┘   └──────────────────────────┘
```

- **Manifest V3** — modern Chrome extension standard
- **Service Worker** — non-persistent background script for state management
- **Content Scripts** — injected per matched domain to monitor activity
- **`chrome.storage.local`** — all configuration and history stored locally
- **Web Crypto API** — SHA-256 password hashing via `crypto.subtle.digest`

## Project Structure

```
samay/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── .gitignore
├── manifest.json
├── src/
│   ├── background.js
│   ├── content/
│   │   └── playback-tracker.js
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   └── overlay/
│       └── overlay.css
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Roadmap

See [CHANGELOG.md](CHANGELOG.md) for the full planned feature list. Key upcoming items:

- [ ] Per-domain configuration UI — add any domain with custom limits
- [ ] Active-mode tracker for non-video sites
- [ ] Custom block messages per domain
- [ ] Weekly / monthly stats view
- [ ] Schedule-based limits (weekday vs. weekend)
- [ ] CSV export of usage history
- [ ] Firefox port

## Privacy

Samay collects nothing. All tracking data — daily watch time, video log, history — is stored exclusively in `chrome.storage.local` on your machine. There is no backend, no analytics, no telemetry, no network traffic of any kind originating from this extension.

## Contributing

Contributions welcome. Please open an issue first to discuss any large changes.

## License

[MIT](LICENSE)

---

*"Time is the most valuable thing a man can spend." — Theophrastus*
