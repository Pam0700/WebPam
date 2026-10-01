/**
 * Webhook.gs - doPost chỉ làm: xác thực -> parse -> validate -> chống trùng -> route.
 * Zalo gửi secret ở header nhưng GAS không đọc được header, nên xác thực bằng ?key=WEBHOOK_KEY trên URL.
 * Luôn trả JSON nhanh; lỗi nội bộ không bao giờ trả lỗi cho Zalo (tránh bị gửi lại liên tục).
 */
const Webhook = (function () {
  const ID_RE = /^[A-Za-z0-9_\-.:]{1,128}$/;

  function json_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  }

  function authorized_(e) {
    const real = ConfigManager.getProperty('WEBHOOK_KEY');
    return Utils.safeEqual(real, e && e.parameter && e.parameter.key);
  }

  /**
   * Chuẩn hoá payload Zalo Bot -> event nội bộ. Chấp nhận cả dạng {ok,result:{...}} và {...}.
   * Trả về null nếu không phải tin nhắn hợp lệ.
   */
  function parseEvent_(payload) {
    const body = (payload && payload.result && typeof payload.result === 'object') ? payload.result : payload;
    const msg = body && body.message;
    if (!msg || typeof msg !== 'object') return null;
    const from = msg.from || {};
    const chat = msg.chat || {};
    if (from.is_bot === true) return null;

    const userId = String(from.id || '');
    const chatId = String(chat.id || '');
    if (!ID_RE.test(userId) || !ID_RE.test(chatId)) return null;

    const name = String(body.event_name || '');
    let kind = 'other';
    if (name.indexOf('.text.') !== -1) kind = 'text';
    else if (name.indexOf('.image.') !== -1) kind = 'image';
    else if (name.indexOf('.sticker.') !== -1) kind = 'sticker';
    else if (!name && typeof msg.text === 'string') kind = 'text';

    const text = kind === 'text' ? String(msg.text || '').trim().substring(0, 4000) : '';
    const messageId = String(msg.message_id || '');
    const ts = msg.date || '';
    const eventId = messageId
      ? chatId + ':' + messageId
      : 'h_' + Utils.sha256Hex([chatId, ts, text].join('|')).substring(0, 32);

    return {
      eventId: eventId, messageId: messageId, eventName: name, kind: kind, text: text,
      userId: userId, chatId: chatId, displayName: Utils.truncate(from.display_name || from.name || '', 100),
      ts: ts, preview: Utils.truncate(text, 200)
    };
  }

  function handle(e) {
    try {
      if (!authorized_(e)) {
        LogService.warn('webhook_auth', 'Sai hoặc thiếu key webhook', null, '', 'Webhook.handle');
        return json_({ ok: false, error: 'forbidden' });
      }
      const raw = e && e.postData && e.postData.contents;
      if (!raw || raw.length > 100000) return json_({ ok: false, error: 'bad_request' });

      let payload;
      try { payload = JSON.parse(raw); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }

      if (ConfigManager.getBool('WEBHOOK_DEBUG', false)) {
        LogService.info('webhook_raw', 'payload', payload, '', 'Webhook.handle');
      }

      const event = parseEvent_(payload);
      if (!event) return json_({ ok: true, ignored: true });

      const claim = QueueService.claimEvent(event);
      if (!claim.claimed) return json_({ ok: true, duplicate: true });

      let status = 'done', error = '';
      try {
        MessageRouter.handleMessage(event);
      } catch (err) {
        status = 'failed';
        error = err.message;
        LogService.error('router_error', err.message, { stack: Utils.truncate(err.stack, 800), eventId: event.eventId }, event.userId, 'MessageRouter.handleMessage');
        ZaloService.sendMessage(event.chatId, 'Xin lỗi, hệ thống đang gặp sự cố. Vui lòng thử lại sau.');
      }
      QueueService.finish(claim.row, status, error);
      return json_({ ok: true });
    } catch (err) {
      LogService.error('webhook_fatal', err.message, { stack: Utils.truncate(err.stack, 800) }, '', 'Webhook.handle');
      return json_({ ok: true });
    }
  }

  return { handle: handle, parseEvent: parseEvent_ };
})();

/** Điểm vào webhook từ Zalo. */
function doPost(e) {
  return Webhook.handle(e);
}
