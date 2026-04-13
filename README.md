# JotBot

A command-driven WhatsApp assistant that creates Google Calendar events and saves notes — powered by Google Apps Script and Gemini AI.

Send a WhatsApp message like `#add event Team sync tomorrow 3pm` and JotBot creates the Calendar event and replies with a confirmation. Send `#list today` or `#agenda` to see today's events. Send `#note` to save a quick note to Google Sheets.

## How it works

```
WhatsApp message → Meta webhook → Apps Script → Gemini AI → Google Calendar / Sheets → WhatsApp reply
```

The app runs entirely on Google Apps Script (no server required). Code lives in this repo and is pushed to Apps Script using [clasp](https://github.com/google/clasp).

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v16+) — only needed for the clasp CLI
- [clasp](https://github.com/google/clasp) installed globally: `npm install -g @google/clasp`
- A Google account with [Apps Script API enabled](https://script.google.com/home/usersettings)
- A [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) app with a phone number
- A [Gemini API key](https://aistudio.google.com/app/apikey)

---

## Local setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd JotBot
```

### 2. Install dependencies

```bash
npm install
```

This installs the local clasp CLI used by the npm scripts.

### 3. Authenticate clasp

```bash
clasp login
```

This opens a browser window. Log in with the same Google account that owns the Apps Script project. After approving, clasp saves credentials to `~/.clasprc.json`.

---

## Connecting to Apps Script

### First time — create a new Apps Script project

1. Go to [script.google.com](https://script.google.com) and create a new project.
2. Copy the **Script ID** from **Project Settings** (the long string in the URL or under "IDs").
3. Open `.clasp.json` at the project root and replace the placeholder:

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "apps-script"
}
```

### Push code to Apps Script

```bash
npm run push
```

This syncs all files from `apps-script/` to your Apps Script project. Run this every time you make a code change.

Other useful commands:

```bash
npm run pull    # pull remote changes back into apps-script/
npm run deploy  # create a new versioned deployment
npm run open    # open the project in the Apps Script editor
```

---

## Configure Script Properties

In the Apps Script editor, go to **Project Settings → Script properties** and add the following:

| Property | Description |
|---|---|
| `WA_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token |
| `WA_PHONE_NUMBER_ID` | WhatsApp phone number ID from Meta dashboard |
| `WA_VERIFY_TOKEN` | Any secret string — used to verify the webhook |
| `WA_API_VERSION` | Default: `v21.0` |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Default: `gemini-2.0-flash` |
| `SELF_WHATSAPP_NUMBER` | Your WhatsApp number with country code (e.g. `15551234567`) |
| `ENFORCE_SELF_ONLY` | `true` to restrict to your number only (recommended to start) |
| `DEFAULT_TIMEZONE` | IANA timezone string (e.g. `America/New_York`) |
| `DEFAULT_DURATION_MINUTES` | Default event length in minutes (e.g. `60`) |
| `DEFAULT_CALENDAR_ID` | Google Calendar ID or `primary` |
| `CALENDAR_MAP_JSON` | Optional: `{"work":"id@group.calendar.google.com"}` |
| `COLOR_MAP_JSON` | Optional: `{"meeting":"PALE_BLUE","priority":"RED"}` |
| `NOTES_SHEET_ID` | Google Sheet ID to save `#note` entries |
| `NOTES_SHEET_NAME` | Sheet tab name, default: `Notes` |
| `DEAD_LETTER_SHEET_ID` | Optional: Sheet ID to log failures |
| `IDEMPOTENCY_TTL_SECONDS` | Default: `21600` (6 hours) |

See `.env` for the full list of property names.

---

## Deploy and register the webhook

### 1. Deploy as a Web App

In the Apps Script editor: **Deploy → New deployment → Web app**
- Execute as: **Me**
- Who has access: **Anyone**

Copy the deployment URL.

> Re-deploy after every `npm run push` to pick up code changes — use **Deploy → Manage deployments → Edit** and create a new version.

### 2. Register the webhook with Meta

In the [Meta Developer Dashboard](https://developers.facebook.com):
1. Go to your WhatsApp app → **Configuration → Webhooks**
2. Set **Callback URL** to your Apps Script deployment URL
3. Set **Verify token** to the value of `WA_VERIFY_TOKEN`
4. Click **Verify and Save**, then subscribe to the `messages` field

### 3. Smoke test

Send this from your WhatsApp number to your JotBot number:

```
#add event Team sync tomorrow 8:30 pm high priority remind me 20 min
```

Expected response: `Added: Team sync — Tue, Apr 8 8:30 PM`

---

## Commands

| Command | What it does |
|---|---|
| `#add event <details>` | Creates a Google Calendar event |
| `#addevent` / `#event` | Aliases for `#add event` |
| `#list today` / `#agenda` | Lists today's events from the configured Google Calendar |
| `#note <text>` | Saves a note to Google Sheets |
| `#jot <text>` | Alias for `#note` |

See [docs/commands.md](docs/commands.md) for full syntax, hints, and examples.

---

## Project structure

```
JotBot/
├── apps-script/          # All Apps Script source files
│   ├── Code.gs           # Webhook entry point and command router
│   ├── config.gs         # Reads Script Properties
│   ├── rules.gs          # Command detection, validation, messages
│   ├── gemini.gs         # Gemini AI extraction
│   ├── calendar.gs       # Google Calendar integration
│   ├── whatsapp.gs       # WhatsApp Cloud API integration
│   ├── notes.gs          # Google Sheets notes storage
│   ├── appsscript.json   # Apps Script manifest
│   └── tests/            # Manual test cases
├── docs/
│   ├── architecture.md   # System design and extensibility notes
│   ├── commands.md       # User-facing command reference
│   └── setup.md          # Detailed setup guide
├── .clasp.json           # clasp project config (scriptId + rootDir)
├── .env                  # Script property names reference (no real secrets)
└── package.json          # npm scripts for clasp push/pull/deploy
```
