/**
 * 调试实验室 Skill 配置
 * 每个 Skill 导出：id, name, icon, color, description, controls, buildPrompt()
 * 所有 Skill 共用 runner 页面，按 skillId 加载不同配置
 */

const headshotStyles = require('./headshot-styles');
const { QUICK_TEMPLATES } = require('./retouch-prompts');

// ============ Skill 1: 智能美颜（海马体三档体系）============

const beautySkill = {
  id: 'beauty',
  name: '智能美颜',
  icon: '✨',
  color: '#07C160',
  description: '海马体精修师标准：三档美颜 + 细节微调',
  controls: [
    {
      type: 'card-select',
      key: 'level',
      label: '美颜档位',
      required: true,
      options: [
        { id: 'off', name: '纯还原', desc: '不做任何美化，最大化保真' },
        { id: 'light', name: '海马体精修', desc: '轻微变好看，仍像本人', default: true },
        { id: 'medium', name: '写真精修', desc: '精致变好看，仍像本人' }
      ]
    },
    {
      type: 'slider',
      key: 'faceShape',
      label: '脸型',
      options: ['关', '轻微', '自然', '明显'],
      defaultValue: 1,
      when: (p) => p.level !== 'off'
    },
    {
      type: 'chips',
      key: 'makeup',
      label: '妆容风格',
      options: [
        { id: 'none', name: '无妆' },
        { id: 'nude', name: '裸妆', default: true },
        { id: 'korean', name: '韩系清透' },
        { id: 'western', name: '欧美立体' },
        { id: 'vintage', name: '港风复古' },
        { id: 'chinese', name: '古风优雅' }
      ],
      when: (p) => p.level !== 'off'
    },
    {
      type: 'switch',
      key: 'hairVolume',
      label: '增发蓬松',
      default: true,
      when: (p) => p.level !== 'off'
    },
    {
      type: 'slider',
      key: 'skinQuality',
      label: '肤质',
      options: ['关', '轻微', '自然', '明显'],
      defaultValue: 2,
      when: (p) => p.level !== 'off'
    },
    {
      type: 'slider',
      key: 'eyeBrighten',
      label: '眼神',
      options: ['关', '轻微', '自然', '明显'],
      defaultValue: 1,
      when: (p) => p.level !== 'off'
    },
    {
      type: 'switch',
      key: 'whiteTeeth',
      label: '美牙',
      default: true,
      when: (p) => p.level !== 'off'
    },
    {
      type: 'switch',
      key: 'darkCircle',
      label: '去黑眼圈',
      default: true,
      when: (p) => p.level !== 'off'
    },
    {
      type: 'textarea',
      key: 'extraNotes',
      label: '额外要求（可选）',
      placeholder: '如：保持眼镜不变、头发扎起来...'
    }
  ],
  buildPrompt(params) {
    const level = params.level || 'light';
    const beauty = headshotStyles.BEAUTY_LEVELS[level];
    if (level === 'off') {
      return '纯还原，不做任何美化处理。\n\n' +
        headshotStyles.IDENTITY_LOCK + '\n' +
        headshotStyles.QUALITY_RULES;
    }
    let prompt = '保持人物不变，' + beauty.prompt;

    // 脸型
    const faceMap = ['', '轻微收下颌显小脸', '自然瘦脸，脸型精致', '明显瘦脸，V脸效果'];
    const faceVal = params.faceShape || 0;
    if (faceVal > 0) prompt += faceMap[faceVal] + '。';

    // 妆容
    const makeupMap = {
      none: '不加任何妆容，保持原生状态。',
      nude: '自然淡妆：顺眉、睫毛分明、自然腮红、裸色饱满唇。',
      korean: '韩系清透妆感：水光通透底妆、粉色腮红、咬唇妆、眼头卧蚕高光提亮。',
      western: '欧美立体妆感：深邃修容、大地色眼影、上挑眼线、雾面裸棕色口红。',
      vintage: '港风复古妆感：红棕色唇妆、上挑眼线、复古氛围。',
      chinese: '古风优雅妆感：柳叶细眉、雾面红唇、红棕调眼影、眉心花钿。'
    };
    const mk = params.makeup || 'nude';
    prompt += makeupMap[mk] || '';

    // 发型
    if (params.hairVolume) {
      prompt += '增发蓬松：颅顶微增高、消除发缝空隙、收碎发不遮眼。';
    }

    // 肤质
    const skinMap = ['', '轻微磨皮去油光', '自然磨皮，肤色均匀通透', '明显磨皮，皮肤细腻无瑕'];
    const skinVal = params.skinQuality || 0;
    if (skinVal > 0) prompt += skinMap[skinVal] + '。';

    // 眼神
    const eyeMap = ['', '轻微提亮眼神光', '自然明亮有神，增强虹膜颜色', '明显放大双眼，眼神明亮锐利'];
    const eyeVal = params.eyeBrighten || 0;
    if (eyeVal > 0) prompt += eyeMap[eyeVal] + '。';

    // 美牙
    if (params.whiteTeeth) prompt += '牙齿自然美白。';

    // 去黑眼圈
    if (params.darkCircle) prompt += '淡化黑眼圈和眼袋，自然不僵硬。';

    prompt += '\n\n' + headshotStyles.IDENTITY_LOCK;
    prompt += '\n' + headshotStyles.QUALITY_RULES;

    if (params.extraNotes && params.extraNotes.trim()) {
      prompt += '\n【额外要求】' + params.extraNotes.trim();
    }
    return prompt;
  }
};

