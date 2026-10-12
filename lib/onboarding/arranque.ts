// ─────────────────────────────────────────────────────────────────────────────
// La lista de arranque y el «siguiente paso» (P1.4). Puro.
//
// ⚠️ No decide nada: los pasos, su orden y si están hechos salen de
// `calcularProgresoGuia` (`lib/guia/progreso.ts`), que a su vez lee
// `lib/onboarding.ts` — los MISMOS que la tarjeta del Resumen, /primeros-pasos
// y el inicio de Configuración. Así el «N de M» no puede divergir otra vez, y
// ningún criterio cambia para nadie (decisión conservadora del 12-oct-2026).
// Lo único nuevo es cómo se PINTA, y solo en estudios nuevos.
// ─────────────────────────────────────────────────────────────────────────────
import type { ProgresoGuia } from '../guia/progreso.ts';
import type { PasoOnboarding } from '../onboarding.ts';

export interface FilaArranque {
  id: string;
  label: string;
  descripcion: string;
  href: string;
  done: boolean;
}

/** Los pasos de los capítulos «Para empezar», en su orden: lo que lleva a la primera reserva. */
export function listaDeArranque(progreso: ProgresoGuia): FilaArranque[] {
  return progreso.capitulos
    .filter(c => c.capitulo.nivel === 'esencial')
    .flatMap(c => c.pasos)
    .map(p => ({ id: p.id, label: p.label, descripcion: p.descripcion, href: p.href, done: p.done }));
}

export interface SiguientePaso {
  /** El paso que acaba de quedar hecho, y cómo se dice en pasado. */
  hecho: Pick<PasoOnboarding, 'id' | 'label'> & { frase: string };
  /** El que toca ahora. Su `id` es lo que se recuerda al descartarlo. */
  siguiente: Pick<PasoOnboarding, 'id' | 'label' | 'descripcion' | 'href'>;
}

/**
 * Cómo se dice que un paso QUEDÓ hecho. Las etiquetas de la guía son órdenes
 * («Crea tu primera clase») y «"Crea tu primera clase", hecho» mezclaba
 * imperativo y participio. Un paso sin frase aquí usa la forma genérica.
 */
const HECHO_EN_PASADO: Readonly<Record<string, string>> = {
  salas: 'Tus salas están listas.',
  instructor: 'Tu primera instructora ya está en el equipo.',
  clase: 'Tu primer tipo de clase está creado.',
  horario: 'Tus clases ya están en el calendario.',
  reservas: 'Tus reservas están abiertas.',
  'primera-reserva': 'Ya tienes tu primera reserva.',
  bonos: 'Tu primera tarifa está creada.',
  stripe: 'Stripe está conectado.',
  clientes: 'Ya tienes tus primeras clientas.',
};

export function fraseDeHecho(paso: Pick<PasoOnboarding, 'id' | 'label'>): string {
  return HECHO_EN_PASADO[paso.id] ?? `«${paso.label}»: hecho.`;
}

/** Los pasos que ya están hechos: la línea base contra la que se mide «acaba de quedar hecho». */
export function pasosHechos(progreso: ProgresoGuia): Set<string> {
  return new Set(progreso.capitulos.flatMap(c => c.pasos).filter(p => p.done).map(p => p.id));
}

/**
 * El siguiente paso tras uno RECIÉN hecho: el primer paso pendiente de TODA la
 * guía (en su orden) cuyo anterior está hecho… y lo estaba desde DESPUÉS de
 * `lineaBase` (lo hecho al abrir el panel). Sin ella, la banda salía en todas
 * las pantallas durante días, y tras el asistente de alta celebraba unas salas
 * que la propietaria no había creado («justo después», 07 §3).
 * Depende del dato, así que no puede adelantarse al servidor (el contexto solo
 * cambia tras `res.ok`) y se va sola cuando el paso se hace. Nunca dos a la vez,
 * y uno descartado no vuelve.
 */
export function siguientePaso(
  progreso: ProgresoGuia,
  descartados: ReadonlySet<string>,
  lineaBase: ReadonlySet<string> = new Set(),
): SiguientePaso | null {
  const pasos = progreso.capitulos.flatMap(c => c.pasos);
  const k = pasos.findIndex(p => !p.done);
  if (k <= 0) return null; // nada hecho todavía (la lista ya dice por dónde empezar) o todo hecho
  const anterior = pasos[k - 1];
  const actual = pasos[k];
  if (!anterior.done || lineaBase.has(anterior.id) || descartados.has(actual.id) || actual.externo) return null;
  return {
    hecho: { id: anterior.id, label: anterior.label, frase: fraseDeHecho(anterior) },
    siguiente: { id: actual.id, label: actual.label, descripcion: actual.descripcion, href: actual.href },
  };
}

/** Lo descartado, por persona y estudio: misma forma de clave que los tutoriales, otro nombre. */
export function claveSiguientePaso(usuarioId: string, studioId: string): string {
  return `tentare:siguiente-paso:v1:${usuarioId}:${studioId}`;
}

/** Nunca lanza: sin storage o con basura, nada descartado. */
export function leerDescartados(almacen: Pick<Storage, 'getItem'> | null, clave: string): Set<string> {
  try {
    const v: unknown = JSON.parse(almacen?.getItem(clave) ?? 'null');
    const lista = (v as { descartados?: unknown } | null)?.descartados;
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function guardarDescartados(almacen: Pick<Storage, 'setItem'> | null, clave: string, descartados: ReadonlySet<string>): boolean {
  try {
    if (!almacen) return false;
    almacen.setItem(clave, JSON.stringify({ descartados: [...descartados] }));
    return true;
  } catch {
    return false;
  }
}
