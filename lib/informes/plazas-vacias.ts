// «Plazas que dejaron vacías» (P3.15, diseño en investigacion-bonsai 21): por
// alumna, las clases del periodo en las que tenía plaza y la dejó vacía —la
// canceló fuera de plazo o no vino—. Puro: lo usa la ruta
// `/api/informes/plazas-vacias`, que es quien lee las reservas.
//
// ⚠️ No se calcula en el navegador a propósito. El trigger que marca
// `cancelada_tardia` la pone en CUALQUIER paso a CANCELADA dentro del plazo:
// también al cerrar una espera de una clase que ya pasó, al caducar una oferta o
// al rechazar una pendiente, donde nunca tuvo plaza. Quién la tuvo lo dice
// `llegoAOcuparPlaza` (lib/recuperaciones/derecho-semanal.ts), que necesita
// columnas que el panel no carga.
//
// Qué NO cuenta: cancelar a tiempo (no deja hueco: es lo que se pide), la clase
// fija retirada por el estudio, las reservas de plataformas externas y las
// clases canceladas (eso lo filtra la ruta). Ningún porcentaje: con pocas
// reservas mentiría, y es un juicio sobre una persona. Se enseña la cifra y la
// base («2 tarde · 1 sin venir, de 9 reservas»), y solo desde un umbral.

import { canceladasCompensables, llegoAOcuparPlaza, type ReservaDeLaSemana } from '../recuperaciones/derecho-semanal.ts';

/** Con menos, no sale: dos cancelaciones en un trimestre no dicen nada de nadie. */
export const UMBRAL_PLAZAS_VACIAS = 3;
/** Cuántas se enseñan como mucho. */
export const MAXIMO_PLAZAS_VACIAS = 5;
/** El periodo más largo que se acepta (el año de Informes). */
export const DIAS_MAXIMO_PLAZAS_VACIAS = 366;

/** Lo que la ruta lee de cada reserva (columnas de `reservas`). */
export interface ReservaPlazasVacias extends ReservaDeLaSemana {
  socio_id: unknown;
  cancelada_tardia?: unknown;
  cancelada_motivo?: unknown;
  origen?: unknown;
}

export interface FilaPlazasVacias {
  socioId: string;
  /** Canceladas fuera de plazo, con plaza y sin volver a esa clase (una por clase). */
  tarde: number;
  /** No vino («NO_ASISTIO»). */
  sinVenir: number;
  /** Las reservas del periodo en las que llegó a tener plaza: la base de la cifra. */
  conPlaza: number;
}

const USAN_PLAZA = new Set(['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);

/** De Tentare (no de ClassPass y compañía), con alumna, y no una clase fija retirada por el estudio. */
function cuenta(r: ReservaPlazasVacias): boolean {
  if (typeof r.socio_id !== 'string' || !r.socio_id) return false;
  if (r.origen != null && r.origen !== 'TENTARE') return false;
  return r.cancelada_motivo !== 'plaza_fija_retirada';
}

export function plazasQueDejaronVacias(reservas: ReservaPlazasVacias[]): FilaPlazasVacias[] {
  const porSocia = new Map<string, ReservaPlazasVacias[]>();
  for (const r of reservas) {
    if (!cuenta(r)) continue;
    const id = r.socio_id as string;
    const suyas = porSocia.get(id);
    if (suyas) suyas.push(r); else porSocia.set(id, [r]);
  }

  const filas: FilaPlazasVacias[] = [];
  for (const [socioId, suyas] of porSocia) {
    const canceladas = suyas.filter(r => r.estado === 'CANCELADA');
    const tardias = canceladas.filter(r => r.cancelada_tardia === true);
    const tarde = canceladasCompensables(tardias, suyas).length;
    const sinVenir = suyas.filter(r => r.estado === 'NO_ASISTIO').length;
    const conPlaza = suyas.filter(r => USAN_PLAZA.has(String(r.estado))).length
      + canceladas.filter(r => llegoAOcuparPlaza(r)).length;
    if (tarde + sinVenir >= UMBRAL_PLAZAS_VACIAS) filas.push({ socioId, tarde, sinVenir, conPlaza });
  }
  return filas
    .sort((a, b) => (b.tarde + b.sinVenir) - (a.tarde + a.sinVenir) || b.sinVenir - a.sinVenir || a.socioId.localeCompare(b.socioId))
    .slice(0, MAXIMO_PLAZAS_VACIAS);
}

const FECHA = /^(\d{4})-\d{2}-\d{2}$/;
/** Un día de verdad (sin 30 de febrero) y de un año razonable: nada de 0001 ni 9999. */
const esDia = (v: string | null): v is string => {
  const m = v ? FECHA.exec(v) : null;
  if (!v || !m || Number(m[1]) < 2000 || Number(m[1]) > 2100) return false;
  const t = Date.parse(`${v}T12:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};

/** El periodo que pide la pantalla: dos días válidos, en orden y de un año como mucho. */
export function rangoDePlazasVacias(desde: string | null, hasta: string | null):
  { ok: true; desde: string; hasta: string } | { ok: false; error: string } {
  if (!esDia(desde) || !esDia(hasta)) return { ok: false, error: 'Fechas no válidas.' };
  if (desde > hasta) return { ok: false, error: 'El periodo empieza después de terminar.' };
  const dias = (Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000;
  if (dias > DIAS_MAXIMO_PLAZAS_VACIAS) return { ok: false, error: 'Como mucho, un año.' };
  return { ok: true, desde, hasta };
}

/** «2 tarde · 1 sin venir, de 9 reservas». */
export function textoPlazasVacias(f: FilaPlazasVacias): string {
  const partes: string[] = [];
  if (f.tarde > 0) partes.push(`${f.tarde} tarde`);
  if (f.sinVenir > 0) partes.push(`${f.sinVenir} sin venir`);
  return `${partes.join(' · ')}, de ${f.conPlaza} ${f.conPlaza === 1 ? 'reserva' : 'reservas'}`;
}
