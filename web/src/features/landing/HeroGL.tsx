/* Nền hero bằng WebGL thuần (không thư viện):
   - ảnh gợn như mặt nước quanh con trỏ, phóng nhẹ như thấu kính
   - tách màu RGB theo tốc độ chuột
   - nhấp chuột tạo vòng sóng lan ra
   Không có WebGL hoặc ảnh lỗi thì rơi về <img>. */
import { useEffect, useRef, useState } from 'react'

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec4 uRect;
uniform vec2 uMouse;
uniform float uVel;
uniform float uTime;
uniform float uIntro;
uniform vec3 uWave;
uniform float uHover;
uniform vec3 uBg;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec3 sampleImg(vec2 uv) {
  vec2 px = uv * uRes;
  vec2 iuv = (px - uRect.xy) / uRect.zw;
  vec3 c = texture2D(uTex, clamp(iuv, 0.0, 1.0)).rgb;
  float fx = smoothstep(0.0, 0.3, iuv.x) * smoothstep(1.0, 0.94, iuv.x);
  float fy = smoothstep(0.0, 0.12, iuv.y) * smoothstep(1.0, 0.9, iuv.y);
  return mix(uBg, c, fx * fy);
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  vec2 m = vec2(uMouse.x * aspect, uMouse.y);
  vec2 dm = p - m;
  float d = length(dm);
  vec2 dir = dm / max(d, 0.0001);

  float radius = 0.24 + uVel * 0.22;
  float fall = smoothstep(radius, 0.0, d) * uHover;

  float t = uTime;
  float n1 = snoise(vUv * 3.0 + vec2(t * 0.08, -t * 0.06));
  float n2 = snoise(vUv * 3.0 + vec2(-t * 0.07, t * 0.05) + 17.0);

  vec2 disp = vec2(0.0);
  disp -= dm * fall * 0.16;
  disp += vec2(n1, n2) * fall * (0.006 + uVel * 0.05);
  disp += vec2(n1, n2) * 0.0018;

  float age = uWave.z;
  if (age < 2.4) {
    vec2 w = vec2(uWave.x * aspect, uWave.y);
    vec2 dw = p - w;
    float wd = length(dw);
    float r = age * 0.75;
    float band = exp(-pow((wd - r) * 12.0, 2.0));
    float amp = 0.03 * (1.0 - age / 2.4);
    disp += (dw / max(wd, 0.0001)) * band * amp * sin((wd - r) * 55.0);
  }

  float zoom = mix(1.12, 1.0, uIntro);
  vec2 uv = (vUv - 0.5) / zoom + 0.5;
  uv += (uMouse - 0.5) * vec2(-0.012, -0.008) * uHover;
  uv += disp / vec2(aspect, 1.0);

  float ca = fall * (0.002 + uVel * 0.012) + 0.0006;
  vec2 cad = dir / vec2(aspect, 1.0);
  vec3 col;
  col.r = sampleImg(uv + cad * ca).r;
  col.g = sampleImg(uv).g;
  col.b = sampleImg(uv - cad * ca).b;

  col += vec3(1.0, 0.42, 0.16) * fall * fall * 0.07;
  float vig = smoothstep(1.3, 0.3, length((vUv - vec2(0.62, 0.5)) * vec2(aspect * 0.7, 1.0)));
  col = mix(uBg, col, mix(0.35, 1.0, vig));
  col = mix(uBg, col, uIntro);
  gl_FragColor = vec4(col, 1.0);
}`

type Props = { src: string; onReady?: () => void }

export default function HeroGL({ src, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readyRef = useRef(onReady)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    readyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    if (!canvas || !host) return
    let signalled = false
    const ready = () => {
      if (signalled) return
      signalled = true
      readyRef.current?.()
    }
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' })
    if (!gl) {
      setFallback(true)
      ready()
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[HeroGL]', gl.getShaderInfoLog(s))
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[HeroGL]', gl.getProgramInfoLog(prog))
      setFallback(true)
      ready()
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const loc = (n: string) => gl.getUniformLocation(prog, n)
    const U = {
      tex: loc('uTex'), res: loc('uRes'), rect: loc('uRect'), mouse: loc('uMouse'), vel: loc('uVel'),
      time: loc('uTime'), intro: loc('uIntro'), wave: loc('uWave'), hover: loc('uHover'), bg: loc('uBg'),
    }
    gl.uniform1i(U.tex, 0)
    gl.uniform3f(U.bg, 7 / 255, 9 / 255, 8 / 255)

    const tex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([7, 9, 8, 255]))

    let w = 1, h = 1, imgW = 0, imgH = 0, introStart = 0
    let rect: [number, number, number, number] = [0, 0, 1, 1]
    const layout = () => {
      if (!imgW) return
      const ia = imgW / imgH
      let rw: number, rh: number
      if (w / h > 1.1) {
        rh = h * 1.04
        rw = rh * ia
        if (rw < w * 0.62) { rw = w * 0.62; rh = rw / ia }
        rect = [w - rw * 0.97, (h - rh) / 2, rw, rh]
      } else {
        const s = Math.max(w / imgW, h / imgH) * 1.02
        rw = imgW * s
        rh = imgH * s
        rect = [(w - rw) / 2, (h - rh) / 2, rw, rh]
      }
    }
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      const r = host.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width * dpr))
      h = Math.max(1, Math.round(r.height * dpr))
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      layout()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        imgW = img.naturalWidth
        imgH = img.naturalHeight
        layout()
        introStart = performance.now()
      } catch {
        setFallback(true)
      }
      ready()
    }
    img.onerror = () => {
      setFallback(true)
      ready()
    }
    img.src = src

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, vel: 0, hover: 0, thover: 0 }
    let wave = { x: 0.5, y: 0.5, t0: -1e9 }
    const toUv = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height }
    }
    const onMove = (e: PointerEvent) => {
      const q = toUv(e)
      mouse.vel = Math.min(1, mouse.vel + Math.hypot(q.x - mouse.tx, q.y - mouse.ty) * 5)
      mouse.tx = q.x
      mouse.ty = q.y
      mouse.thover = 1
    }
    const onLeave = () => { mouse.thover = 0 }
    const onDown = (e: PointerEvent) => {
      const q = toUv(e)
      wave = { x: q.x, y: q.y, t0: performance.now() }
      mouse.tx = q.x
      mouse.ty = q.y
      mouse.thover = 1
    }
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    host.addEventListener('pointerdown', onDown)

    const t0 = performance.now()
    let raf = 0
    let visible = true
    const frame = (now: number) => {
      raf = 0
      mouse.x += (mouse.tx - mouse.x) * 0.08
      mouse.y += (mouse.ty - mouse.y) * 0.08
      mouse.vel *= 0.94
      mouse.hover += (mouse.thover - mouse.hover) * 0.05
      const k = imgW ? Math.min(1, (now - introStart) / 1800) : 0
      const intro = 1 - Math.pow(1 - k, 3)
      gl.uniform2f(U.res, w, h)
      gl.uniform4f(U.rect, rect[0], rect[1], rect[2], rect[3])
      gl.uniform2f(U.mouse, mouse.x, mouse.y)
      gl.uniform1f(U.vel, reduced ? 0 : mouse.vel)
      gl.uniform1f(U.time, reduced ? 0 : (now - t0) / 1000)
      gl.uniform1f(U.intro, reduced && imgW ? 1 : intro)
      gl.uniform3f(U.wave, wave.x, wave.y, reduced ? 99 : (now - wave.t0) / 1000)
      gl.uniform1f(U.hover, reduced ? 0 : mouse.hover)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const start = () => { if (!raf) raf = requestAnimationFrame(frame) }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) start()
    })
    io.observe(host)
    const onVis = () => { if (!document.hidden) start() }
    document.addEventListener('visibilitychange', onVis)
    start()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('pointerdown', onDown)
      img.onload = null
      img.onerror = null
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [src])

  if (fallback) return <img className="cse-hero__fallback" src={src} alt="" />
  return <canvas ref={canvasRef} className="cse-hero__gl" aria-hidden="true" />
}
