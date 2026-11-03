import type { ThemeMode } from '../types'

/**
 * 主题应用：<html> 挂 dark class（Element Plus dark 变量 + 应用 token 覆盖均以此为开关），
 * 同时设 color-scheme 让原生控件 / 滚动条跟随，并同步 Tauri 窗口主题（标题栏配色）。
 * 设置值镜像到 localStorage，启动时同步读取避免深色用户看到闪白。
 */

const STORAGE_KEY = 'quik.theme'

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system'
}

export function readCachedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isThemeMode(saved)) return saved
  } catch {
    /* localStorage 不可用时忽略 */
  }
  return 'light'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 解析实际生效的主题：system 跟随系统偏好，其余原样返回 */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode
}

let mediaListenerAttached = false
/** 当前生效的模式；跟随系统时监听系统切换实时重应用 */
let activeMode: ThemeMode = 'light'

function apply(mode: ThemeMode) {
  const resolved = resolveTheme(mode)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
  // 标题栏等原生部分跟随；失败不影响界面主题
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(resolved))
    .catch(() => {})
}

export function applyTheme(mode: ThemeMode) {
  activeMode = mode
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
  apply(mode)

  // 「跟随系统」时监听系统主题变化；只挂一次，回调里按当前模式重应用
  if (!mediaListenerAttached && window.matchMedia) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => apply(activeMode))
    mediaListenerAttached = true
  }
}

/** 启动时同步应用缓存的主题（在应用挂载前调用，避免主题闪变） */
export function initTheme() {
  applyTheme(readCachedTheme())
}
