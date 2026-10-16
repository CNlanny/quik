import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { i18n } from './i18n'
import './styles/main.css'

createApp(App).use(createPinia()).use(i18n).use(ElementPlus).mount('#app')

// 屏蔽 WebView 自带的浏览器右键菜单（刷新/后退/检查等）；
// 文本输入框内保留原生菜单，方便右键复制粘贴。卡片的自定义菜单不受影响（各自 preventDefault）。
document.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
  e.preventDefault()
})
