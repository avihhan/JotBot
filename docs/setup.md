# JotBot V1 Setup

## 1) Create Apps Script project
1. Create a new Apps Script project.
2. Add all files from `apps-script/` into the script editor.
3. Ensure `appsscript.json` includes required scopes.

## 2) Configure Script Properties
Set these in **Project Settings -> Script properties**:

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
