<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EMOJI_GROUPS, FONT_OPTIONS, PRESET_COLORS, TEXT_COLOR_PRESETS } from '../constants'
import { buttonFxClasses, computeButtonVars, gradientEndColor, mixHex } from '../utils/buttonStyle'
import type { ButtonStyle } from '../types'

const props = defineProps<{
  /** 预览用的按钮名称与动作类型 */
  name: string
  type: string
}>()

const icon = defineModel<string>('icon', { default: '' })
const color = defineModel<string>('color', { default: '#409EFF' })
const btnStyle = defineModel<ButtonStyle>('btnStyle', { required: true })

const { t } = useI18n()

function patchStyle(p: Partial<ButtonStyle>) {
  btnStyle.value = { ...btnStyle.value, ...p }
}

/** 切到渐变时给终点色一个同色系浅色默认值，避免起止同色看不出渐变 */
function setFill(fill: 'solid' | 'gradient') {
  if (fill === 'gradient' && !btnStyle.value.color2) {
    patchStyle({ fill, color2: mixHex(color.value, '#ffffff', 0.4) })
  } else {
    patchStyle({ fill })
  }
}

/* ---- 图标选择框 ---- */
const iconPop = ref(false)
const iconTab = ref(0)
/** 无自定义图标时按动作类型给默认图标（预览里也用它） */
const fallbackIcon = computed(() =>
  icon.value || (props.type === 'curl' ? '🌐' : props.type === 'script' ? '📜' : '⚡')
)

/* ---- 渐变角度（0° = 向上，与 CSS linear-gradient 一致） ---- */
const angles = [0, 45, 90, 135, 180, 225, 270, 315]
const gradEnd = computed(() => gradientEndColor(color.value, btnStyle.value))

/* ---- 文字：字重三档 + 斜体开关；字号 0 表示默认 12.5px ---- */
const weightOptions = [400, 600, 800]
const weightLabels: Record<number, string> = {
  400: 'buttonDialog.weightRegular',
  600: 'buttonDialog.weightMedium',
  800: 'buttonDialog.weightBold'
}
const fontOptions = computed(() => [{ label: t('buttonDialog.fontDefault'), value: '' }, ...FONT_OPTIONS])
const sizeProxy = computed({
  get: () => btnStyle.value.fontSize || 12.5,
  set: (v: number) => patchStyle({ fontSize: v })
})

/* ---- 实时预览：与真实卡片共用变量与 class ---- */
const previewVars = computed(() => computeButtonVars(color.value, btnStyle.value))
const previewClasses = computed(() => buttonFxClasses(btnStyle.value))
</script>

