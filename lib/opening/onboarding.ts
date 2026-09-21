// Onboarding progresivo de Opening OS: pocas preguntas, y lo que se responde
// decide qué se recomienda después. Se guarda en opening_progreso.objetivos.

export const PUNTOS = {
  PROYECTO: 'Tengo el proyecto en mente, pero todavía estoy preparándolo',
  LOCAL: 'Ya tengo el local',
  REFORMA: 'Estoy preparando o reformando el local',
  FECHA: 'Ya tengo una fecha prevista de apertura',
  LISTA_VENDER: 'Estoy prácticamente lista para empezar a vender',
} as const;
export type Punto = keyof typeof PUNTOS;

export const OBJETIVOS = {
  PRIMERAS_CLIENTAS: 'Conseguir mis primeras clientas',
  FUNDADORAS: 'Vender plazas fundadoras',
  LISTA_ESPERA: 'Crear una lista de espera',
  LLENAR_HORARIOS: 'Llenar mis primeros horarios',
  CONTRATAR: 'Contratar instructoras',
  TODO_PREPARADO: 'Tener todo preparado para abrir',
} as const;
export type Objetivo = keyof typeof OBJETIVOS;

export type TipoFecha = 'EXACTA' | 'APROXIMADA' | 'NO_SE';

export interface RespuestasOnboarding {
  completado: true;
  puntos: Punto[];
  objetivos: Objetivo[];
  fechaAproximada: boolean;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;
const fechaValida = (f: string) => {
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100;
};

/**
 * Valida el onboarding y resuelve la fecha: exacta tal cual, aproximada como
 * día 1 de ese mes (y se marca aproximada), «no lo sé» sin fecha.
 */
export function validarOnboarding(b: unknown):
  | { ok: true; respuestas: RespuestasOnboarding; fechaApertura: string | null; fase: 'PREPARACION' | 'PREVENTA' }
  | { ok: false; error: string } {
  const x = (b ?? {}) as Record<string, unknown>;
  const puntos = Array.isArray(x.puntos) ? [...new Set(x.puntos)] : null;
  const objetivos = Array.isArray(x.objetivos) ? [...new Set(x.objetivos)] : null;
  if (!puntos || puntos.length === 0 || !puntos.every(p => typeof p === 'string' && p in PUNTOS)) {
    return { ok: false, error: 'Elige en qué punto está tu apertura' };
  }
  if (!objetivos || !objetivos.every(o => typeof o === 'string' && o in OBJETIVOS)) {
    return { ok: false, error: 'Objetivos no válidos' };
  }

  let fechaApertura: string | null = null;
  if (x.fechaTipo === 'EXACTA') {
    if (typeof x.fecha !== 'string' || !FECHA.test(x.fecha) || !fechaValida(x.fecha)) return { ok: false, error: 'Fecha no válida' };
    fechaApertura = x.fecha;
  } else if (x.fechaTipo === 'APROXIMADA') {
    if (typeof x.mes !== 'string' || !MES.test(x.mes) || !fechaValida(`${x.mes}-01`)) return { ok: false, error: 'Elige el mes aproximado' };
    fechaApertura = `${x.mes}-01`;
  } else if (x.fechaTipo !== 'NO_SE') {
    return { ok: false, error: 'Dinos si tienes fecha de apertura' };
  }

  return {
    ok: true,
    respuestas: { completado: true, puntos: puntos as Punto[], objetivos: objetivos as Objetivo[], fechaAproximada: x.fechaTipo === 'APROXIMADA' },
    fechaApertura,
    fase: (puntos as Punto[]).includes('LISTA_VENDER') ? 'PREVENTA' : 'PREPARACION',
  };
}

/** Lee lo guardado sin fiarse de su forma: un jsonb viejo o a medias no es un onboarding hecho. */
export function leerRespuestas(v: unknown): RespuestasOnboarding | null {
  const x = (v ?? {}) as Record<string, unknown>;
  if (x.completado !== true || !Array.isArray(x.puntos) || !Array.isArray(x.objetivos)) return null;
  return {
    completado: true,
    puntos: x.puntos.filter((p): p is Punto => typeof p === 'string' && p in PUNTOS),
    objetivos: x.objetivos.filter((o): o is Objetivo => typeof o === 'string' && o in OBJETIVOS),
    fechaAproximada: x.fechaAproximada === true,
  };
}

export interface Recomendacion { id: string; titulo: string; motivo: string; href: string }

export interface ContextoRecomendaciones {
  respuestas: RespuestasOnboarding | null;
  /** Tipos de alerta abiertos: lo que ya avisa una alerta no se repite como paso. */
  alertas: string[];
  hayPlanes: boolean;
  hayEtapaFundadora: boolean;
  /** Filtro de rol: la API pasa puedeVer(rol, href). */
  puedeVer: (href: string) => boolean;
}

/**
 * Qué hacer ahora, según lo que respondió y lo que ya hay hecho. Solo enlaces a
 * pantallas que existen: lo que el producto aún no hace (soft opening,
 * campañas) no se recomienda. Como mucho 3, por orden de lo que bloquea más.
 */
export function recomendar(c: ContextoRecomendaciones): Recomendacion[] {
  const objetivos = new Set(c.respuestas?.objetivos ?? []);
  const out: Recomendacion[] = [];

  // Horario, cobro y demás imprescindibles los lleva «¿Lista para abrir?»
  // (lib/opening/listo.ts): aquí solo lo que depende de lo que quiere hacer.
  if (objetivos.has('FUNDADORAS') && !c.hayEtapaFundadora) {
    out.push(c.hayPlanes
      ? { id: 'fundadora', titulo: 'Crea tu etapa Fundadora', motivo: 'Elige el plan, las fechas y cuántas plazas vendes a ese precio.', href: '#etapas-lanzamiento' }
      : { id: 'plan-fundadora', titulo: 'Crea la cuota Fundadora', motivo: 'Primero el plan con su precio especial; después, su etapa aquí.', href: '/productos' });
  }
  if (objetivos.has('CONTRATAR')) {
    out.push({ id: 'contratar', titulo: 'Busca instructoras', motivo: 'Encuentra y contacta profesionales en Tentare Network.', href: '/network/buscar' });
  }
  if (objetivos.has('PRIMERAS_CLIENTAS') || objetivos.has('LISTA_ESPERA')) {
    out.push({ id: 'interesadas', titulo: 'Apunta a tus primeras interesadas', motivo: 'Tenlas localizadas para avisarlas cuando abras la venta.', href: '/clientas?nuevo=1' });
  }

  return out.filter(r => r.href.startsWith('#') || c.puedeVer(r.href.split('?')[0])).slice(0, 3);
}
