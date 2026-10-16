import { defineStore } from 'pinia'
import { h, reactive, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ElMessage, ElMessageBox } from 'element-plus'
import { i18n } from '../i18n'
import CodeBlock from '../components/CodeBlock.vue'
import type { ButtonItem, OutputChunk, RunResult } from '../types'
import { useConfigStore } from './config'
import { uid } from '../utils'

export type RunStatus = 'running' | 'success' | 'fail' | 'stopped'
export type ChunkStream = 'stdout' | 'stderr' | 'system'

export interface OutChunk {
  stream: ChunkStream
  text: string
}

export interface RunState {
  runId: string
  buttonId: string
  buttonName: string
  script: string
  /** 日志框是否显示脚本内容（取自按钮配置） */
  showScript: boolean
  status: RunStatus
  chunks: OutChunk[]
  startedAt: number
  exitCode: number | null
  durationMs: number | null
  error: string | null
}

const MAX_RUNS = 50
/** 单次运行保留的输出块上限（防止超长输出拖垮界面） */
const MAX_CHUNKS = 4000
/** 输出批量刷入界面的间隔（ms），高频输出时合并渲染 */
const FLUSH_INTERVAL = 80

/** 将 {{key}} 占位符替换为当前环境变量 */
function renderVars(script: string, vars: Record<string, string>): string {
  return script.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) =>
    vars[key] !== undefined ? vars[key] : m
  )
}

