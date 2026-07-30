'use client';

// Pantalla de bienvenida a pantalla completa, mostrada UNA sola vez justo
// después de crear el estudio: intro con efecto máquina de escribir → wizard
// rápido de 6 preguntas (un toque por respuesta) → resumen. Diseñada en
// Claude Design (Bienvenida.dc.html) y portada aquí con los tokens reales del
// producto (oliva/arena) en vez de los hex de la maqueta.
//
// Motor de tecleo en un único bucle requestAnimationFrame: el estado de la
// animación vive en `engineRef` (un ref mutable), pero SOLO se lee/escribe
// dentro de efectos y manejadores de eventos, nunca durante el render (regla
// react-hooks/refs) — cada frame vuelca una instantánea calculada a
// `vals` (useState), y el JSX solo lee de `vals`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Volume2, VolumeX } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { authHeader } from '@/lib/api-client';
import type { Studio } from '@/lib/types';
import { useStudio } from '@/lib/studio-context';

const FRASES = [
  'Tu estudio ya está en marcha.',
  'Calendario, bonos y cobros quedan listos desde el primer día.',
  'Ahora solo falta hacerlo tuyo.',
];

const MS_POR_CARACTER = 25;
const PAUSA_MS = 3200;
const SALIDA_MS = 520;

type Respuestas = {
  centros?: string;
  software?: string;
  alumnos?: string;
  importar?: string;
  foco?: string[];
  ayuda?: string;
};

type Paso = {
  id: keyof Respuestas;
  etiqueta: string;
  titulo: string;
  nota: string | ((ans: Respuestas) => string);
  opciones: string[];
  multi?: number;
};

const PASOS: Paso[] = [
  {
    id: 'centros', etiqueta: 'Tu estudio', titulo: '¿Cuántos centros tienes?',
    nota: 'Si gestionas más de uno, activamos la vista multicentro.',
    opciones: ['1 estudio', '2-3 estudios', '4-10 estudios', 'Más de 10'],
  },
  {
    id: 'software', etiqueta: 'Tu estudio', titulo: '¿Desde qué software vienes?',
    nota: 'Si vienes de otra plataforma, migramos tus datos gratis.',
    opciones: ['Ninguno', 'Bsport', 'Momence', 'Eversports', 'Mindbody', 'Un Respiro', 'Excel', 'Otro'],
  },
  {
    id: 'alumnos', etiqueta: 'Tu estudio', titulo: '¿Cuántos alumnos activos tienes?',
    nota: 'Ajustamos los límites y los informes a tu tamaño real.',
    opciones: ['Menos de 50', '50-150', '150-300', '300-600', 'Más de 600'],
  },
  {
    id: 'importar', etiqueta: 'Migración', titulo: '¿Quieres que importemos tus datos?',
    nota: (a) => a.software && a.software !== 'Ninguno'
      ? `Alumnos, bonos y reservas de ${a.software}. Lo hacemos nosotros, sin coste.`
      : 'Si tienes listas en Excel o en papel, las pasamos nosotros, sin coste.',
    opciones: ['Sí, importadlos', 'No, empiezo de cero'],
  },
  {
    id: 'foco', etiqueta: 'Prioridad', titulo: '¿Qué es lo que más te preocupa ahora mismo?',
    nota: 'Elige hasta dos. Con eso ordenamos tu panel de inicio.',
    opciones: ['Conseguir más alumnos', 'Gestionar reservas', 'Cobros', 'Sustituciones de profesoras', 'Automatizar tareas', 'Marketing', 'Otro'],
    multi: 2,
  },
  {
    id: 'ayuda', etiqueta: 'Puesta en marcha', titulo: '¿Cómo prefieres que te ayudemos?',
    nota: 'Puedes cambiar de idea cuando quieras.',
    opciones: ['Lo configuro yo', 'Quiero una videollamada', 'Configuradlo por mí'],
  },
];

const ease = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

type Fase = 'intro' | 'wizard' | 'resumen';

type Engine = {
  reduced: boolean;
  fase: Fase;
  ans: Respuestas;
  paso: number;
  idx: number;
  typed: number;
  t0: number;
  holdAt: number | null;
  out: { texto: string; t0: number } | null;
  lastCharAt: number;
  charCount: number;
  buttonAt: number | null;
  qAt: number;
  energy: number;
  prev: number;
};

