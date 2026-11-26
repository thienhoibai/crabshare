/* Ảnh bìa của mục video: hoàng hôn trên sông rừng đước, vẽ bằng SVG theo cảnh của bản mẫu.
   Mọi hình được dựng bằng công thức cố định (không ngẫu nhiên) nên lần tải nào cũng giống nhau. */

const INK = '#101a0d'
const HORIZON = 420

/** Độ lõm của dải rừng ở chỗ mặt trời lặn (0 tới 1). */
const dip = (x: number) => Math.exp(-(((x - 850) / 190) ** 2))
const n1 = (v: number) => v.toFixed(1)

/** Viền tán của dải rừng đước ở chân trời. */
function canopyLine() {
  const top = (x: number) => 384 + 13 * dip(x)
  let d = `M-20 406V${n1(top(-20))}`
  for (let i = 0, x = -20; x < 1460; i++) {
    const w = 36 + ((i * 37) % 30)
    const h = (9 + ((i * 53) % 15)) * (1 - 0.6 * dip(x))
    d += `Q${n1(x + w / 2)} ${n1(top(x + w / 2) - h * 2)} ${n1(x + w)} ${n1(top(x + w))}`
    x += w
  }
  return `${d}V406Z`
}

/** Hàng rễ chống nhỏ giữa tán rừng xa và mặt nước: các vòm rộng hẹp khác nhau, đan vào nhau. */
function rootLace() {
  let d = ''
  for (let i = 0, x = -12; x < 1448; i++, x += 8 + ((i * 29) % 13)) {
    const w = 14 + ((i * 41) % 25)
    const h = 13 + ((i * 23) % 9)
    d += `M${x} 424q${n1(w / 2)} ${-2 * h} ${w} 0`
  }
  return d
}

/** Rễ chống của một cây ở gần: các vòm toả từ thân xuống mặt nước. */
function stilts(x: number, water: number, spread: number, count: number, rise: number) {
  let d = ''
  for (let k = -count; k <= count; k++) {
    if (!k) continue
    const from = water - rise - Math.abs(k) * rise * (0.42 + ((Math.abs(k) * 13 + count) % 5) / 14)
    const to = x + k * spread + ((k * k * 7 + count) % 13) - 6
    d += `M${x} ${n1(from)}Q${n1(x + k * spread * 0.94)} ${n1(from + 5)} ${n1(to)} ${water + 4 + (Math.abs(k) % 2) * 7}`
  }
  return d
}

type Blob = [cx: number, cy: number, rx: number, ry: number]

/** Một tán lá: các khối bầu dục có viền gợn như chùm lá. */
function Crown({ blobs }: { blobs: Blob[] }) {
  return (
    <g fill={INK}>
      {blobs.map(([cx, cy, rx, ry], b) => (
        <g key={b}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
          {Array.from({ length: 13 }, (_, k) => {
            const angle = ((k + ((k * 7 + b) % 5) / 6) / 13) * Math.PI * 2 + b
            return <circle key={k} cx={n1(cx + rx * Math.cos(angle))} cy={n1(cy + ry * Math.sin(angle))} r={12 + ((k * 7 + b * 5) % 16)} />
          })}
        </g>
      ))}
    </g>
  )
}

const CANOPY = canopyLine()
const LACE = rootLace()

