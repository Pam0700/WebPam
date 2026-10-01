/** Test.gs - Chạy từng hàm trong editor, xem kết quả ở Execution log. */
function testConfig() {
  Logger.log('TEST_MODE=' + ConfigManager.isTestMode());
  Logger.log('TAX_RATE=' + ConfigManager.getNumber('TAX_RATE', 10));
  Logger.log('Token có cấu hình: ' + !!ConfigManager.getProperty('ZALO_BOT_TOKEN'));
}

function testLog() {
  LogService.info('test', 'Kiểm tra ghi log', { token: 'abc', note: 'ok' }, 'test_user', 'testLog');
}

function testZaloGetMe() {
  Logger.log(JSON.stringify(ZaloService.getMe()));
}

/** Gửi mô phỏng: không gọi Zalo thật. Kết quả mong đợi: simulated:true */
function testZaloSimulated() {
  Logger.log(JSON.stringify(ZaloService.sendMessage('test_001', 'Xin chào')));
}

/** Gửi tin thật: đặt Script Property TEST_CHAT_ID = chat_id của bạn trước. */
function testZaloSendReal() {
  const chatId = ConfigManager.getProperty('TEST_CHAT_ID');
  if (!chatId) { Logger.log('Chưa có TEST_CHAT_ID'); return; }
  Logger.log(JSON.stringify(ZaloService.sendMessage(chatId, '✅ Bot GAS đã kết nối thành công.')));
}

// ===== Phase 5: test webhook (mọi chat_id bắt đầu "test_" nên KHÔNG gửi tin thật) =====
function fakeWebhook_(text, messageId, userId, key) {
  const payload = {
    ok: true,
    result: {
      event_name: 'message.text.received',
      message: {
        from: { id: userId || 'test_u1', display_name: 'Test User', is_bot: false },
        chat: { id: 'test_chat1', chat_type: 'PRIVATE' },
        text: text, message_id: messageId, date: Date.now()
      }
    }
  };
  const e = {
    parameter: { key: key === undefined ? ConfigManager.getProperty('WEBHOOK_KEY') : key },
    postData: { contents: JSON.stringify(payload) }
  };
  return JSON.parse(doPost(e).getContent());
}

function testWebhook() {
  const id = 'test_' + Utils.uuid().substring(0, 8);
  const out = [];
  out.push('menu       -> ' + JSON.stringify(fakeWebhook_('#menu', id + 'a')));          // {ok:true}
  out.push('thongtin   -> ' + JSON.stringify(fakeWebhook_('#thongtin', id + 'b')));      // {ok:true}
  out.push('trùng      -> ' + JSON.stringify(fakeWebhook_('#menu', id + 'a')));          // {ok:true,duplicate:true}
  out.push('không hiểu -> ' + JSON.stringify(fakeWebhook_('xin chào', id + 'c')));       // {ok:true}
  out.push('link       -> ' + JSON.stringify(fakeWebhook_('xem https://shopee.vn/abc', id + 'd')));
  out.push('lệnh admin -> ' + JSON.stringify(fakeWebhook_('#capnhatcsv', id + 'e')));    // user thường -> từ chối
  out.push('sai key    -> ' + JSON.stringify(fakeWebhook_('#menu', id + 'f', 'test_u1', 'sai')));  // {ok:false,error:forbidden}
  Logger.log(out.join('\n'));
}

function testDoGet() {
  Logger.log(doGet({ parameter: {} }).getContent()); // {"status":"ok",...}
}
