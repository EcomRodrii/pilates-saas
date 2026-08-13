import type { Automatizacion, AutomationLog, Socio, Suscripcion, Reserva, Cita } from '@/lib/types';
import { ultimaAsistidaPorSocio, huboAvisoInactividadReciente } from './senales-inactividad.ts';
import { tieneConsentimientoMarketingVigente } from '../marketing/consentimiento.ts';

// Motor de las Automatizaciones de MARKETING (tipo `Automatizacion`, con triggers
// de negocio). Antes la UI las creaba pero NINGÚN proceso las ejecutaba — fachada
// muerta. Este módulo puro detecta, para cada regla activa, a qué socias aplica
// hoy; el envío real + dedup lo hace lib/inngest/automatizaciones.ts (reusa la
// tabla automation_logs con ruleId = id de la automatización).

const MS_DIA = 86400000;

export interface AutomatizacionMktCandidato {
  automatizacion: Automatizacion;
  socio: Socio;
  // NOTIFICACION: aviso interno para el equipo (nunca llega a la socia) — el
  // envío real (lib/inngest/automatizaciones.ts) crea una fila en
  // `notificaciones` en vez de mandar nada por Resend/Twilio.
  canal: 'EMAIL' | 'WHATSAPP' | 'NOTIFICACION';
  asunto: string;
  mensaje: string;
  // Marca este candidato como parte de la señal "socia inactiva" (dedup
  // cruzado con AUSENCIA_DIAS del motor clásico — ver
  // docs/marketing-solape-motores-diseno.md §2 y senales-inactividad.ts).
  // Lo lee lib/inngest/automatizaciones.ts para prefijar el `detalle` del
  // log con MARCA_INACTIVIDAD.
  marcaInactividad?: boolean;
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
  // Subido de 30 a 45: con AUSENCIA_DIAS del motor clásico ya cubriendo los
  // días 7/14/25 de una ausencia, repetir cada 30 días aquí se sentía como
  // spam encima de una oferta de reactivación recién mandada. 45 la deja como
  // un recordatorio ocasional "más allá" de esa secuencia, no una repetición
  // mensual agresiva. Si el estudio usa las dos a la vez, ver aviso de
  // solapamiento en la UI (app/(dashboard)/automatizaciones/page.tsx).
  INACTIVIDAD_30D: 45,
  BONO_AGOTADO: 30,
  BONO_QUEDA_1: 14,
  NUEVA_ALTA: UNA_VEZ,
  CITA_RECORDATORIO: 1,
  // Trigger del constructor de flujos (Contenido). Este motor gym no lo procesa
  // por-socia; se define para exhaustividad del Record.
  CONTENIDO_PUBLICADO: UNA_VEZ,
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
  // Consentimiento de marketing (art. 7.4 RGPD) — texto EXACTO que cada
  // socia aceptó, keyed por socioId. Ausencia de entrada = sin consentimiento,
  // nunca se le manda nada de este motor. Ver lib/marketing/consentimiento.ts
  // y docs/marketing-integrations-arquitectura.md §7.
  consentimientosMarketing: Map<string, string>;
  textoConsentimientoVigente: string;
}

