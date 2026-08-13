// 本地存储管理 - 生成记录、云相册、7天销毁
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const FAILED_CLEANUP = 24 * 60 * 60 * 1000;

function getRecords() {
  return wx.getStorageSync('records') || [];
}

function saveRecords(records) {
  wx.setStorageSync('records', records);
}

function addRecord(record) {
  const records = getRecords();
  record.id = record.id || ('rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
  record.createdAt = record.createdAt || Date.now();
  record.expireAt = record.createdAt + SEVEN_DAYS;
  records.unshift(record);
  saveRecords(records);
  return record;
}

function updateRecord(id, updates) {
  const records = getRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx !== -1) {
    records[idx] = { ...records[idx], ...updates };
    saveRecords(records);
    return records[idx];
  }
  return null;
}

function removeRecord(id) {
  let records = getRecords();
  records = records.filter(r => r.id !== id);
  saveRecords(records);
}

// 批量删除：传入 id 数组
function removeRecords(ids) {
  if (!ids || !ids.length) return 0;
  const idSet = new Set(ids);
  const records = getRecords();
  const remaining = records.filter(r => !idSet.has(r.id));
  const removed = records.length - remaining.length;
  saveRecords(remaining);
  return removed;
}

function getRemainingTime(expireAt) {
  const diff = expireAt - Date.now();
  if (diff <= 0) return { expired: true, text: '已过期', days: 0, hours: 0 };
  const days = Math.floor(diff / ONE_DAY);
  const hours = Math.floor((diff % ONE_DAY) / (60 * 60 * 1000));
  return { expired: false, text: `还剩${days}天${hours}小时`, days, hours, isExpiring: diff <= ONE_DAY };
}

function cleanupExpiredRecords() {
  const records = getRecords();
  const now = Date.now();
  const valid = records.filter(r => {
    if (r.status === 'failed' || r.status === 'cancelled' || r.status === 'review_rejected') {
      return now - r.createdAt < FAILED_CLEANUP;
    }
    return r.expireAt > now;
  });
  if (valid.length !== records.length) {
    saveRecords(valid);
  }
  return valid;
}

function saveAllToAlbum(records) {
  const album = getAlbum();
  let count = 0;
  records.forEach(r => {
    if (r.resultUrl && r.status === 'completed') {
      if (!album.find(a => a.id === r.id)) {
        album.unshift({
          id: 'alb_' + r.id,
          src: r.resultUrl,
          originalSrc: r.originalUrl,
          createdAt: Date.now(),
          fromRecordId: r.id,
          type: r.type || 'retouch'
        });
        count++;
      }
      updateRecord(r.id, { savedToAlbum: true });
    }
  });
  saveAlbum(album);
  return count;
}

function getAlbum() {
  return wx.getStorageSync('album') || [];
}

function saveAlbum(album) {
  wx.setStorageSync('album', album);
}

function addToAlbum(item) {
  const album = getAlbum();
  item.id = item.id || ('alb_' + Date.now());
  item.createdAt = item.createdAt || Date.now();
  album.unshift(item);
  saveAlbum(album);
  return item;
}

function removeFromAlbum(id) {
  let album = getAlbum();
  album = album.filter(a => a.id !== id);
  saveAlbum(album);
}

function getTemplates() {
  return require('./templates').getTemplates();
}

function getBodyParts() {
  return [
    { id: 'face', name: '瘦脸', icon: '😊' },
    { id: 'eyes', name: '大眼', icon: '👁' },
    { id: 'nose', name: '瘦鼻', icon: '👃' },
    { id: 'lips', name: '美唇', icon: '👄' },
    { id: 'arm', name: '瘦手臂', icon: '💪' },
    { id: 'belly', name: '瘦肚子', icon: '🫃' },
    { id: 'leg', name: '瘦腿', icon: '🦵' },
    { id: 'body', name: '瘦身', icon: '🧍' }
  ];
}

module.exports = {
  getRecords, addRecord, updateRecord, removeRecord, removeRecords,
  getRemainingTime, cleanupExpiredRecords, saveAllToAlbum,
  getAlbum, addToAlbum, removeFromAlbum,
  getTemplates, getBodyParts
};
