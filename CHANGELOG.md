# Changelog

All notable changes to Samay will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Per-domain configuration UI (currently YouTube-only)
- Active-mode tracking for non-video sites (Reddit, Twitter, news sites)
- Custom block messages per domain
- Weekly and monthly stats view
- Schedule-based limits (school days vs. weekends)
- CSV export of usage history
- Firefox port

## [1.0.0] - 2026-04-29

### Added
- Initial release
- YouTube playback time tracking — counts only actual video playback, not page idle
- Configurable daily limit (default 30 minutes)
- Stealth blocking overlay with "Screen time limit reached" message
- Password-protected settings via SHA-256 hashing
- Daily auto-reset at midnight via Chrome alarms
- 30-day usage history archived per day
- Per-video logging (URL, title, channel, watch duration)
- Single Page Application (SPA) navigation handling for YouTube
- Manifest V3 service worker architecture
- Local-only data storage (no servers, no analytics)
