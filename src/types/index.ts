export type ActionType = 'curl' | 'shell' | 'script'
export type ShellMode = 'auto' | 'bash' | 'powershell' | 'cmd'
export type Language = 'zh-CN' | 'en-US'
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

export interface ButtonItem {
  id: string
  name: string
  color: string
  icon: string
  confirm: boolean
  /** 运行输出中是否显示脚本内容（false = 日志框只显示日志） */
  showScript: boolean
  /** 是否允许并发执行（false = 执行中不可再次触发） */
  allowConcurrent: boolean
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
  confirm: boolean
  showScript: boolean
  allowConcurrent: boolean
  action: ActionConfig
}
