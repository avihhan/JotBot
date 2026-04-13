# JotBot Commands

## `#add event`
Create a Google Calendar event from WhatsApp text, image, or document.

### Supported command forms
- `#add event`
- `#addevent`
- `#event`

### Behavior
- If both media (image/PDF) and caption/text are present, **text overrides media details**.
- Missing required fields (title/date/time) trigger a short clarification message.
- Event is created in selected calendar and color-coded by category, hint, or priority.
- Recurring events are supported via natural language (e.g. "every Monday").
- Urgency (1-5) is auto-detected; high urgency events get automatic popup reminders.
- If GCS is configured, attached media is uploaded and a signed URL is added to the event description.

### Examples
- Text only:
  - `#add event Team sync tomorrow 8:30 pm, work calendar, high priority`
- Recurring:
  - `#add event Standup every Monday at 9am`
- Image with caption override:
  - Caption: `#add event same meeting but set time to 8:30 pm, remind me 20 minutes`
- PDF attachment:
  - Send a PDF with caption: `#add event`

### Optional inline hints
- Priority:
  - `high priority`
  - `low priority`
- Early reminder:
  - `early reminder 30 minutes`
  - `remind me 15 min`

### Response format
- Success:
  - `Added: <title> — <weekday, month day time>`
- Clarification:
  - `I need <missing_fields> to add this event...`

---

## `#add task`
Create a Google Tasks to-do item.

### Supported command forms
- `#add task`
- `#addtask`
- `#task`
- `#todo`

### Behavior
- Gemini extracts a title, optional deadline, description, and priority.
- Task is created in the configured Google Tasks list (default: `@default`).
- If a deadline is provided, it becomes the task's due date.

### Examples
- `#add task Buy groceries by Friday`
- `#task Submit report by end of day`
- `#todo Call dentist next week`

### Response format
- Success (with due date):
  - `Task created: <title> — due <weekday, month day time>`
- Success (no due date):
  - `Task created: <title>`

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

---

## `#cancel`
Delete the most recently created event or task.

### Supported command forms
- `#cancel`
- `#delete`

### Behavior
- Looks up the last action recorded for the sender in Firestore.
- Supports cancelling both events and tasks.
- If the action is within the cancel window (default 15 minutes, configurable via `CANCEL_TTL_SECONDS`), the item is deleted.
- If no recent action exists or the window has expired, an informational message is returned.
- After a successful cancel, the stored last-action record is cleared.
- Requires Firestore to be configured; otherwise responds with an error message.

### Response format
- Success:
  - `🗑️ Successfully cancelled "<title>".`
- Nothing to cancel:
  - `Nothing to cancel.`
- Expired:
  - `Your last action was too long ago to cancel.`

---

## `#help`
Display the list of available commands.

### Supported command forms
- `#help`

### Behavior
- Returns a formatted message listing all commands with brief descriptions and examples.
- Also triggered automatically when the bot receives an unrecognized command.

---

## `/health` (Admin only)
Check system status from WhatsApp.

### Supported command forms
- `/health`
- `/status`

### Behavior
- Only responds to phone numbers listed in `ADMIN_PHONE_NUMBERS`.
- Pings Firestore, WhatsApp API, Gemini API, and checks GCS configuration.
- Returns a formatted status message with green/red indicators.

### Response format
```
JotBot System Status

🟢 Firestore: OK
🟢 WhatsApp API: OK
🟢 Gemini API: OK
🟢 GCS: Configured (my-bucket)
```
