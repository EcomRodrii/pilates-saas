// F2 (B2.9) — Excepciones por socia: el "porque lo digo yo". Lógica pura + catálogo
// de tipos. Todas las automatizaciones que escriben a la socia consultan esto antes.

import type { SocioExcepcion } from '@/lib/types';

export type TipoExcepcion = 'SIN_AVISO_HUECO' | 'SIN_RECORDATORIO';

export const TIPOS_EXCEPCION: TipoExcepcion[] = ['SIN_AVISO_HUECO', 'SIN_RECORDATORIO'];

export const EXCEPCION_META: Record<TipoExcepcion, { label: string; descripcion: string }> = {
  SIN_AVISO_HUECO: {
    label: 'No avisarle de clases con hueco',
    descripcion: 'El radar de ocupación no le escribirá cuando una clase tenga sitio.',
  },
  SIN_RECORDATORIO: {
    label: 'No enviarle recordatorios',
    descripcion: 'No recibirá el recordatorio automático de sus clases próximas.',
  },
};

// ¿Esta socia tiene esta excepción activa?
export function tieneExcepcion(excepciones: SocioExcepcion[], socioId: string, tipo: TipoExcepcion): boolean {
  return excepciones.some(e => e.socioId === socioId && e.tipo === tipo);
}

// Conjunto de socioIds con una excepción dada — para filtrar en lote en las
// automatizaciones (una pasada, sin O(n·m)).
export function sociosConExcepcion(excepciones: SocioExcepcion[], tipo: TipoExcepcion): Set<string> {
  const s = new Set<string>();
  for (const e of excepciones) if (e.tipo === tipo) s.add(e.socioId);
  return s;
}
