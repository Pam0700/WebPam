/**
 * Config.gs - ConfigManager
 * Thứ tự ưu tiên: Script Properties -> sheet Config -> DEFAULTS -> fallback.
 * Các khóa nhạy cảm (SECRET_ONLY) CHỈ đọc từ Script Properties, không bao giờ từ sheet.
 */
const ConfigManager = (function () {
  // Chỉ nằm ở Script Properties
  const PROPERTY_ONLY = [
    'SPREADSHEET_ID', 'ZALO_BOT_TOKEN', 'ZALO_BOT_SECRET', 'WEBHOOK_KEY',
    'SHOPEE_COOKIE', 'SHOPEE_COOKIE_UPDATED_AT', 'SHORTENER_API_KEY'
  ];

  // Giá trị mặc định, đồng thời dùng để seed sheet Config: key -> [value, description]
  const DEFAULTS = {
    TAX_RATE: ['10', 'Thuế (%) trên hoa hồng gross'],
    CUSTOMER_SHARE_RATE: ['80', 'Phần khách nhận (%) trên net'],
    OPERATOR_SHARE_RATE: ['20', 'Phần vận hành (%) trên net'],
    MIN_WITHDRAWAL: ['10000', 'Số tiền rút tối thiểu (VND)'],
    WITHDRAWABLE_STATUSES: ['completed', 'Trạng thái đơn được tính vào available (phân tách bằng dấu phẩy)'],
    TEST_MODE: ['false', 'true = chế độ test, không gửi tin thật tới chat_id bắt đầu bằng test_'],
    PLATFORM_ENABLED: ['true', 'false = tạm tắt tạo link'],
    COOKIE_ALERT_REPEAT_HOURS: ['3', 'Số giờ giữa các lần báo admin cookie lỗi'],
    WEBHOOK_DEBUG: ['false', 'true = ghi payload webhook (đã che secret) vào Logs để kiểm tra, nhớ tắt sau khi xong'],
    RATE_LIMIT_PER_MIN: ['20', 'Số tin tối đa mỗi user mỗi phút'],
    SYNC_CURSOR: ['', 'Con trỏ đồng bộ đơn tự động (hệ thống tự ghi)']
  };

  const CACHE_KEY = 'CFG_SHEET_V1';
  const CACHE_TTL = 120; // giây
  let ssMemo_ = null;

  function props_() {
    return PropertiesService.getScriptProperties();
  }

  function getProperty(key) {
    const v = props_().getProperty(key);
    return (v === null || v === '') ? null : v;
  }

  function setProperty(key, value) {
    props_().setProperty(key, String(value));
  }

  /** Mở spreadsheet một lần cho mỗi lần chạy (memo). */
  function getSpreadsheet() {
    if (ssMemo_) return ssMemo_;
    const id = getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Chưa có SPREADSHEET_ID. Hãy chạy setupSheets() trước.');
    ssMemo_ = SpreadsheetApp.openById(id);
    return ssMemo_;
  }

  function readSheetConfig_() {
    const cache = CacheService.getScriptCache();
    const hit = cache.get(CACHE_KEY);
    if (hit) {
      try { return JSON.parse(hit); } catch (e) { /* đọc lại từ sheet */ }
    }
    const map = {};
    try {
      const sh = getSpreadsheet().getSheetByName('Config');
      if (sh && sh.getLastRow() > 1) {
        const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
        rows.forEach(function (r) {
          const k = String(r[0]).trim();
          if (k) map[k] = String(r[1]).trim();
        });
      }
      cache.put(CACHE_KEY, JSON.stringify(map), CACHE_TTL);
    } catch (e) {
      // Chưa setup xong: coi như sheet Config rỗng
    }
    return map;
  }

  function clearCache() {
    CacheService.getScriptCache().remove(CACHE_KEY);
  }

  function get(key, fallback) {
    const p = getProperty(key);
    if (p !== null) return p;
    if (PROPERTY_ONLY.indexOf(key) === -1) {
      const m = readSheetConfig_();
      if (m[key] !== undefined && m[key] !== '') return m[key];
    }
    if (DEFAULTS[key] !== undefined && DEFAULTS[key][0] !== '') return DEFAULTS[key][0];
    return fallback === undefined ? null : fallback;
  }

  function require_(key) {
    const v = get(key, null);
    if (v === null || v === '') throw new Error('Thiếu cấu hình bắt buộc: ' + key);
    return v;
  }

  function getNumber(key, fallback) {
    const n = Number(get(key, fallback));
    return isFinite(n) ? n : fallback;
  }

  function getBool(key, fallback) {
    const v = get(key, null);
    if (v === null) return !!fallback;
    return ['true', '1', 'yes', 'y'].indexOf(String(v).toLowerCase()) !== -1;
  }

  function getList(key) {
    const v = get(key, '');
    return String(v).split(/[,\s;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /** Ghi một giá trị vào sheet Config (không dùng cho secret). */
  function setSheetValue(key, value, description) {
    if (PROPERTY_ONLY.indexOf(key) !== -1) throw new Error(key + ' chỉ được lưu trong Script Properties.');
    const sh = getSpreadsheet().getSheetByName('Config');
    const last = sh.getLastRow();
    if (last > 1) {
      const keys = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < keys.length; i++) {
        if (String(keys[i][0]).trim() === key) {
          sh.getRange(i + 2, 2).setValue(String(value));
          clearCache();
          return;
        }
      }
    }
    sh.appendRow([key, String(value), description || '']);
    clearCache();
  }

  function isTestMode() {
    return getBool('TEST_MODE', false);
  }

  function getAdminIds() {
    return getList('ADMIN_USER_IDS');
  }

  function isAdmin(userId) {
    if (userId === null || userId === undefined || userId === '') return false;
    return getAdminIds().indexOf(String(userId)) !== -1;
  }

  return {
    DEFAULTS: DEFAULTS,
    PROPERTY_ONLY: PROPERTY_ONLY,
    get: get,
    require: require_,
    getNumber: getNumber,
    getBool: getBool,
    getList: getList,
    getProperty: getProperty,
    setProperty: setProperty,
    setSheetValue: setSheetValue,
    clearCache: clearCache,
    getSpreadsheet: getSpreadsheet,
    isTestMode: isTestMode,
    getAdminIds: getAdminIds,
    isAdmin: isAdmin
  };
})();
