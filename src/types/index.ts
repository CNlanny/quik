export type ActionType = 'curl' | 'shell' | 'script'
export type ShellMode = 'auto' | 'bash' | 'powershell' | 'cmd'
export type Language = 'zh-CN' | 'en-US'
/** 界面主题：浅色 / 深色 / 跟随系统 */
export type ThemeMode = 'light' | 'dark' | 'system'
/** 关闭按钮行为：每次询问 / 最小化到托盘 / 直接退出 */
export type CloseAction = 'ask' | 'tray' | 'exit'

/**
 * 动作配置：
 * - curl / shell：脚本内容内联在 script 字段
 * - script：引用脚本库（scriptId），运行时可指定工作目录 workdir 与命令行参数 args，
 *   脚本内容运行时从脚本库解析，改脚本库即对所有引用它的按钮生效
 */
export interface ActionConfig {
  type: ActionType
  mode: 'script' | 'form'
  script: string
  scriptId: string
  workdir: string
  args: string
  timeoutSec: number
  shell: ShellMode
}

/** 脚本库条目：集中维护的可复用脚本 */
export interface ScriptItem {
  id: string
  name: string
  content: string
  order: number
}

/**
 * 按钮外观：颜色铺满卡片后的填充与特效（形状固定不变）。
 * 旧配置没有该字段时按默认值处理。
 */
export interface ButtonStyle {
  /** 填充方式：纯色 / 渐变 */
  fill: 'solid' | 'gradient'
  /** 渐变终点色（空串 = 自动取主色的同色系浅色） */
  color2: string
  /** 渐变角度 0-360（0 = 向上） */
  gradientAngle: number
  /** 特效：无 / 光晕 / 毛玻璃 */
  effect: 'none' | 'glow' | 'glass'
  /** 特效强度 0-100（光晕 = 扩散范围，毛玻璃 = 模糊度） */
  effectLevel: number
  /** 是否显示卡片描边 */
  border: boolean
  /** 字体（CSS font-family 值，空串 = 跟随应用默认） */
  fontFamily: string
  /** 字重（按钮名称）：400 常规 / 600 中等 / 800 粗体 */
  fontWeight: number
  /** 文字斜体 */
  fontItalic: boolean
  /** 名称字号 px（0 = 默认 12.5） */
  fontSize: number
  /** 文字颜色（空串 = 按底色亮度自动取黑/白） */
  textColor: string
}

export interface ButtonItem {
  id: string
  name: string
  color: string
  icon: string
  /** 外观（填充 + 特效），旧数据可能缺失 */
  style?: ButtonStyle
  confirm: boolean
  /** 运行输出中是否显示脚本内容（false = 日志框只显示日志） */
  showScript: boolean
  /** 是否允许并发执行（false = 执行中不可再次触发） */
  allowConcurrent: boolean
  /** 执行结束时是否通过系统通知提醒（成功 / 失败均提醒；旧数据缺省视为关闭） */
  notify: boolean
  action: ActionConfig
  order: number
}

export interface GroupItem {
  id: string
  name: string
  color: string
  collapsed: boolean
  order: number
  buttons: ButtonItem[]
}

export interface Environment {
  id: string
  name: string
  vars: Record<string, string>
}

export interface AppSettings {
  language: Language
  defaultShell: ShellMode
  historyLimit: number
  closeAction: CloseAction
  /** 界面主题；旧配置缺失时按浅色处理 */
  theme: ThemeMode
}

export interface AppConfig {
  version: number
  settings: AppSettings
  environments: Environment[]
  activeEnvId: string
  groups: GroupItem[]
  scripts: ScriptItem[]
}

/** run_action 命令的返回值 */
export interface RunResult {
  success: boolean
  exitCode: number | null
  durationMs: number
  killed: boolean
  timedOut: boolean
  error: string | null
}

/** run://output 事件载荷 */
export interface OutputChunk {
  runId: string
  stream: 'stdout' | 'stderr'
  data: string
}

export interface ShellInfo {
  auto: ShellMode
  bashFound: boolean
  bashPath: string | null
  curlFound: boolean
}

export interface ImportSummary {
  groupsAdded: number
  buttonsAdded: number
}

export interface ExportFile {
  kind: 'quik-export'
  version: number
  exportedAt: number
  groups: GroupItem[]
  environments?: Environment[]
  scripts?: ScriptItem[]
}

/** 新建/编辑按钮时表单提交的数据 */
export interface ButtonFormData {
  name: string
  color: string
  icon: string
  style: ButtonStyle
  confirm: boolean
  showScript: boolean
  allowConcurrent: boolean
  notify: boolean
  action: ActionConfig
}
