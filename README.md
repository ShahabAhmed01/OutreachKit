# OutreachKit

Open-source Instagram & Facebook DM automation. Scrape commenters, send personalized bulk DMs with daily caps, campaign management, and a modern web dashboard.

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Start the dashboard
npm start
```

Or use the launcher script:

```bash
./start.sh        # Linux / macOS
start.bat         # Windows
```

Open `http://localhost:3000` in your browser.

### Linux (CachyOS / Arch and other distros)

Install Node.js with your package manager:

```bash
sudo pacman -S nodejs npm      # CachyOS / Arch
```

Playwright's Chromium may need extra system libraries — install them once:

```bash
npx playwright install-deps chromium   # requires sudo
```

Then run `./start.sh` or `npm start` as above.

## Features

- **Multi-platform** — Instagram & Facebook DM automation
- **Campaign management** — Create, run, pause, and track multiple campaigns
- **Smart scraping** — Extract commenters from posts and reels via GraphQL
- **Personalized outreach** — Template variables: `{username}`, `{comment}`, `{link}`
- **Safety built-in** — Daily caps, configurable delays, schedule windows, consecutive failure pauses
- **Comment filtering** — Keyword-based targeting for qualified leads
- **Inbox scanning** — Auto-detect replies and mark contacted users
- **Backup & restore** — One-click data backup and restore
- **Modern dashboard** — Real-time SSE updates, glassmorphism UI

## Architecture

```
src/
├── server.js       # Express HTTP server + API routes
├── config.js       # Config loading and sanitization
├── csv.js          # CSV parsing and writing
├── campaign.js     # Campaign CRUD operations
├── scrape.js       # Instagram/Facebook GraphQL scraping
├── send.js         # DM sending logic
├── inbox.js        # Inbox scanning for replies
├── auth.js         # Login and session detection
├── validator.js    # Input validation helpers
└── security.js     # Security helpers (path traversal, sanitize)
gui/
├── server.js       # Server entry point
├── index.html      # Dashboard HTML
├── app.js          # Frontend JavaScript
└── app.css         # Dashboard styles
```

## Configuration

Edit `config.json` in the project root:

```json
{
  "dailyCap": 50,
  "delayMinSec": 60,
  "delayMaxSec": 120,
  "pauseOnConsecutiveFailures": 3,
  "pauseMinutes": 30,
  "messages": {
    "openers": ["Hey {username}, great post!"],
    "questions": ["What do you think about {comment}?"]
  },
  "commentFilter": {
    "enabled": false,
    "keywords": []
  },
  "schedule": {
    "enabled": false,
    "start": "09:00",
    "end": "22:30"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | `production` enables stricter security |

## Scripts

```bash
npm start          # Start the dashboard
npm test           # Run tests
npm run test:server    # Run server integration tests
npm run test:coverage  # Run tests with coverage
npm run lint       # Lint source files
npm run format     # Format code with Prettier
npm run dist       # Build distribution package
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © 2026 Shahab Ahmed
