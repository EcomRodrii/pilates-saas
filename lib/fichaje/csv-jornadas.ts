import type { JornadaEquipo } from './jornadas-equipo.ts';
import type { ClaseEquipo } from './clases-equipo.ts';

// Registro de jornada del mes en CSV, para la gestoría o una inspección.
//
// Punto y coma y BOM: es lo que abre Excel en español sin preguntar. Las horas
// van en hora del estudio, nunca en la del navegador. Una celda que empieza por
// = + - @ se prefija con ' para que la hoja no la ejecute como fórmula (el
// nombre de una ficha lo escribe el estudio a mano).

const TZ = 'Europe/Madrid';
const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const ESTADO: Record<JornadaEquipo['status'], string> = { OPEN: 'Abierta', CLOSED: 'Cerrada', PENDING_REVIEW: 'Por revisar' };

function celda(v: string): string {
  const segura = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

function duracion(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

export function csvJornadas(jornadas: readonly JornadaEquipo[], nombre: (instructorId: string) => string): string {
  const cabecera = ['Instructora', 'Fecha', 'Entrada', 'Salida', 'Duración (h:mm)', 'Horas', 'Estado', 'Corregida'];
  const filas = [...jornadas]
    .sort((a, b) => nombre(a.instructorId).localeCompare(nombre(b.instructorId), 'es') || a.checkInAt.localeCompare(b.checkInAt))
    .map((j) => [
      nombre(j.instructorId),
      fmtFecha.format(new Date(j.checkInAt)),
      fmtHora.format(new Date(j.checkInAt)),
      j.checkOutAt ? fmtHora.format(new Date(j.checkOutAt)) : '',
      j.minutos != null ? duracion(j.minutos) : '',
      j.minutos != null ? (j.minutos / 60).toFixed(2).replace('.', ',') : '',
      j.requiereRevision ? 'Por revisar' : ESTADO[j.status],
      j.corregida ? 'Sí' : 'No',
    ]);
  return '﻿' + [cabecera, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}

/** `tiempo-trabajado-2026-09.csv` */
export function nombreCsvJornadas(anio: number, mes: number): string {
  return `tiempo-trabajado-${anio}-${String(mes).padStart(2, '0')}.csv`;
}

const ESTADO_CLASE: Partial<Record<ClaseEquipo['estado'], string>> = {
  DADA: 'Dada', EN_CURSO: 'En curso', EMPEZABLE: 'Sin empezar', NO_DADA: 'No dada', SIN_CONFIRMAR: 'Sin confirmar',
  PREVIA: 'Dada (antes del control de clases)',
};
const ORIGEN: Record<NonNullable<ClaseEquipo['origen']>, string> = {
  BOTON: 'Empezada en la app', LISTA: 'Al pasar lista', CONFIRMACION: 'Confirmada por ella', PROPIETARIA: 'Corregida por el estudio',
};

/** Las clases del mes: si se dieron, a qué hora empezaron y cómo se supo. */
export function csvClases(clases: readonly ClaseEquipo[], nombre: (instructorId: string) => string): string {
  const cabecera = ['Instructora', 'Fecha', 'Clase', 'Horario', 'Estado', 'Empezó', 'Terminó', 'Retraso (min)', 'Cómo se supo'];
  const filas = [...clases]
    .sort((a, b) => nombre(a.instructorId).localeCompare(nombre(b.instructorId), 'es') || a.inicio.localeCompare(b.inicio))
    .map((c) => [
      nombre(c.instructorId),
      fmtFecha.format(new Date(c.inicio)),
      c.nombre,
      `${fmtHora.format(new Date(c.inicio))}-${fmtHora.format(new Date(c.fin))}`,
      ESTADO_CLASE[c.estado] ?? c.estado,
      c.inicioReal ? fmtHora.format(new Date(c.inicioReal)) : '',
      c.finReal ? fmtHora.format(new Date(c.finReal)) : (c.inicioReal ? fmtHora.format(new Date(c.fin)) : ''),
      c.retrasoMin > 0 ? String(c.retrasoMin) : '',
      c.porJornada ? 'Dentro de su jornada' : c.origen ? ORIGEN[c.origen] : '',
    ]);
  return '\ufeff' + [cabecera, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}

/** `clases-impartidas-2026-09.csv` */
export function nombreCsvClases(anio: number, mes: number): string {
  return `clases-impartidas-${anio}-${String(mes).padStart(2, '0')}.csv`;
}
