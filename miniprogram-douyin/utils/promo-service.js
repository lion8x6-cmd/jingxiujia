// 分销素材服务 - 种草文案生成（豆包 doubao-seed-character 对话模型）
const platform = require('./platform.js');
const { ARK_CONFIG } = require('./ark-config');

const COPY_MODEL = 'doubao-seed-character-260628';

// 日常种草文案系统提示词：强真实感、弱营销
const COPY_SYSTEM_PROMPT = [
  '你是一个爱分享生活的普通女生/男生，在抖音、小红书、朋友圈随手分享好用的修图小工具。',
  '请写一条真实、自然、口语化的"种草"文案，分享一个叫「P图精修必拍」的修图小程序把废片/随手拍修好看的体验。',
  '要求：',
  '1. 像朋友安利，不要广告腔，不要"家人们快冲""点击链接""下载""限时优惠"等硬广/带货话术；',
  '2. 60~110 字，可带 2~4 个 emoji，语气轻松接地气；',
  '3. 可以提到：废片拯救、一键精修、皮肤自然不假白、老照片修复、抠图、消除路人等真实功能点（挑 1~2 个即可，别全堆上）；',
  '4. 结尾自然带 2~3 个话题标签，如 #修图 #照片修复 #p图 #精修 之类，放在最后一行；',
  '5. 文案里不要出现"AI"字样，只输出文案本身，不要任何解释、标题、引号或编号。'
].join('\n');

/**
 * 生成一条日常种草文案
 * @param {object} opts
 * @param {string} [opts.styleHint] 风格/场景提示（可选，如"老照片修复""男生写真"）
 * @param {number} [opts.seed] 随机种子，用于"换一批"产生不同结果
 * @returns {Promise<string>}
 */
function generateCopy(opts) {
  opts = opts || {};
  const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 100000);
  let userPrompt = '请帮我写一条分享修图体验的日常种草文案（第 ' + seed + ' 次尝试，请换一个不同的切入角度和开头）。';
  if (opts.styleHint) {
    userPrompt += '这次主要想分享的点是：' + opts.styleHint + '。';
  }

  return new Promise((resolve, reject) => {
    platform.request({
      url: ARK_CONFIG.baseUrl + '/chat/completions',
      method: 'POST',
      timeout: 60000,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ARK_CONFIG.apiKey
      },
      data: {
        model: COPY_MODEL,
        messages: [
          { role: 'system', content: COPY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.95,
        top_p: 0.9,
        max_tokens: 400,
        stream: false
      },
      success(res) {
        if (res.statusCode !== 200) {
          const msg = (res.data && res.data.error && res.data.error.message) || ('HTTP ' + res.statusCode);
          reject(new Error('文案生成失败：' + msg));
          return;
        }
        const choice = res.data && res.data.choices && res.data.choices[0];
        let text = (choice && choice.message && choice.message.content) || '';
        text = text.trim()
          .replace(/^["'“”]+|["'“”]+$/g, '')  // 去掉首尾引号
          .replace(/^文案[:：]?\s*/m, '');
        if (!text) {
          reject(new Error('文案为空，请重试'));
          return;
        }
        resolve(text);
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常，请重试'));
      }
    });
  });
}

/**
 * AI 优化文案：把用户随手写的几个字润色成一句简短精炼的种草短句
 * @param {string} rawText 用户输入的大白话/关键词
 * @returns {Promise<string>} 50 字以内的精炼文案
 */
function optimizeCopy(rawText) {
  const input = (rawText || '').trim();
  const systemPrompt = [
    '你是短视频图文文案高手。用户会给你几个字或一句大白话，是他想发抖音/小红书的修图分享，',
    '请帮他润色成一句简短、自然、口语化的种草文案。',
    '要求：',
    '1. 总长度控制在 50 个汉字以内，越短越精炼越好，不要长篇大论；',
    '2. 像本人随口分享，不要广告腔、不要"下载""点击""限时"等硬广话术；',
    '3. 可带 1~2 个 emoji，结尾最多带 1 个话题标签（如 #修图），也可以不带；',
    '4. 保留用户原本想表达的核心意思，不要凭空编造他没提到的内容；',
    '5. 文案里不要出现"AI"字样，只输出润色后的文案本身，不要解释、不要引号、不要编号。'
  ].join('\n');

  return new Promise((resolve, reject) => {
    platform.request({
      url: ARK_CONFIG.baseUrl + '/chat/completions',
      method: 'POST',
      timeout: 30000,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ARK_CONFIG.apiKey
      },
      data: {
        model: COPY_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '帮我润色这句话：' + input }
        ],
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 200,
        stream: false
      },
      success(res) {
        if (res.statusCode !== 200) {
          const msg = (res.data && res.data.error && res.data.error.message) || ('HTTP ' + res.statusCode);
          reject(new Error('优化失败：' + msg));
          return;
        }
        const choice = res.data && res.data.choices && res.data.choices[0];
        let text = (choice && choice.message && choice.message.content) || '';
        text = text.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/^文案[:：]?\s*/m, '');
        // 兜底：超长就截断到 50 字
        if (text.length > 50) text = text.slice(0, 49) + '…';
        if (!text) { reject(new Error('优化结果为空，请重试')); return; }
        resolve(text);
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常，请重试'));
      }
    });
  });
}

module.exports = {
  generateCopy,
  optimizeCopy,
  COPY_MODEL
};
