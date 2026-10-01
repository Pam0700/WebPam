/**
 * Code.gs - Điểm vào Web App.
 * doGet: ?page=admin&key=... -> trang admin; còn lại -> JSON kiểm tra sống.
 * doPost (nhận webhook Zalo) sẽ thêm ở Phase 5 trong Webhook.gs.
 */
const APP_VERSION = '1.0.0';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.page === 'admin') {
    if (!AdminService.checkKey(p.key)) {
      return ContentService.createTextOutput('Forbidden').setMimeType(ContentService.MimeType.TEXT);
    }
    const t = HtmlService.createTemplateFromFile('AdminPage');
    t.token = p.key;
    return t.evaluate()
      .setTitle('Zalo Affiliate Bot - Admin')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok', service: 'Zalo Affiliate Bot', version: APP_VERSION
  })).setMimeType(ContentService.MimeType.JSON);
}