// ============ Skill 2: 职业照生成 ============

const headshotSkill = {
  id: 'headshot',
  name: '职业照生成',
  icon: '📸',
  color: '#378ADD',
  description: '11种影棚风格 + 海马体级美颜',
  controls: [
    {
      type: 'style-grid',
      key: 'style',
      label: '选择风格',
      required: true,
      options: headshotStyles.STYLES.map(s => ({
        id: s.id,
        name: s.name,
        desc: s.desc,
        tags: s.tags
      }))
    },
    {
      type: 'card-select',
      key: 'beautyLevel',
      label: '美颜档位',
      required: true,
      options: [
        { id: 'off', name: '纯还原', desc: '不做美化' },
        { id: 'light', name: '海马体精修', desc: '轻微变好看，仍像本人', default: true },
        { id: 'medium', name: '写真精修', desc: '精致变好看' }
      ]
    },
    {
      type: 'chips',
      key: 'ratio',
      label: '输出比例',
      options: [
        { id: '1:1', name: '1:1', desc: '头像' },
        { id: '3:4', name: '3:4', desc: '证件/简历', default: true },
        { id: '4:5', name: '4:5', desc: '小红书' },
        { id: '9:16', name: '9:16', desc: '手机全屏' },
        { id: '4:3', name: '4:3', desc: '横屏' },
        { id: '16:9', name: '16:9', desc: '演讲海报' }
      ]
    },
    {
      type: 'switch',
      key: 'mirror',
      label: '镜像修复',
      desc: '解决「像又不像」的高频问题',
      default: false
    },
    {
      type: 'textarea',
      key: 'extraNotes',
      label: '额外要求（可选）',
      placeholder: '如：蓝底、不戴眼镜、头发扎起来、穿白色西装...'
    }
  ],
  buildPrompt(params) {
    const styleId = params.style || 'apple-executive';
    const beautyLevel = params.beautyLevel || 'light';
    const extra = params.extraNotes || '';
    return headshotStyles.buildHeadshotPrompt(styleId, beautyLevel, extra);
  }
};

// ============ Skill 3: 提示词工坊 ============

