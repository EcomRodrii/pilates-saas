// Reglas puras de la agenda de «Mis clases → Próximas». Sin `@/` (node --test).

import { addDias } from './formato.ts';

const SEMANA = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MES_C = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function fecha(iso: string): Date | null {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** El lunes de la semana de `iso`. */
export function lunesDe(iso: string): string {
  const d = fecha(iso);
  if (!d) return iso;
  return addDias(iso, -((d.getDay() + 6) % 7));
}

/** El bloque de la agenda: «Esta semana», «La semana que viene» o el mes. */
export function grupoAgenda(iso: string, hoy: string): string {
  const lunes = lunesDe(hoy);
  if (iso < addDias(lunes, 7)) return 'Esta semana';
  if (iso < addDias(lunes, 14)) return 'La semana que viene';
  const d = fecha(iso);
  const h = fecha(hoy);
  if (!d) return 'Más adelante';
  const mes = MES_L[d.getMonth()];
  return h && d.getFullYear() !== h.getFullYear() ? `${mes} ${d.getFullYear()}` : mes;
}

/** Agrupa en bloques CONSECUTIVOS, conservando el orden que llega. */
export function agruparAgenda<T extends { c: { fecha: string } }>(items: T[], hoy: string): { titulo: string; items: T[] }[] {
  const grupos: { titulo: string; items: T[] }[] = [];
  for (const x of items) {
    const titulo = grupoAgenda(x.c.fecha, hoy);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === titulo) ultimo.items.push(x);
    else grupos.push({ titulo, items: [x] });
  }
  return grupos;
}

/** El cuadradito de la fecha: «LUN / 12 / OCT». */
export function tileFecha(iso: string): { semana: string; dia: string; mes: string } {
  const d = fecha(iso);
  if (!d) return { semana: '', dia: '', mes: '' };
  return { semana: SEMANA[d.getDay()], dia: String(d.getDate()), mes: MES_C[d.getMonth()] };
}

/** Cuánto falta, en palabras: «Hoy», «Mañana», «En 3 días», «En 2 semanas». */
export function faltaTexto(iso: string, hoy: string): string {
  const d = fecha(iso);
  const h = fecha(hoy);
  if (!d || !h) return '';
  const dias = Math.round((d.getTime() - h.getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  if (dias < 14) return `En ${dias} días`;
  return `En ${Math.floor(dias / 7)} semanas`;
}
