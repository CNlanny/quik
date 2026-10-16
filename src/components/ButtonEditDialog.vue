<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useConfigStore } from '../stores/config'
import CodeEditor from './CodeEditor.vue'
import CodeBlock from './CodeBlock.vue'
import { PRESET_COLORS, EMOJIS } from '../constants'
import type { ActionConfig, ActionType, ButtonFormData, ButtonItem, ShellMode } from '../types'

const props = defineProps<{
  button: ButtonItem | null
  groupId: string
}>()

const visible = defineModel<boolean>({ default: false })

const emit = defineEmits<{ manageScripts: [] }>()

const { t } = useI18n()
const config = useConfigStore()

const isEdit = computed(() => !!props.button)
const isScriptType = computed(() => form.type === 'script')

const form = reactive<{
  groupId: string
  name: string
  color: string
  icon: string
  type: ActionType
  shell: ShellMode
  timeoutSec: number
  confirm: boolean
  showScript: boolean
  script: string
  scriptId: string
  workdir: string
  args: string
}>({
  groupId: '',
  name: '',
  color: PRESET_COLORS[0],
  icon: '',
  type: 'shell',
  shell: 'auto',
  timeoutSec: 30,
  confirm: false,
  showScript: true,
  script: '',
  scriptId: '',
  workdir: '',
  args: ''
})

watch(visible, (v) => {
  if (!v) return
  if (props.button) {
    const b = props.button
    const g = config.groupOfButton(b.id)
    form.groupId = g?.id ?? ''
    form.name = b.name
    form.color = b.color
    form.icon = b.icon
    form.type = b.action.type
    form.shell = b.action.shell
    form.timeoutSec = b.action.timeoutSec
    form.confirm = b.confirm
    form.showScript = b.showScript ?? true
    form.script = b.action.script
    form.scriptId = b.action.scriptId ?? ''
    form.workdir = b.action.workdir ?? ''
    form.args = b.action.args ?? ''
  } else {
    form.groupId = props.groupId || config.groups[0]?.id || ''
    form.name = ''
    form.color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
    form.icon = ''
    form.type = 'shell'
    form.shell = 'auto'
    form.timeoutSec = 30
    form.confirm = false
    form.showScript = true
    form.script = ''
    form.scriptId = ''
    form.workdir = ''
    form.args = ''
  }
})

/** 当前选中的脚本库条目（预览 + 校验引用是否仍存在） */
const selectedScript = computed(() =>
  isScriptType.value ? config.scripts.find((s) => s.id === form.scriptId) : undefined
)

async function browseWorkdir() {
  const dir = await openDialog({ directory: true, multiple: false })
  if (typeof dir === 'string') form.workdir = dir
}

