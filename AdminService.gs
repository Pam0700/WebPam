/**
 * AdminService.gs - API cho trang admin (gọi qua google.script.run -> adminApi).
 * Web app mở công khai (để Zalo gọi được) nên MỌI hành động đều phải kèm ADMIN_WEB_KEY.
 * Các tab Users/Orders/Payments sẽ được thêm khi các Phase tương ứng hoàn thành.
 */
const AdminService = (function () {
  function checkKey(key) {
    const real = ConfigManager.getProperty('ADMIN_WEB_KEY');
    if (!real || !key || String(key).length !== real.length) return false;
    let diff = 0; // so sánh thời gian cố định
    for (let i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ String(key).charCodeAt(i);
    return diff === 0;
  }

  function overview() {
    const props = {};
    ['SPREADSHEET_ID', 'ZALO_BOT_TOKEN', 'ZALO_BOT_SECRET', 'WEBHOOK_KEY', 'ADMIN_USER_IDS', 'SHOPEE_COOKIE'].forEach(function (k) {
      props[k] = !!ConfigManager.getProperty(k);
    });
    const tabs = [];
    try {
      const ss = ConfigManager.getSpreadsheet();
      SHEET_SCHEMA.forEach(function (d) {
        const sh = ss.getSheetByName(d.name);
        let headerOk = false, rows = 0;
        if (sh) {
          const cur = sh.getRange(1, 1, 1, d.headers.length).getValues()[0];
          headerOk = cur.every(function (v, i) { return String(v).trim() === d.headers[i]; });
          rows = Math.max(0, sh.getLastRow() - 1);
        }
        tabs.push({ name: d.name, exists: !!sh, headerOk: headerOk, rows: rows });
      });
      props.sheetUrl = ss.getUrl();
    } catch (e) {
      props.sheetError = e.message;
    }
    return { version: APP_VERSION, testMode: ConfigManager.isTestMode(), props: props, tabs: tabs, time: Utils.nowStr() };
  }

  function editableConfig() {
    const keys = Object.keys(ConfigManager.DEFAULTS);
    return keys.map(function (k) {
      return { key: k, value: ConfigManager.get(k, ''), description: ConfigManager.DEFAULTS[k][1] };
    });
  }

  function setConfig(p) {
    if (!p || ConfigManager.DEFAULTS[p.key] === undefined || p.key === 'SYNC_CURSOR') throw new Error('Key không được phép sửa.');
    ConfigManager.setSheetValue(p.key, String(p.value).trim(), ConfigManager.DEFAULTS[p.key][1]);
    LogService.info('admin_config', 'Đổi cấu hình ' + p.key, { value: p.value }, 'admin_web', 'AdminService.setConfig');
    return true;
  }

  function logs(p) {
    const sh = ConfigManager.getSpreadsheet().getSheetByName('Logs');
    const last = sh.getLastRow();
    if (last < 2) return [];
    const n = Math.min(Number(p && p.limit) || 50, 200);
    const start = Math.max(2, last - n + 1);
    const level = p && p.level;
    return sh.getRange(start, 1, last - start + 1, 7).getValues()
      .map(function (r) { return { t: r[0], level: r[1], event: r[2], user: r[3], fn: r[4], msg: r[5], data: r[6] }; })
      .filter(function (r) { return !level || r.level === level; })
      .reverse();
  }

  function sendTest(p) {
    const chatId = String(p && p.chatId || '').trim();
    if (!chatId) throw new Error('Cần nhập chat_id.');
    return ZaloService.sendMessage(chatId, (p.text || '✅ Tin nhắn test từ trang admin.'));
  }

  const ACTIONS = {
    overview: overview,
    getConfig: editableConfig,
    setConfig: setConfig,
    logs: logs,
    zaloGetMe: function () { return ZaloService.getMe(); },
    webhookInfo: function () { return ZaloService.getWebhookInfo(); },
    registerWebhook: function () { return ZaloService.registerWebhook(); },
    sendTest: sendTest
  };

  /** Điểm vào duy nhất. Trả {ok,data} hoặc {ok:false,error}; không lộ stack trace. */
  function dispatch(token, action, params) {
    try {
      if (!checkKey(token)) return { ok: false, error: 'Không có quyền.' };
      if (!ACTIONS[action]) return { ok: false, error: 'Hành động không hợp lệ.' };
      return { ok: true, data: ACTIONS[action](params || {}) };
    } catch (e) {
      LogService.error('admin_api', action + ': ' + e.message, null, 'admin_web', 'AdminService.dispatch');
      return { ok: false, error: Utils.maskSecrets(e.message) };
    }
  }

  return { checkKey: checkKey, dispatch: dispatch };
})();

/** Hàm global để google.script.run gọi được. */
function adminApi(token, action, params) {
  return AdminService.dispatch(token, action, params);
}
