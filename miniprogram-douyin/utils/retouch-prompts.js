/**
 * 人像精修提示词库
 *
 * 参考来源：
 * - Seedream 5.0 Edit Guide (Arteza)
 * - 豆包 Seedream 4.0 P图提示词合集
 * - exec-headshot-skill (Vivixiao980, GitHub)
 * - byted-kickart-ai-beauty (火山引擎)
 * - ai-image-editing skill (social-media-skills)
 *
 * 使用方式：在 ai-service.js 中调用 buildRetouchPrompt() 组装最终提示词
 */

// ============ 一键精修模板 ============

const QUICK_TEMPLATES = [
  {
    id: 'natural',
    name: '自然精修',
    icon: '🌿',
    description: '轻度磨皮保留纹理，均匀肤色，去除痘印黑眼圈，五官自然立体',
    prompt: '中度磨皮保留皮肤纹理和毛孔，均匀肤色，去除痘印和黑眼圈，提亮面部光影，五官自然立体，不改变人物五官样貌和脸型，低饱和柔暖色调，8K高清写实，无塑料假脸效果'
  },
  {
    id: 'beauty',
    name: '精致美颜',
    icon: '✨',
    description: '高级商业精修：无瑕但真实的皮肤质感，五官立体，气质提升',
    prompt: '保持人物不变，原生肤质效果，去斑去痘去油光，原生皮肤质感，去皱，均匀肤色，轻微收下颌显小脸，自然淡妆顺眉，睫毛分明，自然腮红，裸色饱满唇，卧蚕眼神光，增发蓬松，匀肤提亮，淡化黑眼圈，牙齿微白，明显变好看但仍一眼是本人，8K高清写实'
  },
  {
    id: 'korean',
    name: '韩系清透',
    icon: '🌸',
    description: '韩系清透妆感，水光肌，温柔气质，社交头像首选',
    prompt: '保持人物不变，韩系清透妆感，微微磨皮美白，水光通透底妆，去斑去痘去油光，粉色腮红自然晕染，眉毛柔和雾眉，眼头卧蚕高光提亮，女团色咬唇妆，整体甜美温柔，头发韩系自然蓬松，皮肤干净但保留细腻真实纹理，不是塑料假面'
  },
  {
    id: 'magazine',
    name: '杂志质感',
    icon: '📸',
    description: '高端商业杂志精修：光影重塑，轮廓立体，质感高级',
    prompt: '高端商业杂志精修，无瑕但真实的皮肤质感保留毛孔纹理，增强眼睛颜色和锐度，定义唇部轮廓，冷调阴影暖调高光彩妆级色彩分级，面部光影重塑增强立体感，深邃立体修容，哑光底妆，祛斑祛痘，微微磨皮去油光，浓密睫毛，整体妆感高级克制，8K高清商业摄影质感'
  },
  {
    id: 'film',
    name: '电影氛围',
    icon: '🎬',
    description: '暗调电影质感，轮廓光分离人物，气场强大',
    prompt: '暗调电影质感肖像，低调布光，一侧柔光主光照亮面部，光比大暗部深但保留细节，脑后轮廓光勾出头发和肩线，双眼有明亮眼神光，接近黑白低饱和色调，肤色保留真实血色，暗部微冷调，保留皮肤纹理去油光但不磨皮，沉静笃定有掌控力的气质，8K电影画面质感'
  },
  {
    id: 'gentle',
    name: '温柔柔光',
    icon: '🕯️',
    description: '暖金色调，柔和浪漫光，生活照/情侣照适用',
    prompt: '自然柔和的人像精修，轻微自然磨皮，温暖金色肤色，柔和浪漫光线，自然光泽，均匀肤色，温柔提亮，暖浪漫色彩分级，自然讨人喜欢，保留皮肤真实质感，8K高清'
  },
  {
    id: 'idphoto',
    name: '证件照',
    icon: '🪪',
    description: '标准证件照精修：端庄大方，底色干净，可换底色',
    prompt: '标准证件照精修，肩部以上至胸口构图，头部居中端正，完全正面双眼平视镜头，肤色提亮均匀质感通透，去除瑕疵油光，皮肤干净但保留细腻真实纹理，五官端正不变形，表情自然温和，背景纯净均匀无渐变阴影，高清锐利，韩式商业精修风格'
  },
  {
    id: 'restore',
    name: '老照片修复',
    icon: '📷',
    description: '高清修复老照片，去划痕泛黄，补全细节，保留年代感',
    prompt: '高清无损修复，去除画面划痕泛黄色块，补全模糊五官细节，适度还原复古色彩，保留年代胶片质感，不改动人物样貌，消除照片噪点，8K高清'
  }
];

