'use client';

import { useEffect, useRef, useState } from 'react';
import { HeroParticulas } from './hero-particulas';

// La entrada de la edición en WebGL (como la de las Editions de Shopify): ~14.000 puntos con su propio shader. Cada punto sale de un sitio
// distinto, llega en espiral a su letra con su retraso (así la palabra se «escribe» desde el centro hacia fuera), brilla (mezcla aditiva) y se
// queda respirando; el puntero los aparta con una repulsión suave. Todo el movimiento ocurre en la GPU: el hilo principal solo manda tres
// números por fotograma. Sin WebGL (o si falla al compilar) se cae al canvas 2D de siempre; con «reducir movimiento» se pinta ya colocado.

const VERT = `
attribute vec2 aTarget; attribute vec2 aStart; attribute float aSeed; attribute vec3 aColor;
uniform vec2 uRes; uniform float uT; uniform vec2 uPtr; uniform float uDpr; uniform float uReposo;
varying vec3 vColor; varying float vBrillo;
void main() {
  float delay = aSeed * 1.1;
  float p = clamp((uT - delay) / 1.9, 0.0, 1.0);
  if (uReposo > 0.5) p = 1.0;
  float e = 1.0 - pow(1.0 - p, 4.0);
  vec2 c = uRes * 0.5;
  vec2 d0 = aStart - c;
  float ang = (1.0 - e) * (1.4 + aSeed * 2.0);
  vec2 rot = vec2(d0.x * cos(ang) - d0.y * sin(ang), d0.x * sin(ang) + d0.y * cos(ang));
  vec2 pos = mix(c + rot, aTarget, e);
  float resp = uReposo > 0.5 ? 0.0 : 1.0;
  pos += resp * vec2(cos(uT * 0.9 + aSeed * 40.0), sin(uT * 0.8 + aSeed * 31.0)) * 1.3 * e;
  vec2 dp = pos - uPtr; float dd = length(dp);
  float R = 110.0;
  if (dd < R && uPtr.x > -1000.0) { float k = 1.0 - dd / R; pos += normalize(dp + 0.001) * k * k * 38.0; }
  vec2 clip = (pos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = (2.4 + aSeed * 2.4 + (1.0 - e) * 2.0) * uDpr;
  vColor = aColor;
  vBrillo = 0.55 + 0.45 * e + (1.0 - e) * 0.4;
}`;

const FRAG = `
precision mediump float;
varying vec3 vColor; varying float vBrillo;
void main() {
  vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
  if (r > 1.0) discard;
  float a = pow(1.0 - r, 0.8) * vBrillo * 1.25;
  gl_FragColor = vec4(vColor * a, a);
}`;

const PALETA: [number, number, number][] = [[1, 1, 1], [1, 1, 1], [0.62, 0.69, 1], [0.44, 0.95, 1], [0.79, 0.72, 1]];

