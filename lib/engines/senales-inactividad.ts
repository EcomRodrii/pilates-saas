import type { AutomationLog, Reserva } from '@/lib/types';

// Última asistencia real (reserva ASISTIDA) por socia — señal compartida
// entre automation-engine.ts (AUSENCIA_DIAS) y marketing-automation-engine.ts
// (INACTIVIDAD_30D). Antes cada motor la calculaba por su cuenta con el
// mismo criterio exacto; vivir en un solo sitio evita que diverjan en
// silencio si algún día cambia qué cuenta como "asistencia".
export function ultimaAsistidaPorSocio(reservas: Reserva[]): Map<string, string> {
  const ultimaAsistida = new Map<string, string>();
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA') continue;
    const prev = ultimaAsistida.get(r.socioId);
    if (!prev || r.creadoEn > prev) ultimaAsistida.set(r.socioId, r.creadoEn);
  }
  return ultimaAsistida;
}

// Dedup CRUZADO entre los dos motores de "socia inactiva" (AUSENCIA_DIAS del
// motor clásico e INACTIVIDAD_30D del motor de marketing) — ver
// docs/marketing-solape-motores-diseno.md §2. Ambos escriben en la misma
// tabla física `automation_logs` (uno en la columna ruleId, el otro en
// automatizacionId), así que el cruce no necesita tabla nueva: basta marcar
// cada log relacionado con inactividad con este prefijo en `detalle` y mirar
// TODOS los logs de la socia, sin filtrar por de qué motor vinieron.
export const MARCA_INACTIVIDAD = '[INACTIVIDAD]';

// Ventana corta a propósito (72h, no la ventana de dedup propia de cada
// motor): el objetivo es solo evitar que ambos crons disparen el mismo día o
// el día siguiente por una coincidencia de umbrales, no impedir que las dos
// secuencias convivan a lo largo del tiempo si el estudio de verdad las
// quiere activas las dos (caso de uso legítimo documentado en
// marketing-automation-engine.ts).
export function huboAvisoInactividadReciente(
  logs: AutomationLog[],
  socioId: string,
  now: Date,
  ventanaHoras = 72,
): boolean {
  const ventanaMs = ventanaHoras * 3600000;
  return logs.some(l =>
    l.socioId === socioId &&
    l.resultado !== 'FALLIDO' &&
    l.detalle.startsWith(MARCA_INACTIVIDAD) &&
    (now.getTime() - new Date(l.ejecutadoEn).getTime()) < ventanaMs
  );
}