const promptWorkshop = {
  id: 'prompt-workshop',
  name: '提示词工坊',
  icon: '🎨',
  color: '#BA7517',
  description: '多维度参数组合，实时生成精修提示词',
  controls: [
    {
      type: 'chips',
      key: 'skinTexture',
      label: '皮肤质感',
      options: [
        { id: 'natural', name: '自然纹理', default: true },
        { id: 'flawless', name: '无瑕哑光' },
        { id: 'dewy', name: '水光通透' },
        { id: 'tan', name: '健康小麦色' }
      ]
    },
    {
      type: 'chips',
      key: 'eyes',
      label: '眼睛',
      options: [
        { id: 'keep', name: '保持', default: true },
        { id: 'bright', name: '明亮有神' },
        { id: 'enlarge', name: '自然增大' }
      ]
    },
    {
      type: 'chips',
      key: 'faceShape',
      label: '脸型',
      options: [
        { id: 'keep', name: '保持', default: true },
        { id: 'slim', name: '自然瘦' },
        { id: 'vshape', name: '精致小脸' }
      ]
    },
    {
      type: 'chips',
      key: 'makeup',
      label: '妆容',
      options: [
        { id: 'none', name: '无', default: true },
        { id: 'nude', name: '裸妆' },
        { id: 'korean', name: '韩系清透' },
        { id: 'western', name: '欧美立体' },
        { id: 'chinese', name: '古风' },
        { id: 'vintage', name: '港风复古' }
      ]
    },
    {
      type: 'chips',
      key: 'lighting',
      label: '光影',
      options: [
        { id: 'keep', name: '保持', default: true },
        { id: 'soft', name: '自然柔光' },
        { id: 'studio', name: '影棚三点布光' },
        { id: 'cinematic', name: '电影暗调' },
        { id: 'golden', name: '金色逆光' }
      ]
    },
    {
      type: 'chips',
      key: 'tone',
      label: '色调',
      options: [
        { id: 'original', name: '原色', default: true },
        { id: 'warm', name: '暖调' },
        { id: 'cool', name: '冷调' },
        { id: 'bw', name: '黑白杂志' },
        { id: 'film', name: '胶片颗粒' }
      ]
    },
    {
      type: 'chips',
      key: 'background',
      label: '背景',
      options: [
        { id: 'keep', name: '保持', default: true },
        { id: 'blur', name: '虚化' },
        { id: 'solid', name: '纯色' },
        { id: 'studio', name: '影棚渐变' }
      ]
    },
    {
      type: 'textarea',
      key: 'customBg',
      label: '自定义背景',
      placeholder: '如：海边日落、樱花树下...',
      when: (p) => p.background === 'solid'
    },
    {
      type: 'chips',
      key: 'quality',
      label: '画质',
      options: [
        { id: 'realistic', name: '8K写实', default: true },
        { id: 'commercial', name: '商业精修' },
        { id: 'film', name: '电影感' }
      ]
    },
    {
      type: 'textarea',
      key: 'extraNotes',
      label: '额外要求（可选）',
      placeholder: '自由描述...'
    }
  ],
  buildPrompt(params) {
    const skinMap = {
      natural: '保留皮肤真实毛孔纹理',
      flawless: '无瑕哑光底妆质感，细腻如瓷',
      dewy: '水光通透底妆质感，皮肤光泽自然',
      tan: '健康小麦色肌肤，自然光泽'
    };
    const eyeMap = {
      keep: '',
      bright: '眼睛明亮有神，增强虹膜颜色',
      enlarge: '眼睛自然放大，保持真实比例'
    };
    const faceMap = {
      keep: '',
      slim: '自然瘦脸，下颌线条流畅',
      vshape: '精致小脸，脸型更精致'
    };
    const makeupMap = {
      none: '不加任何妆容',
      nude: '自然裸妆，清新淡雅',
      korean: '韩系清透妆感，水光肌',
      western: '欧美立体妆感，深邃修容',
      chinese: '中式古风妆容，柳叶眉红唇',
      vintage: '港风复古妆容，红棕唇色'
    };
    const lightMap = {
      keep: '',
      soft: '自然柔光，面部无明显阴影',
      studio: '影棚三点布光，面部立体',
      cinematic: '电影暗调布光，低调氛围',
      golden: '金色逆光，温暖浪漫'
    };
    const toneMap = {
      original: '',
      warm: '暖调色彩，温暖柔和',
      cool: '冷调色彩，清冷高级',
      bw: '黑白杂志质感，高对比度',
      film: '胶片颗粒质感，复古色调'
    };
    const bgMap = {
      keep: '',
      blur: '背景柔和虚化，突出人物',
      solid: '纯色背景干净均匀',
      studio: '影棚渐变背景，专业质感'
    };
    const qualityMap = {
      realistic: '8K高清写实，真实摄影照片质感',
      commercial: '商业级精修质感，高端大气',
      film: '电影画面质感，色调克制'
    };

    let parts = ['保持人物不变'];
    if (skinMap[params.skinTexture]) parts.push(skinMap[params.skinTexture]);
    if (eyeMap[params.eyes]) parts.push(eyeMap[params.eyes]);
    if (faceMap[params.faceShape]) parts.push(faceMap[params.faceShape]);
    if (makeupMap[params.makeup]) parts.push(makeupMap[params.makeup]);
    if (lightMap[params.lighting]) parts.push(lightMap[params.lighting]);
    if (toneMap[params.tone]) parts.push(toneMap[params.tone]);
    if (bgMap[params.background]) parts.push(bgMap[params.background]);
    if (params.background === 'solid' && params.customBg && params.customBg.trim()) {
      parts.push('背景换成' + params.customBg.trim());
    }
    if (qualityMap[params.quality]) parts.push(qualityMap[params.quality]);
    parts.push('不改变人物五官样貌和脸型');
    parts.push('禁止塑料磨皮，无假脸效果');

    let prompt = parts.join('，') + '。';
    if (params.extraNotes && params.extraNotes.trim()) {
      prompt += params.extraNotes.trim();
    }
    return prompt;
  }
};

