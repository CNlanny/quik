/** 根据背景色亮度返回可读的前景文字颜色 */
export function textColorFor(hex: string): string {
  const m = (hex || '').replace('#', '')
  if (m.length !== 6 && m.length !== 3) return '#ffffff'
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#ffffff'
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 160 ? '#262a30' : '#ffffff'
}

/** hex 颜色转带透明度的 rgba，用于主题色的浅色背景 */
export function hexToRgba(hex: string, alpha: number): string {
  const m = (hex || '').replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return `rgba(78, 110, 242, ${alpha})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}-${raw}` : raw
}
