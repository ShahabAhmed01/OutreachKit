# Changelog

All notable changes to OutreachKit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-08-22

### Added

- Initial public release of OutreachKit
- Instagram & Facebook comment-to-DM scraping pipeline
- Multi-campaign management with message variants and follow-ups
- Daily caps, configurable delays, schedule windows, keyword filtering
- Inbox scanning for reply detection and already-contacted tracking
- Glassmorphism web dashboard with live SSE logs and campaign pipeline
- Campaign creation wizard, backup/restore, lead CSV export
- Windows (`start.bat`) and Linux/macOS (`start.sh`) launchers
- Inno Setup installer script (`scripts/installer.iss`)
- MIT License

### Security

- Helmet security headers, CORS, and Express rate limiting (100 req/min)
- Input validation on all API routes
- Path traversal prevention for static file serving and backup restore
- `.gitignore` excludes `data/`, `profile/`, `node_modules/`, and `.env`

### Testing

- Unit tests for config sanitization, CSV round-trip, campaign CRUD, message sequencing
- Server API integration tests for all routes
- Edge case tests: corrupt config, corrupt CSV, missing data dir, extreme values

## Unreleased

### Changed

- Fixed `activeCampaign` referencing a nonexistent campaign in `config.json`
- Reset `delayMinSec`/`delayMaxSec` to documented defaults (60s / 120s)

### Fixed

- `campaign.js`: `postUrl` → `url` field name so campaigns created via the wizard can be scraped
- `campaign.js`: `text1`/`text2`/`followups` stored at campaign top level (matching `send.js` and API expectations)
- `validator.js`: `login`/`connect` added to valid job names
- `gui/app.js`: settings form key mapping (`minDelay` → `delayMinSec`, `maxDelay` → `delayMaxSec`, `messagePause` → `pauseMinutes`)
- `server.js`: CORS origin now uses `PORT` env var instead of hardcoded `:3000`
- `server.js`: `/api/log ?n` parameter clamped to 1–5000 with NaN protection
- `send.js`: removed redundant ternaries and dead `sentFile` references
- `browser.js`: renamed shadowed parameters (`url`/`body` → `targetUrl`/`postData`)
- Removed unused `uuid` dependency
- Pinned `qs` to 6.17.1 via `overrides` to resolve dependency advisories

### CI

- Lint and format checks now fail the build (removed `continue-on-error`)
- Added `permissions: contents: read` and concurrency controls