<template>
  <div class="appearance-editor">
    <div class="appearance-controls">
      <!-- 图标：单独的选择框，点击弹出分类图标选择器 -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.icon') }}</span>
        <el-popover
          v-model:visible="iconPop"
          placement="bottom-start"
          :width="312"
          trigger="click"
          popper-class="icon-picker-pop"
        >
          <template #reference>
            <div class="icon-select" :class="{ 'is-open': iconPop }">
              <span class="icon-select-value">{{ fallbackIcon }}</span>
              <span class="icon-select-text">
                <span class="icon-select-name">
                  {{ icon ? t('buttonDialog.iconPicked') : t('buttonDialog.iconDefault') }}
                </span>
                <span class="icon-select-hint">{{ t('buttonDialog.iconPickHint') }}</span>
              </span>
              <span class="icon-select-caret">▾</span>
            </div>
          </template>

          <div class="icon-picker">
            <div class="icon-picker-top">
              <el-input
                :model-value="icon"
                maxlength="8"
                :placeholder="t('buttonDialog.iconCustomPh')"
                @update:model-value="(v: string) => (icon = v.trim())"
              />
              <el-button size="small" @click="icon = ''">{{ t('buttonDialog.iconClear') }}</el-button>
            </div>
            <div class="icon-tabs">
              <button
                v-for="(g, i) in EMOJI_GROUPS"
                :key="g.key"
                type="button"
                class="icon-tab"
                :class="{ active: iconTab === i }"
                @click="iconTab = i"
              >
                {{ t(`buttonDialog.iconCat.${g.key}`) }}
              </button>
            </div>
            <div class="icon-grid">
              <button
                v-for="e in EMOJI_GROUPS[iconTab].emojis"
                :key="e"
                type="button"
                class="icon-grid-item"
                :class="{ active: icon === e }"
                @click="icon = e; iconPop = false"
              >
                {{ e }}
              </button>
            </div>
          </div>
        </el-popover>
      </div>

      <!-- 填充方式 -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.fill') }}</span>
        <div class="ap-seg">
          <button
            type="button"
            :class="{ active: btnStyle.fill === 'solid' }"
            @click="setFill('solid')"
          >
            {{ t('buttonDialog.solid') }}
          </button>
          <button
            type="button"
            :class="{ active: btnStyle.fill === 'gradient' }"
            @click="setFill('gradient')"
          >
            {{ t('buttonDialog.gradient') }}
          </button>
        </div>
      </div>

      <!-- 主色：预设色板 + RGB 拾色板 -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.color') }}</span>
        <div class="ap-colors">
          <span
            v-for="c in PRESET_COLORS"
            :key="c"
            class="color-swatch"
            :class="{ active: color.toLowerCase() === c.toLowerCase() }"
            :style="{ backgroundColor: c }"
            @click="color = c"
          ></span>
          <el-color-picker
            :model-value="color"
            :predefine="PRESET_COLORS"
            @update:model-value="(v: string | null) => v && (color = v)"
          />
        </div>
      </div>

      <!-- 渐变：起止色 + 方向 -->
      <div v-if="btnStyle.fill === 'gradient'" class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.gradientLabel') }}</span>
        <div class="ap-grad-box">
          <div class="ap-grad">
            <el-color-picker
              :model-value="color"
              :predefine="PRESET_COLORS"
              @update:model-value="(v: string | null) => v && (color = v)"
            />
            <div
              class="grad-bar"
              :style="{ background: `linear-gradient(${btnStyle.gradientAngle}deg, ${color}, ${gradEnd})` }"
            ></div>
            <el-color-picker
              :model-value="gradEnd"
              :predefine="PRESET_COLORS"
              @update:model-value="(v: string | null) => v && patchStyle({ color2: v })"
            />
          </div>
          <div class="ap-angles">
            <button
              v-for="a in angles"
              :key="a"
              type="button"
              class="angle-chip"
              :class="{ active: btnStyle.gradientAngle === a }"
              :title="`${a}°`"
              @click="patchStyle({ gradientAngle: a })"
            >
              <span class="angle-arrow" :style="{ transform: `rotate(${a - 90}deg)` }">➤</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 字体：选项文字用对应字体渲染，选中即所见 -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.font') }}</span>
        <el-select
          :model-value="btnStyle.fontFamily"
          :style="{ fontFamily: btnStyle.fontFamily || undefined }"
          class="font-select"
          @update:model-value="(v: string) => patchStyle({ fontFamily: v })"
        >
          <el-option v-for="f in fontOptions" :key="f.value" :label="f.label" :value="f.value">
            <span :style="{ fontFamily: f.value || undefined }">{{ f.label }}</span>
          </el-option>
        </el-select>
      </div>

      <!-- 样式：字重三档 + 斜体开关（按钮文字直接按对应字重渲染） -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.textStyle') }}</span>
        <div class="ap-inline">
          <div class="ap-seg">
            <button
              v-for="w in weightOptions"
              :key="w"
              type="button"
              :class="{ active: btnStyle.fontWeight === w }"
              :style="{ fontWeight: w }"
              @click="patchStyle({ fontWeight: w })"
            >
              {{ t(weightLabels[w]) }}
            </button>
          </div>
          <div class="ap-seg">
            <button
              type="button"
              class="italic-btn"
              :class="{ active: btnStyle.fontItalic }"
              @click="patchStyle({ fontItalic: !btnStyle.fontItalic })"
            >
              I
            </button>
          </div>
        </div>
      </div>

      <!-- 字号 -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.textSize') }}</span>
        <div class="ap-slider">
          <el-slider
            v-model="sizeProxy"
            :min="10"
            :max="24"
            :step="0.5"
            :show-tooltip="false"
          />
          <span class="ap-slider-value">{{ sizeProxy }}px</span>
        </div>
      </div>

      <!-- 字色：自动（按底色取对比色）/ 自定义 -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.textColorLabel') }}</span>
        <div class="ap-inline">
          <div class="ap-seg">
            <button
              type="button"
              :class="{ active: !btnStyle.textColor }"
              @click="patchStyle({ textColor: '' })"
            >
              {{ t('buttonDialog.textColorAuto') }}
            </button>
            <button
              type="button"
              :class="{ active: !!btnStyle.textColor }"
              @click="patchStyle({ textColor: btnStyle.textColor || '#ffffff' })"
            >
              {{ t('buttonDialog.textColorCustom') }}
            </button>
          </div>
          <el-color-picker
            v-if="btnStyle.textColor"
            :model-value="btnStyle.textColor"
            :predefine="TEXT_COLOR_PRESETS"
            @update:model-value="(v: string | null) => v && patchStyle({ textColor: v })"
          />
        </div>
      </div>

      <!-- 特效：无 / 光晕 / 毛玻璃（形状不变） -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.effect') }}</span>
        <div class="ap-seg">
          <button
            type="button"
            :class="{ active: btnStyle.effect === 'none' }"
            @click="patchStyle({ effect: 'none' })"
          >
            {{ t('buttonDialog.fxNone') }}
          </button>
          <button
            type="button"
            :class="{ active: btnStyle.effect === 'glow' }"
            @click="patchStyle({ effect: 'glow' })"
          >
            ✨ {{ t('buttonDialog.fxGlow') }}
          </button>
          <button
            type="button"
            :class="{ active: btnStyle.effect === 'glass' }"
            @click="patchStyle({ effect: 'glass' })"
          >
            🧊 {{ t('buttonDialog.fxGlass') }}
          </button>
        </div>
      </div>

      <!-- 特效强度：光晕范围 / 模糊度 -->
      <div v-if="btnStyle.effect !== 'none'" class="ap-row">
        <span class="ap-label">
          {{ btnStyle.effect === 'glass' ? t('buttonDialog.blurLevel') : t('buttonDialog.glowLevel') }}
        </span>
        <div class="ap-slider">
          <el-slider
            :model-value="btnStyle.effectLevel"
            :min="0"
            :max="100"
            :show-tooltip="false"
            @update:model-value="(v: number | number[]) => patchStyle({ effectLevel: Array.isArray(v) ? v[0] : v })"
          />
          <span class="ap-slider-value">{{ btnStyle.effectLevel }}</span>
        </div>
      </div>

      <!-- 边框：是否显示卡片描边 -->
      <div class="ap-row">
        <span class="ap-label">{{ t('buttonDialog.borderLabel') }}</span>
        <div class="ap-inline">
          <el-switch
            :model-value="btnStyle.border"
            @update:model-value="(v: string | number | boolean) => patchStyle({ border: !!v })"
          />
          <span class="ap-switch-tip">{{ t('buttonDialog.borderTip') }}</span>
        </div>
      </div>
    </div>

    <!-- 实时预览：复用按钮卡片的渲染，改一项立刻可见 -->
    <div class="ap-preview">
      <div class="btn-card is-preview" :class="previewClasses" :style="previewVars">
        <div class="btn-content">
          <span class="btn-icon">{{ fallbackIcon }}</span>
          <span class="btn-name">{{ name || t('buttonDialog.previewName') }}</span>
          <span class="btn-type">{{ type }}</span>
        </div>
      </div>
      <span class="ap-preview-tip">{{ t('buttonDialog.previewTip') }}</span>
    </div>
  </div>
