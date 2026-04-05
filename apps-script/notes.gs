var NotesStore = (function () {
  var HEADERS_ = ["timestamp", "sender", "title", "text", "tags_json", "message_id"];

  function appendNote(draft, sender, messageId, sheetId, sheetName) {
    var spreadsheet = SpreadsheetApp.openById(sheetId);
    var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS_);
    }
    sheet.appendRow([
      new Date().toISOString(),
      sender || "",
      draft.title || "",
      draft.text || "",
      JSON.stringify(Array.isArray(draft.tags) ? draft.tags : []),
      messageId || ""
    ]);
    return { ok: true };
  }

  return {
    appendNote: appendNote
  };
})();
