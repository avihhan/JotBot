# JotBot V1 Setup

## 1) Create Apps Script project and push code
1. Create a new project at [script.google.com](https://script.google.com).
2. Copy the **Script ID** from Project Settings.
3. Paste it into `.clasp.json` at the repo root: `"scriptId": "YOUR_ID"`.
4. Run `npm install` then `npm run push` to sync all files from `apps-script/`.

## 2) Configure Script Properties

All configuration lives in the `.env` file at the repo root. You can either:
- **Sync automatically** with `npm run sync-env` (see below), or
- **Set manually** in **Project Settings -> Script properties** in the Apps Script editor.

### Core properties

- `WA_VERIFY_TOKEN`
- `WA_ACCESS_TOKEN`
- `WA_PHONE_NUMBER_ID`
- `WA_API_VERSION` (default `v21.0`)
- `SELF_WHATSAPP_NUMBER` (your own WhatsApp number with country code)
- `ENFORCE_SELF_ONLY` (`true` recommended)
- `ENFORCE_ALLOWED_SENDERS` (`false` by default; set `true` to restrict who can trigger JotBot)
- `ALLOWED_SENDERS_CSV` (comma-separated international numbers, used when `ENFORCE_ALLOWED_SENDERS=true`)
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (default `gemini-2.0-flash`)
- `DEFAULT_TIMEZONE` (example: `America/New_York`)
- `DEFAULT_DURATION_MINUTES` (example: `60`)
- `DEFAULT_CALENDAR_ID` (Google Calendar ID or `primary`)
- `CALENDAR_MAP_JSON` (example: `{\"work\":\"work@group.calendar.google.com\",\"personal\":\"primary\"}`)
- `COLOR_MAP_JSON` (example: `{\"meeting\":\"PALE_BLUE\",\"task\":\"PALE_GREEN\",\"priority\":\"RED\"}`)
- `DEAD_LETTER_SHEET_ID` (optional, for failures)
- `DEAD_LETTER_SHEET_NAME` (optional, default `DeadLetter`)
- `IDEMPOTENCY_TTL_SECONDS` (default `21600`)

### Firestore idempotency (optional, recommended)

If configured, duplicate-message detection uses Firestore instead of Script Properties,
preventing unbounded property growth. When these are not set, the legacy Script Properties
fallback is used automatically.

- `FIRESTORE_PROJECT_ID` — your GCP project id
- `FIRESTORE_DATABASE_ID` (default `(default)` — set if you created a named database, e.g. `jotbot-db`)
- `FIRESTORE_IDEMPOTENCY_COLLECTION` (default `jotbot_idempotency`)
- `GCP_SERVICE_ACCOUNT_JSON` — the **full JSON key** of a service account with **Cloud Datastore User** role (paste the minified JSON string)

#### GCP one-time setup

1. In the [GCP Console](https://console.cloud.google.com), create or select a project.
2. Enable the **Cloud Firestore API** and create a database in **Native mode**.
3. Create a **service account** and grant it the `roles/datastore.user` role.
4. Create a **JSON key** for the service account and paste the entire contents into `GCP_SERVICE_ACCOUNT_JSON` in your `.env`.
5. Set `FIRESTORE_PROJECT_ID` to the project id.
6. **(Recommended)** In Firestore console, add a **TTL policy** on the collection (default `jotbot_idempotency`) for the `expiresAt` field so old documents are deleted automatically.

### Syncing `.env` to Script Properties

Instead of copying values by hand, you can push all `.env` variables to Apps Script in one command:

```
npm run sync-env
```

#### One-time `clasp run` setup

`sync-env` uses `clasp run` under the hood, which requires OAuth Desktop credentials:

1. In **GCP Console > APIs & Services > Enabled APIs**, enable the **Apps Script API**.
2. Go to **APIs & Services > Credentials > + Create Credentials > OAuth client ID**.
   - Application type: **Desktop app**
   - Name: e.g. `clasp-cli`
3. Download the JSON credentials file.
4. Run:
   ```
   npx clasp login --creds <path-to-downloaded-credentials.json>
   ```
5. You can now run `npm run sync-env` anytime to push `.env` values to Script Properties.

## 3) Deploy webhook endpoint
1. Deploy Apps Script as a **Web App**.
2. Execute as: your account.
3. Who has access: Anyone.
4. Copy deployment URL.

## 4) Configure Meta WhatsApp webhook
1. In Meta developer dashboard, configure webhook callback URL to Apps Script Web App URL.
2. Set verify token exactly to `WA_VERIFY_TOKEN`.
3. Subscribe to message events.

## 5) Quick smoke test
Send to your own WhatsApp number:
- `#add event Team sync tomorrow 8:30 pm high priority remind me 20 min`

Expected:
- Event is created in Google Calendar.
- WhatsApp reply similar to: `Added: Team sync — Tue, Apr 7 8:30 PM`.

## Business account inbox mode
If users will message your JotBot business number (instead of self-messages):
- Set `ENFORCE_SELF_ONLY=false`
- Option A (open): keep `ENFORCE_ALLOWED_SENDERS=false`
- Option B (recommended): set `ENFORCE_ALLOWED_SENDERS=true` and configure `ALLOWED_SENDERS_CSV`
  - Example: `15551234567,15557654321`