export function computeAutomatizacionMktCandidatos(
  { automatizaciones, automationLogs, socios, suscripciones, reservas, citas, consentimientosMarketing, textoConsentimientoVigente }: MktEngineInput,
  now: Date,
): AutomatizacionMktCandidato[] {
  const candidatos: AutomatizacionMktCandidato[] = [];
  const socioById = new Map(socios.map(s => [s.id, s]));

  // Dedup: logs no-fallidos por (automatizacionId|socioId).
  const logsPorKey = new Map<string, AutomationLog[]>();
  for (const l of automationLogs) {
    if (l.resultado === 'FALLIDO') continue;
    // S-2: la clave es automatizacionId, su columna propia. Antes se leía de
    // `ruleId` —donde nunca llegaba nada, porque la FK a automation_rules
    // rechazaba el insert—, así que este mapa quedaba siempre vacío y
    // `yaEnviado` devolvía false en cada ejecución del cron diario.
    if (!l.automatizacionId) continue;
    const k = `${l.automatizacionId}|${l.socioId ?? ''}`;
    const arr = logsPorKey.get(k); if (arr) arr.push(l); else logsPorKey.set(k, [l]);
  }
  const yaEnviado = (autoId: string, socioId: string, ventanaDias: number): boolean =>
    (logsPorKey.get(`${autoId}|${socioId}`) ?? []).some(l => (now.getTime() - new Date(l.ejecutadoEn).getTime()) < ventanaDias * MS_DIA);

  // Suscripción ACTIVA por socia (la primera vigente).
  const susActivaPorSocio = new Map<string, Suscripcion>();
  for (const s of suscripciones) if (s.estado === 'ACTIVA' && !susActivaPorSocio.has(s.socioId)) susActivaPorSocio.set(s.socioId, s);

  // Última asistencia — compartida con automation-engine.ts (misma señal
  // exacta, ver lib/engines/senales-inactividad.ts). Primera asistencia
  // sigue local: solo la usa este motor (PRIMERA_CLASE).
  const ultimaAsistida = ultimaAsistidaPorSocio(reservas);
  const primeraAsistida = new Map<string, string>();
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA') continue;
    const p = primeraAsistida.get(r.socioId);
    if (!p || r.creadoEn < p) primeraAsistida.set(r.socioId, r.creadoEn);
  }

  const hoyMD = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const mananaStr = new Date(now.getTime() + MS_DIA).toISOString().slice(0, 10);
  const diasHasta = (iso: string) => Math.floor((new Date(iso).getTime() - now.getTime()) / MS_DIA);
  const diasDesde = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / MS_DIA);

  const emitir = (a: Automatizacion, socio: Socio, marcaInactividad = false) => {
    const canal: 'EMAIL' | 'WHATSAPP' | 'NOTIFICACION' =
      a.accion === 'WHATSAPP' ? 'WHATSAPP' : a.accion === 'NOTIFICACION' ? 'NOTIFICACION' : 'EMAIL';
    // Sin el dato de contacto del canal no hay envío (email para EMAIL, teléfono
    // para WhatsApp). NOTIFICACION no toca a la socia, no necesita contacto.
    if (canal === 'EMAIL' && !socio.email) return;
    if (canal === 'WHATSAPP' && !(socio.telefono && socio.telefono.trim())) return;
    // NOTIFICACION es un aviso interno para el equipo, nunca toca a la socia
    // — no necesita su consentimiento de marketing. EMAIL/WHATSAPP sí.
    if (canal !== 'NOTIFICACION' && !tieneConsentimientoMarketingVigente(consentimientosMarketing.get(socio.id), textoConsentimientoVigente)) return;
    if (yaEnviado(a.id, socio.id, DEDUP_DIAS[a.trigger] ?? 14)) return;
    // Dedup CRUZADO con AUSENCIA_DIAS (motor clásico): solo aplica a
    // INACTIVIDAD_30D (marcaInactividad=true) — ver
    // docs/marketing-solape-motores-diseno.md §2.
    if (marcaInactividad && huboAvisoInactividadReciente(automationLogs, socio.id, now)) return;
    candidatos.push({ automatizacion: a, socio, canal, asunto: personalizar(a.asunto, socio), mensaje: personalizar(a.mensaje, socio), marcaInactividad });
  };

  for (const a of automatizaciones.filter(x => x.activa && (x.accion === 'EMAIL' || x.accion === 'WHATSAPP' || x.accion === 'NOTIFICACION'))) {
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
        for (const [socioId, fecha] of ultimaAsistida) if (diasDesde(fecha) >= DEDUP_DIAS.INACTIVIDAD_30D) { const s = socioById.get(socioId); if (s?.activo) emitir(a, s, true); }
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