</template>

<style scoped>
.appearance-editor {
  display: flex;
  gap: 16px;
  width: 100%;
  align-items: stretch;
}

.appearance-controls {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ap-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ap-label {
  width: 42px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-sub);
  text-align: right;
}

/* ---- 图标选择框 ---- */
.icon-select {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 250px;
  max-width: 100%;
  padding: 5px 10px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.icon-select:hover,
.icon-select.is-open {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-8, #e2e8fd);
}

.icon-select-value {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  background: #f5f7fa;
  border-radius: 8px;
}

.icon-select-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.icon-select-name {
  font-size: 12.5px;
  color: var(--text-main);
  line-height: 1.3;
}

.icon-select-hint {
  font-size: 11px;
  color: var(--text-sub);
  line-height: 1.3;
}

.icon-select-caret {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-sub);
}

/* ---- 弹出式图标选择器 ---- */
.icon-picker-top {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.icon-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.icon-tab {
  padding: 3px 9px;
  font-size: 12px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  color: var(--text-sub);
  cursor: pointer;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.icon-tab:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

.icon-tab.active {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

.icon-grid-item {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  padding: 5px 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  cursor: pointer;
}

.icon-grid-item:hover {
  background: #eef0f4;
}

.icon-grid-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

/* ---- 色板行 ---- */
.ap-colors {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.ap-colors .color-swatch {
  width: 24px;
  height: 24px;
}

/* ---- 渐变编辑 ---- */
.ap-grad-box {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ap-grad {
  display: flex;
  align-items: center;
  gap: 8px;
}

.grad-bar {
  flex: 1;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(16, 24, 40, 0.08);
}

.ap-angles {
  display: flex;
  gap: 4px;
  align-items: center;
}

.angle-chip {
  width: 30px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 6px;
  color: var(--text-sub);
  cursor: pointer;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.angle-chip:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

.angle-chip.active {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.angle-arrow {
  display: inline-block;
  font-size: 11px;
  line-height: 1;
  transition: transform 0.15s ease;
}

/* ---- 分段选择（填充/特效） ---- */
.ap-seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.ap-seg button {
  padding: 5px 14px;
  font-size: 12.5px;
  border: none;
  background: none;
  color: var(--text-sub);
  cursor: pointer;
  transition:
    color 0.12s ease,
    background 0.12s ease;
}

.ap-seg button + button {
  border-left: 1px solid var(--border);
}

.ap-seg button:hover {
  color: var(--el-color-primary);
}

.ap-seg button.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  font-weight: 600;
}

/* ---- 强度滑杆 ---- */
.ap-slider {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ap-slider .el-slider {
  flex: 1;
}

.ap-slider-value {
  width: 26px;
  text-align: right;
  font-size: 12px;
  color: var(--text-sub);
  font-variant-numeric: tabular-nums;
}

/* ---- 字体选择 ---- */
.font-select {
  width: 200px;
  max-width: 100%;
}

.font-select :deep(.el-select__wrapper) {
  font-size: 13px;
}

/* ---- 行内组合（分段 + 拾色器 / 开关 + 提示） ---- */
.ap-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 斜体开关：衬线斜体 I，与字重分段等高 */
.italic-btn {
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 14px;
  padding: 5px 14px;
}

.ap-switch-tip {
  font-size: 11.5px;
  color: var(--text-sub);
}

/* ---- 实时预览 ---- */
.ap-preview {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 10px;
  border-radius: 12px;
  background: #f2f4f8;
  /* 点阵底纹：让毛玻璃/半透明效果在预览里也能看出层次 */
  background-image: radial-gradient(circle, #d5dae3 1px, transparent 1px);
  background-size: 12px 12px;
}

.ap-preview-tip {
  font-size: 11px;
  color: var(--text-sub);
}
</style>
