/**
 * QueueService.gs - Chống xử lý trùng webhook (idempotency) bằng sheet Queue.
 * claimEvent(): cache (nhanh) -> khoá -> quét 500 dòng gần nhất -> ghi dòng "processing".
 * Phase 9 sẽ dùng thêm sheet này làm hàng đợi việc nặng.
 */
const QueueService = (function () {
  const SCAN_ROWS = 500;
  const CACHE_SEC = 21600; // 6 giờ

  function cacheKey_(id) { return 'EVT_' + Utils.truncate(id, 200); }

  /** @return {claimed:boolean, row:number|null} */
  function claimEvent(event) {
    const cache = CacheService.getScriptCache();
    const key = cacheKey_(event.eventId);
    if (cache.get(key)) return { claimed: false, row: null };

    const lock = LockService.getScriptLock();
    const locked = lock.tryLock(8000);
    if (!locked) {
      // Không chắc có trùng hay không: ưu tiên không mất tin nhắn
      LogService.warn('queue_lock', 'Không lấy được khoá, vẫn xử lý event', { eventId: event.eventId }, event.userId, 'QueueService.claimEvent');
      return { claimed: true, row: null };
    }
    try {
      if (cache.get(key)) return { claimed: false, row: null };
      const sh = ConfigManager.getSpreadsheet().getSheetByName('Queue');
      const last = sh.getLastRow();
      if (last > 1) {
        const start = Math.max(2, last - SCAN_ROWS + 1);
        const ids = sh.getRange(start, 1, last - start + 1, 1).getValues();
        for (let i = 0; i < ids.length; i++) {
          if (String(ids[i][0]) === event.eventId) {
            cache.put(key, '1', CACHE_SEC);
            return { claimed: false, row: null };
          }
        }
      }
      sh.appendRow([event.eventId, event.kind, event.preview || '', 'processing', Utils.nowStr(), '', '']);
      const row = sh.getLastRow();
      cache.put(key, '1', CACHE_SEC);
      return { claimed: true, row: row };
    } finally {
      lock.releaseLock();
    }
  }

  function finish(row, status, error) {
    if (!row) return;
    try {
      const sh = ConfigManager.getSpreadsheet().getSheetByName('Queue');
      sh.getRange(row, 4).setValue(status);
      sh.getRange(row, 6, 1, 2).setValues([[Utils.nowStr(), Utils.truncate(error || '', 500)]]);
    } catch (e) {
      console.error('QueueService.finish: ' + e.message);
    }
  }

  return { claimEvent: claimEvent, finish: finish };
})();
