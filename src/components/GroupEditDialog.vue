<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useConfigStore } from '../stores/config'
import { PRESET_COLORS } from '../constants'
import type { GroupItem } from '../types'

const props = defineProps<{ group: GroupItem | null }>()

const visible = defineModel<boolean>({ default: false })

const { t } = useI18n()
const config = useConfigStore()

const isEdit = computed(() => !!props.group)

const form = reactive({ name: '', color: PRESET_COLORS[0] })

watch(visible, (v) => {
  if (!v) return
  if (props.group) {
    form.name = props.group.name
    form.color = props.group.color
  } else {
    form.name = ''
    form.color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
  }
})

const nameInput = ref<HTMLInputElement | null>(null)

function save() {
  if (!form.name.trim()) {
    ElMessage.warning(t('groupDialog.nameRequired'))
    return
  }
  if (props.group) {
    config.updateGroup(props.group.id, { name: form.name.trim(), color: form.color })
  } else {
    const g = config.addGroup(form.name.trim(), form.color)
    config.activeGroupId = g.id
  }
  visible.value = false
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? t('groupDialog.editTitle') : t('groupDialog.newTitle')"
    width="460px"
    append-to-body
    :close-on-click-modal="false"
    destroy-on-close
    @open="nameInput?.focus()"
  >
    <el-form label-width="70px" label-position="left" @submit.prevent>
      <el-form-item :label="t('groupDialog.name')">
        <el-input ref="nameInput" v-model="form.name" :placeholder="t('groupDialog.namePh')" maxlength="40" />
      </el-form-item>
      <el-form-item :label="t('groupDialog.color')">
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
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>
