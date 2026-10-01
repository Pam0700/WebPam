/**
 * Setup.gs - Tự tạo Google Sheets DB "ZaloAffiliateBot_DB" + kiểm tra cấu hình.
 * Chạy lần lượt trong editor: setupSheets() -> initSecrets() -> checkSetup()
 * setupSheets() chạy lại nhiều lần vẫn an toàn (không xoá dữ liệu, không tạo file mới).
 */
const DB_NAME = 'ZaloAffiliateBot_DB';

// Cột số (còn lại tất cả đặt Plain text để không mất số 0 đầu / không bị đổi sang dạng khoa học)
const SHEET_SCHEMA = [
  { name: 'Users', numeric: [], headers: ['user_id', 'display_name', 'phone', 'chat_id', 'source', 'status', 'bank_name', 'account_number', 'account_name', 'conv_state', 'conv_state_at', 'created_at', 'updated_at', 'last_message', 'last_activity'] },
  { name: 'LinkConversions', numeric: ['est_commission'], headers: ['conversion_id', 'user_id', 'chat_id', 'click_id', 'sub_id', 'product_name', 'original_url', 'affiliate_url', 'shortened_url', 'created_at', 'status', 'error_message', 'product_id', 'shop_id', 'est_commission', 'link_method'] },
  { name: 'Orders', numeric: ['order_amount', 'commission_gross', 'tax_rate', 'customer_rate', 'operator_rate', 'tax_amount', 'net_commission', 'customer_amount', 'operator_amount'], headers: ['order_id', 'order_time', 'order_status', 'product_name', 'order_amount', 'commission_gross', 'sub_id', 'user_id', 'source', 'import_id', 'updated_at', 'raw_status', 'complete_time', 'shop_name', 'product_id', 'tax_rate', 'customer_rate', 'operator_rate', 'tax_amount', 'net_commission', 'customer_amount', 'operator_amount'] },
  { name: 'Wallet', numeric: ['pending_amount', 'confirmed_amount', 'paid_amount', 'available_amount', 'cancelled_amount'], headers: ['user_id', 'pending_amount', 'confirmed_amount', 'paid_amount', 'available_amount', 'cancelled_amount', 'updated_at'] },
  { name: 'Payments', numeric: ['amount'], headers: ['payment_id', 'user_id', 'bank_name', 'account_number', 'account_name', 'amount', 'status', 'requested_at', 'processed_at', 'note', 'reference_code', 'request_key'] },
  { name: 'Config', numeric: [], headers: ['key', 'value', 'description'] },
  { name: 'Logs', numeric: [], headers: ['timestamp', 'level', 'event', 'user_id', 'function', 'message', 'data'] },
  { name: 'Queue', numeric: [], headers: ['event_id', 'type', 'payload', 'status', 'received_at', 'processed_at', 'error'] },
  { name: 'Imports', numeric: ['row_count', 'success_count', 'skipped_count'], headers: ['import_id', 'file_name', 'source', 'row_count', 'success_count', 'skipped_count', 'status', 'created_at', 'finished_at'] }
];

/** Tạo (hoặc kiểm tra) toàn bộ Sheet. Trả về báo cáo dạng mảng chuỗi. */
function setupSheets() {
  const report = [];
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('SPREADSHEET_ID');
  let ss;
  let isNew = false;

  if (existingId) {
    try {
      ss = SpreadsheetApp.openById(existingId);
      report.push('Dùng lại file hiện có: ' + ss.getName());
    } catch (e) {
      // Không tự tạo file mới để tránh mất dấu dữ liệu cũ
      throw new Error('SPREADSHEET_ID đã lưu nhưng không mở được. Nếu muốn tạo mới, xoá property SPREADSHEET_ID rồi chạy lại.');
    }
  } else {
    ss = SpreadsheetApp.create(DB_NAME);
    props.setProperty('SPREADSHEET_ID', ss.getId());
    isNew = true;
    report.push('Đã tạo file mới: ' + DB_NAME);
  }

  ss.setSpreadsheetTimeZone(Utils.TZ);
  SHEET_SCHEMA.forEach(function (def) { ensureSheet_(ss, def, report); });

  // File mới: xoá tab mặc định (Sheet1 / Trang tính1)
  if (isNew) {
    const names = SHEET_SCHEMA.map(function (d) { return d.name; });
    ss.getSheets().forEach(function (s) {
      if (names.indexOf(s.getName()) === -1) ss.deleteSheet(s);
    });
  }

  seedConfig_(ss, report);
  ConfigManager.clearCache();

  report.push('URL: ' + ss.getUrl());
  report.push('SPREADSHEET_ID đã lưu trong Script Properties.');
  Logger.log(report.join('\n'));
  return report;
}

