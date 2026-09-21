export const TIPOS_ETAPA = ['LISTA_ESPERA', 'ACCESO_ANTICIPADO', 'FUNDADORA', 'OFERTA_LANZAMIENTO'] as const;
export type TipoEtapa = (typeof TIPOS_ETAPA)[number];
export type AlCompletar = 'AVISAR' | 'CERRAR';

export const NOMBRE_ETAPA: Record<TipoEtapa, string> = {
  LISTA_ESPERA: 'Lista de espera',
  ACCESO_ANTICIPADO: 'Acceso anticipado',
  FUNDADORA: 'Fundadora',
  OFERTA_LANZAMIENTO: 'Oferta de lanzamiento',
};

export interface EtapaVista {
  id: string;
  etapa: TipoEtapa;
  planId: string | null;
  planNombre: string | null;
  /** Días del estudio 'YYYY-MM-DD', ambos incluidos. */
  desde: string;
  hasta: string;
  limitePlazas: number | null;
  alCompletar: AlCompletar;
  cerrada: boolean;
  cerradaMotivo: 'CUPO' | 'FECHA' | null;
  ventas: number;
}

export interface EntradaEtapa {
  etapa: TipoEtapa;
  planId: string;
  desde: string;
  hasta: string;
  limitePlazas: number | null;
  alCompletar: AlCompletar;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esFecha = (f: unknown): f is string => {
  if (typeof f !== 'string' || !FECHA.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
};

/** Valida lo que llega del formulario. Devuelve la etapa limpia o el primer error legible. */
export function validarEtapa(b: unknown): { ok: true; etapa: EntradaEtapa } | { ok: false; error: string } {
  const x = (b ?? {}) as Record<string, unknown>;
  if (!TIPOS_ETAPA.includes(x.etapa as TipoEtapa)) return { ok: false, error: 'Elige el tipo de etapa' };
  if (typeof x.planId !== 'string' || !x.planId) return { ok: false, error: 'Elige el plan que se vende en esta etapa' };
  if (!esFecha(x.desde) || !esFecha(x.hasta)) return { ok: false, error: 'Fechas no válidas' };
  if (x.hasta < x.desde) return { ok: false, error: 'La fecha de fin no puede ser anterior a la de inicio' };
  let limite: number | null = null;
  if (x.limitePlazas !== null && x.limitePlazas !== undefined && x.limitePlazas !== '') {
    const n = Number(x.limitePlazas);
    if (!Number.isInteger(n) || n < 1 || n > 10_000) return { ok: false, error: 'El cupo debe ser un número entero mayor que 0' };
    limite = n;
  }
  const alCompletar: AlCompletar = x.alCompletar === 'CERRAR' ? 'CERRAR' : 'AVISAR';
  return { ok: true, etapa: { etapa: x.etapa as TipoEtapa, planId: x.planId, desde: x.desde, hasta: x.hasta, limitePlazas: limite, alCompletar } };
}

/** Frase de estado de una etapa, tal como la lee la propietaria. */
export function estadoEtapa(e: EtapaVista, hoy: string): { texto: string; tono: 'neutro' | 'activo' | 'aviso' | 'cerrado' } {
  const fechaCorta = (f: string) => {
    const [, m, d] = f.split('-').map(Number);
    return `${d} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}`;
  };
  if (e.cerrada && e.cerradaMotivo === 'CUPO') {
    return e.alCompletar === 'CERRAR'
      ? { texto: 'Cupo lleno: venta cerrada', tono: 'cerrado' }
      : { texto: 'Cupo lleno: el plan sigue a la venta', tono: 'aviso' };
  }
  if (e.cerrada) {
    return e.alCompletar === 'CERRAR'
      ? { texto: `Terminó el ${fechaCorta(e.hasta)}: venta cerrada`, tono: 'cerrado' }
      : { texto: `Terminó el ${fechaCorta(e.hasta)}`, tono: 'cerrado' };
  }
  if (hoy < e.desde) return { texto: `Empieza el ${fechaCorta(e.desde)}`, tono: 'neutro' };
  if (e.limitePlazas !== null && e.ventas >= e.limitePlazas * 0.9) {
    return { texto: `Casi llena · hasta el ${fechaCorta(e.hasta)}`, tono: 'aviso' };
  }
  return { texto: `Activa hasta el ${fechaCorta(e.hasta)}`, tono: 'activo' };
}
