import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification'
import { i18n } from '../i18n'
import type { RunStatus } from '../stores/runner'

/** 权限只询问一次，缓存结果（拒绝后不再重复打扰） */
let permissionPromise: Promise<boolean> | null = null

function ensurePermission(): Promise<boolean> {
  if (!permissionPromise) {
    permissionPromise = (async () => {
      if (await isPermissionGranted()) return true
      try {
        return (await requestPermission()) === 'granted'
      } catch {
        return false
      }
    })()
  }
  return permissionPromise
}

/**
 * 按钮执行结束时发送系统弹窗提醒。
 * 标题为按钮名，正文为结果（成功 / 失败 / 已停止 / 超时）+ 耗时；
 * 系统权限未授予或发送失败时静默忽略，不影响运行记录。
 */
export async function notifyRunResult(
  buttonName: string,
  status: RunStatus,
  timedOut: boolean,
  durationMs: number | null
): Promise<void> {
  if (!(await ensurePermission())) return
  const t = i18n.global.t
  const statusText = timedOut ? t('output.timeout') : t(`output.${status}`)
  const duration =
    durationMs !== null ? ` · ${t('notify.duration', { s: (durationMs / 1000).toFixed(1) })}` : ''
  try {
    sendNotification({ title: buttonName, body: `${statusText}${duration}` })
  } catch (e) {
    console.error('sendNotification failed:', e)
  }
}
