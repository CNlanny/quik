<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConfigStore } from '../stores/config'
import { useRunnerStore } from '../stores/runner'
import { highlightShell } from '../utils/highlight'

const { t } = useI18n()
const config = useConfigStore()
const runner = useRunnerStore()

const collapsed = ref(false)
const bodyRef = ref<HTMLElement | null>(null)

const run = computed(() => runner.runs.find((r) => r.runId === runner.focusRunId))

// 任务列表：运行中置顶，历史按时间倒序（runs 本身即新→旧）
const runningRuns = computed(() => runner.runs.filter((r) => r.status === 'running'))
const historyRuns = computed(() => runner.runs.filter((r) => r.status !== 'running'))

const pad2 = (n: number) => String(n).padStart(2, '0')

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function fmtDur(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

// 控制台命令行高亮显示实际执行的脚本（含变量替换后的内容）
const cmdHtml = computed(() => (run.value ? highlightShell(run.value.script) : ''))

const statusText = computed(() => {
  if (!run.value) return ''
  if (run.value.status === 'fail' && run.value.error === 'timeout') return t('output.timeout')
  return t(`output.${run.value.status}`)
})

const tagType = computed(() => {
  switch (run.value?.status) {
    case 'running':
      return 'warning'
    case 'success':
      return 'success'
    case 'fail':
      return 'danger'
    default:
      return 'info'
  }
})

// 执行按钮（含面板上的重跑）时自动展开，日志立即可见；手动折叠不被覆盖；
// 切换任务时滚动到日志底部（日志阅读习惯是从最新输出看起）
watch(
  () => runner.focusRunId,
  async (id) => {
    if (id) collapsed.value = false
    await nextTick()
    const el = bodyRef.value
    if (el) el.scrollTop = el.scrollHeight
  }
)

// 新输出到达时自动滚动到底部
watch(
  () => run.value?.chunks.length,
  async () => {
    await nextTick()
    const el = bodyRef.value
    if (el) el.scrollTop = el.scrollHeight
  }
)

async function rerun() {
  if (!run.value) return
  const button = config.getButton(run.value.buttonId)
  if (button) await runner.runButton(button)
}

/** 停止前确认，防止误点（停止会强制终止整棵进程树） */
async function confirmStop() {
  if (!run.value || run.value.status !== 'running') return
  try {
    await ElMessageBox.confirm(
      t('output.stopConfirm', { name: run.value.buttonName }),
      t('output.stop'),
      {
        type: 'warning',
        confirmButtonText: t('output.stop'),
        cancelButtonText: t('common.cancel'),
        confirmButtonClass: 'el-button--danger'
      }
    )
  } catch {
    return
  }
  await runner.stopFocus()
}

async function copyAll() {
  if (!run.value) return
  try {
    await navigator.clipboard.writeText(run.value.chunks.map((c) => c.text).join(''))
    ElMessage.success(t('common.copied'))
  } catch {
    ElMessage.error(t('common.copy'))
  }
}
</script>

<template>
  <div class="output-panel" :class="{ collapsed }">
    <div class="output-header">
      <span class="output-title">▌{{ t('output.title') }}</span>
      <template v-if="run">
        <span class="run-name">{{ run.buttonName }}</span>
        <el-tag size="small" :type="tagType">{{ statusText }}</el-tag>
        <span class="run-meta">{{ t('output.exitCode') }}: {{ run.exitCode ?? '—' }}</span>
        <span v-if="run.durationMs != null" class="run-meta">
          {{ t('output.duration') }}: {{ run.durationMs }}{{ t('output.ms') }}
        </span>
        <span class="spacer"></span>
        <el-button v-if="run.status === 'running'" size="small" type="danger" plain @click="confirmStop()">
          {{ t('output.stop') }}
        </el-button>
        <el-button v-else size="small" @click="rerun">{{ t('output.rerun') }}</el-button>
        <el-button size="small" @click="copyAll">{{ t('output.copy') }}</el-button>
        <el-button size="small" @click="runner.clearFinished()">{{ t('output.clear') }}</el-button>
      </template>
      <span v-else class="spacer"></span>
      <el-button size="small" text @click="collapsed = !collapsed">
        {{ collapsed ? t('output.expand') : t('output.collapse') }}
      </el-button>
    </div>

    <div v-show="!collapsed" class="output-flex">
      <!-- 左侧任务列表：运行中置顶 + 历史倒序，点击切换右侧日志 -->
      <aside class="run-list">
        <template v-if="runner.runs.length">
          <div v-if="runningRuns.length" class="run-group-title">
            {{ t('output.runningTasks') }} · {{ runningRuns.length }}
          </div>
          <div
            v-for="r in runningRuns"
            :key="r.runId"
            class="run-item"
            :class="{ active: r.runId === runner.focusRunId }"
            @click="runner.focus(r.runId)"
          >
            <span class="run-dot" :class="r.status"></span>
            <span class="run-item-name">{{ r.buttonName }}</span>
            <span v-if="r.unread" class="run-unread"></span>
            <span class="run-item-time">{{ fmtTime(r.startedAt) }}</span>
          </div>
          <div v-if="historyRuns.length" class="run-group-title">
            {{ t('output.history') }} · {{ historyRuns.length }}
          </div>
          <div
            v-for="r in historyRuns"
            :key="r.runId"
            class="run-item"
            :class="{ active: r.runId === runner.focusRunId }"
            @click="runner.focus(r.runId)"
          >
            <span class="run-dot" :class="r.status"></span>
            <span class="run-item-name">{{ r.buttonName }}</span>
            <span class="run-item-time">
              <template v-if="r.durationMs != null">{{ fmtDur(r.durationMs) }} · </template>{{ fmtTime(r.startedAt) }}
            </span>
          </div>
        </template>
        <div v-else class="run-list-empty">{{ t('output.listEmpty') }}</div>
      </aside>

      <div ref="bodyRef" class="output-body">
        <template v-if="run">
          <div v-if="run.showScript" class="cmd-line">
            <span class="cmd-prompt">$</span>
            <code v-html="cmdHtml"></code>
          </div>
          <pre class="out-pre"><span
            v-for="(c, i) in run.chunks"
            :key="i"
            :class="['out-chunk', c.stream]"
          >{{ c.text }}</span></pre>
        </template>
        <div v-else class="output-empty">{{ t('output.empty') }}</div>
      </div>
    </div>
  </div>
</template>
