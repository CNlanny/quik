<script setup lang="ts">
import { computed, ref } from 'vue'
import { i18n } from '../i18n'
import { highlightShell, prettifyScript } from '../utils/highlight'

/**
 * 带语法高亮的脚本编辑器：透明 textarea 叠加在高亮 <pre> 之上，两层字体/滚动严格同步。
 * 支持Tab 缩进与一键格式化（仅美化排版，不改写 token）。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    lang?: string
    placeholder?: string
    rows?: number
  }>(),
  { lang: '', placeholder: '', rows: 7 }
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const t = i18n.global.t
const layerRef = ref<HTMLElement | null>(null)

// 末尾补一个换行：textarea 中光标停在末行空行时，高亮层需要等高的空行对齐
const highlighted = computed(() => highlightShell(props.modelValue) + '\n')

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}

function syncScroll(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  if (layerRef.value) {
    layerRef.value.scrollTop = ta.scrollTop
    layerRef.value.scrollLeft = ta.scrollLeft
  }
}

function onTab(e: KeyboardEvent) {
  const ta = e.target as HTMLTextAreaElement
  const { selectionStart, selectionEnd, value } = ta
  emit('update:modelValue', value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd))
  requestAnimationFrame(() => ta.setSelectionRange(selectionStart + 2, selectionStart + 2))
}

function format() {
  emit('update:modelValue', prettifyScript(props.modelValue))
  requestAnimationFrame(() => {
    const ta = layerRef.value?.parentElement?.querySelector('textarea')
    ta?.setSelectionRange(0, 0)
  })
}
</script>

<template>
  <div class="code-editor">
    <div class="code-editor-bar">
      <span v-if="lang" class="code-lang-chip">{{ lang }}</span>
      <span class="spacer"></span>
      <button class="code-mini-btn" type="button" @click="format">✦ {{ t('buttonDialog.format') }}</button>
    </div>
    <div class="code-editor-body">
      <pre ref="layerRef" class="code-layer" aria-hidden="true"><code v-html="highlighted"></code></pre>
      <textarea
        class="code-input"
        :value="modelValue"
        :rows="rows"
        :placeholder="placeholder"
        spellcheck="false"
        wrap="off"
        @input="onInput"
        @scroll="syncScroll"
        @keydown.tab.prevent="onTab"
      ></textarea>
    </div>
  </div>
</template>
