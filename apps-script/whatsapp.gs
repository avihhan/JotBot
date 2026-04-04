var JotBotWhatsApp = (function () {
  function parseIncomingMessages(payload) {
    var out = [];
    var entries = (payload && payload.entry) || [];
    entries.forEach(function (entry) {
      (entry.changes || []).forEach(function (change) {
        var value = change.value || {};
        (value.messages || []).forEach(function (msg) {
          out.push({
            id: msg.id || "",
            from: msg.from || "",
            timestamp: msg.timestamp || "",
            type: msg.type || "",
            text: msg.text && msg.text.body ? msg.text.body : "",
            caption: msg.image && msg.image.caption ? msg.image.caption : "",
            imageId: msg.image && msg.image.id ? msg.image.id : "",
            raw: msg
          });
        });
      });
    });
    return out;
  }

  function getMediaDownloadUrl(mediaId) {
    var config = JotBotConfig.requireKeys(["waAccessToken", "waApiVersion"]);
    var url = "https://graph.facebook.com/" + config.waApiVersion + "/" + encodeURIComponent(mediaId);
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { Authorization: "Bearer " + config.waAccessToken },
      muteHttpExceptions: true
    });
    var bodyText = response.getContentText() || "{}";
    var body = JSON.parse(bodyText);
    if (response.getResponseCode() >= 300 || !body.url) {
      throw new Error("Unable to fetch media metadata: " + bodyText);
    }
    return {
      url: body.url,
      mimeType: body.mime_type || "application/octet-stream"
    };
  }

  function downloadMedia(mediaId) {
    var config = JotBotConfig.requireKeys(["waAccessToken"]);
    var mediaInfo = getMediaDownloadUrl(mediaId);
    var response = UrlFetchApp.fetch(mediaInfo.url, {
      method: "get",
      headers: { Authorization: "Bearer " + config.waAccessToken },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() >= 300) {
      throw new Error("Unable to download media, status " + response.getResponseCode());
    }
    var blob = response.getBlob();
    return {
      bytes: blob.getBytes(),
      base64: Utilities.base64Encode(blob.getBytes()),
      mimeType: mediaInfo.mimeType
    };
  }

  function sendTextMessage(to, messageText, contextMessageId) {
    var config = JotBotConfig.requireKeys(["waAccessToken", "waApiVersion", "waPhoneNumberId"]);
    var url = "https://graph.facebook.com/" + config.waApiVersion + "/" + config.waPhoneNumberId + "/messages";
    var payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: messageText || "" }
    };
    if (contextMessageId) payload.context = { message_id: contextMessageId };

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + config.waAccessToken },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() >= 300) {
      throw new Error("Unable to send WhatsApp response: " + response.getContentText());
    }
    return JSON.parse(response.getContentText() || "{}");
  }

  return {
    parseIncomingMessages: parseIncomingMessages,
    getMediaDownloadUrl: getMediaDownloadUrl,
    downloadMedia: downloadMedia,
    sendTextMessage: sendTextMessage
  };
})();
