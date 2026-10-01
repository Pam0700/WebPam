/**
 * LogService.gs - Ghi log vào sheet Logs (bản tối thiểu cho Phase 4, mở rộng ở Phase 13).
 * Tự động che token/cookie/secret/số tài khoản. Lỗi ghi log không bao giờ làm hỏng luồng chính.
 */
const LogService = (function () {
  const SENSITIVE_KEY = /token|secret|cookie|password|authorization|api_?key|account_?number/i;

  function redact_(v, depth) {
    if (depth > 4) return '[...]';
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.slice(0, 20).map(function (x) { return redact_(x, depth + 1); });
    if (typeof v === 'object') {
      const out = {};
      Object.keys(v).forEach(function (k) {
        out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact_(v[k], depth + 1);
      });
      return out;
    }
    return v;
  }

  function safeJson_(v) {
    try {
      return typeof v === 'string' ? v : JSON.stringify(v);
    } catch (e) {
      return '[unserializable]';
    }
  }

  function write_(level, event, message, data, userId, fnName) {
    const msg = Utils.truncate(Utils.maskSecrets(message), 2000);
    const dataStr = (data === undefined || data === null || data === '')
      ? '' : Utils.truncate(Utils.maskSecrets(safeJson_(redact_(data, 0))), 4000);
    console.log('[' + level + '] ' + (event || '') + ' ' + msg);
    try {
      const sh = ConfigManager.getSpreadsheet().getSheetByName('Logs');
      if (!sh) return;
      sh.appendRow([Utils.nowStr(), level, event || '', userId || '', fnName || '', msg, dataStr]);
    } catch (e) {
      console.error('LogService ghi sheet thất bại: ' + Utils.maskSecrets(e.message));
    }
  }

  return {
    info: function (event, message, data, userId, fnName) { write_('INFO', event, message, data, userId, fnName); },
    warn: function (event, message, data, userId, fnName) { write_('WARN', event, message, data, userId, fnName); },
    error: function (event, message, data, userId, fnName) { write_('ERROR', event, message, data, userId, fnName); }
  };
})();
