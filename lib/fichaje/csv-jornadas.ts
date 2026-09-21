import type { JornadaEquipo } from './jornadas-equipo.ts';

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
