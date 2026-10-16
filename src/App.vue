<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElConfigProvider, ElMessage } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import GroupSidebar from './components/GroupSidebar.vue'
import Toolbar from './components/Toolbar.vue'
import ButtonGrid from './components/ButtonGrid.vue'
import OutputPanel from './components/OutputPanel.vue'
import ButtonEditDialog from './components/ButtonEditDialog.vue'
import GroupEditDialog from './components/GroupEditDialog.vue'
import SettingsPage from './components/SettingsPage.vue'
import ScriptPage from './components/ScriptPage.vue'
import { useConfigStore } from './stores/config'
import { useRunnerStore } from './stores/runner'
import type { ButtonItem, GroupItem } from './types'

const { t, locale } = useI18n()
const config = useConfigStore()
const runner = useRunnerStore()

const search = ref('')
const epLocale = computed(() => (locale.value === 'zh-CN' ? zhCn : en))

// ----- 页面视图：主页面 / 脚本库 / 设置页 -----
const activeView = ref<'main' | 'scripts' | 'settings'>('main')

// ----- 弹窗状态 -----
const buttonDialogVisible = ref(false)
const editingButton = ref<ButtonItem | null>(null)
const dialogGroupId = ref('')
const groupDialogVisible = ref(false)
const editingGroup = ref<GroupItem | null>(null)

function openNewButton(groupId?: string) {
  if (!config.groups.length) {
    ElMessage.warning(t('sidebar.newGroupFirst'))
    openNewGroup()
    return
  }
  editingButton.value = null
  dialogGroupId.value = groupId && groupId !== 'all' ? groupId : ''
  buttonDialogVisible.value = true
}

function openEditButton(button: ButtonItem) {
  editingButton.value = button
  buttonDialogVisible.value = true
}

function openNewGroup() {
  editingGroup.value = null
  groupDialogVisible.value = true
}

function openEditGroup(group: GroupItem) {
  editingGroup.value = group
  groupDialogVisible.value = true
}

// ----- 关闭询问弹窗（closeAction = ask 时由 Rust 侧 close-ask 事件触发） -----
const closeAskVisible = ref(false)
const closeRemember = ref(false)
let closeAsking = false
let unlistenCloseAsk: UnlistenFn | null = null

async function onCloseChoice(action: 'tray' | 'exit') {
  closeAskVisible.value = false
  // 勾选「记住」先落盘再执行，保证直接退出前配置已保存
  if (closeRemember.value) {
    config.setCloseAction(action)
    await config.persist()
  }
  await invoke(action === 'exit' ? 'quit_app' : 'hide_to_tray')
}

onMounted(async () => {
  config.init()
  runner.init()
  unlistenCloseAsk = await listen('close-ask', () => {
    if (closeAsking) return
    closeAsking = true
    closeRemember.value = false
    closeAskVisible.value = true
  })
})

onBeforeUnmount(() => {
  unlistenCloseAsk?.()
})
</script>

<template>
  <el-config-provider :locale="epLocale">
    <div class="app-shell">
      <GroupSidebar @new-group="openNewGroup" @edit-group="openEditGroup" @select="activeView = 'main'" />
      <div class="app-main">
        <template v-if="activeView === 'main'">
          <Toolbar
            v-model:search="search"
            @new-button="openNewButton()"
            @open-scripts="activeView = 'scripts'"
            @open-settings="activeView = 'settings'"
          />
          <ButtonGrid :search="search" @run="runner.runButton" @edit="openEditButton" @new-button="openNewButton" />
        </template>
        <ScriptPage v-else-if="activeView === 'scripts'" @back="activeView = 'main'" />
        <SettingsPage v-else @back="activeView = 'main'" />
      </div>
      <OutputPanel />
    </div>

    <ButtonEditDialog
      v-model="buttonDialogVisible"
      :button="editingButton"
      :group-id="dialogGroupId"
      @manage-scripts="buttonDialogVisible = false; activeView = 'scripts'"
    />
    <GroupEditDialog v-model="groupDialogVisible" :group="editingGroup" />

    <el-dialog
      v-model="closeAskVisible"
      :title="t('closeDialog.title')"
      width="420px"
      append-to-body
      @closed="closeAsking = false"
    >
      <div class="close-ask-msg">{{ t('closeDialog.message') }}</div>
      <el-checkbox v-model="closeRemember">{{ t('closeDialog.remember') }}</el-checkbox>
      <template #footer>
        <el-button @click="onCloseChoice('tray')">{{ t('closeDialog.minimize') }}</el-button>
        <el-button type="danger" plain @click="onCloseChoice('exit')">{{ t('closeDialog.quit') }}</el-button>
      </template>
    </el-dialog>
  </el-config-provider>
</template>

<style scoped>
.close-ask-msg {
  margin-bottom: 12px;
  line-height: 1.6;
}
</style>
