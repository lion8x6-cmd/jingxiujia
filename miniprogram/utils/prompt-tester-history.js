/**
 * 提示词测试历史记录 - 本地持久化
 * 每条记录保存：原图、结果图、提示词、模板名、负面提示词、时间
 */

const STORAGE_KEY = 'prompt_tester_history_v1';
const MAX_RECORDS = 100;

function getAll() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || [];
  } catch (e) {
    return [];
  }
}

function save(list) {
  // 最多保留 MAX_RECORDS 条
  const trimmed = list.slice(0, MAX_RECORDS);
  wx.setStorageSync(STORAGE_KEY, trimmed);
}

function addRecord({ originalPath, resultPath, prompt, negativePrompt, promptName }) {
  const list = getAll();
  const record = {
    id: 'pt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    originalPath,
    resultPath,
    prompt: (prompt || '').trim(),
    negativePrompt: (negativePrompt || '').trim(),
    promptName: promptName || '',
    createdAt: Date.now()
  };
  list.unshift(record);
  save(list);
  return record;
}

function getById(id) {
  return getAll().find(r => r.id === id) || null;
}

function removeRecord(id) {
  const list = getAll().filter(r => r.id !== id);
  save(list);
}

function clearAll() {
  wx.setStorageSync(STORAGE_KEY, []);
}

module.exports = {
  getAll,
  addRecord,
  getById,
  removeRecord,
  clearAll
};