function nuevoEngine(reduced: boolean, now: number): Engine {
  return {
    reduced, fase: 'intro', ans: {}, paso: 0,
    idx: 0, typed: 0, t0: now, holdAt: null, out: null,
    lastCharAt: -1e6, charCount: 0, buttonAt: null, qAt: now,
    energy: 0, prev: now,
  };
}

function tickIntro(e: Engine, now: number, tock: (pitch: number, vol: number) => void) {
  const texto = FRASES[e.idx] || '';
  const len = texto.length;
  const target = e.reduced ? len : Math.min(len, Math.floor((now - e.t0) / MS_POR_CARACTER));
  if (target > e.typed) {
    const salto = target - e.typed;
    const ch = texto.charAt(target - 1);
    e.typed = target;
    e.lastCharAt = now;
    if (salto <= 2 && !e.reduced) {
      e.charCount += salto;
      e.energy = Math.min(1, e.energy + 0.55);
      tock(ch === ' ' ? 0.9 : 1, 1);
      if (e.charCount % 3 === 0 && navigator.vibrate) { try { navigator.vibrate(3); } catch { /* no-op */ } }
    }
  }
  if (e.typed >= len && e.holdAt == null) {
    e.holdAt = now;
    if (e.idx === FRASES.length - 1 && e.buttonAt == null) e.buttonAt = now + 240;
  }
  if (e.out && now - e.out.t0 >= SALIDA_MS) e.out = null;
  if (e.holdAt != null && now - e.holdAt >= PAUSA_MS && e.idx < FRASES.length - 1) {
    e.out = { texto, t0: now };
    e.idx += 1;
    e.typed = 0;
    e.t0 = now;
    e.holdAt = null;
    e.charCount = 0;
  }
}

// Ráfaga de ruido filtrado (bandpass) + golpe de onda triangular: dos capas
// por pulsación, como especifica el brief del diseño. Variación aleatoria
// ligera de tono/volumen para que no suene a metrónomo.
function tocarTecla(ctx: AudioContext, master: GainNode, pitch: number, vol: number) {
  const R = (a: number, b: number) => a + Math.random() * (b - a);
  const t = ctx.currentTime + 0.001;
  const p = pitch * R(0.985, 1.015);
  const v = vol * R(0.94, 1.06);

  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(1150 * p, t);
  o.frequency.exponentialRampToValueAtTime(760 * p, t + 0.024);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4200;
  lp.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.11 * v, t + 0.0012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
  o.connect(lp); lp.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.05);

  const n = Math.max(1, Math.ceil(ctx.sampleRate * 0.014));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2250 * p;
  bp.Q.value = 1.4;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.001);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
  s.connect(bp); bp.connect(g2); g2.connect(master);
  s.start(t); s.stop(t + 0.03);
}

