<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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

/** 不允许并发且执行中：悬停时以「禁止运行」徽标替代播放徽标 */
const blocked = computed(() => status.value === 'running' && !props.button.allowConcurrent)

/* ---- 右键菜单：跟随鼠标位置弹出 ---- */
const cardEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

function openMenu(e: MouseEvent) {
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuVisible.value = true
  // 渲染后按菜单实际尺寸收缩坐标，避免贴着窗口右/下边缘被裁掉
  nextTick(() => {
    const el = menuEl.value
    if (!el) return
    menuX.value = Math.max(8, Math.min(menuX.value, window.innerWidth - el.offsetWidth - 8))
    menuY.value = Math.max(8, Math.min(menuY.value, window.innerHeight - el.offsetHeight - 8))
  })
}

/** 目标不在本卡片和本菜单内时才关闭（右键本卡片会重新定位而非关闭） */
function isOutside(e: Event) {
  const node = e.target as Node
  return !cardEl.value?.contains(node) && !menuEl.value?.contains(node)
}

function onDocMousedown(e: MouseEvent) {
  if (menuVisible.value && isOutside(e)) menuVisible.value = false
}

function onDocContextMenu(e: MouseEvent) {
  if (menuVisible.value && isOutside(e)) menuVisible.value = false
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') menuVisible.value = false
}

function closeOnScrollOrResize() {
  menuVisible.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMousedown)
  document.addEventListener('contextmenu', onDocContextMenu)
  document.addEventListener('keydown', onDocKeydown)
  // scroll 用捕获：容器内部滚动不冒泡也能关掉菜单
  window.addEventListener('scroll', closeOnScrollOrResize, true)
  window.addEventListener('resize', closeOnScrollOrResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  document.removeEventListener('contextmenu', onDocContextMenu)
  document.removeEventListener('keydown', onDocKeydown)
  window.removeEventListener('scroll', closeOnScrollOrResize, true)
  window.removeEventListener('resize', closeOnScrollOrResize)
})

/** 卡片以浅色主题呈现：自定义色作为强调色（图标底、悬停阴影、边框）注入 CSS 变量 */
const cardStyle = computed<CSSProperties>(() => ({
  '--accent': props.button.color,
  '--accent-soft': hexToRgba(props.button.color, 0.12),
  '--accent-deep': hexToRgba(props.button.color, 0.45)
}))

function onCommand(cmd: string) {
  menuVisible.value = false
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
        allowConcurrent: props.button.allowConcurrent,
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
    ref="cardEl"
    class="btn-card"
    :class="[`st-${status ?? 'idle'}`, { 'is-blocked': blocked }]"
    :style="cardStyle"
    draggable="true"
    :title="button.name"
    @click="emit('run', button)"
    @contextmenu.prevent="openMenu"
    @dragstart="emit('dragStart', button.id)"
    @dragend="emit('dragEnd')"
    @dragover.prevent
    @drop.prevent="emit('dropOn', button.id)"
  >
    <!-- 内容层：悬停时整体模糊淡出，为播放徽标让位 -->
    <div class="btn-content">
      <span class="btn-icon">{{ button.icon || (button.action.type === 'curl' ? '🌐' : button.action.type === 'script' ? '📜' : '⚡') }}</span>
      <span class="btn-name">{{ button.name }}</span>
      <span class="btn-type">{{ button.action.type }}</span>
    </div>

    <span v-if="!blocked" class="btn-run-hint" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="21" fill="currentColor" />
        <!-- 三角形按 48×48 视框几何居中（含描边外扩） -->
        <path
          d="M16.75 14.5v19l14.5-9.5z"
          fill="#fff"
          stroke="#fff"
          stroke-width="3"
          stroke-linejoin="round"
        />
      </svg>
    </span>

    <!-- 禁止运行徽标：不允许并发的按钮执行中悬停时显示 -->
    <span v-if="blocked" class="btn-ban-hint" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <!-- 禁止圈 + 45° 斜杠，两端落在圆周上（r=19） -->
        <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="4.5" />
        <line
          x1="10.6"
          y1="10.6"
          x2="37.4"
          y2="37.4"
          stroke="currentColor"
          stroke-width="4.5"
          stroke-linecap="round"
        />
      </svg>
    </span>

    <span v-if="status === 'running'" class="btn-spinner"></span>
  </div>

  <!-- 右键菜单：固定定位在鼠标位置，挂到 body 避免被卡片 overflow 裁剪 -->
  <Teleport to="body">
    <div
      v-if="menuVisible"
      ref="menuEl"
      class="ctx-menu"
      :style="{ left: `${menuX}px`, top: `${menuY}px` }"
    >
      <div class="ctx-item" @click="onCommand('edit')">{{ t('common.edit') }}</div>
      <div class="ctx-item" @click="onCommand('duplicate')">{{ t('common.duplicate') }}</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item is-danger" @click="onCommand('delete')">{{ t('common.delete') }}</div>
    </div>
  </Teleport>
</template>
