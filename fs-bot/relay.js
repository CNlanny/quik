/**
 * fs-bot —— 个人飞书 → 公司飞书 消息转发机器人
 *
 * 原理：
 *   1. 个人飞书侧创建一个自建应用（含机器人能力），事件订阅选择「长连接」
 *   2. 本脚本通过 WebSocket 长连接接收个人飞书的消息事件，无需公网服务器
 *   3. 收到消息后，推送到公司飞书群自定义机器人的 Webhook
 *
 * 使用：复制 config.example.json 为 config.json 并填写，然后 npm start
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lark = require('@larksuiteoapi/node-sdk');

const CONFIG_PATH = path.join(__dirname, 'config.json');

let config = null; // main() 里加载

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[启动失败] 未找到 ${CONFIG_PATH}`);
    console.error('请先复制 config.example.json 为 config.json，并按 README 填写。');
    process.exit(1);
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error(`[启动失败] config.json 不是合法的 JSON：${e.message}`);
    process.exit(1);
  }
  for (const key of ['appId', 'appSecret', 'webhookUrl']) {
    if (!cfg[key]) {
      console.error(`[启动失败] config.json 缺少必填字段：${key}`);
      process.exit(1);
    }
  }
  return cfg;
}

/* ---------------- 飞书 API 客户端（用于把 chat_id / open_id 翻译成可读名称） ---------------- */

let client = null;
const nameCache = new Map();

function initApiClient() {
  client = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });
}

async function getChatName(chatId) {
  if (!chatId) return '未知会话';
  if (nameCache.has(chatId)) return nameCache.get(chatId);
  let name = chatId;
  try {
    const res = await client.im.chat.get({ path: { chat_id: chatId } });
    if (res && res.data && res.data.name) name = res.data.name;
  } catch (e) {
    // 未开通「获取群组信息」权限时，退回显示 chat_id
  }
  nameCache.set(chatId, name);
  return name;
}

async function getUserName(openId) {
  if (!openId) return '未知用户';
  if (nameCache.has(openId)) return nameCache.get(openId);
  let name = openId;
  try {
    const res = await client.contact.user.get({
      path: { user_id: openId },
      params: { user_id_type: 'open_id' },
    });
    if (res && res.data && res.data.user && res.data.user.name) name = res.data.user.name;
  } catch (e) {
    // 未开通「获取用户基本信息」权限时，退回显示 open_id
  }
  nameCache.set(openId, name);
  return name;
}

/* ---------------- 消息体解析 ---------------- */

function extractPost(body) {
  // 富文本结构：{ title, content: { zh_cn: [[{tag,text},{tag,a,href}], ...] } }
  const title = body.title ? `${body.title}\n` : '';
  const lines = [];
  for (const blocks of Object.values(body.content || {})) {
    for (const line of blocks) {
      const text = (line || [])
        .map((seg) => seg.text || (seg.a && seg.a.href) || '')
        .join('');
      lines.push(text);
    }
  }
  return title + lines.join('\n');
}

function extractText(message) {
  let body = {};
  try {
    body = JSON.parse(message.content || '{}');
  } catch (e) {
    // content 不是 JSON 时按占位符处理
  }
  switch (message.message_type) {
    case 'text':
      return body.text || '';
    case 'post':
      return extractPost(body);
    case 'image':
      return '[图片]';
    case 'file':
      return '[文件]';
    case 'audio':
      return '[语音]';
    case 'media':
      return '[视频]';
    case 'sticker':
      return '[表情]';
    case 'share_chat':
      return '[群名片]';
    case 'share_user':
      return '[个人名片]';
    case 'merge_forward':
      return '[合并转发的聊天记录]';
    default:
      return `[${message.message_type} 消息]`;
  }
}

/* ---------------- 去重（平台可能重推同一条事件） ---------------- */

const seen = new Map(); // message_id -> 收到时间

function seenBefore(id) {
  if (!id) return false;
  if (seen.has(id)) return true;
  const now = Date.now();
  seen.set(id, now);
  if (seen.size > 2000) {
    for (const [k, ts] of seen) {
      if (now - ts > 10 * 60 * 1000) seen.delete(k);
    }
  }
  return false;
}

/* ---------------- 群过滤 ---------------- */

function shouldForward(chatType, chatId, chatName) {
  if (chatType === 'p2p') return config.forwardP2P !== false;
  const include = config.includeGroups || []; // 空数组 = 机器人所在的群全部转发
  const exclude = config.excludeGroups || [];
  if (include.length && !include.includes(chatId) && !include.includes(chatName)) return false;
  if (exclude.includes(chatId) || exclude.includes(chatName)) return false;
  return true;
}

/* ---------------- 公司飞书 Webhook（群自定义机器人） ---------------- */

function genSign(timestamp, secret) {
  // 飞书自定义机器人签名算法：base64(hmac_sha256(key = timestamp + "\n" + secret, data = ""))
  return crypto.createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
}

async function sendToCompany(text) {
  const payload = { msg_type: 'text', content: { text } };
  if (config.webhookSecret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    payload.timestamp = timestamp;
    payload.sign = genSign(timestamp, config.webhookSecret);
  }
  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.code !== undefined && data.code !== 0)) {
    throw new Error(`公司 Webhook 返回异常：HTTP ${res.status} ${JSON.stringify(data)}`);
  }
}

/* ---------------- 主流程 ---------------- */

function log(msg) {
  console.log(`[${new Date().toLocaleString('zh-CN')}] ${msg}`);
}

async function forward(data) {
  const message = data.message || {};
  const sender = data.sender || {};
  if (sender.sender_type === 'app') return; // 不转发机器人自己的消息
  if (seenBefore(message.message_id)) return;

  const chatType = message.chat_type; // 'p2p'（与机器人的单聊）或 'group'
  const chatName =
    chatType === 'p2p'
      ? config.p2pLabel || '私聊（手动转发）'
      : await getChatName(message.chat_id);
  if (!shouldForward(chatType, message.chat_id, chatName)) return;

  const senderName = await getUserName(sender.sender_id && sender.sender_id.open_id);
  const text = extractText(message);
  const prefix = config.prefix !== undefined ? config.prefix : '📮 个人飞书';

  await sendToCompany(`${prefix}｜${chatName}｜${senderName}\n${text}`);
  log(`已转发 [${chatName}] ${senderName}: ${text.replace(/\n/g, ' ').slice(0, 60)}`);
}

// 串行队列：保持消息顺序，单个失败不影响后续
let queue = Promise.resolve();
function enqueue(fn) {
  queue = queue.then(fn).catch((e) => log(`[错误] ${e && e.message ? e.message : e}`));
}

async function main() {
  config = loadConfig();

  // --test-webhook：只验证公司飞书 Webhook 是否配置正确
  if (process.argv.includes('--test-webhook')) {
    await sendToCompany('✅ fs-bot 测试消息：公司飞书 Webhook 配置正确');
    log('测试消息已发送，请到公司飞书群里确认。');
    return;
  }

  initApiClient();

  const wsClient = new lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    loggerLevel: lark.LoggerLevel.info,
  });

  await wsClient.start({
    eventDispatcher: new lark.EventDispatcher({}).register({
      'im.message.receive_v1': (data) => {
        // 事件处理器必须 3 秒内返回，否则平台会重推；实际转发进串行队列异步执行
        enqueue(() => forward(data));
      },
    }),
  });

  log('已启动，正在通过长连接监听个人飞书消息（Ctrl+C 退出）…');
  log('提醒：脚本在线才会转发，离线期间的新消息不会补发。');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`[启动失败] ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}

module.exports = { extractText, extractPost, genSign };