// ── Cálculo de todos los valores visuales para el frame actual ─────────────
function computeVals(e: Engine, now: number, nombreEstudio: string) {
  const waveTransform = `translate3d(${(Math.sin(now / 9000) * 7).toFixed(2)}px, ${(Math.cos(now / 11000) * 5).toFixed(2)}px, 0)`;
  const bloomOpacity = (0.05 + 0.12 * e.energy).toFixed(4);
  const reglaOpacity = (0.55 + 0.45 * e.energy).toFixed(3);
  const cursorGlow = `0 0 ${(5 + 12 * e.energy).toFixed(1)}px rgba(52,56,37,${(0.1 + 0.22 * e.energy).toFixed(3)})`;

  // ── Intro ──────────────────────────────────────────────────────────────
  const texto = FRASES[e.idx] || '';
  const n = e.typed;
  const typed = texto.slice(0, n);
  const completa = n >= texto.length;
  const edad = now - e.lastCharAt;
  const ep = ease(edad / 110);
  const flash = !completa && edad < 60;

  const tail: { c: string; o: string }[] = [];
  for (let k = 5; k >= 1; k--) {
    const j = n - 1 - k;
    if (j < 0) { tail.push({ c: '', o: '1' }); continue; }
    if (e.reduced) { tail.push({ c: texto.charAt(j), o: '1' }); continue; }
    const age = now - (e.t0 + (j + 1) * MS_POR_CARACTER);
    tail.push({ c: texto.charAt(j), o: (0.42 + 0.58 * ease(age / 130)).toFixed(3) });
  }
  const out = e.out;
  const outP = out ? ease((now - out.t0) / SALIDA_MS) : 0;

  const head = typed.slice(0, Math.max(0, n - 6));

  // ── Wizard ─────────────────────────────────────────────────────────────
  const qp = ease((now - e.qAt) / 340);
  const paso = e.fase === 'wizard' ? PASOS[Math.min(e.paso, PASOS.length - 1)] : null;
  const multi = paso?.multi;
  const sel = paso ? e.ans[paso.id] : undefined;
  const listo = multi ? ((sel as string[] | undefined)?.length ?? 0) > 0 : !!sel;

  const opciones = (paso?.opciones ?? []).map((label, i) => {
    const activo = multi ? ((sel as string[] | undefined) ?? []).includes(label) : sel === label;
    return {
      label, num: String(i + 1),
      bg: activo ? '#343825' : '#FFFFFF',
      border: activo ? '#343825' : '#E7E7E0',
      color: activo ? '#D9C29E' : '#1A1A1A',
      shadow: activo ? '0 1px 2px rgba(26,26,26,0.10)' : '0 1px 1px rgba(26,26,26,0.03)',
      numColor: activo ? 'rgba(217,194,158,0.55)' : 'rgba(26,26,26,0.3)',
    };
  });

  const tramos = PASOS.length + 1;
  const hechas = e.fase === 'intro'
    ? (e.buttonAt != null ? 1 : (n / Math.max(1, texto.length)) * 0.9)
    : e.fase === 'resumen'
      ? tramos
      : 1 + e.paso + (listo ? 1 : 0);

  // ── Resumen ────────────────────────────────────────────────────────────
  const migra = e.ans.software && e.ans.software !== 'Ninguno';
  const resumen = ([
    ['Centros', e.ans.centros],
    ['Alumnos activos', e.ans.alumnos],
    ['Vienes de', e.ans.software],
    ['Prioridad', (e.ans.foco ?? []).join(' · ')],
    ['Puesta en marcha', e.ans.ayuda],
    ['Importamos tus datos', e.ans.importar],
  ] as const)
    .filter((f) => !!f[1])
    .map(([label, valor]) => ({
      label, valor: valor as string,
      color: label === 'Vienes de' && migra ? '#55622C' : '#1A1A1A',
    }));

  const bt = e.buttonAt != null ? ease((now - e.buttonAt) / 480) : 0;
  const rp = e.buttonAt != null ? Math.min(1, Math.max(0, (now - e.buttonAt) / 760)) : 0;
  const enIntro = e.fase === 'intro';

  return {
    fase: e.fase,
    ans: e.ans,
    waveTransform, bloomOpacity, reglaOpacity, cursorGlow,
    head,
    tail,
    lastChar: typed.slice(-1),
    ghost: completa || e.reduced ? '' : texto.slice(n, n + 2),
    lastColor: flash ? '#55622C' : '#1A1A1A',
    lastFilter: !completa && edad < 45 ? 'blur(0.4px)' : 'none',
    lastGlow: flash ? '0 0 14px rgba(85,98,44,0.3)' : 'none',
    cursorTransform: `translateX(${(completa ? 0 : 1.6 * (1 - ep)).toFixed(2)}px) scaleY(${(completa ? 1 : 0.94 + 0.06 * ep).toFixed(3)})`,
    cursorOpacity: completa && e.holdAt != null ? (Math.floor((now - e.holdAt) / 530) % 2 ? 0 : 1) : 1,
    outText: out?.texto ?? '',
    outOpacity: (out ? 1 - outP : 0).toFixed(3),
    outTransform: `translateY(${(out && !e.reduced ? -16 * outP : 0).toFixed(2)}px)`,
    paso,
    qPaso: paso ? `${String(e.paso + 1).padStart(2, '0')} — ${String(PASOS.length).padStart(2, '0')}` : '',
    qNota: paso ? (typeof paso.nota === 'function' ? paso.nota(e.ans) : paso.nota) : '',
    qBoton: multi ? (((sel as string[] | undefined)?.length ?? 0) > 1 ? 'Continuar con 2' : 'Continuar') : 'Continuar',
    opciones,
    qOpacity: qp.toFixed(3),
    qTransform: `translateY(${(e.reduced ? 0 : 10 * (1 - qp)).toFixed(2)}px)`,
    accionesOpacity: listo ? '1' : '0.32',
    accionesEvents: (listo ? 'auto' : 'none') as 'auto' | 'none',
    progresoAncho: `${Math.min(100, (hechas / tramos) * 100).toFixed(2)}%`,
    resumen,
    resumenTitulo: migra && e.ans.importar === 'Sí, importadlos'
      ? `Migramos tus datos de ${e.ans.software} y te avisamos al terminar.`
      : `${nombreEstudio}, tu panel ya está ordenado a tu medida.`,
    panelPie: enIntro ? 'Tu estudio, en marcha' : e.fase === 'wizard' ? `Paso ${e.paso + 1} de ${PASOS.length}` : 'Todo listo',
    // "Elige una opción" en vez de "Pulsa 1-N": el atajo de teclado (número)
    // sigue funcionando igual, pero la pista no puede asumir que quien
    // responde tiene teclado — la mayoría toca con el dedo o hace clic.
    pista: enIntro ? 'Toca para acelerar' : e.fase === 'wizard' ? 'Elige una opción' : '',
    pistaOpacity: e.fase === 'resumen' || (enIntro && e.buttonAt != null) ? '0' : '1',
    textoBoton: e.fase === 'resumen' ? 'Entrar al panel' : 'Empezar',
    btnOpacity: (enIntro || e.fase === 'resumen' ? bt : 0).toFixed(3),
    btnTransform: `translateY(${(8 * (1 - bt)).toFixed(2)}px)`,
    btnEvents: ((enIntro || e.fase === 'resumen') && bt > 0.9 ? 'auto' : 'none') as 'auto' | 'none',
    ringOpacity: (rp > 0 && rp < 1 ? 0.4 * (1 - rp) : 0).toFixed(3),
    ringTransform: `scale(${(1 + 0.28 * rp).toFixed(3)})`,
  };
}

