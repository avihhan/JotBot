# JotBot Setup

## 1) Create Apps Script project and push code
1. Create a new project at [script.google.com](https://script.google.com).
2. Copy the **Script ID** from Project Settings.
3. Paste it into `.clasp.json` at the repo root: `"scriptId": "YOUR_ID"`.
4. In Project Settings, under **Google Cloud Platform (GCP) Project**, click **Change project** and enter your GCP project number. This enables Firestore, Tasks, and Stackdriver logging.
5. In the GCP Console, enable the **Google Tasks API** for your project.
6. Run `npm install` then `npm run push` to sync all files from `apps-script/`.

## 2) Configure Script Properties

All configuration lives in the `.env` file at the repo root. You can either:
- **Sync with `npm run sync-env`** (see below), or
- **Set manually** in **Project Settings -> Script properties** in the Apps Script editor.

### Core properties

- `WA_VERIFY_TOKEN`
- `WA_ACCESS_TOKEN`
- `WA_PHONE_NUMBER_ID`
- `WA_API_VERSION` (default `v21.0`)
- `SELF_WHATSAPP_NUMBER` (your own WhatsApp number with country code)
- `ENFORCE_SELF_ONLY` (`true` recommended)
- `ENFORCE_ALLOWED_SENDERS` (`false` by default)
- `ALLOWED_SENDERS_CSV` (comma-separated international numbers)
- `GEMINI_API_KEY` (standard `AIzaSy...` key from [AI Studio](https://aistudio.google.com/apikey))
- `GEMINI_MODEL` (default `gemini-2.5-flash`)
- `GEMINI_FALLBACK_MODEL` (default `gemini-1.5-flash` — used when primary model returns 5xx)
- `DEFAULT_TIMEZONE` (example: `America/New_York`)
- `DEFAULT_DURATION_MINUTES` (example: `60`)
- `DEFAULT_CALENDAR_ID` (Google Calendar ID or `primary`)
- `DEFAULT_TASK_LIST_ID` (default `@default` — Google Tasks list ID)
- `CALENDAR_MAP_JSON` (example: `{"work":"work@group.calendar.google.com","personal":"primary"}`)
- `COLOR_MAP_JSON` (example: `{"meeting":"PALE_BLUE","task":"PALE_GREEN","priority":"RED"}`)
- `CATEGORY_COLOR_MAP_JSON` (example: `{"work":"BLUE","school":"GREEN","finance":"YELLOW","health":"CYAN"}`)
- `CANCEL_TTL_SECONDS` (default `900` — 15 minute cancel window)
- `DEAD_LETTER_SHEET_ID` (optional, for failures)
- `DEAD_LETTER_SHEET_NAME` (optional, default `DeadLetter`)
- `IDEMPOTENCY_TTL_SECONDS` (default `21600`)
- `NOTES_SHEET_ID` (Google Sheets ID for notes storage)
- `NOTES_SHEET_NAME` (default `Notes`)

### Firestore (optional, recommended)

If configured, duplicate-message detection and last-action tracking use Firestore.

- `FIRESTORE_PROJECT_ID` — your GCP project id
- `FIRESTORE_DATABASE_ID` (default `(default)` — set if you created a named database)
- `FIRESTORE_IDEMPOTENCY_COLLECTION` (default `jotbot_idempotency`)
- `GCP_SERVICE_ACCOUNT_JSON` — the **full JSON key** of a service account with **Cloud Datastore User** role

### GCS file storage (optional)

When configured, attached media (images, PDFs, documents) is uploaded to GCS and a signed URL is added to events.

- `GCP_BUCKET_NAME` — your GCS bucket name

The service account from `GCP_SERVICE_ACCOUNT_JSON` must also have the `roles/storage.objectCreator` and `roles/storage.objectViewer` roles on the bucket.

### Admin healthcheck (optional)

- `ADMIN_PHONE_NUMBERS` — comma-separated phone numbers (with country code) that can run `/health`

### GCP one-time setup

1. In the [GCP Console](https://console.cloud.google.com), create or select a project.
2. Enable the **Cloud Firestore API**, **Google Tasks API**, and **Cloud Storage API**.
3. Create a Firestore database in **Native mode**.
4. Create a **service account** and grant it:
   - `roles/datastore.user` (for Firestore)
   - `roles/storage.objectCreator` + `roles/storage.objectViewer` (for GCS, if used)
5. Create a **JSON key** for the service account and paste the entire contents into `GCP_SERVICE_ACCOUNT_JSON` in your `.env`.
6. **(Optional)** Create a GCS bucket and set `GCP_BUCKET_NAME`.
7. **(Recommended)** Add a **TTL policy** on the Firestore collection for the `expiresAt` field.

### Syncing `.env` to Script Properties

```
npm run sync-env
```

This generates a temporary `_syncProps.gs` file with your values baked in and pushes it. Then:

1. Open the Apps Script editor
2. Select `_syncProps.gs` and run `_syncAllProperties()`
3. Grant permissions when prompted
4. Verify in **Project Settings -> Script properties**
5. Clean up: `npm run sync-env-cleanup`

## 3) Deploy webhook endpoint

**Deploy from the Apps Script editor** (not the CLI):

1. Click **Deploy -> New deployment**
2. Select type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click **Deploy** and copy the URL

> After every `npm run push`, update the deployment: **Deploy -> Manage deployments -> Edit -> New version -> Deploy**.

## 4) Configure Meta WhatsApp webhook

1. In [Meta Developer Dashboard](https://developers.facebook.com), configure webhook callback URL to your Apps Script Web App URL.
2. Set verify token exactly to `WA_VERIFY_TOKEN`.
3. Subscribe to message events.

## 5) Quick smoke test

Send to your WhatsApp bot number:
- `#add event Team sync tomorrow 3pm high priority remind me 20 min`
- `#add task Buy groceries by Friday`
- `#note Pick up dry cleaning`
- `#cancel`
- `#help`

Admin only:
- `/health`

## Business account inbox mode

If users will message your JotBot business number:
- Set `ENFORCE_SELF_ONLY=false`
- Option A (open): keep `ENFORCE_ALLOWED_SENDERS=false`
- Option B (recommended): set `ENFORCE_ALLOWED_SENDERS=true` and configure `ALLOWED_SENDERS_CSV`
