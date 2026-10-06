// «Avisos» de la app de la alumna (rediseño aprobado del 5-oct-2026): por días,
// con filtros, su icono y, cuando el aviso pide algo y existe la vía, su botón.
// Puro y sin `@/` (lo prueba `node --test`).
//
// ⚠️ Los filtros y los botones salen del CATÁLOGO real (`lib/notifications/
// catalog.ts`): la categoría con la que el motor guarda cada aviso y su tipo de
// evento. Un aviso que no se reconoce cae en «Del estudio» y sin botón: mejor
// sin botón que con uno que no sabe qué hacer.

export type FiltroAvisos = 'todo' | 'reservas' | 'pagos' | 'estudio';

export const FILTROS_AVISOS: { id: FiltroAvisos; etiqueta: string }[] = [
  { id: 'todo', etiqueta: 'Todo' },
  { id: 'reservas', etiqueta: 'Reservas' },
  { id: 'pagos', etiqueta: 'Pagos' },
  { id: 'estudio', etiqueta: 'Del estudio' },
];

/**
 * A qué filtro va un aviso. Las categorías de una alumna (`CATEGORIAS_POR_ROL.SOCIA`)
 * son `reservas`, `clases`, `pagos`, `marketing` y `mensajeria`: sus clases (reservas
 * y cambios en ellas) van juntas, los cobros y bonos a Pagos, y lo que le cuenta el
 * estudio (tablón, mensajes, campañas) a «Del estudio». Sin categoría, se mira el
 * prefijo del evento.
 */
export function filtroDeAviso(categoria: string | null | undefined, evento: string | null | undefined): Exclude<FiltroAvisos, 'todo'> {
  if (categoria === 'reservas' || categoria === 'clases') return 'reservas';
  if (categoria === 'pagos') return 'pagos';
  if (categoria) return 'estudio';
  const e = evento ?? '';
  if (/^(reserva|clase|clase_fija|plaza_fija|recuperacion)\./.test(e)) return 'reservas';
  if (/^(pago|bono|renovacion|suscripcion)\./.test(e)) return 'pagos';
  return 'estudio';
}

export function filtrarAvisos<T extends { categoria?: string | null; evento?: string | null }>(avisos: T[], filtro: FiltroAvisos): T[] {
  return filtro === 'todo' ? avisos : avisos.filter((a) => filtroDeAviso(a.categoria, a.evento) === filtro);
}

// ── Por días ─────────────────────────────────────────────────────────────────

export type GrupoAvisos = 'Hoy' | 'Ayer' | 'Esta semana' | 'Antes';

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** El lunes de la semana de `iso` (las semanas empiezan en lunes, como en España). */
function lunesDe(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return sumarDias(iso, -((dow + 6) % 7));
}

/** En qué grupo cae un día (YYYY-MM-DD) visto desde `hoy`. «Esta semana» es la del calendario: desde el lunes. */
export function grupoDeDia(dia: string, hoy: string): GrupoAvisos {
  if (dia >= hoy) return 'Hoy';
  if (dia === sumarDias(hoy, -1)) return 'Ayer';
  if (dia >= lunesDe(hoy)) return 'Esta semana';
  return 'Antes';
}

/**
 * Agrupa por Hoy / Ayer / Esta semana / Antes, lo más nuevo primero. `diaDe` pasa
 * el instante del aviso a su día EN LA ZONA DEL ESTUDIO: con el día de UTC, un
 * aviso de las 00:30 caía en «Ayer».
 */
export function agruparAvisosPorDia<T extends { fecha: string }>(
  avisos: T[], hoy: string, diaDe: (iso: string) => string,
): { grupo: GrupoAvisos; items: T[] }[] {
  const orden: GrupoAvisos[] = ['Hoy', 'Ayer', 'Esta semana', 'Antes'];
  const grupos = new Map<GrupoAvisos, T[]>();
  const ordenados = [...avisos].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  for (const a of ordenados) {
    const g = grupoDeDia(diaDe(a.fecha), hoy);
    grupos.set(g, [...(grupos.get(g) ?? []), a]);
  }
  return orden.filter((g) => grupos.has(g)).map((g) => ({ grupo: g, items: grupos.get(g) as T[] }));
}

// ── El botón de cada aviso ───────────────────────────────────────────────────

/**
 * Qué botón lleva un aviso, por su evento. Solo los que piden algo Y tienen una vía
 * en la app:
 * - `aceptar-oferta`: «Se ha liberado una plaza» (`reserva.oferta_lista_espera`) →
 *   aceptarla o salir de la lista, lo mismo que en Mis clases.
 * - `renovar`: el bono se acaba o se ha acabado → a Bonos.
 * - `calendario`: reserva confirmada (también la que llega de la lista de espera) →
 *   añadirla al calendario del móvil.
 *
 * Que el evento lo pida no basta: la pantalla comprueba además que la oferta siga
 * viva o que la clase siga reservada. Si no, no hay botón.
 */
export type AccionAviso = 'aceptar-oferta' | 'renovar' | 'calendario';

export function accionDeAviso(evento: string | null | undefined): AccionAviso | null {
  switch (evento) {
    case 'reserva.oferta_lista_espera': return 'aceptar-oferta';
    case 'bono.por_caducar':
    case 'bono.agotado': return 'renovar';
    case 'reserva.confirmada':
    case 'reserva.plaza_liberada': return 'calendario';
    default: return null;
  }
}

/** «Tienes hasta las 18:36 · quedan 24 min». `null` si ya ha caducado. */
export function plazoDeOferta(expiraEn: string, ahoraMs: number, horaDe: (iso: string) => string): string | null {
  const ms = new Date(expiraEn).getTime() - ahoraMs;
  if (!(ms > 0)) return null;
  const min = Math.ceil(ms / 60_000);
  const queda = min < 60 ? `quedan ${min} min` : `quedan ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  return `Tienes hasta las ${horaDe(expiraEn)} · ${queda}`;
}

// ── Su icono ─────────────────────────────────────────────────────────────────

/** El icono de cada aviso, del juego de `Icono` (nada de trazados sueltos). Por evento, y si no se conoce, por su cara. */
const ICONO_POR_EVENTO: Record<string, string> = {
  'reserva.oferta_lista_espera': 'plaza',
  'reserva.plaza_liberada': 'plaza',
  'recuperacion.otorgada': 'plaza',
  'reserva.confirmada': 'hecho',
  'reserva.lista_espera': 'reloj',
  'reserva.recordatorio_24h': 'reloj',
  'reserva.recordatorio_1h': 'reloj',
  'reserva.cancelada': 'cerrar',
  'clase.cancelada': 'cerrar',
  'clase.modificada': 'calendario',
  'clase.sustituta': 'instructoras',
  'plaza_fija.respuesta': 'calendario',
  'clase_fija.termina_pronto': 'calendario',
  'reserva.plaza_fija_no_materializada': 'alerta',
  'bono.por_caducar': 'bono',
  'bono.agotado': 'bono',
  'pago.realizado': 'bono',
  'clase.valorar': 'estrella',
  'mensaje.recibido': 'comentario',
};

const ICONO_POR_TIPO: Record<string, string> = {
  'plaza-liberada': 'plaza', recordatorio: 'reloj', bono: 'bono', estudio: 'megafono', valorar: 'estrella', atencion: 'alerta',
};

export function iconoDeAviso(evento: string | null | undefined, tipo: string): string {
  return (evento && ICONO_POR_EVENTO[evento]) || ICONO_POR_TIPO[tipo] || 'megafono';
}
