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
