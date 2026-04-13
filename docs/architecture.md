# JotBot Architecture

## Overview
JotBot is a self-hosted, AI-powered WhatsApp assistant for calendar, task, and note management. It supports `#add event` (with recurring events), `#add task`, `#note`, `#cancel`, `#help`, and `/health` (admin).

Core principles:
- Keep integrations isolated (`whatsapp`, `gemini`, `calendar`, `tasks`, `firestore`, `gcs` modules).
- Keep business rules centralized (`rules.gs`).
- Keep secrets in Script Properties (synced from `.env` via `sync-env`).
- Keep command handling extensible so new commands can be added as independent handlers.

## Runtime flow
1. Meta WhatsApp webhook sends updates to Apps Script `doPost`.
2. Message parser extracts normalized payload (text, caption, image id, document id, sender, message id, timestamp).
3. Router detects command (`#add event`, `#add task`, `#note`, `#cancel`, `#help`, `/health`). Unrecognized commands trigger the help message.
4. For events/tasks, Gemini extracts structured data from:
   - text-only pass (caption/body)
   - media pass (image, PDF, or document if attached)
5. Merge logic applies **text-over-media** precedence.
6. Rules module applies optional hints (priority, early reminder), validates required fields, and normalizes date range.
7. Calendar/Tasks module creates the item. For events, recurring rules are handled via `CalendarApp.createEventSeries()`.
8. If GCS is configured, attached media is uploaded and a signed URL is added to the event description.
9. WhatsApp module sends a short confirmation message.
10. Last action is recorded in Firestore for `#cancel` support.

## Intelligent time handling
- The WhatsApp webhook `msg.timestamp` (Unix epoch) is passed to Gemini as the user's "current time" reference, ensuring relative dates like "today" and "tomorrow" are accurate.
- The Gemini prompt enforces timezone-aware ISO-8601 output with explicit UTC offset.
- Ambiguous times default to reasonable hours (07:00-23:59); the bot never schedules at 3 AM unless explicitly told to.
- The Apps Script project timezone is set to `America/New_York` (configurable via `appsscript.json`).

## Sender control
- self-only mode (`ENFORCE_SELF_ONLY=true`)
- allowlist mode (`ENFORCE_ALLOWED_SENDERS=true` + `ALLOWED_SENDERS_CSV`)
- open inbox mode (both disabled)

## Reliability controls
- **Idempotency** — three-tier duplicate detection by WhatsApp message id:
  1. **CacheService** — fast in-memory check (TTL configurable via `IDEMPOTENCY_TTL_SECONDS`, default 6h).
  2. **Firestore** (optional, recommended) — persistent check using SHA-256 document ids with `expiresAt` TTL for automatic cleanup.
  3. **Script Properties** — legacy fallback when Firestore is not configured.
- **Gemini retry with fallback** — API calls use `fetchWithRetry_` which retries once on 429/500/503. If the retry also fails with a server error and `GEMINI_FALLBACK_MODEL` is configured, the request is re-attempted with the fallback model (default: `gemini-1.5-flash`).
- **Config pass-through** — `isDuplicateMessage_` receives the pre-loaded `config` object to avoid redundant reads.
- Dead-letter sheet logging for parse/validation/runtime failures.
- Safe defaults for timezone, duration, calendar, and color.

## Urgency and categorization
- Gemini assigns an `urgency` score (1-5) and a `category` string (Work, School, Chore, Finance, etc.) to each event.
- High urgency (>=4) auto-adds popup reminders (60 min; urgency 5 adds 15 min too) when no explicit reminders are set.
- Categories map to calendar colors via `CATEGORY_COLOR_MAP_JSON`, falling back to priority-based colors.
- Category is stored in Firestore last-action records.

## Cancel / undo flow
- After creating an event or task, the handler records the action in Firestore via `saveLastAction`.
- `#cancel` retrieves the last action, checks TTL, deletes the Calendar event or Google Task, and clears the record.
- Last-action documents store `type` (`"event"` or `"task"`), `itemId`, `calendarId`/`taskListId`, `title`, `category`, and `createdAt`.

## GCS file storage
- When `GCP_BUCKET_NAME` is configured, attached media (images, PDFs, documents) is uploaded to a GCS bucket.
- V4 signed URLs (7-day expiry) are generated using the service account private key and attached to event descriptions.
- The `gcs.gs` module reuses the same JWT/service-account auth pattern as `firestore.gs`.

## Admin healthcheck
- `/health` or `/status` commands (gated to `ADMIN_PHONE_NUMBERS`) ping Firestore, WhatsApp API, Gemini API, and check GCS configuration.
- Returns a formatted status message with per-service indicators.

## Module overview

| File | Responsibility |
|---|---|
| `Code.gs` | Webhook entry (`doGet`/`doPost`), command router, idempotency, all command handlers |
| `config.gs` | Reads all Script Properties into a config object |
| `rules.gs` | Command parsing (`#add event`, `#add task`, `#note`, `#cancel`, `#help`, `/health`), validation, hint extraction, message formatting, help text |
| `gemini.gs` | Gemini API calls for event/task/note extraction with retry and model fallback |
| `calendar.gs` | Google Calendar event/series creation with color/calendar mapping, urgency reminders, recurrence |
| `tasks.gs` | Google Tasks API — create and delete tasks |
| `whatsapp.gs` | WhatsApp Cloud API (send messages, download media for images and documents) |
| `notes.gs` | Google Sheets note storage |
| `firestore.gs` | Firestore REST client — JWT auth, idempotency, last-action CRUD |
| `gcs.gs` | GCS REST client — file upload and V4 signed URL generation |
| `admin.gs` | Utility function for syncing Script Properties via `sync-env` |

## Security notes
- Webhook challenge verification via `doGet`.
- GCP service account credentials stored in Script Properties, not in code.
- Admin commands gated to `ADMIN_PHONE_NUMBERS` allowlist.
- GCS signed URLs have a 7-day expiry for controlled access.