// ============ Skill 4: 一键精修模板 ============

const quickRetouchSkill = {
  id: 'quick-retouch',
  name: '一键精修',
  icon: '🪄',
  color: '#7F77DD',
  description: '8种预设模板，一键出图',
  controls: [
    {
      type: 'template-grid',
      key: 'template',
      label: '选择精修风格',
      required: true,
      options: QUICK_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        desc: t.description
      }))
    },
    {
      type: 'textarea',
      key: 'extraNotes',
      label: '额外要求（可选）',
      placeholder: '如：保留眼镜、背景换成...'
    }
  ],
  buildPrompt(params) {
    const tpl = QUICK_TEMPLATES.find(t => t.id === (params.template || 'natural'));
    if (!tpl) return '';
    let prompt = tpl.prompt;
    if (params.extraNotes && params.extraNotes.trim()) {
      prompt += '，' + params.extraNotes.trim();
    }
    return prompt;
  }
};

// ============ Skill 5: AI换装换景 ============

const changerSkill = {
  id: 'photo-changer',
  name: 'AI换装换景',
  icon: '🎭',
  color: '#D4537E',
  description: '换装 / 换背景 / 风格转换',
  controls: [
    {
      type: 'tabs',
      key: 'mode',
      label: '模式',
      options: [
        { id: 'outfit', name: '换装' },
        { id: 'background', name: '换背景' },
        { id: 'style', name: '风格转换' }
      ]
    },
    // 换装模式
    {
      type: 'chips',
      key: 'outfit',
      label: '服装',
      options: [
        { id: 'suit', name: '商务西装' },
        { id: 'white-shirt', name: '白衬衫' },
        { id: 'casual', name: '休闲T恤' },
        { id: 'dress', name: '礼服' },
        { id: 'hanfu', name: '汉服' },
        { id: 'jk', name: 'JK制服' },
        { id: 'sport', name: '运动装' }
      ],
      when: (p) => p.mode === 'outfit'
    },
    {
      type: 'textarea',
      key: 'customOutfit',
      label: '自定义服装描述',
      placeholder: '如：白色连衣裙、格子衬衫...',
      when: (p) => p.mode === 'outfit'
    },
    {
      type: 'switch',
      key: 'keepHair',
      label: '保持发型不变',
      default: true,
      when: (p) => p.mode === 'outfit'
    },
    // 换背景模式
    {
      type: 'chips',
      key: 'bgScene',
      label: '场景',
      options: [
        { id: 'white', name: '纯白' },
        { id: 'gray', name: '浅灰影棚' },
        { id: 'beach', name: '海边' },
        { id: 'sakura', name: '樱花' },
        { id: 'city-night', name: '城市夜景' },
        { id: 'study', name: '书房' },
        { id: 'bokeh', name: '虚化光斑' }
      ],
      when: (p) => p.mode === 'background'
    },
    {
      type: 'textarea',
      key: 'customBg',
      label: '自定义背景',
      placeholder: '如：故宫门前、咖啡厅...',
      when: (p) => p.mode === 'background'
    },
    // 风格转换模式
    {
      type: 'chips',
      key: 'artStyle',
      label: '风格',
      options: [
        { id: 'anime', name: '日系动漫' },
        { id: 'oil-painting', name: '油画肖像' },
        { id: 'clay', name: '粘土手办' },
        { id: 'watercolor', name: '水彩' },
        { id: 'cyberpunk', name: '赛博朋克' },
        { id: '3d-cartoon', name: '3D卡通' }
      ],
      when: (p) => p.mode === 'style'
    },
    {
      type: 'switch',
      key: 'identityLock',
      label: '身份锁定',
      desc: '尽量保持人脸一致（风格转换可能降低相似度）',
      default: true,
      when: (p) => p.mode === 'style'
    },
    {
      type: 'textarea',
      key: 'extraNotes',
      label: '额外要求（可选）',
      placeholder: '自由描述...'
    }
  ],
  buildPrompt(params) {
    const mode = params.mode || 'outfit';
    let prompt = '';

    if (mode === 'outfit') {
      const outfitMap = {
        'suit': '穿一套合身的深色商务西装，白色衬衫',
        'white-shirt': '穿一件简洁的白色衬衫',
        'casual': '穿一件简约休闲T恤',
        'dress': '穿一件优雅的礼服',
        'hanfu': '穿一套精美的中式汉服',
        'jk': '穿一套JK制服',
        'sport': '穿一套运动装'
      };
      prompt = params.outfit && outfitMap[params.outfit]
        ? '保持人物不变，将服装换成' + outfitMap[params.outfit] + '。'
        : '保持人物不变';
      if (params.customOutfit && params.customOutfit.trim()) {
        prompt = '保持人物不变，将服装换成' + params.customOutfit.trim() + '。';
      }
      if (params.keepHair) prompt += '发型和发色保持不变。';
    }
    else if (mode === 'background') {
      const bgMap = {
        'white': '纯白色背景',
        'gray': '浅灰色影棚背景',
        'beach': '海边日落背景',
        'sakura': '樱花树下背景',
        'city-night': '城市夜景背景',
        'study': '温馨书房背景',
        'bokeh': '柔和虚化光斑背景'
      };
      if (params.customBg && params.customBg.trim()) {
        prompt = '保持人物不变，将背景换成' + params.customBg.trim() + '。光影和人物统一。';
      } else if (params.bgScene && bgMap[params.bgScene]) {
        prompt = '保持人物不变，将背景换成' + bgMap[params.bgScene] + '。光影和人物统一，无违和拼接痕迹。';
      } else {
        prompt = '保持人物不变';
      }
    }
    else if (mode === 'style') {
      const styleMap = {
        'anime': '转换为日系动漫风格',
        'oil-painting': '转换为油画肖像风格',
        'clay': '转换为粘土手办风格',
        'watercolor': '转换为水彩画风格',
        'cyberpunk': '转换为赛博朋克风格',
        '3d-cartoon': '转换为3D卡通风格'
      };
      prompt = (params.artStyle && styleMap[params.artStyle])
        ? styleMap[params.artStyle]
        : '转换风格';
      if (params.identityLock) {
        prompt += '，尽量保持与原照片相同的脸型和五官特征';
      }
      prompt += '，高清画质。';
    }

    prompt += '\n\n' + headshotStyles.IDENTITY_LOCK;
    prompt += '\n' + headshotStyles.QUALITY_RULES;

    if (params.extraNotes && params.extraNotes.trim()) {
      prompt += '\n【额外要求】' + params.extraNotes.trim();
    }
    return prompt;
  }
};

// ============ 导出所有 Skill ============

const SKILLS = [
  beautySkill,
  headshotSkill,
  promptWorkshop,
  quickRetouchSkill,
  changerSkill
];

module.exports = {
  SKILLS,
  getSkill(id) {
    return SKILLS.find(s => s.id === id);
  }
};
