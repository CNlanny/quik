<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConfigStore } from '../stores/config'
import { useRunnerStore } from '../stores/runner'
import { hexToRgba } from '../utils'
import type { ButtonItem } from '../types'

const props = defineProps<{ button: ButtonItem }>()

const emit = defineEmits<{
  run: [button: ButtonItem]
  edit: [button: ButtonItem]
  dragStart: [id: string]
  dropOn: [targetId: string]
  dragEnd: []
}>()

const { t } = useI18n()
const config = useConfigStore()
const runner = useRunnerStore()

const status = computed(() => runner.statusOf(props.button.id))

/** 卡片以浅色主题呈现：自定义色作为强调色（图标底、悬停阴影、边框）注入 CSS 变量 */
const cardStyle = computed<CSSProperties>(() => ({
  '--accent': props.button.color,
  '--accent-soft': hexToRgba(props.button.color, 0.12),
  '--accent-deep': hexToRgba(props.button.color, 0.45)
}))

function onCommand(cmd: string) {
  if (cmd === 'edit') {
    emit('edit', props.button)
  } else if (cmd === 'duplicate') {
    const g = config.groupOfButton(props.button.id)
    if (g) {
      config.addButton(g.id, {
        name: `${props.button.name} ②`,
        color: props.button.color,
        icon: props.button.icon,
        confirm: props.button.confirm,
        showScript: props.button.showScript,
        action: { ...props.button.action }
      })
    }
  } else if (cmd === 'delete') {
    ElMessageBox.confirm(t('confirm.deleteButton', { name: props.button.name }), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
      .then(() => {
        config.deleteButton(props.button.id)
        ElMessage.success(t('common.ok'))
      })
      .catch(() => {})
  }
}
</script>

<template>
  <div
    class="btn-card"
    :class="[`st-${status ?? 'idle'}`]"
    :style="cardStyle"
    draggable="true"
    :title="button.name"
    @click="emit('run', button)"
    @dragstart="emit('dragStart', button.id)"
    @dragend="emit('dragEnd')"
    @dragover.prevent
    @drop.prevent="emit('dropOn', button.id)"
  >
    <el-dropdown class="btn-menu" trigger="click" @command="onCommand">
      <span class="menu-dots" @click.stop>⋯</span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="edit">{{ t('common.edit') }}</el-dropdown-item>
          <el-dropdown-item command="duplicate">{{ t('common.duplicate') }}</el-dropdown-item>
          <el-dropdown-item command="delete" divided>{{ t('common.delete') }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 内容层：悬停时整体模糊淡出，为播放徽标让位 -->
    <div class="btn-content">
      <span class="btn-icon">{{ button.icon || (button.action.type === 'curl' ? '🌐' : button.action.type === 'script' ? '📜' : '⚡') }}</span>
      <span class="btn-name">{{ button.name }}</span>
      <span class="btn-type">{{ button.action.type }}</span>
    </div>

    <span class="btn-run-hint" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="21" fill="currentColor" />
        <path d="M20.5 15.8v16.4c0 1.2 1.3 1.9 2.3 1.3l13-8.2c1-.6 1-2 0-2.6l-13-8.2c-1-.6-2.3.1-2.3 1.3z" fill="#fff" />
      </svg>
    </span>

    <span v-if="status === 'running'" class="btn-spinner"></span>
  </div>
</template>
