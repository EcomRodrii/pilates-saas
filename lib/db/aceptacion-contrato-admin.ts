import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientIp } from '@/lib/rate-limit';
import { secretoRateLimit } from '@/lib/rate-limit-core';
import { hashTextoLegal } from '@/lib/legal-hash';
import { componerTextoLegalVigente } from '@/lib/legal-sellado';
import {
  huellaIp, truncarUserAgent, resultadoAceptacion, rpcNoDesplegada, type ResultadoAceptacion,
} from '@/lib/aceptacion-contrato';

// Registro de la aceptación del contrato de la socia, EN SERVIDOR (plan RGPD
// 3.17). Lo usan las dos puertas que la escriben: la de la propia socia
// (`/api/public/socio`, origen PORTAL) y la de mostrador
// (`/api/socios/[id]/aceptacion-contrato`, origen MOSTRADOR).
//
// Del navegador solo se acepta la FIRMA tecleada. La fecha la pone la RPC
// (`now()`), el origen lo decide la ruta, el texto se compone aquí con los
// datos del estudio, y la IP se guarda como HMAC con el secreto del limitador
// (`RATE_LIMIT_HMAC_SECRET`, o la service-role si no está), nunca en claro.

export { componerTextoLegalVigente as textoContratoVigente };

export interface EvidenciaPeticion { ipHmac: string | null; userAgent: string | null }

export function evidenciaDePeticion(req: Request): EvidenciaPeticion {
  return {
    ipHmac: huellaIp(clientIp(req), secretoRateLimit(process.env)),
    userAgent: truncarUserAgent(req.headers.get('user-agent')),
  };
}

export type ResultadoRegistroAceptacion = ResultadoAceptacion & { causa?: unknown };

export async function registrarAceptacionContrato(admin: SupabaseClient, p: {
  studioId: string;
  socioId: string;
  origen: 'PORTAL' | 'MOSTRADOR';
  /** Ya normalizada (`normalizarFirma`). */
  firma: string;
  /** El texto compuesto en servidor (`textoContratoVigente`). */
  texto: string;
  /** El que traía el navegador, solo para anotar si coincidía. Nunca se guarda. */
  textoCliente?: unknown;
  /** Solo MOSTRADOR: quién del estudio la introdujo. */
  introducidaPor?: string | null;
  actorUid: string | null;
  actorRol: string;
  evidencia: EvidenciaPeticion;
}): Promise<ResultadoRegistroAceptacion> {
  const hash = hashTextoLegal(p.texto);
  const coincide = typeof p.textoCliente === 'string' && p.textoCliente.trim()
    ? hashTextoLegal(p.textoCliente) === hash
    : null;

  const { data, error } = await admin.rpc('aceptacion_contrato_registrar', {
    p_studio_id: p.studioId,
    p_socio_id: p.socioId,
    p_origen: p.origen,
    p_texto: p.texto,
    p_texto_hash: hash,
    p_texto_cliente_coincide: coincide,
    p_firma: p.firma,
    p_introducida_por: p.origen === 'MOSTRADOR' ? (p.introducidaPor ?? null) : null,
    p_actor_uid: p.actorUid,
    p_actor_rol: p.actorRol,
    p_ip_hmac: p.evidencia.ipHmac,
    p_user_agent: p.evidencia.userAgent,
  });

  if (error && rpcNoDesplegada(error)) {
    // Código desplegado antes que la migración 20260914015133: se escriben las
    // columnas con los valores del SERVIDOR, sin historial, y se deja rastro en
    // los logs. En cuanto la migración esté aplicada, esta rama no se pisa.
    console.error('[aceptacion-contrato] RPC sin desplegar: se guarda sin historial', { code: error.code });
    const { error: e2 } = await admin.from('socios').update({
      aceptacion_fecha: new Date().toISOString(),
      aceptacion_firma: p.firma,
      aceptacion_version: p.texto,
      aceptacion_origen: p.origen,
      aceptacion_por: p.origen === 'MOSTRADOR' ? (p.introducidaPor ?? null) : null,
    }).eq('id', p.socioId).eq('studio_id', p.studioId).is('borrado_en', null);
    if (e2) return { ...resultadoAceptacion(null), causa: e2 };
    return { ok: true, cambiado: true };
  }
  if (error) return { ...resultadoAceptacion(null), causa: error };
  return resultadoAceptacion(data);
}
