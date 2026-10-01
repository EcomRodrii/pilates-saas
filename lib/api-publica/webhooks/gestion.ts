import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@/lib/utils';
import { clavesDelEntorno } from '@/lib/integraciones/cifrado-credenciales';
import { exigirGestorApi, type Gestor } from '../gestion';
import { accesoVigente } from '../servidor';
import { tiposPermitidos, type TipoEvento } from './catalogo';
import { comprobarResolucionPublica, validarUrlWebhook } from './destino';
import { CABECERA_FIRMA, firmar, generarSecretoWebhook } from './firma';
import { USER_AGENT, enviarWebhook, type ResultadoEnvio } from './envio';
import { cifrarSecretoWebhook, secretosVigentes } from './secretos';
import { describirFallo, esExito } from './reintentos';
import { COLUMNAS_WEBHOOK_PANEL, HORAS_SOLAPE_SECRETO, webhookPanel, type FilaWebhookPanel } from './gestion-reglas';
import { VERSION_EVENTOS } from './evento';
import type { NextRequest } from 'next/server';

// Lo que comparten las rutas del panel de webhooks
// (/api/integrations/api-publica/webhooks/*). La cerradura es la misma que la de
// las claves (`exigirGestorApi`: solo PROPIETARIO) y, además, la API activada.

export type GestorWebhooks = Extract<Gestor, { ok: true }> & {
  tipos: TipoEvento[];
  /**
   * El estudio tiene acceso a Tentare hoy (no suspendido, con suscripción): lo
   * que exige el trabajador antes de mandar nada. Sin él no se crea, prueba,
   * reactiva ni reenvía: si no, un estudio suspendido podría seguir haciendo que
   * Tentare llame a direcciones de fuera.
   */
  conAcceso: boolean;
};

export async function exigirGestorWebhooks(req: NextRequest): Promise<{ ok: true; g: GestorWebhooks } | { ok: false; status: number; error: string }> {
  const g = await exigirGestorApi(req);
  if (!g.ok) return g;
  const acceso = await accesoVigente(g.admin, g.studioId, g.userId);
  return { ok: true, g: { ...g, tipos: tiposPermitidos(g.permitidos), conAcceso: acceso.ok } };
}

export const SIN_ACCESO = 'Tu estudio no tiene acceso a Tentare ahora mismo: no se pueden mandar avisos.';

export async function listarWebhooks(admin: SupabaseClient, studioId: string) {
  const { data, error } = await admin.from('api_webhooks').select(COLUMNAS_WEBHOOK_PANEL)
    .eq('studio_id', studioId).is('borrado_en', null).order('creado_en', { ascending: false }).limit(50);
  if (error) return null;
  const ahora = new Date();
  return ((data ?? []) as FilaWebhookPanel[]).map((f) => webhookPanel(f, ahora));
}

export async function webhookDelEstudio(admin: SupabaseClient, studioId: string, id: string) {
  if (!/^[0-9A-Za-z_-]{1,80}$/.test(id)) return null;
  const { data } = await admin.from('api_webhooks')
    .select(`${COLUMNAS_WEBHOOK_PANEL}, studio_id, secreto_cifrado, secreto_anterior_cifrado`)
    .eq('id', id).eq('studio_id', studioId).is('borrado_en', null).maybeSingle();
  return data as (FilaWebhookPanel & { studio_id: string; secreto_cifrado: string; secreto_anterior_cifrado: string | null }) | null;
}

/** Comprobación de red al guardar: el dominio existe y solo apunta a direcciones públicas. */
export async function comprobarDestino(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return comprobarResolucionPublica(new URL(url));
}

export type CreacionWebhook =
  | { ok: true; id: string; secreto: string }
  | { ok: false; status: number; error: string };

export async function crearWebhook(
  g: GestorWebhooks, datos: { url: string; descripcion: string | null; tipos: TipoEvento[] },
): Promise<CreacionWebhook> {
  const claves = clavesDelEntorno();
  const id = `whk-${uid()}`;
  const secreto = generarSecretoWebhook();
  const cifrado = cifrarSecretoWebhook(secreto, g.studioId, id, claves);
  // Sin clave de cifrado no hay webhook: el secreto no se guarda en claro nunca.
  if (!cifrado) return { ok: false, status: 503, error: 'Ahora mismo no se pueden crear webhooks. Escríbenos y lo revisamos.' };
  const { error } = await g.admin.from('api_webhooks').insert({
    id, studio_id: g.studioId, url: datos.url, descripcion: datos.descripcion, tipos: datos.tipos,
    secreto_cifrado: cifrado, creado_por: g.userId,
  });
  if (error) return { ok: false, status: 500, error: 'No se pudo crear el webhook.' };
  return { ok: true, id, secreto };
}