export default function MangroveScene() {
  return (
    <svg className="ld-scene" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ld-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efe0a8" />
          <stop offset=".34" stopColor="#d6c987" />
          <stop offset=".66" stopColor="#a4b276" />
          <stop offset="1" stopColor="#688558" />
        </linearGradient>
        <linearGradient id="ld-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8aa56c" />
          <stop offset=".3" stopColor="#4d6c47" />
          <stop offset=".72" stopColor="#22351f" />
          <stop offset="1" stopColor="#131f12" />
        </linearGradient>
        <linearGradient id="ld-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2b19" stopOpacity=".62" />
          <stop offset="1" stopColor="#1b2b19" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ld-glow">
          <stop offset="0" stopColor="#fff3cf" stopOpacity=".98" />
          <stop offset=".26" stopColor="#ffd692" stopOpacity=".66" />
          <stop offset="1" stopColor="#f2b76a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* trời, mây, mặt trời, chim */}
      <rect width="1440" height="470" fill="url(#ld-sky)" />
      <g fill="#fbf0cc" opacity=".34">
        <rect x="150" y="112" width="400" height="9" rx="4.5" />
        <rect x="320" y="150" width="270" height="7" rx="3.5" />
        <rect x="900" y="98" width="360" height="8" rx="4" />
        <rect x="1010" y="134" width="220" height="6" rx="3" />
        <rect x="470" y="216" width="300" height="6" rx="3" />
      </g>
      <circle cx="850" cy="318" r="330" fill="url(#ld-glow)" />
      <circle cx="850" cy="316" r="42" fill="#fffbea" />
      <g stroke="#3d4526" strokeWidth="2.6" fill="none" opacity=".6" strokeLinecap="round">
        <path d="M612 204c9-8 16-8 23 0 7-8 14-8 23 0" />
        <path d="M686 168c7-6 12-6 17 0 5-6 10-6 17 0" />
        <path d="M1002 232c8-7 15-7 21 0 6-7 13-7 21 0" />
      </g>

      {/* rừng xa mờ, rồi dải rừng đước có rễ chống ở chân trời */}
      <path d="M0 380c60-16 110 6 170-2s120-24 190-8 130 18 200 4 150-22 230-6 150 18 220 4 140-20 210-6 150 14 220 6v90H0Z" fill="#8ba26b" />
      <path d={CANOPY} fill="#1e301c" />
      <path d={LACE} stroke="#1e301c" strokeWidth="1.8" fill="none" strokeLinecap="round" />

      {/* mặt sông, bóng rừng, vệt nắng */}
      <rect y={HORIZON} width="1440" height={900 - HORIZON} fill="url(#ld-water)" />
      <rect y={HORIZON} width="1440" height="54" fill="url(#ld-shade)" />
      <g fill="#fbe2a6">
        <rect x="742" y="446" width="216" height="8" rx="4" opacity=".4" />
        <rect x="768" y="480" width="164" height="7" rx="3.5" opacity=".34" />
        <rect x="794" y="520" width="112" height="6" rx="3" opacity=".28" />
        <rect x="780" y="568" width="140" height="5" rx="2.5" opacity=".22" />
        <rect x="808" y="622" width="84" height="4.5" rx="2.2" opacity=".17" />
        <rect x="798" y="680" width="104" height="4" rx="2" opacity=".12" />
      </g>

      {/* cụm đước bên phải */}
      <ellipse cx="1340" cy="676" rx="230" ry="24" fill="#0c140a" opacity=".42" />
      <Crown blobs={[[1306, 318, 104, 62], [1392, 286, 92, 58], [1244, 366, 66, 38], [1350, 388, 100, 42], [1292, 250, 76, 44], [1452, 356, 70, 60]]} />
      <g stroke={INK} fill="none" strokeLinecap="round">
        <path d="M1320 632c-10-70 6-150-10-232" strokeWidth="17" />
        <path d="M1314 470c-30-28-52-40-76-62" strokeWidth="8" />
        <path d="M1316 448c34-26 60-38 82-66" strokeWidth="8" />
        <path d={stilts(1320, 664, 36, 4, 40)} strokeWidth="6.5" />
        <path d={stilts(1320, 660, 20, 3, 26)} strokeWidth="4" />
        <path d="M1444 650c-8-60 4-140-6-250" strokeWidth="14" />
        <path d={stilts(1444, 686, 30, 3, 36)} strokeWidth="5.5" />
      </g>

      {/* cụm đước bên trái, lấn ra ngoài khung */}
      <ellipse cx="110" cy="682" rx="220" ry="24" fill="#0c140a" opacity=".42" />
      <Crown blobs={[[96, 300, 150, 82], [214, 362, 92, 46], [-6, 384, 120, 80], [66, 214, 112, 60], [168, 246, 82, 44]]} />
      <g stroke={INK} fill="none" strokeLinecap="round">
        <path d="M116 640c10-74-8-152 6-240" strokeWidth="18" />
        <path d="M122 472c32-26 56-36 80-58" strokeWidth="8" />
        <path d={stilts(116, 670, 38, 4, 40)} strokeWidth="6.5" />
        <path d={stilts(116, 666, 21, 3, 26)} strokeWidth="4" />
      </g>

      {/* bờ gần */}
      <g fill="#0b1309">
        <path d="M0 784c150 10 262 52 312 116H0Z" />
        <path d="M1440 764c-160 12-282 58-336 136h336Z" />
      </g>
    </svg>
  )
}
