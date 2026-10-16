<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConfigStore } from '../stores/config'
import CodeEditor from './CodeEditor.vue'

/**
 * 脚本库管理：集中维护可复用脚本，供「脚本」类型按钮引用执行。
 * 编辑即保存（400ms 防抖落盘），删除时提示引用该脚本的按钮数量。
 */
const emit = defineEmits<{ back: [] }>()

const { t } = useI18n()
const config = useConfigStore()

interface ScriptRow {
  id: string
  name: string
  content: string
}

const rows = ref<ScriptRow[]>([])
/** 展开的脚本（折叠面板，同时只展开一个） */
const expandedRows = ref<string[]>([])

/** 进入页面时从配置同步一份行数据（页面每次进入重新挂载，无需监听外部变更） */
function syncRows() {
  rows.value = (config.scripts ?? []).map((s) => ({ id: s.id, name: s.name, content: s.content }))
  expandedRows.value = rows.value.length ? [rows.value[0].id] : []
}

// ---------- 编辑即保存（防抖） ----------
let saveTimer: number | null = null

function commitDirty() {
  saveTimer = null
  for (const r of rows.value) {
    const s = config.getScript(r.id)
    if (!s) continue
    const name = r.name.trim() || s.name
    if (r.name !== name) r.name = name
    if (s.name !== r.name || s.content !== r.content) {
      config.updateScript(r.id, { name: r.name, content: r.content })
    }
  }
}

function scheduleCommit() {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(commitDirty, 400)
}

watch(rows, scheduleCommit, { deep: true })

function onNameChange(row: ScriptRow) {
  if (!row.name.trim()) {
    row.name = config.getScript(row.id)?.name ?? row.name
    ElMessage.warning(t('scriptPage.nameRequired'))
    return
  }
  commitDirty()
}

// ---------- 增删复制 ----------
function addScript() {
  const s = config.addScript(t('scriptPage.newName', { n: rows.value.length + 1 }), '')
  if (!s) return
  rows.value.push({ id: s.id, name: s.name, content: s.content })
  expandedRows.value = [s.id]
}

function duplicateScript(row: ScriptRow) {
  const s = config.duplicateScript(row.id)
  if (!s) return
  rows.value.push({ id: s.id, name: s.name, content: s.content })
  expandedRows.value = [s.id]
}

async function removeScript(row: ScriptRow) {
  const usage = config.scriptUsageCount(row.id)
  const msg = usage
    ? t('scriptPage.deleteConfirmUsed', { name: row.name, n: usage })
    : t('scriptPage.deleteConfirm', { name: row.name })
  try {
    await ElMessageBox.confirm(msg, t('common.delete'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return
  }
  config.deleteScript(row.id)
  rows.value = rows.value.filter((r) => r.id !== row.id)
}

// ---------- Esc 返回（有弹层时让给它） ----------
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !document.querySelector('.el-overlay.is-message-box')) emit('back')
}

onMounted(() => {
  syncRows()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  // 离开页面前把未落盘的编辑写回
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    commitDirty()
  }
})
</script>

<template>
  <div class="script-page">
    <div class="settings-header">
      <el-button text class="back-btn" @click="emit('back')">← {{ t('scriptPage.back') }}</el-button>
      <span class="settings-title">{{ t('scriptPage.title') }}</span>
    </div>

    <div class="settings-scroll">
      <div class="script-body">
        <div class="form-tip">
          {{ t('scriptPage.tipPrefix') }} <code v-pre class="var-key-example">{{var}}</code>
        </div>

        <div class="script-toolbar">
          <el-button type="primary" plain @click="addScript">＋ {{ t('scriptPage.add') }}</el-button>
          <span v-if="rows.length" class="script-count">{{ t('scriptPage.count', { n: rows.length }) }}</span>
        </div>

        <el-collapse v-if="rows.length" v-model="expandedRows" class="script-collapse">
          <el-collapse-item v-for="row in rows" :key="row.id" :name="row.id">
            <template #title>
              <div class="script-title">
                <el-input
                  v-model="row.name"
                  class="script-name-input"
                  :placeholder="t('scriptPage.namePh')"
                  maxlength="60"
                  @change="onNameChange(row)"
                  @click.stop
                />
                <el-tag
                  v-if="config.scriptUsageCount(row.id)"
                  size="small"
                  type="info"
                  effect="light"
                  class="script-usage-tag"
                >
                  {{ t('scriptPage.usedBy', { n: config.scriptUsageCount(row.id) }) }}
                </el-tag>
                <span v-else class="script-unused">{{ t('scriptPage.unused') }}</span>
                <el-button link size="small" class="script-title-act" @click.stop="duplicateScript(row)">
                  {{ t('common.duplicate') }}
                </el-button>
                <el-button link type="danger" size="small" class="script-title-act" @click.stop="removeScript(row)">
                  ✕
                </el-button>
              </div>
            </template>
            <CodeEditor
              v-model="row.content"
              :rows="10"
              :placeholder="t('scriptPage.contentPh')"
            />
          </el-collapse-item>
        </el-collapse>
        <div v-else class="script-empty">
          <div class="script-empty-icon">📜</div>
          <div>{{ t('scriptPage.empty') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 页面骨架复用设置页样式：头部同工具栏分隔，主体可滚动 */
.script-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}

.back-btn {
  font-weight: 600;
}

.settings-title {
  font-size: 15px;
  font-weight: 700;
}

.settings-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.script-body {
  max-width: 780px;
  padding: 22px 28px 48px;
}

.script-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0 4px;
}

.script-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.script-collapse {
  border: none;
}

/* 折叠面板标题：名称（无边框输入，悬停才现边）+ 引用标签 + 复制/删除 */
.script-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-right: 8px;
}

.script-name-input {
  width: 180px;
  flex: none;
}

.script-name-input :deep(.el-input__wrapper) {
  box-shadow: none;
  background: transparent;
  padding: 0 4px;
}

.script-name-input :deep(.el-input__wrapper):hover {
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
  border-radius: 4px;
}

.script-name-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
  border-radius: 4px;
}

.script-usage-tag {
  flex: none;
}

.script-unused {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.script-title-act {
  margin-left: auto;
}

.script-title-act + .script-title-act {
  margin-left: 0;
}

.script-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  padding: 60px 0;
}

.script-empty-icon {
  font-size: 34px;
}

.var-key-example {
  background: var(--el-fill-color-light);
  padding: 0 4px;
  border-radius: 3px;
  font-family: 'Cascadia Code', Consolas, Menlo, monospace;
}
</style>