/** Rota el secreto: el nuevo firma desde ya y el anterior sigue firmando 24 h. */
export async function rotarSecreto(g: GestorWebhooks, id: string): Promise<CreacionWebhook> {
  const w = await webhookDelEstudio(g.admin, g.studioId, id);
  if (!w) return { ok: false, status: 404, error: 'Webhook no encontrado' };
  const claves = clavesDelEntorno();
  const secreto = generarSecretoWebhook();
  const cifrado = cifrarSecretoWebhook(secreto, g.studioId, id, claves);
  if (!cifrado) return { ok: false, status: 503, error: 'Ahora mismo no se puede cambiar el secreto. Escríbenos y lo revisamos.' };
  const { error } = await g.admin.from('api_webhooks').update({
    secreto_cifrado: cifrado,
    secreto_anterior_cifrado: w.secreto_cifrado,
    secreto_anterior_expira_en: new Date(Date.now() + HORAS_SOLAPE_SECRETO * 3_600_000).toISOString(),
    actualizado_en: new Date().toISOString(), actualizado_por: g.userId,
  }).eq('id', id).eq('studio_id', g.studioId).is('borrado_en', null);
  if (error) return { ok: false, status: 500, error: 'No se pudo cambiar el secreto.' };
  return { ok: true, id, secreto };
}

export type ResultadoPrueba = { ok: boolean; estadoHttp: number | null; error: string | null; duracionMs: number };

/**
 * Manda un aviso de prueba (`webhook.prueba`) ahora mismo, firmado como los de
 * verdad. No se guarda en el registro ni cuenta para la salud del webhook.
 */
export async function probarWebhook(g: GestorWebhooks, id: string): Promise<{ ok: true; resultado: ResultadoPrueba } | { ok: false; status: number; error: string }> {
  const w = await webhookDelEstudio(g.admin, g.studioId, id);
  if (!w) return { ok: false, status: 404, error: 'Webhook no encontrado' };
  const url = validarUrlWebhook(w.url);
  if (!url.ok) return { ok: true, resultado: { ok: false, estadoHttp: null, error: url.error, duracionMs: 0 } };
  const comprobado = await comprobarResolucionPublica(url.url);
  if (!comprobado.ok) return { ok: true, resultado: { ok: false, estadoHttp: null, error: comprobado.error, duracionMs: 0 } };
  const secretos = secretosVigentes(w, clavesDelEntorno(), new Date());
  if (!secretos) return { ok: false, status: 503, error: 'Ahora mismo no se puede firmar el aviso. Escríbenos y lo revisamos.' };
  const ahora = new Date().toISOString();
  const evento = {
    id: `evt_prueba_${uid()}`, tipo: 'webhook.prueba', creadoEn: ahora, estudioId: g.studioId,
    recurso: 'webhook', recursoId: w.id, version: VERSION_EVENTOS,
    datos: { mensaje: 'Aviso de prueba desde Tentare. Si lo ves, el webhook funciona.' },
  };
  const cuerpo = JSON.stringify(evento);
  const r: ResultadoEnvio = await enviarWebhook(url.url, cuerpo, {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'Tentare-Evento-Id': evento.id,
    'Tentare-Evento-Tipo': evento.tipo,
    'Tentare-Entrega-Id': `prueba_${uid()}`,
    'Tentare-Intento': '1',
    [CABECERA_FIRMA]: firmar(cuerpo, secretos),
  });
  return {
    ok: true,
    resultado: { ok: esExito(r), estadoHttp: r.tipo === 'respuesta' ? r.estadoHttp : null, error: describirFallo(r), duracionMs: r.duracionMs },
  };
}

export const COLUMNAS_ENTREGA_PANEL = 'id, evento_id, estado, intentos, proximo_intento_en, ultimo_intento_en, ultimo_estado_http, ultimo_error, entregada_en, creada_en, api_eventos(tipo, recurso_id)';

export function entregaPanel(f: Record<string, unknown>) {
  const ev = (Array.isArray(f.api_eventos) ? f.api_eventos[0] : f.api_eventos) as { tipo?: string; recurso_id?: string } | null;
  return {
    id: f.id as string, eventoId: f.evento_id as string, tipo: ev?.tipo ?? null, recursoId: ev?.recurso_id ?? null,
    estado: f.estado as string, intentos: f.intentos as number,
    proximoIntentoEn: f.estado === 'PENDIENTE' ? (f.proximo_intento_en as string) : null,
    ultimoIntentoEn: f.ultimo_intento_en as string | null, ultimoEstadoHttp: f.ultimo_estado_http as number | null,
    ultimoError: f.ultimo_error as string | null, entregadaEn: f.entregada_en as string | null, creadaEn: f.creada_en as string,
  };
}