function ensureSheet_(ss, def, report) {
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    report.push('+ Tạo tab ' + def.name);
  }
  const n = def.headers.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());

  const current = sh.getRange(1, 1, 1, n).getValues()[0].map(function (v) { return String(v).trim(); });
  const same = current.every(function (v, i) { return v === def.headers[i]; });
  const empty = current.every(function (v) { return v === ''; });

  if (!same) {
    if (empty || sh.getLastRow() <= 1) {
      sh.getRange(1, 1, 1, n).setValues([def.headers]);
    } else {
      // Đã có dữ liệu mà header khác: không sửa, chỉ cảnh báo
      report.push('! Tab ' + def.name + ': header khác chuẩn, đã có dữ liệu nên KHÔNG sửa. Hãy kiểm tra thủ công.');
      return;
    }
  }

  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  def.headers.forEach(function (h, i) {
    if (def.numeric.indexOf(h) === -1) {
      sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@'); // Plain text
    }
  });
}

/** Thêm các key Config còn thiếu (không ghi đè giá trị đã sửa). */
function seedConfig_(ss, report) {
  const sh = ss.getSheetByName('Config');
  const last = sh.getLastRow();
  const have = {};
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[String(r[0]).trim()] = true; });
  }
  const rows = [];
  Object.keys(ConfigManager.DEFAULTS).forEach(function (k) {
    if (!have[k]) rows.push([k, ConfigManager.DEFAULTS[k][0], ConfigManager.DEFAULTS[k][1]]);
  });
  if (rows.length) {
    sh.getRange(last + 1, 1, rows.length, 3).setValues(rows);
    report.push('+ Config: thêm ' + rows.length + ' key mặc định');
  }
}

/** Tự sinh ZALO_BOT_SECRET, WEBHOOK_KEY, ADMIN_WEB_KEY nếu chưa có (không in giá trị). */
function initSecrets() {
  const made = [];
  [['ZALO_BOT_SECRET', 40], ['WEBHOOK_KEY', 32], ['ADMIN_WEB_KEY', 32]].forEach(function (p) {
    if (!ConfigManager.getProperty(p[0])) {
      ConfigManager.setProperty(p[0], Utils.generateSecret(p[1]));
      made.push(p[0]);
    }
  });
  Logger.log(made.length ? 'Đã tạo: ' + made.join(', ') : 'Các secret đã tồn tại, không đổi.');
}

/** In link trang admin vào Execution log (chỉ chủ script xem được). */
function showAdminUrl() {
  const base = ConfigManager.getProperty('WEBAPP_URL') || ScriptApp.getService().getUrl();
  Logger.log(base + '?page=admin&key=' + ConfigManager.require('ADMIN_WEB_KEY'));
}

/** Kiểm tra cấu hình, chỉ in có/không, không in giá trị. */
function checkSetup() {
  const out = [];
  ['SPREADSHEET_ID', 'ZALO_BOT_TOKEN', 'ZALO_BOT_SECRET', 'WEBHOOK_KEY', 'ADMIN_WEB_KEY', 'ADMIN_USER_IDS'].forEach(function (k) {
    out.push((ConfigManager.getProperty(k) ? 'OK     ' : 'THIẾU  ') + k);
  });
  try {
    const ss = ConfigManager.getSpreadsheet();
    SHEET_SCHEMA.forEach(function (d) {
      out.push((ss.getSheetByName(d.name) ? 'OK     tab ' : 'THIẾU  tab ') + d.name);
    });
  } catch (e) {
    out.push('Chưa mở được Spreadsheet: ' + e.message);
  }
  Logger.log(out.join('\n'));
  return out;
}
