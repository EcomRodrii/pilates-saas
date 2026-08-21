'use client';

// Pantalla de bienvenida a pantalla completa, mostrada UNA sola vez justo
// después de crear el estudio: intro con efecto máquina de escribir → wizard
// rápido de 11 preguntas (un toque por respuesta, con auto-avance) → resumen.
// Eran 6; las 5 de operativa (salas, aforo, duración, clases, cobro) se
// añadieron porque son las que dejan el estudio MONTADO en vez de solo
// perfilado — ver §8 en lib/onboarding/plan-configuracion.ts. Cinco toques más
// aquí es el intercambio explícito por no llegar al panel con una lista de
// cosas que configurar a mano. Diseñada en
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
import { LogoTentare } from '@/components/marca/logo-tentare';
import { Volume2, VolumeX } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { authHeader } from '@/lib/api-client';
import type { Studio } from '@/lib/types';
import { useStudio } from '@/lib/studio-context';
import { PantallasValor } from './pantallas-valor';
// Las opciones se pintan DESDE el módulo puro a propósito: la etiqueta que se
// enseña y la que se interpreta son el mismo dato, así que no pueden divergir
// al editar una de las dos (hay un test que recorre las listas enteras).
import {
  OPCIONES_SALAS, OPCIONES_AFORO, OPCIONES_DURACION, OPCIONES_COBRO,
  TIPOS_CLASE_SUGERIDOS, interpretarRespuestasWizard, planificarConfiguracion,
  planVacio,
} from '@/lib/onboarding/plan-configuracion';

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
  // §8 — Las cinco de operativa son las ÚNICAS que configuran algo de verdad:
  // se convierten en salas con su aforo, tipos de clase con su duración y
  // borradores de bono/cuota (lib/onboarding/plan-configuracion.ts). Las seis
  // de arriba siguen siendo perfil del estudio.
  salas?: string;
  aforo?: string;
  duracion?: string;
  clases?: string[];
  cobro?: string[];
};

type Paso = {
  id: keyof Respuestas;
  etiqueta: string;
  titulo: string;
  nota: string | ((ans: Respuestas) => string);
  opciones: string[];
  multi?: number;
};

// ── De dónde viene el estudio ───────────────────────────────────────────────
// ⚠️ Solo plataformas de GESTIÓN de estudio, que es lo que se está preguntando.
// Aquí estuvo «Un Respiro», que no lo es: es un marketplace donde la clienta
// compra bonos de clases sueltas, no el sistema con el que un estudio lleva su
// agenda, sus alumnas y sus cobros. Ofrecerlo como respuesta a «¿con qué llevas
// tu estudio?» invita a contestar algo que después no se puede migrar.
//
// La lista sale de los competidores que el propio negocio sigue de verdad —los
// que tienen su página en /comparativa— más las dos respuestas honestas que no
// son un producto: la hoja de cálculo y no usar nada.
const SIN_SOFTWARE = 'Todavía ninguno';
const OTRO_SOFTWARE = 'Otro';

const OPCIONES_SOFTWARE = [
  SIN_SOFTWARE,
  'Bsport',
  'TIMP',
  'Eversports',
  'Momence',
  'Mindbody',
  'Glofox',
  'Bonsai',
  'Lorari',
  'Excel o Google Sheets',
  OTRO_SOFTWARE,
] as const;

/** ¿Hay datos que traer de otro sitio? Ni «ninguno» ni «otro» son migrables:
 *  del primero no hay nada, y del segundo no sabemos siquiera qué es. */
function vieneDeOtraPlataforma(software: string | undefined): boolean {
  return !!software && software !== SIN_SOFTWARE && software !== OTRO_SOFTWARE;
}

