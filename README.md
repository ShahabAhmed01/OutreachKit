# LeadLoop — Open-Source Instagram & Facebook DM Automation

> **Automate Instagram and Facebook outreach** — scrape reel commenters, send personalized bulk DMs with daily caps, campaign management, and a modern glassmorphism web dashboard.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-blue.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

**LeadLoop** is a free, open-source **Instagram DM automation tool** and **Facebook DM bot** that turns commenters on your reels and posts into warm leads through personalized, paced direct message campaigns.

---

## Why LeadLoop?

Most **Instagram outreach tools** are expensive SaaS products that store your data on their servers. LeadLoop is:

- **100% local-first** — your session, leads, and data never leave your machine
- **Free & open-source** — MIT licensed, no hidden fees, no subscriptions
- **Multi-platform** — works on **Instagram** and **Facebook**
- **Multi-campaign** — run multiple outreach campaigns simultaneously
- **Resume-safe** — stop and resume anytime without losing progress
- **Modern UI** — glassmorphism dashboard with real-time live logs

---

## Features

| Feature | Description |
|---------|-------------|
| **Comment-to-DM Pipeline** | Scrape every commenter from a reel, filter and send personalized DMs |
| **Multi-Campaign Manager** | Create, pause, resume, and delete campaigns from the dashboard |
| **Message Variant System** | Multiple text + follow-up variants, randomly picked per lead for natural outreach |
| **Daily Cap & Scheduling** | Timezone-aware daily limits (default 50/day) with optional send windows |
| **Facebook Support** | Full Facebook reel/page scraping and DM sending via Playwright |
| **Keyword Filtering** | Skip commenters mentioning banned keywords |
| **Already-Contacted Detection** | Auto-detect previously messaged users and people who replied |
| **Glassmorphism Dashboard** | Modern dark UI with bento grid stats, pipeline steps, and live console |
| **Backup & Restore** | One-click backup/restore of all campaign data |
| **Lead Export** | Download your lead table as CSV |
| **Campaign Wizard** | Step-by-step wizard: paste URL → scrape → compose messages → launch |
| **Real-Time Logs** | Server-Sent Events (SSE) streaming to the browser console |

---

## Screenshots

> **Dashboard** — Bento grid stats, active campaign overview, and quick actions
> ![Dashboard](screenshots/dashboard.png)

> **Campaign Wizard** — 3-step flow: URL → Scrape → Compose & Launch
> ![Wizard](screenshots/wizard.png)

> **Campaigns View** — Manage all your outreach campaigns in one place
> ![Campaigns](screenshots/campaigns.png)

> **Live Console** — Real-time SSE-powered log streaming
> ![Console](screenshots/console.png)

> **Settings** — Configuration, session management, and data controls
> ![Settings](screenshots/settings.png)

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) 18 or higher
- Windows, macOS, or Linux

### Installation

```bash
# Clone the repository
git clone https://github.com/ShahabAhmed01/LeadLoop.git
cd LeadLoop

# Install dependencies
npm install

# Install Playwright browsers (one-time)
npx playwright install chromium
```

### Launch

```bash
# Start the web dashboard
npm run gui

# Open http://localhost:4876 in your browser
```

Or on Windows, double-click `start.bat`.

---

## How It Works

### Step 1: Connect Your Account

Open the GUI → Settings → click **Open Login Window** → log into your Instagram or Facebook business account in the browser that appears → close it. Your session is saved locally in `profile/`.

### Step 2: Create a Campaign

Click **New Campaign** in the dashboard. The wizard walks you through:

1. **Name & Platform** — name your campaign and choose Instagram or Facebook
2. **Paste URL** — drop in a reel/post URL to scrape commenters
3. **Compose Messages** — write your opener + follow-up variants with `{username}`, `{comment}`, `{link}` placeholders

### Step 3: Launch

- **Dry Run** — preview what would be sent without actually sending
- **Start Campaign** — sends DMs at a paced rate with daily caps and random delays

### Step 4: Monitor

Watch the live console for real-time progress. Pause or stop anytime — progress is saved automatically.

---

## Campaign Data Structure

Each campaign lives in its own isolated directory:

