import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type {
  AppConfig,
  ButtonFormData,
  ButtonItem,
  CloseAction,
  Environment,
  GroupItem,
  Language,
  ScriptItem,
  ShellMode,
  ThemeMode
} from '../types'
import { setLanguage as applyLanguage } from '../i18n'
import { applyTheme } from '../utils/theme'
import { uid } from '../utils'

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig | null>(null)
  const loaded = ref(false)
  const activeGroupId = ref<string>('all')

  const groups = computed(() => config.value?.groups ?? [])
  const scripts = computed(() => config.value?.scripts ?? [])

  async function init() {
    config.value = await invoke<AppConfig>('load_config')
    if (config.value.settings.language) applyLanguage(config.value.settings.language)
    // 启动时已按 localStorage 缓存先行应用，这里以配置为准校正（旧配置缺失按浅色）
    applyTheme(config.value.settings.theme ?? 'light')
    loaded.value = true
  }

  /** 规范化排序字段后持久化到磁盘 */
  function persist(): Promise<unknown> {
    const c = config.value
    if (!c) return Promise.resolve()
    c.groups.forEach((g, i) => {
      g.order = i + 1
      g.buttons.forEach((b, j) => {
        b.order = j + 1
      })
    })
    c.scripts.forEach((s, i) => {
      s.order = i + 1
    })
    return invoke('save_config', { config: c }).catch((e) => {
      console.error('save_config failed:', e)
    })
  }

  // ---------- 分组 ----------
  function addGroup(name: string, color: string): GroupItem {
    const g: GroupItem = { id: uid('g'), name, color, collapsed: false, order: 0, buttons: [] }
    config.value?.groups.push(g)
    persist()
    return g
  }

  function updateGroup(id: string, patch: Partial<Pick<GroupItem, 'name' | 'color'>>) {
    const g = groups.value.find((x) => x.id === id)
    if (!g) return
    Object.assign(g, patch)
    persist()
  }

  function deleteGroup(id: string) {
    if (!config.value) return
    config.value.groups = config.value.groups.filter((g) => g.id !== id)
    if (activeGroupId.value === id) activeGroupId.value = 'all'
    persist()
  }

  /** 将拖拽的分组移动到目标分组之前 */
  function moveGroup(draggedId: string, targetId: string) {
    const list = config.value?.groups
    if (!list) return
    const from = list.findIndex((g) => g.id === draggedId)
    const to = list.findIndex((g) => g.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const [g] = list.splice(from, 1)
    list.splice(list.findIndex((x) => x.id === targetId), 0, g)
    persist()
  }

  function toggleCollapsed(id: string) {
    const g = groups.value.find((x) => x.id === id)
    if (g) g.collapsed = !g.collapsed
  }

  // ---------- 按钮 ----------
  function addButton(groupId: string, data: ButtonFormData) {
    const g = groups.value.find((x) => x.id === groupId)
    if (!g) return
    g.buttons.push({ id: uid('b'), order: 0, ...data })
    persist()
  }

  function updateButton(btn: ButtonItem) {
    const g = groups.value.find((x) => x.buttons.some((b) => b.id === btn.id))
    if (!g) return
    const idx = g.buttons.findIndex((b) => b.id === btn.id)
    g.buttons[idx] = btn
    persist()
  }

  function deleteButton(id: string) {
    for (const g of groups.value) {
      const idx = g.buttons.findIndex((b) => b.id === id)
      if (idx >= 0) {
        g.buttons.splice(idx, 1)
        break
      }
    }
    persist()
  }

  function getButton(id: string): ButtonItem | undefined {
    for (const g of groups.value) {
      const b = g.buttons.find((x) => x.id === id)
      if (b) return b
    }
    return undefined
  }

  function groupOfButton(id: string): GroupItem | undefined {
    return groups.value.find((g) => g.buttons.some((b) => b.id === id))
  }

  /** 将按钮移动到同分组内目标按钮之前（拖拽排序） */
  function moveButton(groupId: string, draggedId: string, targetId: string) {
    const g = groups.value.find((x) => x.id === groupId)
    if (!g) return
    const from = g.buttons.findIndex((b) => b.id === draggedId)
    const to = g.buttons.findIndex((b) => b.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const [b] = g.buttons.splice(from, 1)
    g.buttons.splice(g.buttons.findIndex((x) => x.id === targetId), 0, b)
    persist()
  }

  /** 将按钮移动到同分组末尾（拖到网格尾部放置区） */
  function moveButtonToEnd(groupId: string, draggedId: string) {
    const g = groups.value.find((x) => x.id === groupId)
    if (!g) return
    const from = g.buttons.findIndex((b) => b.id === draggedId)
    if (from < 0 || from === g.buttons.length - 1) return
    const [b] = g.buttons.splice(from, 1)
    g.buttons.push(b)
    persist()
  }

  // ---------- 脚本库 ----------
  function addScript(name: string, content: string): ScriptItem | undefined {
    if (!config.value) return
    const s: ScriptItem = { id: uid('sc'), name, content, order: 0 }
    config.value.scripts.push(s)
    persist()
    return s
  }

  function updateScript(id: string, patch: Partial<Pick<ScriptItem, 'name' | 'content'>>) {
    const s = config.value?.scripts.find((x) => x.id === id)
    if (!s) return
    Object.assign(s, patch)
    persist()
  }

  function deleteScript(id: string) {
    if (!config.value) return
    config.value.scripts = config.value.scripts.filter((s) => s.id !== id)
    persist()
  }

  function duplicateScript(id: string): ScriptItem | undefined {
    const s = config.value?.scripts.find((x) => x.id === id)
    if (!s) return
    return addScript(`${s.name} ②`, s.content)
  }

  function getScript(id: string): ScriptItem | undefined {
    return config.value?.scripts.find((s) => s.id === id)
  }

  /** 引用某脚本的按钮数量（删除脚本时提示用） */
  function scriptUsageCount(id: string): number {
    return groups.value.reduce(
      (n, g) =>
        n + g.buttons.filter((b) => b.action.type === 'script' && b.action.scriptId === id).length,
      0
    )
  }

  // ---------- 环境变量 ----------
  function addEnvironment(name: string): Environment | undefined {
    if (!config.value) return
    const e: Environment = { id: uid('env'), name, vars: {} }
    config.value.environments.push(e)
    persist()
    return e
  }

  function updateEnvironment(id: string, patch: Partial<Pick<Environment, 'name' | 'vars'>>) {
    const e = config.value?.environments.find((x) => x.id === id)
    if (!e) return
    Object.assign(e, patch)
    persist()
  }

  function deleteEnvironment(id: string) {
    if (!config.value) return
    config.value.environments = config.value.environments.filter((e) => e.id !== id)
    // 删除的是当前环境时，回退到剩余第一个；一个不剩则不启用
    if (config.value.activeEnvId === id) {
      config.value.activeEnvId = config.value.environments[0]?.id ?? ''
    }
    persist()
  }

  function setActiveEnvironment(id: string) {
    if (!config.value) return
    config.value.activeEnvId = id
    persist()
  }

  // ---------- 设置 ----------
  function setLanguage(lang: Language) {
    if (!config.value) return
    config.value.settings.language = lang
    applyLanguage(lang)
    persist()
  }

  function setTheme(theme: ThemeMode) {
    if (!config.value) return
    config.value.settings.theme = theme
    applyTheme(theme)
    persist()
  }

  function setDefaultShell(shell: ShellMode) {
    if (!config.value) return
    config.value.settings.defaultShell = shell
    persist()
  }

  function setCloseAction(action: CloseAction) {
    if (!config.value) return
    config.value.settings.closeAction = action
    persist()
  }

  /** 导入配置后从磁盘重新加载 */
  async function reload() {
    await init()
  }

  return {
    config,
    loaded,
    activeGroupId,
    groups,
    scripts,
    init,
    persist,
    addGroup,
    updateGroup,
    deleteGroup,
    moveGroup,
    toggleCollapsed,
    addButton,
    updateButton,
    deleteButton,
    getButton,
    groupOfButton,
    moveButton,
    moveButtonToEnd,
    addScript,
    updateScript,
    deleteScript,
    duplicateScript,
    getScript,
    scriptUsageCount,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setActiveEnvironment,
    setLanguage,
    setTheme,
    setDefaultShell,
    setCloseAction,
    reload
  }
})
