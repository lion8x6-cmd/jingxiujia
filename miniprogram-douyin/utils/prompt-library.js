const platform = require('./platform.js');
/**
 * 提示词库 - 本地持久化
 * 供"提示词测试"页面使用，支持内置示例 + 用户新建/编辑/删除
 * 数据存储在 platform.storage 中
 */

const STORAGE_KEY = 'prompt_library_v1';

// 内置提示词（只读，不可删除，可复制后编辑）
const BUILTIN_PROMPTS = [
  {
    id: 'builtin-natural-beauty',
    name: '自然美颜',
    category: '人像',
    prompt: '保持人物五官和长相不变，自然磨皮保留皮肤纹理毛孔，去除痘印斑点和暗沉，肤色均匀提亮但不过曝，瘦脸幅度自然克制，去除凌乱碎发，发丝柔顺，整体光影通透，照片质感清晰真实。',
    negativePrompt: '换脸，网红尖脸，重度磨皮，塑料假脸，过度瘦身，五官重塑，画面变形，水印文字',
    builtin: true
  },
  {
    id: 'builtin-portrait-studio',
    name: '影棚人像',
    category: '人像',
    prompt: '专业影棚人像精修，三点布光，面部光影立体，皮肤质感真实保留毛孔，五官清晰端正，脸型轻微修饰自然，头发整洁有光泽，背景干净柔和，整体高级商业质感，8K高清。',
    negativePrompt: '换脸，过度磨皮，塑料感，网红脸，背景杂乱，光影割裂，画面变形，水印文字'
  },
  {
    id: 'builtin-enhance',
    name: '通用增强',
    category: '通用',
    prompt: '专业图片精修，整体画质提升，自动校正曝光与白平衡，适度提升对比度和清晰度，还原真实色彩，明暗层次丰富，细节锐利自然，去除噪点和灰雾感，画面干净通透，保持原图内容、构图与尺寸比例不变。',
    negativePrompt: '画面变形，拉伸压缩，裁切扩图，过度锐化，噪点，严重偏色，色彩溢出，画面模糊，水印文字'
  },
  {
    id: 'builtin-night',
    name: '夜景提亮',
    category: '风景',
    prompt: '专业夜景修图，智能提亮暗部和阴影恢复细节，压制高光过曝灯光，降低噪点和彩噪，保持夜景纯净通透，灯光色彩自然不溢出，整体明亮干净但保留夜晚氛围，避免死黑和过曝。',
    negativePrompt: '暗部死黑，灯光过曝发白，色彩溢出，噪点彩噪，画面涂抹模糊，夜晚氛围丢失，画面像白天，偏色严重'
  },
  {
    id: 'builtin-id-photo',
    name: '证件照精修',
    category: '人像',
    prompt: '专业证件照精修，肤色均匀自然，适度磨皮保留皮肤纹理，五官清晰端正保持本人特征，脸型轻微修饰自然克制，头发整洁，背景纯净均匀，光线均匀平整无阴影，画质清晰锐利，符合证件照规范，不改变人物长相。',
    negativePrompt: '换脸，改变长相，网红脸，过度磨皮塑料感，脸型大幅改变，背景杂乱有阴影，肤色惨白偏色，画面模糊噪点，水印文字'
  }
];

function getAll() {
  let list = [];
  try {
    const data = platform.getStorageSync(STORAGE_KEY);
    if (Array.isArray(data)) list = data;
  } catch (e) {}
  // 内置提示词始终在前
  const userPrompts = list.filter(p => !p.builtin);
  return [...BUILTIN_PROMPTS, ...userPrompts];
}

function getById(id) {
  return getAll().find(p => p.id === id) || null;
}

function getUserPrompts() {
  let list = [];
  try {
    const data = platform.getStorageSync(STORAGE_KEY);
    if (Array.isArray(data)) list = data;
  } catch (e) {}
  return list;
}

function saveUserPrompts(list) {
  platform.setStorageSync(STORAGE_KEY, list);
}

function addPrompt({ name, category, prompt, negativePrompt }) {
  const list = getUserPrompts();
  const item = {
    id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: (name || '未命名').trim(),
    category: (category || '自定义').trim(),
    prompt: (prompt || '').trim(),
    negativePrompt: (negativePrompt || '').trim(),
    builtin: false,
    createdAt: Date.now()
  };
  list.push(item);
  saveUserPrompts(list);
  return item;
}

function updatePrompt(id, updates) {
  const list = getUserPrompts();
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    name: updates.name !== undefined ? updates.name.trim() : list[idx].name,
    category: updates.category !== undefined ? updates.category.trim() : list[idx].category,
    prompt: updates.prompt !== undefined ? updates.prompt.trim() : list[idx].prompt,
    negativePrompt: updates.negativePrompt !== undefined ? updates.negativePrompt.trim() : list[idx].negativePrompt,
    updatedAt: Date.now()
  };
  saveUserPrompts(list);
  return list[idx];
}

function removePrompt(id) {
  const list = getUserPrompts();
  const filtered = list.filter(p => p.id !== id);
  saveUserPrompts(filtered);
  return list.length !== filtered.length;
}

// 按分类分组
function getCategories() {
  const all = getAll();
  const map = {};
  all.forEach(p => {
    const cat = p.category || '未分类';
    if (!map[cat]) map[cat] = [];
    map[cat].push(p);
  });
  return Object.keys(map).map(name => ({
    name,
    items: map[name]
  }));
}

module.exports = {
  BUILTIN_PROMPTS,
  getAll,
  getById,
  getCategories,
  addPrompt,
  updatePrompt,
  removePrompt
};