export const useRunnerStore = defineStore('runner', () => {
  const runs = ref<RunState[]>([])
  const focusRunId = ref<string | null>(null)
  let bound = false

  // 输出缓冲：事件先进入 pending，定时批量刷入响应式数组，避免高频输出刷爆渲染
  const pendingChunks = new Map<string, OutChunk[]>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function enqueueChunk(runId: string, stream: ChunkStream, text: string) {
    let arr = pendingChunks.get(runId)
    if (!arr) {
      arr = []
      pendingChunks.set(runId, arr)
    }
    arr.push({ stream, text })
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        for (const [id, chunks] of pendingChunks) {
          const run = runs.value.find((r) => r.runId === id)
          if (run) {
            run.chunks.push(...chunks)
            if (run.chunks.length > MAX_CHUNKS) {
              run.chunks.splice(0, run.chunks.length - MAX_CHUNKS)
            }
          }
        }
        pendingChunks.clear()
      }, FLUSH_INTERVAL)
    }
  }

  function appendSystem(runId: string, text: string) {
    enqueueChunk(runId, 'system', `\n${text}\n`)
  }

  async function init() {
    if (bound) return
    bound = true
    await listen<OutputChunk>('run://output', (ev) => {
      enqueueChunk(ev.payload.runId, ev.payload.stream, ev.payload.data)
    })
  }

  /** 按钮当前（或最近一次）执行状态，用于卡片标识 */
  function statusOf(buttonId: string): RunStatus | null {
    const running = runs.value.find((r) => r.buttonId === buttonId && r.status === 'running')
    if (running) return 'running'
    for (const r of runs.value) {
      if (r.buttonId === buttonId) return r.status
    }
    return null
  }

  async function runButton(button: ButtonItem) {
    const t = i18n.global.t
    if (statusOf(button.id) === 'running') return

    const cfg = useConfigStore().config
    const env = cfg?.environments.find((e) => e.id === cfg.activeEnvId)
    const vars = env?.vars ?? {}

    // script 类型：内容从脚本库解析；curl / shell：按钮内联内容
    const libScript =
      button.action.type === 'script'
        ? cfg?.scripts.find((s) => s.id === button.action.scriptId)
        : undefined

    if (button.action.type === 'script' && !libScript) {
      // 引用的脚本已被删除：生成一条失败记录，让用户在输出面板直接看到原因
      const state = reactive<RunState>({
        runId: uid('run'),
        buttonId: button.id,
        buttonName: button.name,
        script: '',
        showScript: false,
        status: 'fail',
        chunks: [],
        startedAt: Date.now(),
        exitCode: null,
        durationMs: 0,
        error: 'script-missing'
      })
      runs.value.unshift(state)
      focusRunId.value = state.runId
      appendSystem(state.runId, t('runner.scriptMissing'))
      return
    }

    if (button.confirm) {
      try {
        // 正文：按钮名（图标+名称）+ 动作元信息 chips + 默认收起的脚本块；标题警示徽标由样式绘制
        const shellLabel =
          button.action.shell === 'auto'
            ? t('confirm.shellAuto')
            : t(`buttonDialog.${button.action.shell}`)
        await ElMessageBox.confirm(
          h('div', { class: 'confirm-run' }, [
            h('p', { class: 'confirm-run-name' }, [
              button.icon ? h('span', { class: 'confirm-run-name-icon' }, button.icon) : null,
              h('span', { class: 'confirm-run-name-text' }, button.name)
            ]),
            h('div', { class: 'confirm-run-meta' }, [
              h('span', { class: 'confirm-meta-chip is-type' }, button.action.type),
              h('span', { class: 'confirm-meta-chip' }, shellLabel),
              h('span', { class: 'confirm-meta-chip' }, t('confirm.metaTimeout', { n: button.action.timeoutSec })),
              button.action.workdir
                ? h('span', { class: 'confirm-meta-chip' }, `📁 ${button.action.workdir}`)
                : null,
              button.action.args
                ? h('span', { class: 'confirm-meta-chip' }, `⌘ ${button.action.args}`)
                : null
            ]),
            h(CodeBlock, {
              code: libScript ? libScript.content : button.action.script,
              lang: libScript ? libScript.name : button.action.type,
              expandable: true
            })
          ]),
          t('confirm.runTitle'),
          {
            confirmButtonText: t('common.run'),
            cancelButtonText: t('common.cancel'),
            customClass: 'run-confirm'
          }
        )
      } catch {
        return
      }
    }

    const script = renderVars(libScript ? libScript.content : button.action.script, vars)
    const args = renderVars(button.action.args ?? '', vars)
    const workdir = renderVars(button.action.workdir ?? '', vars)

    // reactive 包装：await 之后再改 status/exitCode 等字段才能触发视图更新
    const state = reactive<RunState>({
      runId: uid('run'),
      buttonId: button.id,
      buttonName: button.name,
      script,
      showScript: button.showScript !== false,
      status: 'running',
      chunks: [],
      startedAt: Date.now(),
      exitCode: null,
      durationMs: null,
      error: null
    })
    runs.value.unshift(state)
    if (runs.value.length > MAX_RUNS) runs.value.length = MAX_RUNS
    focusRunId.value = state.runId

    try {
      const r = await invoke<RunResult>('run_action', {
        runId: state.runId,
        script,
        shell: button.action.shell,
        timeoutSec: button.action.timeoutSec,
        vars,
        workdir,
        args
      })
      state.exitCode = r.exitCode
      state.durationMs = r.durationMs
      state.status = r.killed ? 'stopped' : r.success ? 'success' : 'fail'
      if (r.timedOut) state.error = 'timeout'
    } catch (e) {
      state.status = 'fail'
      state.error = String(e)
      state.durationMs = Date.now() - state.startedAt
      appendSystem(state.runId, String(e))
    }
  }

  async function stopFocus() {
    const runId = focusRunId.value
    if (!runId) return
    const run = runs.value.find((r) => r.runId === runId)
    if (run && run.status !== 'running') return
    // 立即给出可见反馈，不等后端确认
    appendSystem(runId, i18n.global.t('output.stopSent'))
    try {
      await invoke('stop_action', { runId })
    } catch (e) {
      console.error('stop_action failed:', e)
      ElMessage.error(`${i18n.global.t('runner.spawnError')}: ${String(e)}`)
    }
  }

  function clearAll() {
    runs.value = []
    focusRunId.value = null
  }

  return { runs, focusRunId, init, runButton, statusOf, stopFocus, clearAll }
})
