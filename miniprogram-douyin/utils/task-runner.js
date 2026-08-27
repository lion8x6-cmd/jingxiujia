/**
 * 全局后台任务运行器
 *
 * 将图片生成任务从 progress 页抽离到全局单例，页面退出/切后台后任务继续运行。
 * progress 页通过 subscribe 监听进度，records 页通过 isRunning/getActiveBatch 查询状态。
 *
 * 使用：
 *   const runner = require('../../utils/task-runner');
 *   runner.startBatch({ taskId, batchId, isBatch, total });
 *   runner.subscribe(callback);   // 进度回调
 *   runner.stop();                // 用户主动停止
 *   runner.isRunning();
 */
const storage = require('./storage');
const aiService = require('./ai-service');
const { TaskStatus } = require('./task-status');

const listeners = new Set();
let running = false;
let currentBatch = null;       // { taskId, batchId, isBatch, total, items }
let cancelToken = null;
let _progress = 0;
let _statusText = '';
let _completedCount = 0;
let _total = 0;
let _currentIndex = 0;

function notify(event, data) {
  listeners.forEach(fn => {
    try { fn(event, data); } catch (e) { console.error('[task-runner] listener error', e); }
  });
}

/**
 * 启动一批任务（幂等：已有任务在跑则忽略）
 */
function startBatch(opts) {
  if (running) {
    return currentBatch;
  }
  const { taskId, batchId, isBatch, total } = opts;
  const records = storage.getRecords();
  let items = [];
  if (isBatch) {
    items = records
      .filter(r => {
        if (batchId) return r.batchId === batchId;
        return r.batchTotal === total && r.batchIndex > 0;
      })
      .sort((a, b) => a.batchIndex - b.batchIndex);
  } else {
    items = records.filter(r => r.taskId === taskId);
  }

  // 只处理未完成的（queued/processing），失败的需要用户显式重试
  const pending = items.filter(r =>
    r.status === TaskStatus.QUEUED ||
    r.status === TaskStatus.PROCESSING
  );

  if (!pending.length) {
    // 全部已完成，直接通知完成
    const allDone = items.every(r => r.status === TaskStatus.COMPLETED);
    notify('done', {
      batchId,
      successCount: allDone ? items.length : 0,
      failedCount: allDone ? 0 : items.length,
      cancelledCount: 0,
      cancelled: false
    });
    return null;
  }

  running = true;
  currentBatch = { taskId, batchId, isBatch, total, items, pending };
  _progress = 0;
  _completedCount = 0;
  _currentIndex = 0;
  _total = pending.length;
  _statusText = `正在精修第 1/${_total} 张`;
  cancelToken = aiService.createCancelToken();

  notify('start', { batchId, total: _total });
  runLoop();
  return currentBatch;
}