function compilar(gl: WebGLRenderingContext, tipo: number, fuente: string) {
  const s = gl.createShader(tipo);
  if (!s) return null;
  gl.shaderSource(s, fuente); gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

export function HeroWebGL({ palabra, className }: { palabra: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [respaldo, setRespaldo] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, failIfMajorPerformanceCaveat: true });
    if (!gl) { setRespaldo(true); return; } // sin WebGL: respaldo 2D
    const vs = compilar(gl, gl.VERTEX_SHADER, VERT), fs = compilar(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) { setRespaldo(true); return; }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setRespaldo(true); return; }
    gl.useProgram(prog);

    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loc = (n: string) => gl.getAttribLocation(prog, n);
    const uni = (n: string) => gl.getUniformLocation(prog, n);
    const buf = gl.createBuffer();
    let n = 0, w = 0, h = 0, dpr = 1, raf = 0, visible = true, vivo = true;
    const t0 = performance.now();
    const ptr = { x: -9999, y: -9999, sx: -9999, sy: -9999 };

    const construir = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);

      const off = document.createElement('canvas');
      const ow = Math.round(w), oh = Math.round(h);
      off.width = ow; off.height = oh;
      const o = off.getContext('2d', { willReadFrequently: true });
      if (!o) return;
      let tam = Math.min(ow * 0.2, oh * 0.5);
      o.font = `500 ${tam}px Inter, system-ui, sans-serif`;
      while (o.measureText(palabra).width > ow * 0.86 && tam > 24) { tam -= 4; o.font = `500 ${tam}px Inter, system-ui, sans-serif`; }
      o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
      o.fillText(palabra, ow / 2, oh * 0.5);
      const datos = o.getImageData(0, 0, ow, oh).data;
      // Tope de puntos: sin él, un lienzo enorme o una pantalla de mucha densidad dibujan decenas de miles.
      let paso = Math.max(2, Math.round(tam / 78));
      while ((ow * oh) / (paso * paso) > 90000 && paso < 12) paso += 1;
      const filas: number[] = [];
      const rad = Math.hypot(ow, oh) * 0.5;
      for (let y = 0; y < oh; y += paso) {
        for (let x = 0; x < ow; x += paso) {
          if (datos[(y * ow + x) * 4 + 3] < 128) continue;
          const a = Math.random() * Math.PI * 2, d = rad * (0.5 + Math.random() * 0.9);
          // El retraso crece con la distancia al centro de la palabra: la palabra se escribe desde dentro hacia fuera.
          const seed = Math.min(1, Math.abs(x - ow / 2) / (ow * 0.5) * 0.7 + Math.random() * 0.3);
          const c = PALETA[Math.floor(Math.random() * PALETA.length)];
          filas.push(x, y, ow / 2 + Math.cos(a) * d, oh / 2 + Math.sin(a) * d, seed, c[0], c[1], c[2]);
        }
      }
      n = filas.length / 8;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(filas), gl.STATIC_DRAW);
      const F = 4 * 8;
      for (const [nombre, tam2, off2] of [['aTarget', 2, 0], ['aStart', 2, 8], ['aSeed', 1, 16], ['aColor', 3, 20]] as const) {
        const l = loc(nombre); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, tam2, gl.FLOAT, false, F, off2);
      }
      gl.uniform2f(uni('uRes'), w, h); gl.uniform1f(uni('uDpr'), dpr); gl.uniform1f(uni('uReposo'), quieto ? 1 : 0);
    };

    const pintar = (ms: number) => {
      ptr.sx += (ptr.x - ptr.sx) * 0.18; ptr.sy += (ptr.y - ptr.sy) * 0.18;
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1f(uni('uT'), (ms - t0) / 1000);
      gl.uniform2f(uni('uPtr'), ptr.sx, ptr.sy);
      gl.drawArrays(gl.POINTS, 0, n);
    };
    const bucle = (ms: number) => { if (!visible || !vivo) { raf = 0; return; } pintar(ms); raf = requestAnimationFrame(bucle); };
    const arrancar = () => { construir(); pintar(performance.now()); if (!quieto && !raf && visible) raf = requestAnimationFrame(bucle); };

    void document.fonts.ready.then(() => { if (vivo) arrancar(); });
    const mover = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; if (ptr.sx < -1000) { ptr.sx = ptr.x; ptr.sy = ptr.y; } };
    const salir = () => { ptr.x = ptr.y = ptr.sx = ptr.sy = -9999; };
    canvas.addEventListener('pointermove', mover); canvas.addEventListener('pointerleave', salir);
    let anchoPrev = 0, altoPrev = 0;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (!vivo || (Math.abs(width - anchoPrev) < 1 && Math.abs(height - altoPrev) < 1)) return; // sin esto, fijar el tamaño del lienzo se mide a sí mismo en bucle
      anchoPrev = width; altoPrev = height; arrancar();
    }); ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !quieto) raf = requestAnimationFrame(bucle); }); io.observe(canvas);
    return () => {
      vivo = false; if (raf) cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      canvas.removeEventListener('pointermove', mover); canvas.removeEventListener('pointerleave', salir);
      // ⚠️ Sin `WEBGL_lose_context`: React monta dos veces en desarrollo y el lienzo se reutiliza; un contexto «perdido» devolvía el mismo
      // objeto muerto al segundo montaje y la entrada caía siempre al respaldo 2D.
    };
  }, [palabra]);

  if (respaldo) return <HeroParticulas palabra={palabra} className={className} />;
  return <canvas ref={ref} className={className} role="img" aria-label={palabra} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' }} />;
}
