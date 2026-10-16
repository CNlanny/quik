<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const search = defineModel<string>('search', { default: '' })

const emit = defineEmits<{ newButton: []; openScripts: []; openSettings: [] }>()
</script>

<template>
  <div class="toolbar">
    <el-input v-model="search" :placeholder="t('toolbar.search')" clearable class="search-input" />
    <div class="toolbar-actions">
      <el-button type="primary" @click="emit('newButton')">＋ {{ t('toolbar.newButton') }}</el-button>
      <el-button class="icon-btn" :title="t('toolbar.scripts')" @click="emit('openScripts')">📜</el-button>
      <el-button class="icon-btn" :title="t('toolbar.settings')" @click="emit('openSettings')">⚙</el-button>
    </div>
  </div>
</template>
