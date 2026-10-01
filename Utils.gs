/**
 * Utils.gs - Hàm tiện ích dùng chung (thời gian, id ngẫu nhiên, hash, cắt chuỗi).
 */
const Utils = {
  TZ: 'Asia/Ho_Chi_Minh',

  /** Thời gian hiện tại dạng yyyy-MM-dd HH:mm:ss (giờ VN). */
  nowStr: function () {
    return Utilities.formatDate(new Date(), Utils.TZ, 'yyyy-MM-dd HH:mm:ss');
  },

  uuid: function () {
    return Utilities.getUuid();
  },

  /** Chuỗi ngẫu nhiên, bỏ ký tự dễ nhầm (0/O, 1/I). */
  randomString: function (len, alphabet) {
    const chars = alphabet || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  },

  /** Secret ngẫu nhiên (hex) lấy từ UUID, đủ dài cho webhook secret/key. */
  generateSecret: function (len) {
    let s = '';
    while (s.length < len) s += Utilities.getUuid().replace(/-/g, '');
    return s.substring(0, len);
  },

  /** So sánh chuỗi thời gian cố định (chống dò secret). */
  safeEqual: function (a, b) {
    a = String(a || ''); b = String(b || '');
    if (!a || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  },

  truncate: function (s, max) {
    s = (s === null || s === undefined) ? '' : String(s);
    return s.length > max ? s.substring(0, max) + '...' : s;
  },

  sha256Hex: function (str) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
    return bytes.map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    }).join('');
  },

  /** Che token dạng 123456:ABC... khỏi chuỗi bất kỳ. */
  maskSecrets: function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/\d{5,}:[A-Za-z0-9_\-]{20,}/g, '[REDACTED_TOKEN]');
  }
};
