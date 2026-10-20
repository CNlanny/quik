/** 预设色板（按钮/分组共用）：按色相铺开的 24 色，覆盖蓝青绿黄橙红紫与中性色 */
export const PRESET_COLORS = [
  '#409EFF', '#0984E3', '#3B5BDB', '#6C5CE7', '#8B5CF6', '#9B59B6',
  '#EC4899', '#FD79A8', '#F472B6', '#F56C6C', '#E17055', '#FB923C',
  '#E6A23C', '#FDCF58', '#84CC16', '#67C23A', '#10B981', '#00B894',
  '#00CEC9', '#14B8A6', '#0EA5E9', '#64748B', '#909399', '#2D3436'
]

/** 预设字体（Windows 常见字体 + 通用 Web 字体）：value 为 CSS font-family，'' = 应用默认 */
export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: '微软雅黑', value: "'Microsoft YaHei', system-ui, sans-serif" },
  { label: '黑体', value: "SimHei, 'Microsoft YaHei', sans-serif" },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '楷体', value: "KaiTi, serif" },
  { label: '仿宋', value: 'FangSong, serif' },
  { label: '等线', value: "'DengXian', 'Microsoft YaHei', sans-serif" },
  { label: 'Consolas', value: "Consolas, 'Cascadia Code', monospace" },
  { label: 'Cascadia', value: "'Cascadia Code', Consolas, monospace" },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" }
]

/** 文字颜色自定义时的预设（自动模式外的常用安全色） */
export const TEXT_COLOR_PRESETS = [
  '#ffffff', '#f5f7fa', '#ffe9a8', '#ffd3d3',
  '#1f2329', '#3a3f47', '#5a6472', '#8a919c'
]

/** emoji 图标分组：key 用于 i18n（buttonDialog.iconCat.<key>），选择器按页签展示 */
export const EMOJI_GROUPS: { key: string; emojis: string[] }[] = [
  {
    key: 'common',
    emojis: [
      '⚡', '🔍', '🚀', '🧹', '📦', '🔄', '🌐', '🛠️',
      '📊', '💾', '🔔', '🗃️', '🧪', '⏱️', '🔒', '☁️'
    ]
  },
  {
    key: 'system',
    emojis: [
      '⚙️', '🔧', '🧰', '🖥️', '💻', '⌨️', '🖱️', '🗑️',
      '🧯', '🛡️', '🔋', '💡', '🧠', '📟', '🎛️', '🪟'
    ]
  },
  {
    key: 'dev',
    emojis: [
      '🐛', '📝', '📋', '📎', '🖇️', '✂️', '📌', '🧲',
      '🔗', '⛓️', '🏷️', '🧵', '🧬', '👨‍💻', '🔤', '🔢'
    ]
  },
  {
    key: 'network',
    emojis: [
      '📡', '🛰️', '🔌', '📶', '🌍', '🪐', '📨', '📤',
      '📥', '📮', '📫', '⚓', '🧭', '🚦', '📣', '📱'
    ]
  },
  {
    key: 'file',
    emojis: [
      '📁', '📂', '📄', '📃', '📖', '📚', '🗞️', '🧾',
      '💹', '📈', '📉', '🗂️', '⏳', '⌛', '🔑', '🗝️'
    ]
  },
  {
    key: 'media',
    emojis: [
      '🎵', '🎶', '🎤', '🎧', '📷', '📹', '🎬', '🎨',
      '🌈', '🖨️', '📺', '📻', '🖼️', '🎭'
    ]
  },
  {
    key: 'status',
    emojis: [
      '✅', '❌', '⚠️', '❓', '❗', '💬', '💭', '⭐',
      '🌟', '🔥', '💧', '✨', '🎉', '💥', '🌙', '☀️'
    ]
  },
  {
    key: 'fun',
    emojis: [
      '🐱', '🐶', '🦊', '🐼', '🐧', '🍀', '🌸', '🍕',
      '☕', '🏠', '🚗', '✈️', '🎮', '⚽', '🏆', '❤️',
      '👍', '🎯'
    ]
  }
]