type Vals = ReturnType<typeof computeVals>;

export function PantallaBienvenida({ studio }: { studio: Studio }) {
  const { updateStudio } = useStudio();
  const router = useRouter();
  const nombreEstudio = studio.nombre || 'Tu estudio';
  const [vals, setVals] = useState<Vals | null>(null);
  const [sonidoActivo, setSonidoActivo] = useState(false);
  const sonidoActivoRef = useRef(sonidoActivo);

  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number | null>(null);
  const avanceTRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode } | null>(null);
  const guardadoRef = useRef(false);

  useEffect(() => {
    sonidoActivoRef.current = sonidoActivo;
  }, [sonidoActivo]);

  const audio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    audioRef.current = { ctx, master };
    return audioRef.current;
  }, []);

  const tock = useCallback((pitch: number, vol: number) => {
    if (!sonidoActivoRef.current) return;
    const a = audio();
    if (!a || a.ctx.state !== 'running') return;
    tocarTecla(a.ctx, a.master, pitch, vol);
  }, [audio]);

  const refrescar = useCallback(() => {
    const e = engineRef.current;
    if (e) setVals(computeVals(e, performance.now(), nombreEstudio));
  }, [nombreEstudio]);

  const finalizar = useCallback(async (ans: Respuestas) => {
    if (guardadoRef.current) return;
    guardadoRef.current = true;
    updateStudio({
      bienvenidaVistaEn: new Date().toISOString(),
      onbCentros: ans.centros ?? null,
      onbSoftwareAnterior: ans.software ?? null,
      onbAlumnosActivos: ans.alumnos ?? null,
      onbImportarDatos: ans.importar ?? null,
      onbPrioridad: ans.foco ?? null,
      onbAyudaAlta: ans.ayuda ?? null,
    });
    // "Quiero una videollamada" / "Configuradlo por mí": antes esto se quedaba
    // solo en la columna onb_ayuda_alta y nadie del equipo se enteraba de que
    // alguien había pedido ayuda humana. Best-effort: si falla, la propietaria
    // ya ha visto su resumen y no hay nada que mostrarle a mitad del onboarding.
    if (ans.ayuda && ans.ayuda !== 'Lo configuro yo') {
      fetch('/api/onboarding/ayuda-alta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ ayuda: ans.ayuda, software: ans.software ?? null }),
      }).catch(() => { /* best-effort */ });
    }
    if (ans.importar === 'Sí, importadlos') router.push('/migracion');
  }, [updateStudio, router]);

  const avanzar = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (avanceTRef.current) { clearTimeout(avanceTRef.current); avanceTRef.current = null; }
    if (e.paso >= PASOS.length - 1) {
      e.fase = 'resumen';
      e.qAt = performance.now();
      e.buttonAt = performance.now();
    } else {
      e.paso += 1;
      e.qAt = performance.now();
    }
    tock(0.78, 1.1);
    refrescar();
  }, [tock, refrescar]);

  const elegir = useCallback((paso: Paso, valor: string) => {
    const e = engineRef.current;
    if (!e) return;
    e.energy = Math.min(1, e.energy + 0.7);
    tock(1.18, 0.9);
    if (navigator.vibrate) { try { navigator.vibrate(6); } catch { /* no-op */ } }
    if (paso.multi) {
      const sel = [...((e.ans[paso.id] as string[] | undefined) ?? [])];
      const i = sel.indexOf(valor);
      if (i >= 0) sel.splice(i, 1);
      else if (sel.length < paso.multi) sel.push(valor);
      else { sel.shift(); sel.push(valor); }
      e.ans = { ...e.ans, [paso.id]: sel } as Respuestas;
      refrescar();
      return;
    }
    e.ans = { ...e.ans, [paso.id]: valor } as Respuestas;
    refrescar();
    if (avanceTRef.current) clearTimeout(avanceTRef.current);
    avanceTRef.current = setTimeout(avanzar, 280);
  }, [tock, refrescar, avanzar]);

  const onTap = useCallback(() => {
    const a = audioRef.current;
    if (a && a.ctx.state === 'suspended') a.ctx.resume();
    const e = engineRef.current;
    if (!e || e.fase !== 'intro') return;
    const texto = FRASES[e.idx] || '';
    if (e.typed < texto.length) e.t0 = performance.now() - texto.length * MS_POR_CARACTER;
  }, []);

  const onEnter = useCallback(() => {
    tock(0.62, 1.5);
    const e = engineRef.current;
    if (!e) return;
    if (e.fase === 'intro') {
      e.fase = 'wizard';
      e.paso = 0;
      e.qAt = performance.now();
      e.buttonAt = null;
      refrescar();
    } else if (e.fase === 'resumen') {
      finalizar(e.ans);
    }
  }, [tock, refrescar, finalizar]);

  const toggleSonido = useCallback(() => {
    setSonidoActivo((v) => {
      const nuevo = !v;
      if (nuevo) {
        const a = audio();
        if (a && a.ctx.state === 'suspended') a.ctx.resume();
      }
      return nuevo;
    });
  }, [audio]);

  // ── Ciclo de vida: rAF, teclado, audio ────────────────────────────────────
  useEffect(() => {
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const now = performance.now();
    const e = nuevoEngine(reduced, now);
    engineRef.current = e;

    const wake = () => { const a = audioRef.current; if (a && a.ctx.state === 'suspended') a.ctx.resume(); };
    const onKey = (ev: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng || eng.fase !== 'wizard') return;
      const paso = PASOS[eng.paso];
      if (!paso) return;
      if (ev.key === 'Enter') { avanzar(); return; }
      const n = parseInt(ev.key, 10);
      if (n >= 1 && n <= paso.opciones.length) elegir(paso, paso.opciones[n - 1]);
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    window.addEventListener('keydown', onKey);

    let raf = 0;
    const loop = (t: number) => {
      const eng = engineRef.current;
      if (eng) {
        const dt = Math.min(64, t - eng.prev);
        eng.prev = t;
        eng.energy *= Math.exp(-dt / 200);
        if (eng.fase === 'intro') tickIntro(eng, t, tock);
        setVals(computeVals(eng, t, nombreEstudio));
      }
      raf = requestAnimationFrame(loop);
      rafRef.current = raf;
    };
    raf = requestAnimationFrame(loop);
    rafRef.current = raf;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (avanceTRef.current) clearTimeout(avanceTRef.current);
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
      window.removeEventListener('keydown', onKey);
      const a = audioRef.current;
      if (a) { try { a.ctx.close(); } catch { /* no-op */ } audioRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!vals) return null;

  return (
    <div
      onClick={onTap}
      className="fixed inset-0 grid bg-background font-sans select-none"
      style={{ gridTemplateColumns: 'minmax(0, 1fr) clamp(0px, calc((100vw - 900px) * 100), 38%)' }}
      data-screen="bienvenida"
    >
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, #F7F6F1 0%, #F2F1EB 22%, #EDEDE6 48%, #E9E9E1 68%, #E7E7DF 76%, #E7E7DF 100%)' }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            inset: '-80px', filter: 'blur(18px)',
            background: 'repeating-radial-gradient(circle at 54% 40%, rgba(52,56,37,0.016) 0px, rgba(52,56,37,0) 54px, rgba(52,56,37,0.016) 108px)',
            transform: vals.waveTransform,
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            inset: '-80px', filter: 'blur(34px)',
            background: 'radial-gradient(circle 360px at 54% 40%, rgba(217,194,158,1) 0%, rgba(217,194,158,0) 70%)',
            opacity: vals.bloomOpacity,
          }}
        />

        <div className="absolute top-0 left-0 pt-[clamp(18px,3.2vh,34px)] px-[clamp(28px,6vw,84px)]">
          <Image src="/logo-stacked.png" alt="Tentare" width={120} height={76} priority draggable={false} className="h-[clamp(58px,8vh,76px)] w-auto object-contain" />
        </div>

        <div className="absolute top-[clamp(18px,3.2vh,34px)] right-6 z-10">
          <IconButton
            label={sonidoActivo ? 'Silenciar sonido de tecleo' : 'Activar sonido de tecleo'}
            icon={sonidoActivo ? Volume2 : VolumeX}
            onClick={(ev: React.MouseEvent) => { ev.stopPropagation(); toggleSonido(); }}
          />
        </div>

        {vals.fase === 'intro' && (
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: '41%' }}>
            <div className="relative max-w-[620px]" style={{ paddingLeft: 26, marginLeft: 'clamp(28px, 6vw, 84px)' }}>
              <div
                className="absolute left-0 w-px"
                style={{ top: '-1.9em', bottom: '0.3em', background: 'linear-gradient(to bottom, rgba(52,56,37,0.45), rgba(52,56,37,0.05))', opacity: vals.reglaOpacity }}
              />
              <div className="text-[11px] font-bold tracking-[0.24em] mb-5" style={{ color: '#55622C' }}>BIENVENIDA</div>
              <div className="relative">
                {vals.outText && (
                  <div
                    className="absolute inset-0 text-foreground font-semibold whitespace-pre-wrap"
                    style={{ fontSize: 'clamp(29px, 3.7vw, 50px)', lineHeight: 1.18, letterSpacing: '-0.026em', textWrap: 'pretty', opacity: vals.outOpacity, transform: vals.outTransform }}
                  >
                    {vals.outText}
                  </div>
                )}
                <div
                  className="text-foreground font-semibold whitespace-pre-wrap"
                  style={{ fontSize: 'clamp(29px, 3.7vw, 50px)', lineHeight: 1.18, letterSpacing: '-0.026em', textWrap: 'pretty' }}
                >
                  {vals.head}
                  {vals.tail.map((t, i) => <span key={i} style={{ opacity: t.o }}>{t.c}</span>)}
                  <span style={{ color: vals.lastColor, filter: vals.lastFilter, textShadow: vals.lastGlow }}>{vals.lastChar}</span>
                  <span
                    className="inline-block align-[-0.04em] rounded-sm"
                    style={{
                      width: 2, height: '0.92em', marginLeft: 4, background: '#343825',
                      boxShadow: vals.cursorGlow, opacity: vals.cursorOpacity, transform: vals.cursorTransform,
                    }}
                  />
                  <span style={{ color: 'rgba(26,26,26,0.11)' }}>{vals.ghost}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {vals.fase === 'wizard' && vals.paso && (
          <div className="absolute left-0 right-0 px-[clamp(28px,6vw,84px)]" style={{ top: '19%' }}>
            <div className="max-w-[620px]" style={{ opacity: vals.qOpacity, transform: vals.qTransform }}>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-[11px] font-bold tracking-[0.24em] whitespace-nowrap tabular-nums" style={{ color: '#55622C' }}>{vals.qPaso}</span>
                <span className="text-[11px] font-semibold tracking-[0.16em] uppercase whitespace-nowrap text-muted-foreground">{vals.paso.etiqueta}</span>
              </div>
              <div className="text-foreground font-semibold" style={{ fontSize: 'clamp(25px, 2.9vw, 37px)', lineHeight: 1.18, letterSpacing: '-0.024em', textWrap: 'pretty' }}>
                {vals.paso.titulo}
              </div>
              <div className="mt-2.5 text-sm leading-relaxed text-muted-foreground max-w-[460px]">{vals.qNota}</div>
              <div className="flex flex-wrap gap-2 mt-7">
                {vals.opciones.map((op) => (
                  <button
                    key={op.label}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); elegir(vals.paso!, op.label); }}
                    className="inline-flex items-center gap-2 rounded-full whitespace-nowrap cursor-pointer transition-colors"
                    style={{
                      minHeight: 46, padding: '0 18px', border: `1px solid ${op.border}`,
                      background: op.bg, color: op.color, boxShadow: op.shadow,
                      fontSize: '14.5px', fontWeight: 600, letterSpacing: '-0.004em',
                    }}
                  >
                    <span className="text-[10.5px] font-bold tabular-nums" style={{ color: op.numColor }}>{op.num}</span>
                    {op.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-6" style={{ opacity: vals.accionesOpacity, pointerEvents: vals.accionesEvents }}>
                <button
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); avanzar(); }}
                  className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-brand text-brand-foreground font-semibold whitespace-nowrap cursor-pointer hover:brightness-95 transition-all"
                  style={{ fontSize: 14, letterSpacing: '-0.005em' }}
                >
                  {vals.qBoton}
                </button>
              </div>
            </div>
          </div>
        )}

        {vals.fase === 'resumen' && (
          <div className="absolute left-0 right-0 px-[clamp(28px,6vw,84px)]" style={{ top: '17%' }}>
            <div className="max-w-[620px]" style={{ opacity: vals.qOpacity, transform: vals.qTransform }}>
              <div className="text-[11px] font-bold tracking-[0.24em] mb-4" style={{ color: '#55622C' }}>TODO LISTO</div>
              <div className="text-foreground font-semibold" style={{ fontSize: 'clamp(25px, 2.9vw, 37px)', lineHeight: 1.17, letterSpacing: '-0.026em', textWrap: 'pretty' }}>
                {vals.resumenTitulo}
              </div>
              <div className="mt-6 max-w-[560px] border-t border-border">
                {vals.resumen.map((r) => (
                  <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-5 py-2.5 border-b border-border">
                    <span className="text-[11px] font-semibold tracking-[0.13em] uppercase whitespace-nowrap overflow-hidden text-ellipsis text-muted-foreground">{r.label}</span>
                    <span className="text-sm font-semibold whitespace-nowrap text-right" style={{ color: r.color }}>{r.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="absolute left-0 right-0 bottom-0 px-[clamp(28px,6vw,84px)] pb-[clamp(24px,4vh,40px)]">
          <div className="relative h-px" style={{ background: 'rgba(26,26,26,0.14)' }}>
            <div
              className="absolute left-0 top-0 h-px transition-[width] duration-300"
              style={{ background: 'linear-gradient(to right, rgba(52,56,37,0.25), #55622C)', width: vals.progresoAncho }}
            />
          </div>
          <div className="flex items-center justify-between gap-4 pt-5" style={{ minHeight: 44 }}>
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase whitespace-nowrap text-muted-foreground transition-opacity duration-500" style={{ opacity: vals.pistaOpacity }}>
              {vals.pista}
            </div>
            <div className="relative" style={{ opacity: vals.btnOpacity, transform: vals.btnTransform, pointerEvents: vals.btnEvents }}>
              <div
                className="absolute rounded-full pointer-events-none"
                style={{ inset: -3, border: '1px solid #55622C', opacity: vals.ringOpacity, transform: vals.ringTransform }}
              />
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); onEnter(); }}
                className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-brand text-brand-foreground font-semibold whitespace-nowrap cursor-pointer hover:brightness-95 transition-all"
                style={{ fontSize: 14, letterSpacing: '-0.005em' }}
              >
                {vals.textoBoton}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden border-l border-black/[0.07] bg-gradient-to-br from-[#1A1A1A] to-[#2A2A24]">
        <div className="absolute left-0 right-0 bottom-0 p-[clamp(22px,3vh,34px)] flex items-center gap-2.5">
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: '#D9C29E' }} />
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-white">{vals.panelPie}</span>
        </div>
      </div>
    </div>
  );
}
