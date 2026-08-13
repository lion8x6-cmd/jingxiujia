// 任务状态常量
const TaskStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  UPLOAD_FAILED: 'upload_failed',
  REVIEWING: 'reviewing',
  REVIEW_REJECTED: 'review_rejected',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  PREVIEW_READY: 'preview_ready',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled'
};

const BatchStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  ALL_COMPLETED: 'all_completed',
  PARTIAL_COMPLETED: 'partial_completed',
  ALL_FAILED: 'all_failed'
};

const RecordStatus = {
  PROCESSING: 'processing',
  VIEWABLE: 'viewable',
  EXPIRING: 'expiring',
  DESTROYED: 'destroyed',
  SAVED_TO_ALBUM: 'saved_to_album'
};

const RETRY_CONFIG = {
  UPLOAD_MAX_RETRY: 3,
  PROCESS_MAX_RETRY: 2,
  PROCESS_TIMEOUT: 60000,
  RETRY_DELAYS: [2000, 4000, 8000]
};

function getTextForStatus(status) {
  const map = {
    [TaskStatus.PENDING]: '等待中',
    [TaskStatus.UPLOADING]: '上传中',
    [TaskStatus.UPLOAD_FAILED]: '上传失败',
    [TaskStatus.REVIEWING]: '内容审核中',
    [TaskStatus.REVIEW_REJECTED]: '审核未通过',
    [TaskStatus.QUEUED]: '排队中',
    [TaskStatus.PROCESSING]: 'AI处理中',
    [TaskStatus.COMPLETED]: '处理完成',
    [TaskStatus.PREVIEW_READY]: '可预览',
    [TaskStatus.FAILED]: '处理失败',
    [TaskStatus.TIMEOUT]: '处理超时',
    [TaskStatus.CANCELLED]: '已取消'
  };
  return map[status] || status;
}

function isTerminal(status) {
  return [
    TaskStatus.COMPLETED,
    TaskStatus.PREVIEW_READY,
    TaskStatus.FAILED,
    TaskStatus.TIMEOUT,
    TaskStatus.CANCELLED,
    TaskStatus.REVIEW_REJECTED
  ].includes(status);
}

function isFailed(status) {
  return [TaskStatus.UPLOAD_FAILED, TaskStatus.FAILED, TaskStatus.TIMEOUT].includes(status);
}

module.exports = {
  TaskStatus,
  BatchStatus,
  RecordStatus,
  RETRY_CONFIG,
  getTextForStatus,
  isTerminal,
  isFailed
};
