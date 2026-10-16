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

// 执行按钮（含面板上的重跑）时自动展开，日志立即可见；手动折叠不被覆盖
watch(
  () => runner.focusRunId,
  (id) => {
    if (id) collapsed.value = false
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
        <el-button size="small" @click="runner.clearAll()">{{ t('output.clear') }}</el-button>
      </template>
      <span v-else class="spacer"></span>
      <el-button size="small" text @click="collapsed = !collapsed">
        {{ collapsed ? t('output.expand') : t('output.collapse') }}
      </el-button>
    </div>

    <div v-show="!collapsed" ref="bodyRef" class="output-body">
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
</template>
