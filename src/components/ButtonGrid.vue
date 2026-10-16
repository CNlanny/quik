<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '../stores/config'
import ButtonCard from './ButtonCard.vue'
import type { ButtonItem, GroupItem } from '../types'

const props = defineProps<{ search: string }>()
const emit = defineEmits<{
  run: [button: ButtonItem]
  edit: [button: ButtonItem]
  newButton: [groupId: string]
}>()

const { t } = useI18n()
const config = useConfigStore()

const dragButtonId = ref<string | null>(null)
const dragOverGroup = ref<string | null>(null)

/** 当前展示的分组（全部 或 单个分组） */
const sections = computed<GroupItem[]>(() => {
  const gs = config.groups
  if (config.activeGroupId === 'all') return gs
  const g = gs.find((x) => x.id === config.activeGroupId)
  return g ? [g] : gs
})

const hasAnyButton = computed(() => config.groups.some((g) => g.buttons.length > 0))

function filteredButtons(g: GroupItem): ButtonItem[] {
  const q = props.search.trim().toLowerCase()
  if (!q) return g.buttons
  return g.buttons.filter((b) => {
    if (b.name.toLowerCase().includes(q)) return true
    if (b.action.script.toLowerCase().includes(q)) return true
    if (b.action.type.toLowerCase().includes(q)) return true
    // 脚本类型按钮顺带匹配引用的脚本库名称
    if (b.action.type === 'script') {
      const s = config.getScript(b.action.scriptId)
      if (s && s.name.toLowerCase().includes(q)) return true
    }
    return false
  })
}

function onDropOn(group: GroupItem, targetId: string) {
  if (dragButtonId.value && dragButtonId.value !== targetId) {
    config.moveButton(group.id, dragButtonId.value, targetId)
  }
  dragButtonId.value = null
  dragOverGroup.value = null
}

function onDropEnd(group: GroupItem) {
  if (dragButtonId.value) {
    config.moveButtonToEnd(group.id, dragButtonId.value)
  }
  dragButtonId.value = null
  dragOverGroup.value = null
}
</script>

<template>
  <div class="button-grid-scroll">
    <div v-if="!config.groups.length" class="grid-empty">
      <div class="grid-empty-icon">🎛️</div>
      <div>{{ t('grid.emptyAll') }}</div>
      <el-button type="primary" plain @click="emit('newButton', '')">
        {{ t('grid.newGroupCta') }}
      </el-button>
    </div>

    <template v-else>
      <section v-for="g in sections" :key="g.id" class="group-section">
        <header class="group-header" @click="config.toggleCollapsed(g.id)">
          <span class="chevron">{{ g.collapsed ? '▸' : '▾' }}</span>
          <span class="group-dot" :style="{ backgroundColor: g.color }"></span>
          <span class="group-name">{{ g.name }}</span>
          <span class="group-count">{{ g.buttons.length }}</span>
        </header>

        <div v-if="!g.collapsed" class="card-grid" :class="{ 'drag-over': dragOverGroup === g.id }">
          <ButtonCard
            v-for="b in filteredButtons(g)"
            :key="b.id"
            :button="b"
            @run="emit('run', $event)"
            @edit="emit('edit', $event)"
            @drag-start="dragButtonId = $event"
            @drop-on="onDropOn(g, $event)"
            @drag-end="dragButtonId = null"
          />
          <button class="card-add" :title="t('toolbar.newButton')" @click="emit('newButton', g.id)">＋</button>
          <div
            v-if="hasAnyButton"
            class="drop-end"
            @dragover.prevent="dragOverGroup = g.id"
            @dragleave="dragOverGroup === g.id && (dragOverGroup = null)"
            @drop.prevent="onDropEnd(g)"
          ></div>
        </div>
      </section>

      <div v-if="sections.every((g) => filteredButtons(g).length === 0)" class="grid-empty small">
        {{ t('grid.noMatch') }}
      </div>
    </template>
  </div>
</template>
