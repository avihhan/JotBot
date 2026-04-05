# JotBot Commands

## `#add event`
Create a Google Calendar event from WhatsApp text or image.

### Supported command forms
- `#add event`
- `#addevent`
- `#event`

### Behavior
- If both image and caption/text are present, **text overrides image details**.
- Missing required fields (title/date/time) trigger a short clarification message.
- Event is created in selected calendar and color-coded by hint/priority mapping.

### Examples
- Text only:
  - `#add event Team sync tomorrow 8:30 pm, work calendar, high priority`
- Image with caption override:
  - Caption: `#add event same meeting but set time to 8:30 pm, remind me 20 minutes`
- Add location and link:
  - `#event Product review May 8 3pm at HQ, meet link https://meet.google.com/abc-defg-hij`

### Optional inline hints
- Priority:
  - `high priority`
  - `low priority`
- Early reminder:
  - `early reminder 30 minutes`
  - `remind me 15 min`

## Response format
- Success:
  - `Added: <title> — <weekday, month day time>`
- Clarification:
  - `I need <missing_fields> to add this event...`

---

## `#note`
Save a quick note to Google Sheets from WhatsApp text.

### Supported command forms
- `#note`
- `#jot`

### Behavior
- Gemini extracts a short title, the full note text, and any tags from the message.
- The note is appended as a new row in the configured Notes Google Sheet (`NOTES_SHEET_ID`).
- Inline hashtags in the message body are captured as tags (e.g. `#work`, `#idea`).

### Examples
- `#note Pick up groceries on the way home`
- `#jot Book dentist appointment for next week`
- `#note Meeting takeaways: follow up with Sarah, send proposal by Friday #work`
- `#note Call mom this weekend #personal`

### Notes sheet columns
| Column | Content |
|--------|---------|
| `timestamp` | ISO-8601 save time |
| `sender` | WhatsApp number |
| `title` | Gemini-generated short title |
| `text` | Full note body |
| `tags_json` | JSON array of tags |
| `message_id` | WhatsApp message id (for deduplication) |

### Response format
- Success:
  - `Noted: <title>`
- Error / empty message:
  - `I need some text to save a note. Reply with #note followed by your note.`

