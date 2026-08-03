// Datos y reglas de la rejilla de Equipo — sin React, sin Supabase.
//
// Mismo principio que `lib/permisos-reglas.ts`: funciones puras, fuera de la
// vista, para poder probarlas sin levantar medio entorno. La vista (page.tsx)
// solo pinta lo que estas funciones deciden; no debe tener condicionales de
// negocio encadenados.
//
// El contrato de permisos vive AQUÍ, no en la vista: `GET /api/equipo/tarjetas`
// construye un `MiembroCompleto` por persona con TODOS los datos reales, y es
// ese endpoint quien decide, campo a campo, qué le manda a cada rol — usando
// las mismas funciones que se testean aquí. La vista nunca recibe un campo que
// el rol de quien mira no debería ver: no hay nada que ocultar en el cliente
// porque el cliente nunca lo tuvo.

import type { Rol } from './types';

export type Situacion = 'clase' | 'mostrador' | 'flojo' | 'libre' | 'direccion' | 'inactiva';

export const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
export const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

/** Umbral de "se están quedando vacías" — mismo criterio que `lib/ocupacion.ts` (I-13). */
export const OCUPACION_ATENCION = 60;

/**
 * Semanas sin dar ninguna clase (sin próxima programada) para avisar de que
 * puede que ya no esté trabajando de verdad. No es una desactivación
 * automática — solo una señal para que la propietaria decida, igual que el
 * distintivo de ausencia. El caso real que lo motiva: instructoras que dan un
 * par de clases sueltas y no vuelven, y se quedan "activas" indefinidamente
 * en todos los desplegables porque nadie se acuerda de desactivarlas a mano.
 */
export const SEMANAS_SIN_CLASE_AVISO = 8;

/** Semanas desde la última clase pasada, o null si no aplica el aviso (nunca
 * dio clase, o tiene una próxima programada). */
export function semanasSinClase(
  m: Pick<MiembroCompleto, 'ultimaClaseIso' | 'proximaClaseIso'>,
  ahora: Date,
): number | null {
  if (m.proximaClaseIso || !m.ultimaClaseIso) return null;
  const dias = (ahora.getTime() - new Date(m.ultimaClaseIso).getTime()) / 86400000;
  return Math.floor(dias / 7);
}

/**
 * Todo lo que el SERVIDOR puede llegar a saber de una persona del equipo.
 * Nunca se manda tal cual por HTTP: `GET /api/equipo/tarjetas` decide, por
 * rol de quien mira, qué campos rellena con el dato real y cuáles pone a
 * null ANTES de serializar — el valor real nunca sale del servidor para un
 * rol que no debe verlo, no se esconde después en el cliente.
 */
export interface MiembroCompleto {
  id: string;
  nombre: string;
  rol: Rol;
  color: string;
  avatar: string | null;
  fotoUrl: string | null;
  activo: boolean;
  conAcceso: boolean;
  /** La ficha pertenece a quien está mirando la pantalla. */
  esYo: boolean;
  email: string | null;
  telefono: string | null;
  /** Tiene una sesión en curso ahora mismo (no cancelada). */
  enClaseAhora: boolean;
  /** Frase de la clase de ahora/hoy, o null si no da clase hoy. */
  claseHoyLabel: string | null;
  /** ISO de su próxima sesión futura, o null. */
  proximaClaseIso: string | null;
  /** ISO de su última clase PASADA (no cancelada), o null si nunca dio ninguna. */
  ultimaClaseIso: string | null;
  /** Clases programadas esta semana (L-D), reales. */
  semana: number[];
  /** Horario de cada día (p.ej. "10:00 · 19:30"), o null si libre ese día. */
  horasDia: (string | null)[];
  /** Ocupación media (ocupadas/aforo, 0-100) de sus clases recientes, o null sin datos. */
  ocupacionPct: number | null;
  valoracion: { media: number; total: number } | null;
  /** Horas trabajadas este mes (de `sesiones` no canceladas), o null si no aplica al rol (recepción). */
  horasMes: number | null;
  /** Coste del mes (tarifa × horas). Solo se rellena si el llamador puede verlo. */
  costeMes: number | null;
  /** Con qué días coincide con quien mira, en texto — solo relevante en vista de compañeras. */
  coincideContigo: string | null;
}

function gestiona(rolViewer: Rol): boolean {
  return rolViewer !== 'INSTRUCTOR';
}

