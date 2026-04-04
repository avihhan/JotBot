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