```
data/campaigns/
  └── c_xxxxx/
      ├── campaign.json          # Campaign config, status, message templates
      ├── commenters.csv         # Scraped leads (username, comment, date)
      ├── sent.csv               # Already sent DMs (skip list)
      ├── already-contacted.csv  # Previously messaged users
      └── replied.csv            # Users who replied (never re-messaged)
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run gui` | Start the web dashboard on port 4876 |
| `npm run login` | Open the login browser manually |
| `npm run scrape` | Scrape commenters from the active campaign |
| `npm run scan` | Detect already-messaged and replied users |
| `npm run send` | Run the campaign (add `--dry` to preview) |
| `npm run report` | Print lead/sent/remaining summary |
| `npm run session` | Headless session validity check |
| `npm test` | Run unit tests |

All CLI commands support `--campaign <id>` to target a specific campaign.

---

## Configuration

Edit settings via the GUI Settings panel or directly in `config.json`:

| Field | Default | Description |
|-------|---------|-------------|
| `dailyCap` | `50` | Max DMs per day |
| `delayMinSec` | `60` | Minimum delay between sends (seconds) |
| `delayMaxSec` | `120` | Maximum delay between sends (seconds) |
| `pauseOnConsecutiveFailures` | `3` | Auto-pause after N failures |
| `pauseMinutes` | `30` | Minutes to pause on action block |
| `commentFilter.enabled` | `false` | Enable keyword filtering |
| `commentFilter.keywords` | `[]` | Keywords to skip |
| `schedule.enabled` | `false` | Enable send schedule |
| `schedule.start` | `"09:00"` | Schedule start time (local) |
| `schedule.end` | `"23:00"` | Schedule end time (local) |
| `ownerUsername` | `""` | Your username (always excluded) |

---

## Message Placeholders

Use these in your message templates:

| Placeholder | Replaced With |
|-------------|---------------|
| `{username}` | The commenter's Instagram/Facebook username |
| `{comment}` | The comment they left on the reel/post |
| `{link}` | The reel/post URL |

**Example:**
```
Hey {username}! Loved your comment "{comment}" — would love to chat more about it!
```

---

## Tech Stack

- **Runtime:** Node.js (CommonJS)
- **Browser Automation:** Playwright
- **Frontend:** Vanilla HTML/CSS/JS with glassmorphism UI
- **Server:** Pure Node.js HTTP server with SSE
- **Data:** Local CSV files, no external database

---

## Project Structure

```
LeadLoop/
├── gui/
│   ├── index.html        # Dashboard SPA
│   ├── app.css           # Glassmorphism dark theme
│   ├── app.js            # Frontend logic & campaign wizard
│   └── server.js         # REST API server (port 4876)
├── src/
│   ├── lib.js            # Core library — campaign CRUD, CSV, config
│   ├── scrape.js         # Instagram/Facebook comment scraper
│   ├── send.js           # DM sender with variant system
│   ├── report.js         # Campaign reporting
│   ├── scan-inbox.js     # Inbox scanner (already-contacted/replied)
│   ├── login.js          # Browser login helper
│   └── session.js        # Session validity checker
├── scripts/
│   └── build.js          # Build distributable ZIP
├── test/
│   ├── lib.test.js       # Core library tests
│   ├── test-all-lib.js   # Comprehensive lib tests
│   ├── test-send.js      # Send module tests
│   ├── test-server.js    # API endpoint tests
│   └── test-edge.js      # Edge case tests
├── config.json           # Default configuration
├── start.bat             # Windows one-click launcher
├── package.json
├── LICENSE               # MIT
└── README.md
```

---

## Building a Distributable

```bash
npm run dist
```

Creates `dist/leadloop-<version>/` and a `.zip` — share the zip, recipients run `start.bat`.

---

## Safety & Disclaimer

> **⚠️ Important:** This tool performs browser automation on Instagram and Facebook. Automated messaging violates the Terms of Service of these platforms. Use at your own risk.

**Best practices:**
- Keep the default daily cap (50 DMs/day) or lower it
- Use multiple message variants to avoid detection patterns
- Pause if you see "possible action block" and wait 24 hours
- Never include links in the first message
- Check [instagram.com/accounts/status](https://instagram.com/accounts/status) regularly

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

## SEO Tags

*Instagram DM automation, Facebook DM bot, Instagram outreach tool, comment-to-DM automation, bulk DM sender, Instagram lead generation, social media automation, Instagram marketing tool, DM campaign manager, automated Instagram messaging, open-source Instagram bot, lead scraping tool, Instagram reel comment scraper, Facebook lead generation, DM outreach software, Instagram DM bot free, automated DM campaigns, Instagram engagement bot, lead generation automation, social media outreach tool*
