import type { Automatizacion, AutomationLog, Socio, Suscripcion, Reserva, Cita } from '@/lib/types';

// Motor de las Automatizaciones de MARKETING (tipo `Automatizacion`, con triggers
// de negocio). Antes la UI las creaba pero NINGÚN proceso las ejecutaba — fachada
// muerta. Este módulo puro detecta, para cada regla activa, a qué socias aplica
// hoy; el envío real + dedup lo hace lib/inngest/automatizaciones.ts (reusa la
// tabla automation_logs con ruleId = id de la automatización).

const MS_DIA = 86400000;

export interface AutomatizacionMktCandidato {
  automatizacion: Automatizacion;
  socio: Socio;
  asunto: string;
  mensaje: string;
}

// Ventana de deduplicación por trigger (días): no reenviar la misma automatización
// a la misma socia dentro de este plazo. Los "de una vez" usan una ventana enorme.
const UNA_VEZ = 3650;
const DEDUP_DIAS: Record<Automatizacion['trigger'], number> = {
  SUSCRIPCION_EXPIRA_7D: 14,
  SUSCRIPCION_EXPIRA_1D: 3,
  SUSCRIPCION_CANCELADA: UNA_VEZ,
  CUMPLEANOS: 300,
  PRIMERA_CLASE: UNA_VEZ,
  INACTIVIDAD_30D: 30,
  BONO_AGOTADO: 30,
  BONO_QUEDA_1: 14,
  NUEVA_ALTA: UNA_VEZ,
  CITA_RECORDATORIO: 1,
};

function personalizar(texto: string, socio: Socio): string {
  return (texto ?? '').replace(/\{nombre\}/gi, socio.nombre).replace(/\{apellidos\}/gi, socio.apellidos ?? '');
}

export interface MktEngineInput {
  automatizaciones: Automatizacion[];
  automationLogs: AutomationLog[];
  socios: Socio[];
  suscripciones: Suscripcion[];
  reservas: Reserva[];
  citas: Cita[];
}

export function computeAutomatizacionMktCandidatos(
  { automatizaciones, automationLogs, socios, suscripciones, reservas, citas }: MktEngineInput,
  now: Date,
): AutomatizacionMktCandidato[] {
  const candidatos: AutomatizacionMktCandidato[] = [];
  const socioById = new Map(socios.map(s => [s.id, s]));

  // Dedup: logs no-fallidos por (automatizacionId|socioId).
  const logsPorKey = new Map<string, AutomationLog[]>();
  for (const l of automationLogs) {
    if (l.resultado === 'FALLIDO') continue;
    const k = `${l.ruleId}|${l.socioId ?? ''}`;
    const arr = logsPorKey.get(k); if (arr) arr.push(l); else logsPorKey.set(k, [l]);
  }
  const yaEnviado = (autoId: string, socioId: string, ventanaDias: number): boolean =>
    (logsPorKey.get(`${autoId}|${socioId}`) ?? []).some(l => (now.getTime() - new Date(l.ejecutadoEn).getTime()) < ventanaDias * MS_DIA);

  // Suscripción ACTIVA por socia (la primera vigente).
  const susActivaPorSocio = new Map<string, Suscripcion>();
  for (const s of suscripciones) if (s.estado === 'ACTIVA' && !susActivaPorSocio.has(s.socioId)) susActivaPorSocio.set(s.socioId, s);

  // Última asistencia (ASISTIDA) por socia + fecha de la PRIMERA asistencia.
  const ultimaAsistida = new Map<string, string>();
  const primeraAsistida = new Map<string, string>();
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA') continue;
    const u = ultimaAsistida.get(r.socioId); if (!u || r.creadoEn > u) ultimaAsistida.set(r.socioId, r.creadoEn);
    const p = primeraAsistida.get(r.socioId); if (!p || r.creadoEn < p) primeraAsistida.set(r.socioId, r.creadoEn);
  }

  const hoyMD = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const mananaStr = new Date(now.getTime() + MS_DIA).toISOString().slice(0, 10);
  const diasHasta = (iso: string) => Math.floor((new Date(iso).getTime() - now.getTime()) / MS_DIA);
  const diasDesde = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / MS_DIA);

  const emitir = (a: Automatizacion, socio: Socio) => {
    if (!socio.email) return; // sin email no hay envío (el motor lo marcará fallido igualmente si llega)
    if (yaEnviado(a.id, socio.id, DEDUP_DIAS[a.trigger] ?? 14)) return;
    candidatos.push({ automatizacion: a, socio, asunto: personalizar(a.asunto, socio), mensaje: personalizar(a.mensaje, socio) });
  };

  for (const a of automatizaciones.filter(x => x.activa && x.accion === 'EMAIL')) {
    switch (a.trigger) {
      case 'NUEVA_ALTA':
        for (const s of socios) if (s.activo && diasDesde(s.fechaAlta) <= 1 && diasDesde(s.fechaAlta) >= 0) emitir(a, s);
        break;
      case 'CUMPLEANOS':
        for (const s of socios) if (s.activo && s.fechaNacimiento && s.fechaNacimiento.slice(5) === hoyMD) emitir(a, s);
        break;
      case 'PRIMERA_CLASE':
        for (const [socioId, fecha] of primeraAsistida) if (diasDesde(fecha) <= 1 && diasDesde(fecha) >= 0) { const s = socioById.get(socioId); if (s?.activo) emitir(a, s); }
        break;
      case 'INACTIVIDAD_30D':
        for (const [socioId, fecha] of ultimaAsistida) if (diasDesde(fecha) >= 30) { const s = socioById.get(socioId); if (s?.activo) emitir(a, s); }
        break;
      case 'SUSCRIPCION_EXPIRA_7D':
        for (const [socioId, sus] of susActivaPorSocio) if (sus.fechaFin) { const d = diasHasta(sus.fechaFin); if (d >= 2 && d <= 7) { const s = socioById.get(socioId); if (s) emitir(a, s); } }
        break;
      case 'SUSCRIPCION_EXPIRA_1D':
        for (const [socioId, sus] of susActivaPorSocio) if (sus.fechaFin) { const d = diasHasta(sus.fechaFin); if (d >= 0 && d <= 1) { const s = socioById.get(socioId); if (s) emitir(a, s); } }
        break;
      case 'SUSCRIPCION_CANCELADA':
        // Sin timestamp de cancelación: proxy = estado CANCELADA con fechaFin
        // reciente (últimos 2 días). Dedup "una vez" evita reenviar históricos.
        for (const sus of suscripciones) if (sus.estado === 'CANCELADA' && sus.fechaFin && diasDesde(sus.fechaFin) >= 0 && diasDesde(sus.fechaFin) <= 2) { const s = socioById.get(sus.socioId); if (s) emitir(a, s); }
        break;
      case 'BONO_AGOTADO':
        for (const [socioId, sus] of susActivaPorSocio) if (sus.sesionesRestantes === 0) { const s = socioById.get(socioId); if (s) emitir(a, s); }
        break;
      case 'BONO_QUEDA_1':
        for (const [socioId, sus] of susActivaPorSocio) if (sus.sesionesRestantes === 1) { const s = socioById.get(socioId); if (s) emitir(a, s); }
        break;
      case 'CITA_RECORDATORIO':
        for (const c of citas) if ((c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA') && c.inicio.slice(0, 10) === mananaStr) { const s = socioById.get(c.socioId); if (s) emitir(a, s); }
        break;
    }
  }

  return candidatos;
}
