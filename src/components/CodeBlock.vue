<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElCollapseTransition, ElMessage } from 'element-plus'
import { i18n } from '../i18n'
import { highlightShell, prettifyScript } from '../utils/highlight'

/**
 * 只读脚本展示：美化排版 + 语法高亮 + 行号 + 复制。
 * expandable 模式下默认收起，点击后平滑展开（用于执行确认框）。
 * 注意用 i18n.global 而非 useI18n：本组件可能经由 ElMessageBox 的独立渲染上下文挂载。
 */
const props = withDefaults(
  defineProps<{
    code: string
    lang?: string
    expandable?: boolean
    prettify?: boolean
  }>(),
  { lang: '', expandable: false, prettify: true }
)

const t = i18n.global.t
const open = ref(!props.expandable)

const display = computed(() => (props.prettify ? prettifyScript(props.code) : props.code))
const lines = computed(() => highlightShell(display.value).split('\n'))

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code)
    ElMessage.success(t('common.copied'))
  } catch {
    ElMessage.error(t('common.copy'))
  }
}
</script>

<template>
  <div class="code-block">
    <button v-if="expandable && !open" class="code-reveal" type="button" @click="open = true">
      <span class="code-reveal-chev">▸</span>
      {{ t('confirm.showScript', { n: lines.length }) }}
    </button>

    <el-collapse-transition>
      <div v-show="open" class="code-block-inner">
        <div class="code-block-bar">
          <span v-if="lang" class="code-lang-chip">{{ lang }}</span>
          <span class="spacer"></span>
          <button class="code-mini-btn" type="button" @click="copy">⧉ {{ t('common.copy') }}</button>
          <button v-if="expandable" class="code-mini-btn" type="button" @click="open = false">
            ▴ {{ t('confirm.hideScript') }}
          </button>
        </div>
        <div class="code-lines">
          <div v-for="(ln, i) in lines" :key="i" class="code-line"><code v-html="ln"></code></div>
        </div>
      </div>
    </el-collapse-transition>
  </div>
</template>