// ============ 局部编辑快捷提示词 ============

const LOCAL_PRESETS = [
  { id: 'skin-smooth', name: '磨皮美颜', category: 'skin', prompt: '自然磨皮，保留皮肤纹理毛孔，去除痘印斑点' },
  { id: 'skin-whiten', name: '美白提亮', category: 'skin', prompt: '肤色美白提亮，均匀肤色，去黄气' },
  { id: 'eye-brighten', name: '亮眼', category: 'eyes', prompt: '眼睛明亮有神，增强虹膜颜色，自然提亮眼白' },
  { id: 'eye-enlarge', name: '大眼', category: 'eyes', prompt: '眼睛自然放大，保持真实比例，睫毛分明' },
  { id: 'nose-slim', name: '瘦鼻', category: 'face', prompt: '鼻梁立体，鼻翼自然收窄' },
  { id: 'face-slim', name: '瘦脸', category: 'face', prompt: '脸部轮廓自然收窄，轻微收下颌，保持五官比例' },
  { id: 'jaw-chin', name: '下巴', category: 'face', prompt: '下巴线条自然流畅，轻微收尖' },
  { id: 'lip-color', name: '唇色', category: 'makeup', prompt: '嘴唇饱满有色泽，自然裸粉色' },
  { id: 'blush', name: '腮红', category: 'makeup', prompt: '自然腮红，气色红润' },
  { id: 'teeth-white', name: '美牙', category: 'teeth', prompt: '牙齿自然美白，整齐' },
  { id: 'hair-fix', name: '修发', category: 'hair', prompt: '去除碎发乱发，发丝顺滑有光泽' },
  { id: 'dark-circle', name: '去黑眼圈', category: 'skin', prompt: '淡化黑眼圈和眼袋，自然不僵硬' },
  { id: 'remove-blemish', name: '去瑕疵', category: 'skin', prompt: '去除痘痘斑点，保留周围皮肤纹理' },
  { id: 'neck-slim', name: '瘦脖子', category: 'body', prompt: '颈部线条自然修长' },
  { id: 'background-blur', name: '虚化背景', category: 'bg', prompt: '背景柔和虚化，突出人物，景深效果' }
];

// ============ 一句话改图快捷短语 ============

const AI_QUICK_PROMPTS = [
  '皮肤更白皙通透',
  '背景虚化，突出人物',
  '增强光影质感，更有电影感',
  '牙齿更白，笑容更自然',
  '眼睛更大更有神',
  '脸小一圈，自然瘦脸',
  '换成卷发造型',
  '换成职业装',
  '背景换成纯色浅灰',
  '加上自然腮红好气色',
  '去除脸上油光',
  '整体色调偏暖更温柔'
];

// ============ 精修层次系统（参考 Seedream 5.0 Edit Guide）============

