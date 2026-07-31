// ─────────────────────────────────────────────────────────────────────────────
// Ocupación por instructora, para la card de "Equipo" (rediseño canvas "2a").
//
// Reusa el mismo criterio "A-16" que ya usan calendario/page.tsx y
// dashboard/page.tsx: ocupadas = reservas CONFIRMADA/ASISTIDA (nunca
// LISTA_ESPERA ni NO_ASISTIO, que inflarían el ratio por encima de lo real).
// ─────────────────────────────────────────────────────────────────────────────

import { ratioOcupacion } from './ocupacion.ts';
import type { Sesion, Reserva, TipoClase, Sala } from './types.ts';

const DIA_MS = 86_400_000;

export function confirmadasPorSesion(reservas: Reserva[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of reservas) {
    if (r.estado !== 'CONFIRMADA' && r.estado !== 'ASISTIDA') continue;
    map.set(r.sesionId, (map.get(r.sesionId) ?? 0) + 1);
  }
  return map;
}

function sesionesDelInstructor(sesiones: Sesion[], instructorId: string): Sesion[] {
  return sesiones.filter((s) => s.instructorId === instructorId && !s.cancelada);
}

// "Dando Reformer Flow en Sala Norte, acaba a las 20:20" | "Libre ahora".
export function estadoAhoraInstructor(
  sesiones: Sesion[],
  tiposClase: TipoClase[],
  salas: Sala[],
  instructorId: string,
  ahora: Date,
): { enClase: true; texto: string } | { enClase: false } {
  const enCurso = sesionesDelInstructor(sesiones, instructorId).find((s) => {
    const inicio = new Date(s.inicio);
    const fin = new Date(s.fin);
    return inicio <= ahora && ahora < fin;
  });
  if (!enCurso) return { enClase: false };
  const tipo = tiposClase.find((t) => t.id === enCurso.tipoClaseId)?.nombre ?? 'Clase';
  const sala = salas.find((s) => s.id === enCurso.salaId)?.nombre ?? null;
  const horaFin = new Date(enCurso.fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const texto = sala
    ? `Dando ${tipo} en ${sala}, acaba a las ${horaFin}`
    : `Dando ${tipo}, acaba a las ${horaFin}`;
  return { enClase: true, texto };
}

// Ocupación media ponderada (ocupadas totales / aforo total) de los próximos
// 7 días. `null` = sin clases en la ventana, la card muestra "—".
export function ocupacionSemanalInstructor(
  sesiones: Sesion[],
  confirmadas: Map<string, number>,
  instructorId: string,
  ahora: Date,
): number | null {
  const limite = new Date(ahora.getTime() + 7 * DIA_MS);
  const propias = sesionesDelInstructor(sesiones, instructorId).filter((s) => {
    const inicio = new Date(s.inicio);
    return inicio >= ahora && inicio <= limite && s.aforoMaximo > 0;
  });
  if (propias.length === 0) return null;
  let ocupadas = 0;
  let aforo = 0;
  for (const s of propias) {
    ocupadas += confirmadas.get(s.id) ?? 0;
    aforo += s.aforoMaximo;
  }
  return Math.round(ratioOcupacion(ocupadas, aforo) * 100);
}

// Una entrada por día, hoy..+6 (longitud fija 7). `ratio` es la media
// ponderada de ese día, o `null` si ese día no tiene ninguna clase — un día
// vacío no es lo mismo que un día con clases pero sin nadie apuntado.
export function barrasOcupacionSemanal(
  sesiones: Sesion[],
  confirmadas: Map<string, number>,
  instructorId: string,
  ahora: Date,
): Array<{ fecha: Date; ratio: number | null }> {
  const propias = sesionesDelInstructor(sesiones, instructorId);
  const dias: Array<{ fecha: Date; ratio: number | null }> = [];
  for (let i = 0; i < 7; i++) {
    const fecha = new Date(ahora.getTime() + i * DIA_MS);
    const claveDia = fecha.toDateString();
    const delDia = propias.filter((s) => new Date(s.inicio).toDateString() === claveDia && s.aforoMaximo > 0);
    if (delDia.length === 0) {
      dias.push({ fecha, ratio: null });
      continue;
    }
    let ocupadas = 0;
    let aforo = 0;
    for (const s of delDia) {
      ocupadas += confirmadas.get(s.id) ?? 0;
      aforo += s.aforoMaximo;
    }
    dias.push({ fecha, ratio: ratioOcupacion(ocupadas, aforo) });
  }
  return dias;
}

// Horas trabajadas en los próximos 7 días (para "33 h 45" / coste = horas × tarifa).
export function horasSemanaInstructor(sesiones: Sesion[], tiposClase: TipoClase[], instructorId: string, ahora: Date): number {
  const limite = new Date(ahora.getTime() + 7 * DIA_MS);
  const propias = sesionesDelInstructor(sesiones, instructorId).filter((s) => {
    const inicio = new Date(s.inicio);
    return inicio >= ahora && inicio <= limite;
  });
  const minutos = propias.reduce((acc, s) => {
    const duracion = tiposClase.find((t) => t.id === s.tipoClaseId)?.duracionMinutos;
    return acc + (duracion ?? (new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / 60_000);
  }, 0);
  return minutos / 60;
}

// "33 h 45" — formato compacto para la card (sin decimales sueltos).
export function fmtHoras(horas: number): string {
  const totalMin = Math.round(horas * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
