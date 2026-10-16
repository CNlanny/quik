/* 轻量 Shell/curl 词法高亮与 curl 命令美化排版。
   零依赖，仅供展示/编辑视图使用；执行始终使用原始脚本，不做任何改写。 */

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  )
}

interface TokenRule {
  re: RegExp
  cls: string
}

/** 顺序敏感：注释 / 占位符 / 字符串优先匹配，避免内部内容被后续规则再次切分 */
const RULES: TokenRule[] = [
  { re: /^#.*/, cls: 'tok-comment' },
  // 占位符先于 URL：https://{{HOST}}/x 中的 {{HOST}} 也要能高亮出来
  { re: /^\{\{\s*[\w.]+\s*\}\}/, cls: 'tok-env' },
  { re: /^"(?:[^"\\\n]|\\.)*"?/, cls: 'tok-string' },
  { re: /^'(?:[^'\\\n]|\\.)*'?/, cls: 'tok-string' },
  { re: /^\$\{[^}\n]*\}/, cls: 'tok-var' },
  { re: /^\$[\w@#?*!-]+/, cls: 'tok-var' },
  { re: /^--?[A-Za-z][\w-]*/, cls: 'tok-flag' },
  { re: /^https?:\/\/[^\s'"<>]+/, cls: 'tok-url' },
  {
    re: /^(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|local|return|exit)\b/,
    cls: 'tok-kw'
  },
  {
    re: /^(?:curl|echo|printf|export|set|read|cd|cat|grep|sed|awk|jq|npm|npx|pnpm|yarn|node|python3?|pip|docker|kubectl|git|ssh|scp|tar|zip|unzip|mkdir|rm|cp|mv|ls|touch|sudo|which|pwsh|powershell)\b/,
    cls: 'tok-cmd'
  },
  { re: /^\d+(?:\.\d+)?\b/, cls: 'tok-num' },
  { re: /^[|&;<>(){}[\]=!+*/%~-]+/, cls: 'tok-op' }
]

/** 字符串内部仍需高亮的变量/占位符（"token {{VAR}}"、'val $HOME' 等） */
const INNER_VARS = /(\{\{\s*[\w.]+\s*\}\}|\$\{[^}\n]*\}|\$[\w@#?*!-]+)/g

function span(cls: string, text: string): string {
  return `<span class="${cls}">${escapeHtml(text)}</span>`
}

/** 生成 token 的 HTML；字符串 / URL token 内部的变量/占位符会再切分出来 */
function emitToken(cls: string, text: string): string {
  if (cls !== 'tok-string' && cls !== 'tok-url') return span(cls, text)
  // split 捕获组：奇数下标是命中的变量/占位符，偶数下标是普通字符串片段
  return text
    .split(INNER_VARS)
    .map((seg, idx) => {
      if (seg === '') return ''
      if (idx % 2 === 1) return seg.startsWith('{{') ? span('tok-env', seg) : span('tok-var', seg)
      return span(cls, seg)
    })
    .join('')
}

/** 将 shell 脚本转为带 <span class="tok-*"> 的 HTML。token 不会跨行，可安全按行拆分渲染。 */
export function highlightShell(src: string): string {
  let out = ''
  let plain = ''
  let i = 0
  const flush = () => {
    if (plain) {
      out += escapeHtml(plain)
      plain = ''
    }
  }
  while (i < src.length) {
    const rest = src.slice(i)
    let matched = false
    for (const { re, cls } of RULES) {
      const m = re.exec(rest)
      if (m && m[0]) {
        flush()
        out += emitToken(cls, m[0])
        i += m[0].length
        matched = true
        break
      }
    }
    if (!matched) {
      plain += src[i]
      i++
    }
  }
  flush()
  return out
}

/* ================= curl 命令美化排版 ================= */

/** 后面跟一个参数值的 curl 选项 */
const CURL_ARG_FLAGS = new Set([
  '-H', '--header',
  '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode',
  '-X', '--request',
  '-u', '--user',
  '-o', '--output',
  '-A', '--user-agent',
  '-e', '--referer',
  '-b', '--cookie',
  '-F', '--form',
  '-T', '--upload-file',
  '-m', '--max-time',
  '--connect-timeout',
  '-x', '--proxy',
  '-w', '--write-out',
  '--url'
])

const CURL_DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode'])

/** 按引号外的顶层 | 切分管道；遇到引号未闭合或 || 直接放弃格式化 */
function splitTopPipes(cmd: string): string[] | null {
  const parts: string[] = []
  let cur = ''
  let quote = ''
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (quote) {
      cur += ch
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === '|' && cmd[i + 1] === '|') {
      return null
    } else if (ch === '|') {
      parts.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (quote) return null
  parts.push(cur.trim())
  return parts
}

/** 按引号外的空白切分 token，token 保留原始引号 */
function shellSplit(line: string): string[] | null {
  const tokens: string[] = []
  let cur = ''
  let quote = ''
  for (const ch of line) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur)
        cur = ''
      }
    } else {
      cur += ch
    }
  }
  if (quote) return null
  if (cur) tokens.push(cur)
  return tokens
}

/** 若值是带引号的 JSON 对象/数组，返回展开缩进后的形式，否则返回 null */
function prettyJsonArg(val: string): string | null {
  const q = val[0]
  if ((q !== "'" && q !== '"') || val[val.length - 1] !== q || val.length < 3) return null
  try {
    const obj = JSON.parse(val.slice(1, -1))
    if (typeof obj !== 'object' || obj === null) return null
    const pretty = JSON.stringify(obj, null, 2).split('\n')
    return q + pretty.map((l, idx) => (idx === 0 ? l : '  ' + l)).join('\n') + q
  } catch {
    return null
  }
}

type CurlItem = { kind: 'token'; text: string } | { kind: 'pair'; flag: string; val: string }

/**
 * 美化单条 curl 命令：
 *   curl -s -X POST 'https://example.com/api' -H '…' -d '{…}' | jq .
 * 变为 URL 前的选项与 URL 保持在首行、URL 之后的带值选项各占一行、JSON 数据展开缩进的形式。
 * token 原文保持不变，仅重排空白。无法可靠解析时返回 null（调用方回退为原文）。
 */
function formatCurlCommand(cmd: string): string | null {
  const parts = splitTopPipes(cmd)
  if (!parts || !parts[0]) return null
  const tokens = shellSplit(parts[0])
  if (!tokens || tokens[0] !== 'curl' || tokens.length < 2) return null
  if (tokens.some((tk) => tk === '&&' || tk === ';')) return null

  // 第一遍：切成 裸 token / 选项+值 序列，并记下第一个裸 token 的位置（视为 URL）
  const items: CurlItem[] = []
  let urlIdx = -1
  let i = 1
  while (i < tokens.length) {
    const tok = tokens[i]
    if (urlIdx === -1 && !tok.startsWith('-')) {
      items.push({ kind: 'token', text: tok })
      urlIdx = items.length - 1
      i++
      continue
    }
    if (CURL_ARG_FLAGS.has(tok) && !(tok.startsWith('--') && tok.includes('='))) {
      const val = tokens[i + 1]
      if (val === undefined || val.startsWith('-')) return null // 值缺失，保守放弃
      items.push({ kind: 'pair', flag: tok, val })
      i += 2
      continue
    }
    items.push({ kind: 'token', text: tok })
    i++
  }

  // 第二遍：URL 之前（含 URL）全部并入首行；URL 之后的带值选项各占一行
  const head: string[] = ['curl']
  const lines: string[] = []
  items.forEach((item, idx) => {
    if (item.kind === 'pair' && idx > urlIdx) {
      const val = CURL_DATA_FLAGS.has(item.flag) ? (prettyJsonArg(item.val) ?? item.val) : item.val
      lines.push('  ' + item.flag + ' ' + val)
    } else if (item.kind === 'pair') {
      head.push(item.flag + ' ' + item.val)
    } else {
      head.push(item.text)
    }
  })

  for (let p = 1; p < parts.length; p++) lines.push('  | ' + parts[p])
  const all = [head.join(' '), ...lines]
  return all.map((l, idx) => (idx < all.length - 1 ? l + ' \\' : l)).join('\n')
}

/** 展示用的脚本美化：合并续行、折叠多余空行、美化 curl 命令 */
export function prettifyScript(src: string): string {
  const raw = src.replace(/\r\n?/g, '\n')
  const logical: string[] = []
  for (const line of raw.split('\n')) {
    const last = logical.length - 1
    if (last >= 0 && logical[last].endsWith('\\')) {
      logical[last] = logical[last].slice(0, -1).trimEnd() + ' ' + line.trim()
    } else {
      logical.push(line)
    }
  }

  const out: string[] = []
  let blankRun = false
  for (const line of logical) {
    const t = line.trimEnd()
    if (!t.trim()) {
      if (out.length && !blankRun) out.push('')
      blankRun = true
      continue
    }
    blankRun = false
    out.push(formatCurlCommand(t) ?? t)
  }
  while (out.length && !out[out.length - 1].trim()) out.pop()
  return out.join('\n')
}
