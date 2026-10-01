/**
 * MessageRouter.gs - Router trung tâm: phân loại tin nhắn rồi giao cho service phù hợp.
 * Service chưa viết (Phase sau) được gọi qua typeof nên router chạy được ngay từ bây giờ.
 */
const MessageRouter = (function () {
  const SHOPEE_RE = /https?:\/\/(?:[\w-]+\.)*(?:shopee\.vn|shp\.ee|shope\.ee)\/[^\s]*/i;

  function reply_(event, text) {
    return ZaloService.sendMessage(event.chatId, text);
  }

  function notReady_(event) {
    return reply_(event, '🛠 Tính năng này đang được hoàn thiện, bạn vui lòng quay lại sau nhé.');
  }

  /** Gọi service nếu đã tồn tại, ngược lại báo "đang hoàn thiện". */
  function viaService_(svcName, method) {
    return function (event, args) {
      let svc;
      switch (svcName) { // khai báo tường minh vì const ở file khác không nằm trên globalThis
        case 'OrderService': svc = typeof OrderService !== 'undefined' ? OrderService : null; break;
        case 'WalletService': svc = typeof WalletService !== 'undefined' ? WalletService : null; break;
        case 'PaymentService': svc = typeof PaymentService !== 'undefined' ? PaymentService : null; break;
        case 'CsvService': svc = typeof CsvService !== 'undefined' ? CsvService : null; break;
        default: svc = null;
      }
      return svc && svc[method] ? svc[method](event, args) : notReady_(event);
    };
  }

  function menuText_(event) {
    let t = '📋 MENU\n\n' +
      '🛒 Gửi link sản phẩm Shopee để nhận link mua hàng có hoàn tiền\n\n' +
      '#donmua - Xem đơn hàng\n' +
      '#vitien - Xem ví của bạn\n' +
      '#thanhtoan - Yêu cầu rút tiền\n' +
      '#thongtin - Thông tin tài khoản\n' +
      '#help - Hướng dẫn';
    if (ConfigManager.isAdmin(event.userId)) {
      t += '\n\n🔐 ADMIN\n#capnhatcsv - Cập nhật đơn từ CSV\n#admin - Lệnh quản trị';
    }
    return t;
  }

  const HELP_TEXT = '❓ HƯỚNG DẪN\n\n' +
    '1. Gửi link sản phẩm Shopee cho bot.\n' +
    '2. Bot trả về link mua hàng riêng của bạn.\n' +
    '3. Mở sản phẩm từ link bot gửi và đặt hàng bình thường.\n' +
    '4. Khi đơn đủ điều kiện, hoa hồng sẽ vào ví. Xem bằng #vitien.\n\n' +
    'Gõ #menu để xem tất cả lệnh.';

  // adminOnly: true -> chỉ admin dùng được
  const COMMANDS = {
    '#menu': { run: function (ev) { return reply_(ev, menuText_(ev)); } },
    '#start': { run: function (ev) { return reply_(ev, menuText_(ev)); } },
    '#help': { run: function (ev) { return reply_(ev, HELP_TEXT); } },
    '#thongtin': {
      run: function (ev) {
        return reply_(ev, 'ℹ️ THÔNG TIN\n\n👤 Tên: ' + (ev.displayName || '(chưa có)') +
          '\n🆔 user_id: ' + ev.userId + '\n💬 chat_id: ' + ev.chatId +
          '\n🔐 Quyền: ' + (ConfigManager.isAdmin(ev.userId) ? 'Admin' : 'Thành viên'));
      }
    },
    '#donmua': { run: viaService_('OrderService', 'handleOrdersCommand') },
    '#vitien': { run: viaService_('WalletService', 'handleWalletCommand') },
    '#thanhtoan': { run: viaService_('PaymentService', 'handlePaymentCommand') },
    '#capnhatcsv': { adminOnly: true, run: viaService_('CsvService', 'handleImportCommand') },
    '#admin': {
      adminOnly: true,
      run: function (ev) {
        return reply_(ev, '🔐 LỆNH ADMIN\n#capnhatcsv - Cập nhật đơn từ CSV\n#ping - Kiểm tra bot\n\n(Các lệnh #stats #users #orders sẽ bổ sung ở Phase 12)');
      }
    },
    '#ping': {
      adminOnly: true,
      run: function (ev) {
        return reply_(ev, '🏓 pong\nTEST_MODE: ' + (ConfigManager.isTestMode() ? 'BẬT' : 'tắt') + '\nGiờ: ' + Utils.nowStr());
      }
    }
  };

  /** Giới hạn tốc độ theo user. Trả về 'ok' | 'warn' | 'drop'. */
  function rateLimit_(userId) {
    const limit = ConfigManager.getNumber('RATE_LIMIT_PER_MIN', 20);
    const cache = CacheService.getScriptCache();
    const key = 'RL_' + userId;
    const n = Number(cache.get(key) || 0) + 1;
    cache.put(key, String(n), 60);
    if (n <= limit) return 'ok';
    return n === limit + 1 ? 'warn' : 'drop';
  }

  function extractShopeeUrl_(text) {
    const m = text.match(SHOPEE_RE);
    return m ? m[0].replace(/[)\]}>.,;!?'"]+$/, '') : null;
  }

  function handleCommand_(event) {
    const parts = event.text.split(/\s+/);
    let name = parts[0].toLowerCase();
    if (name.charAt(0) === '/') name = '#' + name.substring(1);
    const cmd = COMMANDS[name];
    if (!cmd) {
      return reply_(event, 'Mình chưa hiểu lệnh này. Gõ #menu để xem các lệnh nhé.');
    }
    if (cmd.adminOnly && !ConfigManager.isAdmin(event.userId)) {
      LogService.warn('admin_denied', 'User thường gọi lệnh admin: ' + name, null, event.userId, 'MessageRouter');
      return reply_(event, 'Bạn không có quyền sử dụng chức năng này.');
    }
    return cmd.run(event, parts.slice(1));
  }

  /** Điểm vào duy nhất cho mọi tin nhắn đã qua xác thực và chống trùng. */
  function handleMessage(event) {
    const rl = rateLimit_(event.userId);
    if (rl === 'drop') return;
    if (rl === 'warn') return reply_(event, 'Bạn gửi hơi nhanh, vui lòng chờ một chút rồi thử lại nhé.');

    if (event.kind === 'image' || event.kind === 'sticker' || event.kind === 'other') {
      return reply_(event, 'Mình chỉ đọc được tin nhắn văn bản. Hãy gửi link Shopee hoặc gõ #menu nhé.');
    }
    const text = event.text;
    if (!text) return;

    if (text.charAt(0) === '#' || text.charAt(0) === '/') return handleCommand_(event);

    const url = extractShopeeUrl_(text);
    if (url) {
      if (typeof ShopeeService !== 'undefined' && ShopeeService.handleShopeeLink) {
        return ShopeeService.handleShopeeLink(event, url);
      }
      return reply_(event, '✅ Đã nhận link Shopee.\nTính năng tạo link hoàn tiền sẽ sớm hoạt động.');
    }
    // Phase 6+: kiểm tra trạng thái hội thoại (ví dụ đang chờ thông tin ngân hàng) tại đây
    return reply_(event, 'Mình chưa hiểu tin nhắn này. Hãy gửi link sản phẩm Shopee hoặc gõ #menu nhé.');
  }

  return { handleMessage: handleMessage, extractShopeeUrl: extractShopeeUrl_ };
})();
