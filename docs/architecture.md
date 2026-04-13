# JotBot Architecture (V1)

## Overview
JotBot is a command-driven WhatsApp assistant. In V1 it supports `#add event` to create Google Calendar entries from WhatsApp text and/or images.

Core principles:
- Keep integrations isolated (`whatsapp`, `gemini`, `calendar`, `firestore` modules).
- Keep business rules centralized (`rules.gs`).
- Keep secrets in Script Properties (synced from `.env` via `sync-env`).
- Keep command handling extensible so new commands can be added as independent handlers.

## Runtime flow
1. Meta WhatsApp webhook sends updates to Apps Script `doPost`.
2. Message parser extracts normalized payload (text, caption, image id, sender, message id).
3. Router detects hashtag command (`#add event` aliases).
4. Gemini extracts event data from:
   - text-only pass (caption/body)
   - image-only pass (if image exists)
5. Merge logic applies **text-over-image** precedence.
6. Rules module applies optional hints (priority, early reminder), validates required fields, and normalizes date range.
7. Calendar module resolves calendar + color mapping and creates event.
8. WhatsApp module sends a short confirmation message.

For sender control, V1 supports:
- self-only mode (`ENFORCE_SELF_ONLY=true`)
- allowlist mode (`ENFORCE_ALLOWED_SENDERS=true` + `ALLOWED_SENDERS_CSV`)
- open inbox mode (both disabled)

## Reliability controls
- **Idempotency** — three-tier duplicate detection by WhatsApp message id:
  1. **CacheService** — fast in-memory check (TTL configurable via `IDEMPOTENCY_TTL_SECONDS`, default 6h).
  2. **Firestore** (optional, recommended) — persistent check using SHA-256 document ids with `expiresAt` TTL for automatic cleanup. Uses service-account JWT auth via the Firestore REST API (`firestore.gs`).
  3. **Script Properties** — legacy fallback when Firestore is not configured. Works but grows unboundedly.
- Dead-letter sheet logging for parse/validation/runtime failures.
- Clarification response when required fields are missing.
- Safe defaults for timezone, duration, calendar, and color.

## Extensibility path (`#note` and beyond)
- Keep router command registry pattern (`command -> handler`).
- Reuse ingress/parsing and Gemini utility modules.
- Add a `NotesStore` abstraction (Google Sheets first, Firestore later) without touching calendar flow.
- Reuse idempotency and dead-letter logging for all future commands.

## Module overview

| File | Responsibility |
|---|---|
| `Code.gs` | Webhook entry (`doGet`/`doPost`), command router, idempotency |
| `config.gs` | Reads all Script Properties into a config object |
| `rules.gs` | Command parsing, validation, hint extraction, message formatting |
| `gemini.gs` | Gemini API calls for event/note extraction |
| `calendar.gs` | Google Calendar event creation with color/calendar mapping |
| `whatsapp.gs` | WhatsApp Cloud API (send messages, download media) |
| `notes.gs` | Google Sheets note storage |
| `firestore.gs` | Firestore REST client — service-account JWT auth, idempotency check/record |
| `admin.gs` | Utility function for syncing Script Properties via `sync-env` |

## Security notes
- Webhook challenge verification is implemented via `doGet`.
- GCP service account credentials (for Firestore) are stored in Script Properties, not in code.
- In Apps Script Web Apps, HTTP headers are not reliably exposed to validate Meta HMAC signatures directly; use verify token + strict self-sender filtering for V1, and consider Cloud Run proxy for header-based signature verification in a hardened V2.
