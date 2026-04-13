# JotBot

A command-driven WhatsApp assistant that creates Google Calendar events and saves notes — powered by Google Apps Script and Gemini AI.

Send a WhatsApp message like `#add event Team sync tomorrow 3pm` and JotBot creates the Calendar event and replies with a confirmation. Send `#note` to save a quick note to Google Sheets.

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
- A [Gemini API key](https://aistudio.google.com/apikey) (standard `AIzaSy...` key, **not** service-account-bound)
- **(Optional)** A [GCP project](https://console.cloud.google.com) with Firestore for scalable idempotency

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

All configuration lives in the `.env` file at the repo root. You can sync it to Apps Script in one step:

```bash
npm run sync-env
```

This generates a temporary `_syncProps.gs` file, pushes it to Apps Script, and you run `_syncAllProperties()` from the editor. Afterwards clean up with `npm run sync-env-cleanup`.

Alternatively, set properties manually in **Project Settings → Script properties**.

### Core properties

| Property | Description |
|---|---|
| `WA_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token |
| `WA_PHONE_NUMBER_ID` | WhatsApp phone number ID from Meta dashboard |
| `WA_VERIFY_TOKEN` | Any secret string — used to verify the webhook |
| `WA_API_VERSION` | Default: `v21.0` |
| `GEMINI_API_KEY` | Google Gemini API key (`AIzaSy...` from [AI Studio](https://aistudio.google.com/apikey)) |
| `GEMINI_MODEL` | Default: `gemini-2.5-flash` |
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

### Firestore idempotency (optional, recommended)

Without Firestore, idempotency records are stored in Script Properties, which grow unboundedly. Firestore + TTL auto-cleans old records.

| Property | Description |
|---|---|
| `FIRESTORE_PROJECT_ID` | Your GCP project id |
| `FIRESTORE_DATABASE_ID` | Firestore database name (default: `(default)`) |
| `FIRESTORE_IDEMPOTENCY_COLLECTION` | Collection name (default: `jotbot_idempotency`) |
| `GCP_SERVICE_ACCOUNT_JSON` | Full JSON key of a service account with **Cloud Datastore User** role |

When these are not set, the legacy Script Properties fallback is used automatically.

See [docs/setup.md](docs/setup.md) for detailed GCP setup instructions.

---

## Deploy and register the webhook

### 1. Link GCP project

In the Apps Script editor: **Project Settings → Google Cloud Platform (GCP) Project → Change project** and enter your GCP project number. This enables Firestore and Stackdriver logging.

### 2. Deploy as a Web App

In the Apps Script editor (**not** the CLI): **Deploy → New deployment → Web app**
- Execute as: **Me**
- Who has access: **Anyone**

Copy the deployment URL.

> **Important:** `clasp deploy` from the CLI does not set access permissions. Always deploy or update from the editor UI.
>
> After every `npm run push`, update the deployment: **Deploy → Manage deployments → Edit → New version → Deploy**.

### 3. Register the webhook with Meta

In the [Meta Developer Dashboard](https://developers.facebook.com):
1. Go to your WhatsApp app → **Configuration → Webhooks**
2. Set **Callback URL** to your Apps Script deployment URL
3. Set **Verify token** to the value of `WA_VERIFY_TOKEN`
4. Click **Verify and Save**, then subscribe to the `messages` field

### 4. Smoke test

Send this from your WhatsApp number to your JotBot number:

```
#add event Team sync tomorrow 8:30 pm high priority remind me 20 min
```

Expected response: `Added: Team sync — Tue, Apr 8 8:30 PM`

If Firestore is configured, check the `jotbot_idempotency` collection — you should see a document with `processedAt` and `expiresAt` fields.

---

## Commands

| Command | What it does |
|---|---|
| `#add event <details>` | Creates a Google Calendar event |
| `#addevent` / `#event` | Aliases for `#add event` |
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
│   ├── firestore.gs      # Firestore REST client for idempotency
│   ├── admin.gs          # Utility for syncing Script Properties
│   ├── appsscript.json   # Apps Script manifest
│   └── tests/            # Manual test cases
├── scripts/
│   └── sync-env.js       # Generates _syncProps.gs from .env and pushes
├── docs/
│   ├── architecture.md   # System design and extensibility notes
│   ├── commands.md       # User-facing command reference
│   └── setup.md          # Detailed setup guide
├── .clasp.json           # clasp project config (scriptId + rootDir)
├── .env                  # Local config values (gitignored)
└── package.json          # npm scripts for clasp push/pull/deploy/sync-env
```