/** Qué situación describe a esta persona, en el orden en que se decide. */
export function situacionDe(
  m: Pick<MiembroCompleto, 'esYo' | 'rol' | 'enClaseAhora' | 'ocupacionPct' | 'ultimaClaseIso' | 'proximaClaseIso'>,
  ahora: Date,
): Situacion {
  if (m.esYo) return 'direccion';
  if (m.rol === 'RECEPCION') return 'mostrador';
  if (m.enClaseAhora) return 'clase';
  const semanas = semanasSinClase(m, ahora);
  if (semanas != null && semanas >= SEMANAS_SIN_CLASE_AVISO) return 'inactiva';
  if (m.ocupacionPct != null && m.ocupacionPct < OCUPACION_ATENCION) return 'flojo';
  return 'libre';
}

export interface EstadoTarjeta {
  situacion: Situacion;
  etiqueta: string;
  titulo: string;
  pie: string;
}

/** La franja de color + su frase, según quién mira. */
export function estado(m: MiembroCompleto, rolViewer: Rol, ahora: Date): EstadoTarjeta {
  const situacion = situacionDe(m, ahora);

  // Vista de compañeras (instructora mirando a otra persona): solo lo de hoy.
  if (!gestiona(rolViewer) && !m.esYo) {
    return {
      situacion,
      etiqueta: 'Hoy',
      titulo: m.claseHoyLabel ?? 'Sin clases hoy',
      pie: m.coincideContigo ? `Coincidís: ${m.coincideContigo}` : 'No coincidís esta semana.',
    };
  }

  if (situacion === 'direccion') {
    return { situacion, etiqueta: 'Tu cuenta', titulo: 'Eres tú', pie: 'Tu ficha no cuenta en el coste del equipo.' };
  }
  if (situacion === 'mostrador') {
    return {
      situacion, etiqueta: 'Ahora mismo',
      titulo: m.claseHoyLabel ?? 'En recepción',
      pie: 'No da clases.',
    };
  }
  if (situacion === 'clase') {
    return {
      situacion, etiqueta: 'Ahora mismo',
      titulo: m.claseHoyLabel ?? 'Dando clase',
      pie: `${clases(m)} clase${clases(m) === 1 ? '' : 's'} esta semana`,
    };
  }
  if (situacion === 'inactiva') {
    const semanas = semanasSinClase(m, ahora) ?? 0;
    return {
      situacion, etiqueta: 'Sin actividad',
      titulo: `Sin clases desde hace ${semanas} semana${semanas === 1 ? '' : 's'}`,
      pie: '¿Sigue en el equipo? Revisa si hay que desactivarla.',
    };
  }
  if (situacion === 'flojo') {
    return {
      situacion, etiqueta: 'Atención',
      titulo: 'Sus clases se están quedando vacías',
      pie: `${m.ocupacionPct}% de ocupación media`,
    };
  }
  // libre
  return {
    situacion, etiqueta: 'Ahora mismo',
    titulo: clases(m) > 0 ? 'Hoy no tiene clases' : 'Sin clases esta semana',
    pie: m.proximaClaseIso ? `Su próxima es el ${fechaCorta(m.proximaClaseIso)}` : 'Sin próximas clases.',
  };
}

