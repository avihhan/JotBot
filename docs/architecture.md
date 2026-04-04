# JotBot Architecture (V1)

## Overview
JotBot is a command-driven WhatsApp assistant. In V1 it supports `#add event` to create Google Calendar entries from WhatsApp text and/or images.

Core principles:
- Keep integrations isolated (`whatsapp`, `gemini`, `calendar` modules).
- Keep business rules centralized (`rules.gs`).
- Keep secrets in `PropertiesService`.
- Keep command handling extensible so new commands (`#note`) can be added as independent handlers.

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
- Idempotency cache/property by WhatsApp message id to avoid duplicate event creation.
- Dead-letter sheet logging for parse/validation/runtime failures.
- Clarification response when required fields are missing.
- Safe defaults for timezone, duration, calendar, and color.

## Extensibility path (`#note` and beyond)
- Keep router command registry pattern (`command -> handler`).
- Reuse ingress/parsing and Gemini utility modules.
- Add a `NotesStore` abstraction (Google Sheets first, Firestore later) without touching calendar flow.
- Reuse idempotency and dead-letter logging for all future commands.

## Security notes
- Webhook challenge verification is implemented via `doGet`.
- In Apps Script Web Apps, HTTP headers are not reliably exposed to validate Meta HMAC signatures directly; use verify token + strict self-sender filtering for V1, and consider Cloud Run proxy for header-based signature verification in a hardened V2.
