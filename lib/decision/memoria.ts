// Memory Engine (DECISION-OS-NUCLEO.md §3). Tres semánticas sobre las
// candidatas ya emitidas: VETO (suprime), AJUSTE DE CANAL (transforma la
// acción sin cambiar el diagnóstico) y ESCRITURA AUTOMÁTICA (nuevos hechos
// deterministas con evidencia). La memoria nunca sube prioridad ni confianza
// — solo veta o ajusta.
import type { Candidata, ClaveMemoria, HechoMemoria, MemoriaEstudio, Recomendacion, SnapshotEstudio } from './tipos.ts';
import type { IndicesSenal } from './senales.ts';
import { emailsSinRespuesta } from './senales.ts';

export type NuevoHechoMemoria = Omit<HechoMemoria, 'id'>;

const MS_DIA = 86400000;

export function hechoActivo(memoria: MemoriaEstudio, socioId: string, clave: ClaveMemoria, now: Date): HechoMemoria | null {
  const hechos = memoria.get(socioId) ?? [];
  return hechos.find(h => h.clave === clave && h.activa && (h.expiraEn === null || new Date(h.expiraEn) > now)) ?? null;
}

export function tieneHechoActivo(memoria: MemoriaEstudio, socioId: string, clave: ClaveMemoria, now: Date): boolean {
  return hechoActivo(memoria, socioId, clave, now) !== null;
}

export function canalPreferido(memoria: MemoriaEstudio, socioId: string, now: Date): 'WHATSAPP' | 'LLAMADA' | 'EMAIL' | null {
  if (tieneHechoActivo(memoria, socioId, 'PREFIERE_WHATSAPP', now)) return 'WHATSAPP';
  if (tieneHechoActivo(memoria, socioId, 'PREFIERE_LLAMADA', now)) return 'LLAMADA';
  if (tieneHechoActivo(memoria, socioId, 'PREFIERE_EMAIL', now)) return 'EMAIL';
  return null;
}

function degradarReactivacionAContacto(c: Candidata): Candidata {
  const nombre = typeof c.datosUsados.nombre === 'string' ? c.datosUsados.nombre : 'la socia';
  return {
    ...c,
    tipo: 'RECUPERAR_SOCIA',
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: c.motivoMotor },
    dedupeKey: c.dedupeKey.replace('ENVIAR_REACTIVACION', 'RECUPERAR_SOCIA'),
    tituloMotor: `¿Contactamos con ${nombre} sin oferta?`,
    motivoMotor: `${c.motivoMotor} No le ofrecemos descuento — así lo pediste.`,
  };
}

/**
 * Aplica veto y ajuste de canal a una lista de candidatas ya emitidas por los
 * especialistas (Núcleo §0, paso 3). Las candidatas sin socioId (insights de
 * negocio, p.ej. ABRIR_SESION) pasan intactas — la memoria es por cliente.
 */
export function aplicarMemoria(candidatas: Candidata[], memoria: MemoriaEstudio, now: Date): Candidata[] {
  const resultado: Candidata[] = [];

  for (const original of candidatas) {
    if (!original.socioId) { resultado.push(original); continue; }
    const socioId = original.socioId;
    let candidata = original;

    // VETO: NO_CONTACTAR_HASTA suprime cualquier contacto directo.
    if (
      (candidata.accion.tipo === 'CONTACTO_MANUAL' || candidata.accion.tipo === 'ENVIAR_EMAIL') &&
      tieneHechoActivo(memoria, socioId, 'NO_CONTACTAR_HASTA', now)
    ) {
      continue;
    }

    // VETO + DEGRADACIÓN: NO_OFRECER_DESCUENTOS convierte la reactivación en contacto simple.
    if (candidata.tipo === 'ENVIAR_REACTIVACION' && tieneHechoActivo(memoria, socioId, 'NO_OFRECER_DESCUENTOS', now)) {
      candidata = degradarReactivacionAContacto(candidata);
    }

    // AJUSTE DE CANAL para contacto manual.
    if (candidata.accion.tipo === 'CONTACTO_MANUAL') {
      const canal = canalPreferido(memoria, socioId, now);
      if (canal === 'WHATSAPP' || canal === 'LLAMADA') {
        candidata = { ...candidata, accion: { ...candidata.accion, canal } };
      }
    } else if (candidata.accion.tipo === 'ENVIAR_EMAIL' && tieneHechoActivo(memoria, socioId, 'NUNCA_RESPONDE_EMAIL', now)) {
      // NUNCA_RESPONDE_EMAIL convierte el email en contacto manual.
      candidata = {
        ...candidata,
        accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: candidata.motivoMotor },
        motivoMotor: `${candidata.motivoMotor} Los últimos emails no obtuvieron respuesta — mejor por WhatsApp.`,
      };
    }

    resultado.push(candidata);
  }

  return resultado;
}

/** REGLA: ≥3 emails sin respuesta en 60d → NUNCA_RESPONDE_EMAIL (nivel MEDIO, 90d). */
export function detectarHechosPorRegla(idx: IndicesSenal, snapshot: SnapshotEstudio, now: Date): NuevoHechoMemoria[] {
  const nuevos: NuevoHechoMemoria[] = [];
  for (const socio of snapshot.socios) {
    const n = emailsSinRespuesta(socio.id, idx, now);
    if (n < 3) continue;
    nuevos.push({
      studioId: snapshot.studioId,
      socioId: socio.id,
      clave: 'NUNCA_RESPONDE_EMAIL',
      valor: { emailsSinRespuesta: n },
      nivel: 'MEDIO',
      confianza: 'MEDIA',
      origen: 'REGLA',
      creadoPor: null,
      evidencia: `${n} emails en los últimos 60 días sin respuesta`,
      activa: true,
      expiraEn: new Date(now.getTime() + 90 * MS_DIA).toISOString(),
    });
  }
  return nuevos;
}

/** FEEDBACK: 2 rechazos de contacto sobre la misma socia en 90d → NO_CONTACTAR_HASTA +60d. */
export function detectarHechosPorFeedback(resueltas90d: Recomendacion[], now: Date): NuevoHechoMemoria[] {
  const rechazosPorSocio = new Map<string, Recomendacion[]>();
  for (const r of resueltas90d) {
    if (r.estado !== 'RECHAZADA' || !r.socioId) continue;
    if (r.accion.tipo !== 'CONTACTO_MANUAL' && r.accion.tipo !== 'ENVIAR_EMAIL') continue;
    const arr = rechazosPorSocio.get(r.socioId) ?? [];
    arr.push(r);
    rechazosPorSocio.set(r.socioId, arr);
  }

  const nuevos: NuevoHechoMemoria[] = [];
  for (const [socioId, rechazos] of rechazosPorSocio) {
    if (rechazos.length < 2) continue;
    const fechas = rechazos
      .map(r => r.resueltoEn)
      .filter((f): f is string => !!f)
      .sort();
    const hasta = new Date(now.getTime() + 60 * MS_DIA).toISOString();
    nuevos.push({
      studioId: rechazos[0].studioId,
      socioId,
      clave: 'NO_CONTACTAR_HASTA',
      valor: { hasta },
      nivel: 'MEDIO',
      confianza: 'ALTA',
      origen: 'FEEDBACK',
      creadoPor: null,
      evidencia: `rechazaste contactarla el ${fechas[0]?.slice(0, 10)} y el ${fechas[1]?.slice(0, 10)}`,
      activa: true,
      expiraEn: hasta,
    });
  }
  return nuevos;
}