function save() {
  if (!form.name.trim()) {
    ElMessage.warning(t('buttonDialog.nameRequired'))
    return
  }
  if (isScriptType.value) {
    if (!selectedScript.value) {
      ElMessage.warning(t('buttonDialog.scriptSelectRequired'))
      return
    }
    if (!form.workdir.trim()) {
      ElMessage.warning(t('buttonDialog.workdirRequired'))
      return
    }
  } else if (!form.script.trim()) {
    ElMessage.warning(t('buttonDialog.scriptRequired'))
    return
  }
  if (!isEdit.value && !form.groupId) {
    ElMessage.warning(t('buttonDialog.groupRequired'))
    return
  }

  const action: ActionConfig = {
    type: form.type,
    mode: 'script',
    script: isScriptType.value ? '' : form.script,
    scriptId: isScriptType.value ? form.scriptId : '',
    workdir: isScriptType.value ? form.workdir.trim() : '',
    args: isScriptType.value ? form.args.trim() : '',
    timeoutSec: Math.max(1, Math.floor(form.timeoutSec) || 30),
    shell: form.shell
  }
  const data: ButtonFormData = {
    name: form.name.trim(),
    color: form.color || PRESET_COLORS[0],
    icon: form.icon,
    confirm: form.confirm,
    showScript: form.showScript,
    action
  }

  if (props.button) {
    config.updateButton({ ...props.button, ...data })
  } else {
    config.addButton(form.groupId, data)
  }
  visible.value = false
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? t('buttonDialog.editTitle') : t('buttonDialog.newTitle')"
    class="edit-dialog"
    top="5vh"
    width="640px"
    append-to-body
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form label-width="110px" label-position="left" @submit.prevent>
      <el-form-item :label="t('buttonDialog.group')">
        <template v-if="isEdit">
          <span>{{ config.groupOfButton(props.button!.id)?.name ?? '—' }}</span>
        </template>
        <el-select v-else v-model="form.groupId" style="width: 100%">
          <el-option v-for="g in config.groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('buttonDialog.name')">
        <el-input v-model="form.name" :placeholder="t('buttonDialog.namePh')" maxlength="60" />
      </el-form-item>

      <el-form-item :label="t('buttonDialog.icon')">
        <div class="icon-row">
          <el-input v-model="form.icon" :placeholder="t('buttonDialog.iconPh')" style="width: 110px" />
          <div class="emoji-list">
            <span
              v-for="e in EMOJIS"
              :key="e"
              class="emoji-item"
              :class="{ active: form.icon === e }"
              @click="form.icon = e"
            >
              {{ e }}
            </span>
          </div>
        </div>
      </el-form-item>

      <el-form-item :label="t('buttonDialog.color')">
        <div class="color-row">
          <span
            v-for="c in PRESET_COLORS"
            :key="c"
            class="color-swatch"
            :class="{ active: form.color === c }"
            :style="{ backgroundColor: c }"
            @click="form.color = c"
          ></span>
          <el-color-picker v-model="form.color" />
        </div>
      </el-form-item>

      <el-form-item :label="t('buttonDialog.type')">
        <el-radio-group v-model="form.type">
          <el-radio value="shell">{{ t('buttonDialog.shell') }}</el-radio>
          <el-radio value="script">{{ t('buttonDialog.scriptType') }}</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 脚本类型：引用脚本库 + 工作目录 + 参数 -->
      <template v-if="isScriptType">
        <el-form-item :label="t('buttonDialog.scriptRef')" required>
          <div class="script-ref-row">
            <el-select
              v-model="form.scriptId"
              style="flex: 1"
              :placeholder="t('buttonDialog.scriptRefPh')"
            >
              <el-option v-for="s in config.scripts" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
            <el-button plain @click="emit('manageScripts')">📜 {{ t('buttonDialog.manageScripts') }}</el-button>
          </div>
        </el-form-item>

        <el-form-item v-if="selectedScript" label=" ">
          <CodeBlock :code="selectedScript.content" :lang="selectedScript.name" class="script-preview" />
        </el-form-item>

        <el-form-item :label="t('buttonDialog.workdir')" required>
          <div class="script-ref-row">
            <el-input
              v-model="form.workdir"
              :placeholder="t('buttonDialog.workdirPh')"
              spellcheck="false"
              style="flex: 1"
            />
            <el-button plain @click="browseWorkdir">📁</el-button>
          </div>
          <div class="form-tip workdir-tip">{{ t('buttonDialog.workdirTip') }}</div>
        </el-form-item>

        <el-form-item :label="t('buttonDialog.args')">
          <el-input
            v-model="form.args"
            :placeholder="t('buttonDialog.argsPh')"
            spellcheck="false"
          />
          <div class="form-tip workdir-tip">{{ t('buttonDialog.argsTip') }}</div>
        </el-form-item>
      </template>

      <!-- shell 类型：内联脚本编辑 -->
      <el-form-item v-else :label="t('buttonDialog.script')">
        <CodeEditor
          v-model="form.script"
          :lang="form.type"
          :rows="8"
          :placeholder="t('buttonDialog.scriptPh')"
        />
      </el-form-item>

      <el-form-item :label="t('buttonDialog.shellLabel')">
        <el-select v-model="form.shell" style="width: 220px">
          <el-option value="auto" :label="t('buttonDialog.auto')" />
          <el-option value="bash" :label="t('buttonDialog.bash')" />
          <el-option value="powershell" :label="t('buttonDialog.powershell')" />
          <el-option value="cmd" :label="t('buttonDialog.cmd')" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('buttonDialog.timeout')">
        <el-input-number v-model="form.timeoutSec" :min="1" :max="86400" :step="5" />
      </el-form-item>

      <el-form-item :label="t('buttonDialog.confirmLabel')">
        <div>
          <el-switch v-model="form.confirm" />
          <span class="form-tip">{{ t('buttonDialog.confirmTip') }}</span>
        </div>
      </el-form-item>

      <el-form-item :label="t('buttonDialog.showScriptLabel')">
        <div>
          <el-switch v-model="form.showScript" />
          <span class="form-tip">{{ t('buttonDialog.showScriptTip') }}</span>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.script-ref-row {
  display: flex;
  gap: 8px;
  width: 100%;
  align-items: center;
}

.script-preview {
  width: 100%;
}

.workdir-tip {
  margin-top: 4px;
}
</style>
