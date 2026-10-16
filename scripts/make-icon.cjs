// 生成 512x512 应用图标源图：蓝色圆角方块 + 白色闪电
// 纯 Node 实现（zlib 为内置模块），无第三方依赖
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const W = 512
const H = 512
const SS = 2 // 2x 超采样抗锯齿

// 闪电多边形（512 坐标系）
const BOLT = [
  [288, 52],
  [164, 276],
  [242, 276],
  [196, 460],
  [352, 214],
  [266, 214]
]

const R = 104 // 圆角半径
const BG = [64, 158, 255] // #409EFF

function inBolt(x, y) {
  let inside = false
  for (let i = 0, j = BOLT.length - 1; i < BOLT.length; j = i++) {
    const [xi, yi] = BOLT[i]
    const [xj, yj] = BOLT[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inRounded(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false
  const cx = Math.min(Math.max(x, R), W - R)
  const cy = Math.min(Math.max(y, R), H - R)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= R * R
}

const data = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let bgCount = 0
    let boltCount = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS
        const py = y + (sy + 0.5) / SS
        if (inRounded(px, py)) bgCount++
        if (bgCount && inBolt(px, py)) boltCount++
      }
    }
    const i = (y * W + x) * 4
    const total = SS * SS
    const alpha = bgCount / total
    if (alpha > 0) {
      if (boltCount > 0) {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
      } else {
        data[i] = BG[0]
        data[i + 1] = BG[1]
        data[i + 2] = BG[2]
      }
      data[i + 3] = Math.round(alpha * 255)
    }
  }
}

// ---- PNG 编码 ----
function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, body) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(body.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])))
  return Buffer.concat([len, typeBuf, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
// 压缩/过滤/隔行均为 0

// 每行前置过滤字节 0
const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0
  data.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = path.join(__dirname, '..', 'icon-source.png')
fs.writeFileSync(out, png)
console.log(`icon-source.png generated (${W}x${H}, ${png.length} bytes)`)
