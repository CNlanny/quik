<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { useConfigStore } from '../stores/config'
import { languages } from '../i18n'
import type { CloseAction, ImportSummary, Language, ShellInfo, ShellMode, ThemeMode } from '../types'

const emit = defineEmits<{ back: [] }>()

const { t } = useI18n()
const config = useConfigStore()

const includeEnv = ref(false)
const busy = ref(false)
/** 开机自启动：状态以系统注册项为准（设置页每次进入重新查询），不冗余存 config.json */
const autostart = ref(false)
const autostartSwitching = ref(false)

const shellInfo = reactive<{ loading: boolean; info: ShellInfo | null }>({ loading: false, info: null })

async function detectShell() {
  shellInfo.loading = true
  shellInfo.info = null
  try {
    shellInfo.info = await invoke<ShellInfo>('detect_shell')
  } finally {
    shellInfo.loading = false
  }
}

function onKeydown(e: KeyboardEvent) {
  // 有弹层（如删除确认框）打开时，Esc 留给它处理
  if (e.key === 'Escape' && !document.querySelector('.el-overlay.is-message-box')) emit('back')
}

onMounted(() => {
  detectShell()
  syncEnvRows()
  loadAutostart()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

// ---------- 环境变量 ----------
interface VarRow {
  key: string
  value: string
}
interface EnvRow {
  id: string
  name: string
  vars: VarRow[]
}

const envRows = ref<EnvRow[]>([])
/** 展开的环境（折叠面板，同时只展开一个） */
const expandedEnvs = ref<string[]>([])
/** 占位符变量名的合法字符，与 runner 的 renderVars 正则一致 */
const VAR_KEY_RE = /^[\w.]+$/

/** 进入页面时从配置同步一份行数据（页面每次进入重新挂载，无需监听外部变更） */
function syncEnvRows() {
  envRows.value = (config.config?.environments ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    vars: Object.entries(e.vars ?? {}).map(([key, value]) => ({ key, value }))
  }))
  expandedEnvs.value = envRows.value.length ? [envRows.value[0].id] : []
}

/** 把行数据写回配置并持久化；变量名为空的行不写入 */
function commitEnv(row: EnvRow) {
  const vars: Record<string, string> = {}
  for (const v of row.vars) {
    const k = v.key.trim()
    if (k) vars[k] = v.value
  }
  config.updateEnvironment(row.id, { name: row.name.trim(), vars })
}

function addEnv() {
  const e = config.addEnvironment(t('settings.envNewName', { n: envRows.value.length + 1 }))
  if (!e) return
  envRows.value.push({ id: e.id, name: e.name, vars: [] })
  expandedEnvs.value = [e.id]
  // 之前没有激活环境时，激活第一个创建的环境
  if (!config.config?.activeEnvId) config.setActiveEnvironment(e.id)
}

