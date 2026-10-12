// ─────────────────────────────────────────────────────────────────────────────
// Hitos de activación que se ven en el panel (P0.2, 12-oct-2026) — lógica pura.
//
// El embudo «alta → primera reserva» tenía un hueco en medio: ningún evento
// decía cuándo un estudio tiene su primer tipo de clase, su primera clase en el
// calendario o su primera tarifa que se pueda vender. Los tres se escriben desde
// varios sitios del panel (cuatro escritores de tipos de clase, cinco de
// sesiones), así que emitir en cada uno serían copias que acaban divergiendo.
//
// En su lugar se OBSERVA el dato: `components/analitica/hitos-activacion.tsx`
// toma una línea base al cargar y emite cuando un hito pasa de no a sí. El
// criterio de «hecho» es el de la visita guiada (`lib/tour/hecho.ts`): una
// tarifa cuenta si está ACTIVA y tiene precio, no un borrador del asistente.
//
// Al menos una vez, no exactamente una vez: dos pestañas, o borrar y volver a
// crear, pueden repetir un hito. Un embudo de PostHog solo cuenta la primera
// vez de cada paso, así que repetir no estropea la medida; lo que la estropea
// es un hueco. Evitarlo del todo exigiría guardar estado en el dispositivo, y
// la analítica de Tentare no guarda nada en el dispositivo
// (`app/(legal)/cookies`).
// ─────────────────────────────────────────────────────────────────────────────
import type { DatosHecho } from '../tour/hecho.ts';

export const HITOS = ['tiposClase', 'sesiones', 'tarifaActiva'] as const;
export type Hito = (typeof HITOS)[number];
export type EstadoHitos = Record<Hito, boolean>;

export const EVENTO_DEL_HITO = {
  tiposClase: 'primer_tipo_clase',
  sesiones: 'primera_clase_programada',
  tarifaActiva: 'primera_tarifa_activa',
} as const satisfies Record<Hito, string>;

/**
 * Cuántos días desde el alta se observa. El embudo es de ACTIVACIÓN: pasado un
 * mes, un estudio que monta su primera clase ya no dice nada de cómo arranca un
 * estudio nuevo, y un estudio veterano no paga ni la suscripción al contexto.
 */
export const DIAS_OBSERVACION = 30;

export function estadoHitos(h: Pick<DatosHecho, Hito>): EstadoHitos {
  return { tiposClase: h.tiposClase, sesiones: h.sesiones, tarifaActiva: h.tarifaActiva };
}

/** ¿Le falta todavía alguno? Si los tiene todos, no hay nada que observar. */
export function faltaAlguno(e: EstadoHitos): boolean {
  return HITOS.some(h => !e[h]);
}

/**
 * ¿Se observa a este estudio? Solo la propietaria (es quien monta el estudio),
 * solo durante su primer mes y solo si le falta algún hito. `creadoEn` ilegible
 * = no: mejor un hueco que contar a un estudio veterano como nuevo.
 */
export function debeObservar(p: { rol: string | null; creadoEn: string | null | undefined; ahora: Date }): boolean {
  if (p.rol !== 'PROPIETARIO' || !p.creadoEn) return false;
  const alta = Date.parse(p.creadoEn);
  if (Number.isNaN(alta)) return false;
  const dias = (p.ahora.getTime() - alta) / 86_400_000;
  // Un día de margen hacia atrás: un dispositivo con el reloj unos minutos por
  // detrás del servidor veía su estudio recién creado «en el futuro» y no lo
  // observaba en su primera sesión, que es justo la que importa.
  return dias >= -1 && dias <= DIAS_OBSERVACION;
}

/** Los hitos que estaban en NO en la línea base y ahora están en SÍ. */
export function hitosNuevos(base: EstadoHitos, ahora: EstadoHitos): Hito[] {
  return HITOS.filter(h => !base[h] && ahora[h]);
}

/** La línea base avanza y no retrocede: un hito ya contado no vuelve a contar aunque se borre. */
export function avanzarBase(base: EstadoHitos, ahora: EstadoHitos): EstadoHitos {
  return {
    tiposClase: base.tiposClase || ahora.tiposClase,
    sesiones: base.sesiones || ahora.sesiones,
    tarifaActiva: base.tarifaActiva || ahora.tarifaActiva,
  };
}