const RETOUCH_LAYERS = {
  // 第1层：皮肤
  skin: {
    natural: 'Smooth skin naturally, preserve skin texture and pores, remove blemishes',
    beauty: 'Professional beauty retouching on skin, smooth without losing texture, even tone, natural glow',
    editorial: 'Editorial skin retouching: flawless but realistic, preserve pores and natural features',
    even: 'Even skin tone, reduce redness, keep natural texture and freckles',
    undereye: 'Reduce under-eye darkness, brighten naturally'
  },
  // 第2层：眼睛
  eyes: {
    brighten: 'Brighten and sharpen the eyes naturally, enhance iris color subtly',
    catchlight: 'Add subtle catch light to the eyes, brighten whites',
    lashes: 'Sharpen eye details and eyelashes, preserve natural color'
  },
  // 第3层：头发
  hair: {
    stray: 'Remove stray hairs on the forehead and background',
    shine: 'Enhance hair highlights naturally, add shine',
    clean: 'Clean up flyaway hairs, preserve overall hair texture'
  },
  // 第4层：光影
  lighting: {
    liftShadows: 'Lift shadows on the face gently, add soft fill light',
    soften: 'Soften harsh shadows under the chin and nose',
    reduceShine: 'Reduce shine on forehead and nose, even skin highlight',
    warm: 'Warm the overall face lighting, soft golden glow'
  },
  // 第5层：色彩
  color: {
    golden: 'Warm natural skin tones, golden-hour mood, slight film grain',
    editorial: 'Editorial fashion grade: cool shadows, warm skin highlights',
    corporate: 'Clean corporate headshot look: neutral colors, slightly brightened',
    romantic: 'Romantic soft-light grade: warm pastels, gentle fade',
    moody: 'Moody low-key grade: deep shadows, warm skin, film contrast'
  },
  // 第6层：背景
  background: {
    studio: 'Replace background with soft blurred gray studio, keep subject unchanged',
    bokeh: 'Change background to warm out-of-focus bokeh, preserve portrait lighting',
    blur: 'Clean up the background, blur it softly, keep subject sharp'
  }
};

// ============ 身份锁定规则（所有精修提示词通用后缀）============

const IDENTITY_LOCK = {
  zh: '【身份一致性 —— 最高优先级】画面中必须是原照片里的同一个人：脸型、五官比例、眼睛形状、鼻子、嘴唇、肤色、发色发质、年龄感、性别全部与原照片严格一致。不要美颜成另一张脸，熟人一眼认出是本人。',
  en: 'IDENTITY LOCK (highest priority): The person must be the same individual as in the original photo. Face shape, facial proportions, eye shape, nose, lips, skin tone, hair color and texture, apparent age, and gender must remain strictly consistent. Do not beautify into a different face.'
};

const QUALITY_RULES = {
  zh: '【画质要求】真实摄影照片质感（非插画/3D），保留皮肤真实毛孔纹理，禁止塑料磨皮，禁止过度磨皮成假面，禁止放大眼睛，禁止网红妆容，不加任何文字水印logo边框。',
  en: 'QUALITY: Real photographic texture (not illustration/3D). Preserve natural skin pores and texture. No plastic/waxy skin, no over-smoothing, no eye enlargement, no influencer makeup. No text, watermark, logo, or border.'
};

// ============ 组装函数 ============

/**
 * 组装一键精修提示词
 * @param {string} templateId - QUICK_TEMPLATES 中的 id
 * @param {string} extraPrompt - 用户额外输入（可选）
 * @returns {string} 完整提示词
 */
function buildQuickPrompt(templateId, extraPrompt) {
  const tpl = QUICK_TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return extraPrompt || '';
  let prompt = tpl.prompt;
  if (extraPrompt && extraPrompt.trim()) {
    prompt += '，' + extraPrompt.trim();
  }
  return prompt;
}

/**
 * 组装局部编辑提示词（带 bbox）
 * @param {Array} regions - [{x1,y1,x2,y2,prompt}]
 * @returns {string} bbox 格式提示词
 */
function buildLocalPrompt(regions) {
  return regions
    .filter(r => r.prompt && r.prompt.trim())
    .map(r => `<bbox>${r.x1} ${r.y1} ${r.x2} ${r.y2}</bbox> ${r.prompt.trim()}`)
    .join('\n');
}

/**
 * 组装一句话改图提示词
 * @param {string} userPrompt - 用户输入
 * @param {boolean} withIdentityLock - 是否附加身份锁定
 * @returns {string}
 */
function buildAiPrompt(userPrompt, withIdentityLock) {
  let prompt = (userPrompt || '').trim();
  if (withIdentityLock) {
    prompt = IDENTITY_LOCK.zh + '\n' + prompt + '\n' + QUALITY_RULES.zh;
  }
  return prompt;
}

module.exports = {
  QUICK_TEMPLATES,
  LOCAL_PRESETS,
  AI_QUICK_PROMPTS,
  RETOUCH_LAYERS,
  IDENTITY_LOCK,
  QUALITY_RULES,
  buildQuickPrompt,
  buildLocalPrompt,
  buildAiPrompt
};