async function runLoop() {
  const items = currentBatch.pending;
  const total = items.length;
  let successCount = 0;
  let cancelledCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < items.length; i++) {
      if (!running) {
        for (let j = i; j < items.length; j++) {
          if (items[j].status !== TaskStatus.COMPLETED) {
            storage.updateRecord(items[j].id, { status: TaskStatus.CANCELLED });
            cancelledCount++;
          }
        }
        break;
      }

      const item = items[i];
      _currentIndex = i;
      _statusText = `正在精修第 ${i + 1}/${total} 张`;
      notify('progress', {
        progress: _progress,
        statusText: _statusText,
        completedCount: successCount,
        total,
        currentIndex: i
      });

      storage.updateRecord(item.id, { status: TaskStatus.PROCESSING });
      notify('item-update', { id: item.id, status: TaskStatus.PROCESSING });

      try {
        const result = await aiService.generateEdit({
          imagePath: item.originalUrl,
          imageUrl: item.originalUrl,
          templateId: item.templateId,
          basePrompt: item.prompt || '',
          negativePrompt: item.negativePrompt || '',
          adjustments: {},
          signal: cancelToken
        });

        if (!running) {
          storage.updateRecord(item.id, { status: TaskStatus.CANCELLED });
          cancelledCount++;
          for (let j = i + 1; j < items.length; j++) {
            storage.updateRecord(items[j].id, { status: TaskStatus.CANCELLED });
            cancelledCount++;
          }
          break;
        }

        storage.updateRecord(item.id, {
          status: TaskStatus.COMPLETED,
          resultUrl: result.url,
          progress: 100
        });
        successCount++;
        // 按已完成张数推进进度（0~99）
        _progress = Math.min(99, Math.round((successCount / total) * 99 * 100) / 100);
        _completedCount = successCount;
        notify('item-update', { id: item.id, status: TaskStatus.COMPLETED, resultUrl: result.url });
        notify('progress', {
          progress: _progress,
          statusText: _statusText,
          completedCount: successCount,
          total,
          currentIndex: i
        });
      } catch (err) {
        if (err.cancelled || !running) {
          storage.updateRecord(item.id, { status: TaskStatus.CANCELLED });
          cancelledCount++;
        } else {
          const errMsg = err.message || '处理失败';
          console.error('[task-runner] 第', i + 1, '张失败:', errMsg, err);
          storage.updateRecord(item.id, { status: TaskStatus.FAILED, errorMsg: errMsg });
          failedCount++;
          notify('item-update', { id: item.id, status: TaskStatus.FAILED, errorMsg: errMsg });
        }
        _completedCount = successCount;
        notify('progress', {
          progress: _progress,
          statusText: _statusText,
          completedCount: successCount,
          total,
          currentIndex: i
        });
      }
    }
  } catch (fatalErr) {
    // 捕获循环外的意外错误，确保 running 被重置
    console.error('[task-runner] 运行循环致命错误:', fatalErr);
  } finally {
    // 无论成功/失败/取消，都确保重置运行状态（修复任务失败后新任务永远卡99%的bug）
    _progress = 100;
    running = false;
    notify('done', {
      batchId: currentBatch ? currentBatch.batchId : null,
      taskId: currentBatch ? currentBatch.taskId : null,
      isBatch: currentBatch ? currentBatch.isBatch : false,
      total,
      successCount,
      failedCount,
      cancelledCount,
      cancelled: cancelledCount > 0
    });
    currentBatch = null;
    cancelToken = null;
  }
}

/**
 * 用户主动停止
 */
function stop() {
  if (!running) return;
  running = false;
  if (cancelToken) cancelToken.abort();
}

/**
 * 重试失败的任务（原地重试，不跳转到上传页）
 * 返回 { ok, taskId, batchId, isBatch, total } 或 { ok:false }
 */
function retryBatch(batchId) {
  if (running) return { ok: false, reason: 'running' };
  // 将失败的记录重置为 queued
  const records = storage.getRecords();
  const items = records.filter(r =>
    (batchId ? r.batchId === batchId : false) &&
    (r.status === TaskStatus.FAILED || r.status === TaskStatus.CANCELLED || r.status === TaskStatus.TIMEOUT)
  );
  if (!items.length) return { ok: false, reason: 'no-failed-items' };

  const isBatch = items.length > 1 || items[0].isBatch;
  const taskId = items[0].taskId;
  const total = isBatch ? (items[0].batchTotal || items.length) : 1;

  items.forEach(r => {
    storage.updateRecord(r.id, {
      status: TaskStatus.QUEUED,
      errorMsg: '',
      resultUrl: ''
    });
  });

  startBatch({ taskId, batchId, isBatch, total });
  return { ok: true, taskId, batchId, isBatch, total };
}

function subscribe(fn) {
  listeners.add(fn);
  if (running) {
    fn('start', { batchId: currentBatch.batchId, total: _total });
    fn('progress', {
      progress: _progress,
      statusText: _statusText,
      completedCount: _completedCount,
      total: _total,
      currentIndex: _currentIndex
    });
  }
  return () => listeners.delete(fn);
}

function isRunning() { return running; }
function getActiveBatch() { return currentBatch; }
function getProgress() { return _progress; }
function getStatusText() { return _statusText; }
function getCompletedCount() { return _completedCount; }
function getTotal() { return _total; }

module.exports = {
  startBatch,
  stop,
  retryBatch,
  subscribe,
  isRunning,
  getActiveBatch,
  getProgress,
  getStatusText,
  getCompletedCount,
  getTotal
};