async function removeEnv(row: EnvRow) {
  try {
    await ElMessageBox.confirm(t('settings.envDeleteConfirm', { name: row.name }), t('common.delete'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return
  }
  config.deleteEnvironment(row.id)
  envRows.value = envRows.value.filter((r) => r.id !== row.id)
}

function onNameChange(row: EnvRow) {
  if (!row.name.trim()) {
    row.name = config.config?.environments.find((e) => e.id === row.id)?.name ?? row.name
    ElMessage.warning(t('settings.envNameRequired'))
    return
  }
  commitEnv(row)
}

function onKeyChange(row: EnvRow, idx: number) {
  const v = row.vars[idx]
  const k = v.key.trim()
  if (!k) return
  if (!VAR_KEY_RE.test(k)) {
    v.key = ''
    ElMessage.warning(t('settings.envKeyInvalid'))
    return
  }
  if (row.vars.some((r, i) => i !== idx && r.key === k)) {
    v.key = ''
    ElMessage.warning(t('settings.envKeyDup'))
    return
  }
  v.key = k
  commitEnv(row)
}

function addVar(row: EnvRow) {
  row.vars.push({ key: '', value: '' })
}

function removeVar(row: EnvRow, idx: number) {
  row.vars.splice(idx, 1)
  commitEnv(row)
}

async function onExport() {
  const path = await save({
    filters: [{ name: 'Quik Export', extensions: ['json'] }],
    defaultPath: 'quik-export.json'
  })
  if (!path) return
  busy.value = true
  try {
    await invoke('export_config', { path, groupIds: null, includeEnv: includeEnv.value })
    ElMessage.success(t('settings.exportOk'))
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    busy.value = false
  }
}

async function onImport() {
  const path = await open({
    multiple: false,
    filters: [{ name: 'Quik Export', extensions: ['json'] }]
  })
  if (!path || typeof path !== 'string') return
  busy.value = true
  try {
    const summary = await invoke<ImportSummary>('import_config', { path })
    await config.reload()
    ElMessage.success(t('settings.importOk', { groups: summary.groupsAdded, buttons: summary.buttonsAdded }))
  } catch (e) {
    ElMessage.error(t('settings.importFail'))
    console.error(e)
  } finally {
    busy.value = false
  }
}

function onLanguageChange(lang: Language) {
  config.setLanguage(lang)
  // 托盘菜单文案跟随界面语言，切换后立即重建
  invoke('refresh_tray_menu', { lang })
}

function onThemeChange(theme: ThemeMode) {
  config.setTheme(theme)
}

function onShellChange(shell: ShellMode) {
  config.setDefaultShell(shell)
}

function onCloseActionChange(action: CloseAction) {
  config.setCloseAction(action)
}

// ---------- 开机自启动 ----------
async function loadAutostart() {
  try {
    autostart.value = await isEnabled()
  } catch (e) {
    console.error('query autostart failed:', e)
    autostart.value = false
  }
}

async function onAutostartChange(v: boolean | string | number) {
  const target = Boolean(v)
  autostartSwitching.value = true
  try {
    if (target) await enable()
    else await disable()
    autostart.value = target
    ElMessage.success(target ? t('settings.autostartOk') : t('settings.autostartOff'))
  } catch (e) {
    // 失败回弹：恢复切换前的状态
    autostart.value = !target
    ElMessage.error(t('settings.autostartFail'))
    console.error('toggle autostart failed:', e)
  } finally {
    autostartSwitching.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-header">
      <el-button text class="back-btn" @click="emit('back')">← {{ t('settings.back') }}</el-button>
      <span class="settings-title">{{ t('settings.title') }}</span>
    </div>

    <div class="settings-scroll">
      <el-form class="settings-form" label-width="120px" label-position="left">
        <el-form-item :label="t('settings.language')">
          <el-radio-group
            :model-value="config.config?.settings.language ?? 'zh-CN'"
            @update:model-value="onLanguageChange"
          >
            <el-radio v-for="l in languages" :key="l.value" :value="l.value">{{ l.label }}</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="t('settings.theme')">
          <el-radio-group
            :model-value="config.config?.settings.theme ?? 'light'"
            @update:model-value="onThemeChange"
          >
            <el-radio value="light">{{ t('settings.themeLight') }}</el-radio>
            <el-radio value="dark">{{ t('settings.themeDark') }}</el-radio>
            <el-radio value="system">{{ t('settings.themeSystem') }}</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="t('settings.defaultShell')">
          <div class="setting-block">
            <el-select
              :model-value="config.config?.settings.defaultShell ?? 'auto'"
              style="width: 200px"
              @update:model-value="onShellChange"
            >
              <el-option value="auto" :label="t('buttonDialog.auto')" />
              <el-option value="bash" :label="t('buttonDialog.bash')" />
              <el-option value="powershell" :label="t('buttonDialog.powershell')" />
              <el-option value="cmd" :label="t('buttonDialog.cmd')" />
            </el-select>
            <div class="shell-info">
              <template v-if="shellInfo.loading">{{ t('settings.detecting') }}</template>
              <template v-else-if="shellInfo.info">
                <div>{{ t('settings.resolved', { shell: shellInfo.info.auto }) }}</div>
                <div v-if="shellInfo.info.bashFound" class="info-ok">
                  {{ t('settings.bashFound', { path: shellInfo.info.bashPath ?? '' }) }}
                </div>
                <div v-else class="info-warn">{{ t('settings.bashNotFound') }}</div>
                <div :class="shellInfo.info.curlFound ? 'info-ok' : 'info-warn'">
                  {{ shellInfo.info.curlFound ? t('settings.curlFound') : t('settings.curlNotFound') }}
                </div>
                <el-button link size="small" @click="detectShell">{{ t('settings.refresh') }}</el-button>
              </template>
            </div>
          </div>
        </el-form-item>

        <el-form-item :label="t('settings.closeBehavior')">
          <el-select
            :model-value="config.config?.settings.closeAction ?? 'ask'"
            style="width: 200px"
            @update:model-value="onCloseActionChange"
          >
            <el-option value="ask" :label="t('settings.closeAsk')" />
            <el-option value="tray" :label="t('settings.closeTray')" />
            <el-option value="exit" :label="t('settings.closeExit')" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('settings.autostart')">
          <div class="setting-block">
            <el-switch
              :model-value="autostart"
              :loading="autostartSwitching"
              @change="onAutostartChange"
            />
            <div class="form-tip">{{ t('settings.autostartTip') }}</div>
          </div>
        </el-form-item>

        <el-form-item :label="t('settings.environments')">
          <div class="setting-block">
            <div class="form-tip">
              {{ t('settings.envTip') }} <code v-pre class="var-key-example">{{key}}</code>
            </div>
            <div class="env-toolbar">
              <el-select
                :model-value="config.config?.activeEnvId ?? ''"
                style="width: 200px"
                @update:model-value="config.setActiveEnvironment"
              >
                <el-option value="" :label="t('settings.envNone')" />
                <el-option v-for="row in envRows" :key="row.id" :label="row.name" :value="row.id" />
              </el-select>
              <el-button type="primary" plain @click="addEnv">{{ t('settings.envAdd') }}</el-button>
            </div>

            <el-collapse v-if="envRows.length" v-model="expandedEnvs" class="env-collapse">
              <el-collapse-item v-for="row in envRows" :key="row.id" :name="row.id">
                <template #title>
                  <div class="env-title">
                    <el-input
                      v-model="row.name"
                      class="env-name-input"
                      :placeholder="t('settings.envNamePh')"
                      maxlength="30"
                      @change="onNameChange(row)"
                      @click.stop
                    />
                    <el-tag
                      v-if="config.config?.activeEnvId === row.id"
                      size="small"
                      type="success"
                      effect="light"
                      class="env-active-tag"
                    >
                      {{ t('settings.envActiveTag') }}
                    </el-tag>
                    <span class="env-var-count">{{ t('settings.envVarCount', { n: row.vars.length }) }}</span>
                    <el-button link type="danger" size="small" class="env-title-del" @click.stop="removeEnv(row)">✕</el-button>
                  </div>
                </template>
                <div class="env-body">
                  <div v-for="(v, idx) in row.vars" :key="idx" class="var-row">
                    <el-input
                      v-model="v.key"
                      :placeholder="t('settings.envKeyPh')"
                      class="var-key"
                      spellcheck="false"
                      @change="onKeyChange(row, idx)"
                    />
                    <el-input
                      v-model="v.value"
                      :placeholder="t('settings.envValuePh')"
                      show-password
                      @change="commitEnv(row)"
                    />
                    <el-button link type="danger" class="var-del" @click="removeVar(row, idx)">✕</el-button>
                  </div>
                  <el-button link size="small" @click="addVar(row)">{{ t('settings.envAddVar') }}</el-button>
                </div>
              </el-collapse-item>
            </el-collapse>
            <div v-else class="form-tip">{{ t('settings.envEmpty') }}</div>
          </div>
        </el-form-item>

        <el-form-item :label="t('settings.data')">
          <div class="setting-block">
            <div class="form-tip">{{ t('settings.dataTip') }}</div>
            <div class="data-actions">
              <el-button :disabled="busy" @click="onImport">{{ t('settings.import') }}</el-button>
              <el-button :disabled="busy" type="primary" plain @click="onExport">{{ t('settings.export') }}</el-button>
            </div>
            <div class="include-env">
              <el-checkbox v-model="includeEnv">{{ t('settings.includeEnv') }}</el-checkbox>
              <span class="form-tip">{{ t('settings.includeEnvTip') }}</span>
            </div>
          </div>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* 页头：与工具栏同款的分隔样式，返回按钮 + 标题 */
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

.settings-form {
  max-width: 780px;
  padding: 26px 28px 48px;
}

.env-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.env-collapse {
  margin-top: 10px;
  border: none;
}

/* 折叠面板标题：名称（无边框输入，悬停才现边）+ 状态标签 + 变量数 + 删除 */
.env-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-right: 8px;
}

.env-name-input {
  width: 150px;
  flex: none;
}

.env-name-input :deep(.el-input__wrapper) {
  box-shadow: none;
  background: transparent;
  padding: 0 4px;
}

.env-name-input :deep(.el-input__wrapper):hover {
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
  border-radius: 4px;
}

.env-name-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
  border-radius: 4px;
}

.env-active-tag {
  flex: none;
}

.env-var-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.env-title-del {
  margin-left: auto;
}

.env-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 0 4px;
}

/* 变量行：变量名 | 值 | 删除，网格对齐 */
.var-row {
  display: grid;
  grid-template-columns: minmax(120px, 200px) 1fr auto;
  gap: 8px;
  align-items: center;
}

.var-key {
  font-family: 'Cascadia Code', Consolas, Menlo, monospace;
}

.var-del {
  justify-self: end;
}

.var-key-example {
  background: var(--el-fill-color-light);
  padding: 0 4px;
  border-radius: 3px;
  font-family: 'Cascadia Code', Consolas, Menlo, monospace;
}
</style>