const PASOS: Paso[] = [
  {
    id: 'centros', etiqueta: 'Tu estudio', titulo: '¿Cuántos centros tienes?',
    // Decía "activamos la vista multicentro". No se activa nada: las sedes de
    // una cadena se crean por /api/cadena/sedes y el multicentro depende de
    // eso, no de esta respuesta. Se cuenta lo que sí pasa.
    nota: 'Nos dice si vas a necesitar gestionar varias sedes.',
    opciones: ['1 estudio', '2-3 estudios', '4-10 estudios', 'Más de 10'],
  },
  {
    id: 'software', etiqueta: 'Tu estudio', titulo: '¿Con qué llevas ahora tu estudio?',
    // "¿Desde qué software vienes?" daba por hecho que viene de uno, y muchos
    // estudios no vienen de ninguno: lo llevan en papel, en WhatsApp o en una
    // hoja de cálculo. Preguntado así, «Todavía ninguno» es una respuesta más,
    // no la confesión de que te falta algo.
    nota: 'Si vienes de otra plataforma, traemos tus datos gratis. Y si no usas ninguna, también está bien.',
    opciones: [...OPCIONES_SOFTWARE],
  },
  {
    id: 'alumnos', etiqueta: 'Tu estudio', titulo: '¿Cuántos alumnos activos tienes?',
    // Decía "ajustamos los límites y los informes a tu tamaño real". No hay
    // límites por estudio que ajustar, y los informes se calculan sobre los
    // datos reales, no sobre esta respuesta.
    nota: 'Nos ayuda a entender el tamaño de tu estudio desde el primer día.',
    opciones: ['Menos de 50', '50-150', '150-300', '300-600', 'Más de 600'],
  },
  {
    id: 'salas', etiqueta: 'Tu espacio', titulo: '¿Cuántas salas tienes?',
    nota: 'Las creamos por ti para que puedas programar clases hoy mismo.',
    opciones: [...OPCIONES_SALAS],
  },
  {
    id: 'aforo', etiqueta: 'Tu espacio', titulo: '¿Cuántas plazas hay en cada sala?',
    nota: 'Es el límite real de reservas por clase, así que no lo adivinamos.',
    opciones: [...OPCIONES_AFORO],
  },
  {
    id: 'duracion', etiqueta: 'Tus clases', titulo: '¿Cuánto dura una clase?',
    nota: 'La duración por defecto de cada clase que programes.',
    opciones: [...OPCIONES_DURACION],
  },
  {
    id: 'clases', etiqueta: 'Tus clases', titulo: '¿Qué clases das?',
    nota: 'Elige hasta cuatro. Las dejamos creadas y podrás añadir más luego.',
    opciones: [...TIPOS_CLASE_SUGERIDOS],
    multi: 4,
  },
  {
    id: 'cobro', etiqueta: 'Tus precios', titulo: '¿Cómo cobras a tus alumnas?',
    // No se promete el precio: se deja el bono con la forma correcta y en
    // borrador. Un precio inventado sería un bono comprable por dinero que
    // nadie ha decidido.
    nota: 'Dejamos preparado lo que uses; el precio lo pones tú antes de activarlo.',
    opciones: [...OPCIONES_COBRO],
    multi: 2,
  },
  {
    id: 'importar', etiqueta: 'Migración', titulo: '¿Quieres que importemos tus datos?',
    // 'Otro' es un cajón genérico, no el nombre real de ninguna plataforma —
    // interpolarlo tal cual daba "reservas de Otro." (#issue pendiente).
    nota: (a) => vieneDeOtraPlataforma(a.software)
      ? `Alumnos, bonos y reservas de ${a.software}. Lo hacemos nosotros, sin coste.`
      : 'Si tienes listas en Excel o en papel, las pasamos nosotros, sin coste.',
    opciones: ['Sí, importadlos', 'No, empiezo de cero'],
  },
  {
    id: 'foco', etiqueta: 'Prioridad', titulo: '¿Qué es lo que más te preocupa ahora mismo?',
    // Esta sí se cumple ya: `ordenarSeccionesHome` sube la sección que atiende
    // la prioridad elegida (lib/home-sections.ts). Se matiza el "ordenamos"
    // porque no todas las prioridades tienen hoy una sección que mover.
    nota: 'Elige hasta dos. Subimos a lo primero de tu panel lo que más te importe.',
    opciones: ['Conseguir más alumnos', 'Gestionar reservas', 'Cobros', 'Sustituciones de instructoras', 'Automatizar tareas', 'Marketing', 'Otro'],
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
  const migra = vieneDeOtraPlataforma(e.ans.software);
  const resumen = ([
    ['Centros', e.ans.centros],
    ['Alumnos activos', e.ans.alumnos],
    ['Salas', e.ans.salas],
    ['Plazas por sala', e.ans.aforo],
    ['Duración de clase', e.ans.duracion],
    ['Clases', (e.ans.clases ?? []).join(' · ')],
    ['Cobras con', (e.ans.cobro ?? []).join(' · ')],
    ['Ahora usas', e.ans.software],
    ['Prioridad', (e.ans.foco ?? []).join(' · ')],
    ['Puesta en marcha', e.ans.ayuda],
    ['Importamos tus datos', e.ans.importar],
  ] as const)
    .filter((f) => !!f[1])
    .map(([label, valor]) => ({
      label, valor: valor as string,
      color: label === 'Ahora usas' && migra ? '#55622C' : '#1A1A1A',
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

/**
 * Lo primero al entrar: primero se ENSEÑA lo que hace Tentare, y solo después
 * se pregunta. Antes esto abría directamente con «¿cuántos centros tienes?»
 * a alguien que acaba de registrarse y todavía no sabe qué gana con esto.
 *
 * Son dos componentes y no una fase más del motor de dentro a propósito: ese
 * motor es un bucle de requestAnimationFrame con audio y una máquina de
 * estados en un ref, y meterle una fase previa significaba que el tecleo de la
 * intro corriera —y se gastara— por detrás de las pantallas de valor. Montando
 * el asistente solo cuando la baraja termina, la intro empieza cuando se ve.
 */
export function PantallaBienvenida({ studio }: { studio: Studio }) {
  const [valorVisto, setValorVisto] = useState(false);
  const saltarValor = useCallback(() => setValorVisto(true), []);
  if (!valorVisto) return <PantallasValor onContinuar={saltarValor} />;
  return <AsistenteBienvenida studio={studio} />;
}

function AsistenteBienvenida({ studio }: { studio: Studio }) {
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
    await updateStudio({
      bienvenidaVistaEn: new Date().toISOString(),
      onbCentros: ans.centros ?? null,
      onbSoftwareAnterior: ans.software ?? null,
      onbAlumnosActivos: ans.alumnos ?? null,
      onbImportarDatos: ans.importar ?? null,
      onbPrioridad: ans.foco ?? null,
      onbAyudaAlta: ans.ayuda ?? null,
    });

    // §8 — Lo que de verdad convierte el cuestionario en un estudio montado:
    // crea sus salas con su aforo, sus tipos de clase con su duración y los
    // borradores de bono/cuota. Antes de esto, TODAS las respuestas del
    // asistente se guardaban en `studios.onb_*` y no las leía nadie.
    //
    // Se espera (`await`) a propósito, a diferencia del aviso de ayuda-alta de
    // abajo: en cuanto la propietaria entra al panel, el checklist de primeros
    // pasos consulta salas/tipos/planes para marcar qué está hecho. Sin
    // esperar, entraría a un checklist que dice "configura tus salas" con las
    // salas ya creándose por detrás — y la impresión sería justo la contraria
    // de la que se busca.
    //
    // El endpoint es idempotente (inserta lo que falte, por nombre), así que un
    // reintento no duplica nada. Fallo suave: si no se puede aplicar, ella ya
    // ha visto su resumen y el panel sigue siendo usable — el checklist le
    // pedirá esas mismas cosas, que es el comportamiento de siempre.
    const operativa = interpretarRespuestasWizard(ans);
    if (!planVacio(planificarConfiguracion(operativa))) {
      try {
        await fetch('/api/onboarding/configurar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify(operativa),
        });
      } catch { /* fallo suave: el checklist de primeros pasos sigue estando */ }
    }
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
      {/* ⚠️ `overflow-clip`, NO `overflow-hidden`. Las dos capas decorativas de
          abajo llevan `inset: -80px`, así que sobresalen del panel y lo hacían
          desplazable a lo ancho (scrollWidth 879 vs clientWidth 794). Con
          `hidden` eso es un contenedor de scroll de verdad: en cuanto algo
          recibía el foco —un chip de respuesta, el botón de sonido— el
          navegador lo desplazaba 85 px para «traerlo a la vista» y esos 85 px
          de contenido se quedaban fuera PARA SIEMPRE, porque `hidden` no deja
          volver atrás. Se veía como una pantalla rota: la pregunta empezaba
          cortada y «Continuar» quedaba a medias.
          `clip` recorta exactamente igual pero no crea contenedor desplazable,
          así que no hay nada que desplazar. Medido antes/después. */}
      <div className="relative overflow-clip">
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
          <LogoTentare formato="vertical" className="h-[clamp(58px,8vh,76px)] w-auto" />
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

      {/* La columna derecha pintaba SOLO la etiqueta del pie: casi 500 px de
          negro sin nada, un tercio de la pantalla sin usar. Es lo que hacía que
          el alta pareciera un formulario a medio hacer.
          Ahora enseña el estudio tomando forma: cada respuesta aparece aquí en
          cuanto se da. No es adorno — es la respuesta visible a «¿para qué me
          preguntas esto?», que era otra de las quejas. Reutiliza `vals.resumen`,
          que ya se calculaba para la pantalla final; no hay estado nuevo. */}
      <div className="relative overflow-clip border-l border-black/[0.07] bg-gradient-to-br from-[#1A1A1A] to-[#2A2A24]">
        <div className="absolute inset-x-0 top-0 p-[clamp(22px,3vh,34px)]">
          <div className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color: '#D9C29E' }}>
            Tu estudio
          </div>
          <div className="mt-1 text-[13px] leading-relaxed text-white/55">
            {vals.resumen.length === 0
              ? 'Lo que respondas se irá montando aquí.'
              : 'Esto es lo que dejamos configurado.'}
          </div>

          <div className="mt-6">
            {vals.resumen.map((r) => (
              <div
                key={r.label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b py-2.5"
                style={{ borderColor: 'rgba(255,255,255,0.09)' }}
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.13em] text-white/45">
                  {r.label}
                </span>
                <span className="whitespace-nowrap text-right text-[13px] font-semibold text-white/90">{r.valor}</span>
              </div>
            ))}
          </div>

          {/* La promesa que trajo a esta persona hasta aquí, a la vista mientras
              rellena. Es el momento en que más dudas entran. */}
          <div
            className="mt-7 rounded-2xl px-4 py-3.5"
            style={{ background: 'rgba(217,194,158,0.10)', border: '1px solid rgba(217,194,158,0.18)' }}
          >
            <div className="text-[12.5px] font-bold text-white/90">{TRIAL_DIAS} días gratis</div>
            <div className="mt-0.5 text-[12px] leading-relaxed text-white/55">
              Sin tarjeta. Si no eliges plan, la prueba simplemente termina.
            </div>
          </div>
        </div>

        <div className="absolute left-0 right-0 bottom-0 p-[clamp(22px,3vh,34px)] flex items-center gap-2.5">
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: '#D9C29E' }} />
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-white">{vals.panelPie}</span>
        </div>
      </div>
    </div>
  );
}
