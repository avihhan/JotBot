# JotBot V1 Manual Test Cases

## Setup checks
- Script deployed as Web App with public webhook URL.
- Meta webhook points to Apps Script URL and verification succeeds.
- Script properties configured (tokens, ids, Gemini key/model, timezone defaults).
- Test Google Calendar exists and mapping is configured.

## Functional matrix

1. Text-only basic
- Input: `#add event Doctor appointment next Tuesday 5pm`
- Expected: Event created, default calendar, success confirmation.

2. Image-only extraction
- Input: Image of event flyer, no caption other than `#add event`
- Expected: Gemini OCR extracts title/date/time; event created if complete.

3. Text overrides image time
- Input: Image says `5pm`, caption says `#add event set it for 8:30 pm`
- Expected: Event at `8:30 pm`.

4. Add extra text hints
- Input: `#add event Project deadline Friday 9am high priority remind me 30 minutes`
- Expected: Priority set high, popup reminder 30 min.

5. Missing required field
- Input: `#add event call with team` (no date/time)
- Expected: Clarification message with missing fields, no event creation.

6. Unknown calendar hint
- Input: `#add event meeting tomorrow 10am calendar unicorn`
- Expected: Falls back to default calendar.

7. Unknown color hint
- Input: `#add event meet tomorrow 10am color cosmic`
- Expected: Falls back to priority/default color.

8. Duplicate delivery
- Input: Replay same webhook payload with same message id.
- Expected: Second pass ignored, no duplicate event.

9. Self-only enforcement
- Input: Message from non-self number while `ENFORCE_SELF_ONLY=true`.
- Expected: Ignored.

10. Gemini failure path
- Input: Force invalid Gemini key.
- Expected: Dead-letter record created, no crash, webhook returns accepted.

11. WhatsApp send failure
- Input: Force invalid WA token after extraction.
- Expected: Error logged/dead-letter; no unhandled exception.

12. Timezone normalization
- Input: `#add event standup tomorrow 9am` with configured `DEFAULT_TIMEZONE`.
- Expected: Event time interpreted in configured timezone.

13. Agenda with events
- Input: `#list today` or `#agenda` on a day with existing calendar events.
- Expected: Ordered list of today's events with times; all-day events shown as `All day`.

14. Agenda with no events
- Input: `#list today` on a day with no calendar events.
- Expected: `No events today for <calendar_name>.`

## Suggested payload fixtures
- Store raw webhook JSON examples for:
  - Text message
  - Image + caption message
  - Delivery/read status update (should be ignored)