export function clases(m: Pick<MiembroCompleto, 'semana'>): number {
  return m.semana.reduce((a, b) => a + b, 0);
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

/** El día libre de la semana, para la pista bajo las barras — o null si trabaja todos. */
export function diaLibre(semana: number[]): number | null {
  const i = semana.findIndex(n => n === 0);
  return i === -1 ? null : i;
}

export function pistaSemana(m: Pick<MiembroCompleto, 'semana'>): string {
  const libre = diaLibre(m.semana);
  if (libre === null) return 'Trabaja todos los días de la semana.';
  return `El ${DIAS_LARGOS[libre].toLowerCase()} lo tiene libre: es a quien preguntar si falta alguien.`;
}

export interface CifrasTarjeta {
  /** Barras L-D + pista: solo tiene sentido para quien gestiona (no compañeras). */
  verBarras: boolean;
  /** Ocupación + segunda cifra (coste/horas/valoración): idem. */
  verCifras: boolean;
  ocupacionTexto: string;
  ocupacionBarraPct: number;
  ocupacionPie: string;
  segundaValor: string;
  segundaEtiqueta: string;
  valoracionTexto: string;
  conValoracion: boolean;
}

/** Las cifras de la tarjeta, ya recortadas al rol de quien mira. */
export function cifras(m: MiembroCompleto, rolViewer: Rol, ahora: Date): CifrasTarjeta {
  const situacion = situacionDe(m, ahora);
  const puedeVer = gestiona(rolViewer) || m.esYo;
  // Recepción no da clases: no hay ocupación/horas de clase que enseñar.
  const verCifras = puedeVer && situacion !== 'mostrador';
  const verBarras = puedeVer && situacion !== 'mostrador' && clases(m) > 0;
  const dueña = rolViewer === 'PROPIETARIO';

  const coste = dueña ? m.costeMes : null;
  return {
    verBarras,
    verCifras,
    ocupacionTexto: m.ocupacionPct == null ? '—' : `${m.ocupacionPct}%`,
    ocupacionBarraPct: m.ocupacionPct ?? 0,
    ocupacionPie: m.ocupacionPct == null ? 'sin clases recientes' : `${clases(m)} clase${clases(m) === 1 ? '' : 's'} esta semana`,
    segundaValor: coste != null ? euros(coste) : (m.horasMes == null ? '—' : horas(m.horasMes)),
    segundaEtiqueta: coste != null ? 'Coste del mes' : 'Horas del mes',
    valoracionTexto: m.valoracion && m.valoracion.total > 0
      ? `${m.valoracion.media.toFixed(1)} de ${m.valoracion.total} clientas`
      : 'sin valoraciones aún',
    conValoracion: !!(m.valoracion && m.valoracion.total > 0),
  };
}

export function euros(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
export function horas(n: number): string {
  const h = Math.round(n * 10) / 10;
  return `${h % 1 === 0 ? h : h.toFixed(1)} h`;
}

export type AccionTipo = 'avisos' | 'mensaje' | 'hecho' | 'horas' | 'pedir';
export interface AccionTarjeta {
  texto: string;
  tipo: AccionTipo;
}

/**
 * Una acción con nombre propio por tarjeta. "Pedirle disponibilidad" y
 * "Revisar sus horas" son conceptos de sustituciones/clases — solo se ofrecen
 * sobre instructoras; al resto del equipo (recepción, otra propietaria) se le
 * escribe, no se le "pide disponibilidad para cubrir clases".
 */
export function accion(m: MiembroCompleto, rolViewer: Rol, ctx: { pedido: boolean }): AccionTarjeta {
  if (m.esYo) return { texto: 'Ver mis avisos', tipo: 'avisos' };
  if (!gestiona(rolViewer)) return { texto: 'Escribirle', tipo: 'mensaje' };
  if (m.rol !== 'INSTRUCTOR') return { texto: 'Escribirle', tipo: 'mensaje' };
  if (ctx.pedido) return { texto: 'Enlace copiado ✓', tipo: 'hecho' };
  if (m.ocupacionPct != null && m.ocupacionPct < OCUPACION_ATENCION) return { texto: 'Revisar sus horas', tipo: 'horas' };
  return { texto: 'Pedirle disponibilidad', tipo: 'pedir' };
}

// ─── Filtrar / ordenar ──────────────────────────────────────────────────────

export type FiltroEstado = 'activas' | 'todas' | 'inactivas';
export type FiltroRol = 'todos' | Rol;
export type Orden = 'nombre-az' | 'nombre-za' | 'mas-clases' | 'peor-ocupacion' | 'mayor-coste';

export function filtrar(
  ms: MiembroCompleto[],
  { busca, estadoF, rol }: { busca: string; estadoF: FiltroEstado; rol: FiltroRol },
): MiembroCompleto[] {
  const term = normaliza(busca.trim());
  return ms.filter(m => {
    if (estadoF === 'activas' && !m.activo) return false;
    if (estadoF === 'inactivas' && m.activo) return false;
    if (rol !== 'todos' && m.rol !== rol) return false;
    if (term && !normaliza(m.nombre).includes(term)) return false;
    return true;
  });
}

function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Solo tiene sentido para quien puede ver coste/ocupación (`gestiona`) — se
 * usa como guard antes de ofrecer "Más clases"/"Peor ocupación"/"Mayor coste". */
export function ordenesDisponibles(rolViewer: Rol): Orden[] {
  const base: Orden[] = ['nombre-az', 'nombre-za', 'mas-clases', 'peor-ocupacion'];
  return rolViewer === 'PROPIETARIO' ? [...base, 'mayor-coste'] : base;
}

export function ordenar(ms: MiembroCompleto[], orden: Orden): MiembroCompleto[] {
  const out = [...ms];
  out.sort((a, b) => {
    if (orden === 'nombre-za') return b.nombre.localeCompare(a.nombre, 'es');
    if (orden === 'mas-clases') return clases(b) - clases(a);
    if (orden === 'peor-ocupacion') return (a.ocupacionPct ?? 999) - (b.ocupacionPct ?? 999);
    if (orden === 'mayor-coste') return (b.costeMes ?? -1) - (a.costeMes ?? -1);
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  return out;
}
