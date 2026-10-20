import type { CSSProperties } from 'vue'
import { hexToRgba, textColorFor } from '../utils'
import type { ButtonStyle } from '../types'

/** 外观默认值：纯色、无特效；color2 留空表示渐变时自动取主色浅色变体。
 *  字体默认跟随应用；字重 600 与字号 0（=12.5px）保持旧版观感；文字颜色自动取对比色 */
export const DEFAULT_BUTTON_STYLE: ButtonStyle = {
  fill: 'solid',
  color2: '',
  gradientAngle: 135,
  effect: 'none',
  effectLevel: 45,
  border: true,
  fontFamily: '',
  fontWeight: 600,
  fontItalic: false,
  fontSize: 0,
  textColor: ''
}

/** 补全缺省字段（旧配置没有 style 时全部走默认值） */
export function normalizeButtonStyle(s?: Partial<ButtonStyle> | null): ButtonStyle {
  return { ...DEFAULT_BUTTON_STYLE, ...(s ?? {}) }
}

function parseHex(hex: string): [number, number, number] | null {
  const m = (hex || '').replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  if (full.length !== 6) return null
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return null
  return [r, g, b]
}

/** 两色线性混合（t=0 取 a，t=1 取 b） */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return b
  const k = Math.min(1, Math.max(0, t))
  const mixed = ca.map((v, i) => Math.round(v + (cb[i] - v) * k))
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** 渐变终点色：未指定时用主色向白色偏移的同色系浅色，默认出耐看的单色渐变 */
export function gradientEndColor(color: string, s?: Partial<ButtonStyle> | null): string {
  const st = normalizeButtonStyle(s)
  return st.color2 || mixHex(color, '#ffffff', 0.4)
}

/** 特效/填充相关的 class（毛玻璃需要 backdrop-filter，无边框需要覆盖描边样式） */
export function buttonFxClasses(s?: Partial<ButtonStyle> | null): string[] {
  const st = normalizeButtonStyle(s)
  const cls: string[] = []
  if (st.fill === 'gradient') cls.push('fill-grad')
  if (st.effect === 'glass') cls.push('fx-glass')
  if (st.effect === 'glow') cls.push('fx-glow')
  if (!st.border) cls.push('no-border')
  return cls
}

/**
 * 由主色 + 外观配置计算卡片渲染所需的全部 CSS 变量：
 * --card-fill 铺满底色（纯色/渐变/半透明），--btn-fg 系列保证文字在深浅底色上都可读，
 * --fx-shadow / --glass-blur 承载光晕与毛玻璃特效强度。卡片与编辑弹窗的实时预览共用。
 */
export function computeButtonVars(color: string, s?: Partial<ButtonStyle> | null): CSSProperties {
  const st = normalizeButtonStyle(s)
  const c2 = gradientEndColor(color, st)
  const glow = st.effect === 'glow'
  const glass = st.effect === 'glass'
  const level = Math.min(100, Math.max(0, st.effectLevel))
  // 毛玻璃：模糊越强填充越透明（0.62 → 0.30），让背景透出来
  const alpha = glass ? 0.62 - level * 0.0032 : 1

  const fill =
    st.fill === 'gradient'
      ? glass
        ? `linear-gradient(${st.gradientAngle}deg, ${hexToRgba(color, alpha)}, ${hexToRgba(c2, alpha)})`
        : `linear-gradient(${st.gradientAngle}deg, ${color}, ${c2})`
      : glass
        ? hexToRgba(color, alpha)
        : color

  // 文字对比色：纯色直接判定；渐变两端分别判定，不一致时取白
  //（彩色卡片配白字 + 文字阴影是更稳的默认，浅色端靠 --btn-text-shadow 兜底）。
  // 毛玻璃叠在浅色画布上，判定时向白色偏移。
  let autoFg: string
  if (st.fill === 'gradient') {
    const fa = textColorFor(color)
    const fb = textColorFor(mixHex(c2, '#ffffff', glass ? 0.35 : 0))
    autoFg = fa === fb ? fa : '#ffffff'
  } else {
    autoFg = textColorFor(glass ? mixHex(color, '#ffffff', 0.35) : color)
  }
  const fg = st.textColor || autoFg

  return {
    '--accent': color,
    '--accent-soft': hexToRgba(color, 0.12),
    '--accent-deep': hexToRgba(color, 0.45),
    '--card-fill': fill,
    '--btn-fg': fg,
    '--btn-fg-2': st.textColor
      ? `color-mix(in srgb, ${st.textColor} 72%, transparent)`
      : autoFg === '#ffffff'
        ? 'rgba(255,255,255,0.74)'
        : 'rgba(31,35,41,0.6)',
    '--btn-text-shadow': !st.textColor && autoFg === '#ffffff' ? '0 1px 2px rgba(0,0,0,0.22)' : 'none',
    '--bubble': autoFg === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.42)',
    '--btn-family': st.fontFamily || 'inherit',
    '--btn-weight': String(st.fontWeight),
    '--btn-style': st.fontItalic ? 'italic' : 'normal',
    '--btn-size': st.fontSize ? `${st.fontSize}px` : '12.5px',
    '--glass-blur': `${(6 + level * 0.14).toFixed(1)}px`,
    '--fx-shadow': glow
      ? `0 6px ${Math.round(10 + level * 0.3)}px ${hexToRgba(color, 0.22 + level * 0.004)}`
      : '0 0 0 rgba(0,0,0,0)',
    '--fx-shadow-hover': glow
      ? `0 10px ${Math.round(16 + level * 0.42)}px ${hexToRgba(color, 0.32 + level * 0.004)}`
      : '0 0 0 rgba(0,0,0,0)'
  } as CSSProperties
}
