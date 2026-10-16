import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'
import type { Language } from '../types'

export const languages: { value: Language; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' }
]

function initialLocale(): Language {
  try {
    const saved = localStorage.getItem('quik.lang')
    if (saved === 'zh-CN' || saved === 'en-US') return saved
  } catch {
    /* localStorage 不可用时忽略 */
  }
  return 'zh-CN'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

export function setLanguage(lang: Language) {
  i18n.global.locale.value = lang
  try {
    localStorage.setItem('quik.lang', lang)
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute('lang', lang)
}
