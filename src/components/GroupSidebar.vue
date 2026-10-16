<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConfigStore } from '../stores/config'
import type { GroupItem } from '../types'

const { t } = useI18n()
const config = useConfigStore()

const emit = defineEmits<{ newGroup: []; editGroup: [group: GroupItem]; select: [] }>()

const dragGroupId = ref<string | null>(null)

function onGroupCommand(cmd: string, group: GroupItem) {
  if (cmd === 'edit') {
    emit('editGroup', group)
  } else if (cmd === 'delete') {
    ElMessageBox.confirm(t('confirm.deleteGroup', { name: group.name, n: group.buttons.length }), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
      .then(() => {
        config.deleteGroup(group.id)
        ElMessage.success(t('common.ok'))
      })
      .catch(() => {})
  }
}

function onGroupDrop(targetId: string) {
  if (dragGroupId.value && dragGroupId.value !== targetId) {
    config.moveGroup(dragGroupId.value, targetId)
  }
  dragGroupId.value = null
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="logo">⚡ Quik</span>
    </div>

    <div class="sidebar-scroll">
      <div
        class="side-item"
        :class="{ active: config.activeGroupId === 'all' }"
        @click="config.activeGroupId = 'all'; emit('select')"
      >
        <span class="side-dot all"></span>
        <span class="side-name">{{ t('sidebar.all') }}</span>
        <span class="side-count">{{ config.groups.reduce((n, g) => n + g.buttons.length, 0) }}</span>
      </div>

      <div class="side-divider"></div>

      <div
        v-for="g in config.groups"
        :key="g.id"
        class="side-item group-item"
        :class="{ active: config.activeGroupId === g.id }"
        draggable="true"
        @click="config.activeGroupId = g.id; emit('select')"
        @dragstart="dragGroupId = g.id"
        @dragover.prevent
        @drop.prevent="onGroupDrop(g.id)"
      >
        <span class="side-dot" :style="{ backgroundColor: g.color }"></span>
        <span class="side-name" :title="g.name">{{ g.name }}</span>
        <span class="side-count">{{ g.buttons.length }}</span>
        <el-dropdown class="side-menu" trigger="click" @command="onGroupCommand($event, g)">
          <span class="menu-dots" @click.stop>⋯</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="edit">{{ t('common.edit') }}</el-dropdown-item>
              <el-dropdown-item command="delete" divided>{{ t('common.delete') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <button class="new-group-btn" @click="emit('newGroup')">＋ {{ t('sidebar.newGroup') }}</button>
  </aside>
</template>
