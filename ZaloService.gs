/**
 * ZaloService.gs - Mọi lời gọi Zalo Bot API đi qua đây (không gọi UrlFetchApp ở nơi khác).
 * API: POST https://bot-api.zaloplatforms.com/bot{TOKEN}/{method}, body JSON.
 * Trả về {ok:true,result} hoặc {ok:false,status,error}; không throw để router tự xử lý.
 */
const ZaloService = (function () {
  const API_BASE = 'https://bot-api.zaloplatforms.com';
  const MAX_TEXT = 2000;
  const MAX_RETRY = 2;

  function isSimulated_(chatId) {
    // Chat id bắt đầu bằng "test_" không bao giờ gửi tin thật (an toàn cho test)
    return String(chatId).toLowerCase().indexOf('test_') === 0;
  }

  function call_(method, payload) {
    const token = ConfigManager.require('ZALO_BOT_TOKEN');
    const base = ConfigManager.get('ZALO_API_BASE', API_BASE).replace(/\/+$/, '');
    const url = base + '/bot' + token + '/' + method;
    let last = { ok: false, status: 0, error: 'unknown' };

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        const res = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload || {}),
          muteHttpExceptions: true
        });
        const code = res.getResponseCode();
        const text = res.getContentText();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ }

        if (code >= 200 && code < 300 && json && json.ok !== false) {
          return { ok: true, status: code, result: json.result !== undefined ? json.result : json };
        }
        last = { ok: false, status: code, error: Utils.truncate((json && (json.description || json.message)) || text, 300) };
        if (code === 429 || code >= 500) { Utilities.sleep(500 * (attempt + 1)); continue; }
        break; // lỗi 4xx khác: không retry
      } catch (e) {
        last = { ok: false, status: 0, error: Utils.maskSecrets(e.message).split(token).join('[TOKEN]') };
        Utilities.sleep(500 * (attempt + 1));
      }
    }
    LogService.error('zalo_api', method + ' thất bại', { status: last.status, error: last.error }, '', 'ZaloService.' + method);
    return last;
  }

  /** Cắt text theo dòng, mỗi đoạn tối đa 2000 ký tự (an toàn Unicode). */
  function split_(text) {
    const chunks = [];
    let cur = '';
    String(text).split('\n').forEach(function (line) {
      let pieces = [line];
      if (line.length > MAX_TEXT) {
        const chars = Array.from(line);
        pieces = [];
        for (let i = 0; i < chars.length; i += MAX_TEXT) pieces.push(chars.slice(i, i + MAX_TEXT).join(''));
      }
      pieces.forEach(function (p) {
        if ((cur + (cur ? '\n' : '') + p).length > MAX_TEXT) { chunks.push(cur); cur = p; }
        else cur = cur ? cur + '\n' + p : p;
      });
    });
    if (cur) chunks.push(cur);
    return chunks;
  }

  function sendMessage(chatId, text) {
    if (!chatId || !text) return { ok: false, error: 'chatId/text rỗng' };
    if (isSimulated_(chatId)) return { ok: true, simulated: true, sent: 1 };
    const parts = split_(text);
    let sent = 0, lastErr = null;
    for (let i = 0; i < parts.length; i++) {
      const r = call_('sendMessage', { chat_id: String(chatId), text: parts[i] });
      if (r.ok) sent++; else { lastErr = r.error; break; }
    }
    return { ok: sent === parts.length, sent: sent, total: parts.length, error: lastErr };
  }

  function sendImage(chatId, photoUrl, caption) {
    if (isSimulated_(chatId)) return { ok: true, simulated: true };
    return call_('sendPhoto', { chat_id: String(chatId), photo: photoUrl, caption: caption || '' });
  }

  /** Chưa dùng được endpoint gửi file nên gửi dạng link. */
  function sendFile(chatId, fileUrl, caption) {
    return sendMessage(chatId, (caption ? caption + '\n' : '') + fileUrl);
  }

  function sendTyping(chatId) {
    if (isSimulated_(chatId)) return { ok: true, simulated: true };
    return call_('sendChatAction', { chat_id: String(chatId), action: 'typing' });
  }

  /** Zalo Bot không có endpoint tra user: thông tin user lấy từ payload webhook (Phase 5/6). */
  function getUserInfo(userId) {
    return null;
  }

  function getMe() { return call_('getMe', {}); }
  function getWebhookInfo() { return call_('getWebhookInfo', {}); }
  function deleteWebhook() { return call_('deleteWebhook', {}); }
  function setWebhook(url, secretToken) {
    return call_('setWebhook', { url: url, secret_token: secretToken });
  }

  /** URL webhook = URL web app + ?key=WEBHOOK_KEY (GAS không đọc được header nên xác thực bằng key trên URL). */
  function buildWebhookUrl() {
    const base = ConfigManager.getProperty('WEBAPP_URL') || ScriptApp.getService().getUrl();
    return base + '?key=' + encodeURIComponent(ConfigManager.require('WEBHOOK_KEY'));
  }

  function registerWebhook() {
    return setWebhook(buildWebhookUrl(), ConfigManager.require('ZALO_BOT_SECRET'));
  }

  return {
    sendMessage: sendMessage, sendImage: sendImage, sendFile: sendFile, sendTyping: sendTyping,
    getUserInfo: getUserInfo, getMe: getMe, getWebhookInfo: getWebhookInfo,
    setWebhook: setWebhook, deleteWebhook: deleteWebhook,
    buildWebhookUrl: buildWebhookUrl, registerWebhook: registerWebhook
  };
})();
