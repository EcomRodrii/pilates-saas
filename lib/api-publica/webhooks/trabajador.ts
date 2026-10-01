import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { mapLimit } from '@/lib/concurrency';
import { clavesDelEntorno } from '@/lib/integraciones/cifrado-credenciales';
import { accesoVigente, apiActivada, type AccesoVigente } from '../servidor';
import { scopesEfectivos } from '../scopes';
import { esTipoEvento, scopeDeTipo, TABLA_DE_RECURSO, type RecursoEvento } from './catalogo';
import { COLUMNAS_EVENTO, eventoPublico, serializarRecurso, type FilaEvento } from './evento';
import { CABECERA_FIRMA, firmar } from './firma';
import { validarUrlWebhook } from './destino';
import { USER_AGENT, enviarWebhook, type ResultadoEnvio } from './envio';
import { decidirTrasIntento, describirFallo, esExito } from './reintentos';
import { porQueSeDesactivo, saludTrasIntento } from './salud';
import { emitirAvisoWebhook } from '@/lib/notifications/emit';
import { cifrarSecretoWebhook, descifrarSecretoWebhook, secretoPideRecifrarse, secretosVigentes } from './secretos';

// ─────────────────────────────────────────────────────────────────────────────
// El trabajador de los webhooks. Lo llama el cron `api-webhooks` (pg_cron, cada
// minuto, y SOLO si hay algo que hacer: migr 20261001162731).
//
//   1. procesarEventos: escribe la forma pública (`datos`) de cada evento nuevo
//      con el mismo serializador que la API y crea sus entregas.
//   2. entregarPendientes: manda las entregas que tocan, firmadas, y apunta el
//      resultado (reintento con espera, entregada o fallida).
//
// Antes de mandar nada se vuelve a comprobar lo mismo que comprueba la API en
// cada petición: el estudio tiene acceso y la API activada, y quien creó el
// webhook sigue en el estudio con un rol que puede ver ese dato. Si no, la
// entrega se descarta: un webhook nunca cuenta más de lo que su dueña podría
// leer hoy.
// ─────────────────────────────────────────────────────────────────────────────

const LIMITE_EVENTOS = 200;
const LIMITE_ENTREGAS = 30;
const WEBHOOKS_EN_PARALELO = 6;
const TROZO_IN = 100;
/** Un destino que acaba de fallar no recibe más en esta pasada: lo suyo espera 5 min sin gastar intento. */
const ESPERA_DESTINO_CAIDO_MS = 5 * 60_000;

export interface ResumenEventos { procesados: number; entregasCreadas: number }

export async function procesarEventos(admin: SupabaseClient): Promise<ResumenEventos> {
  const { data: eventos, error } = await admin.rpc('api_eventos_reclamar', { p_limite: LIMITE_EVENTOS });
  if (error) throw new Error(`api_eventos_reclamar: ${error.message}`);
  const lista = (eventos ?? []) as Array<{ id: string; studio_id: string; tipo: string; recurso: RecursoEvento; recurso_id: string }>;
  if (lista.length === 0) return { procesados: 0, entregasCreadas: 0 };

  // Una consulta por recurso (en trozos), no una por evento.
  const filas = new Map<string, Record<string, unknown>>();
  const porRecurso = new Map<RecursoEvento, string[]>();
  for (const e of lista) {
    if (e.tipo.endsWith('.eliminado') || e.tipo.endsWith('.eliminada')) continue;
    const ids = porRecurso.get(e.recurso) ?? [];
    if (!ids.includes(e.recurso_id)) ids.push(e.recurso_id);
    porRecurso.set(e.recurso, ids);
  }
  for (const [recurso, ids] of porRecurso) {
    for (let i = 0; i < ids.length; i += TROZO_IN) {
      const trozo = ids.slice(i, i + TROZO_IN);
      const { data, error: errLectura } = await admin
        .from(TABLA_DE_RECURSO[recurso]).select(COLUMNAS_EVENTO[recurso]).in('id', trozo);
      // Sin poder leer, mejor no procesar: el plazo de la reclamación vence y
      // el siguiente minuto lo vuelve a intentar.
      if (errLectura) throw new Error(`leer ${recurso}: ${errLectura.message}`);
      for (const f of (data ?? []) as unknown as Record<string, unknown>[]) filas.set(`${recurso}:${f.id as string}`, f);
    }
  }

  const salida = lista.map((e) => {
    const fila = filas.get(`${e.recurso}:${e.recurso_id}`);
    // La fila tiene que ser del estudio del evento: nunca se cuela un dato de otro.
    const datos = fila && fila.studio_id === e.studio_id ? serializarRecurso(e.recurso, fila) : null;
    return { id: e.id, datos };
  });
  const { data: creadas, error: errGuardar } = await admin.rpc('api_eventos_guardar', { p_eventos: salida });
  if (errGuardar) throw new Error(`api_eventos_guardar: ${errGuardar.message}`);
  return { procesados: lista.length, entregasCreadas: (creadas as number | null) ?? 0 };
}

interface FilaWebhook {
  id: string; studio_id: string; url: string; descripcion: string | null; tipos: string[]; creado_por: string;
  secreto_cifrado: string; secreto_anterior_cifrado: string | null; secreto_anterior_expira_en: string | null;
  desactivado_en: string | null; fallando_desde: string | null; aviso_fallando_en: string | null;
}
const COLUMNAS_WEBHOOK = 'id, studio_id, url, descripcion, tipos, creado_por, secreto_cifrado, secreto_anterior_cifrado, secreto_anterior_expira_en, desactivado_en, fallando_desde, aviso_fallando_en';

export interface ResumenEntregas { reclamadas: number; intentadas: number; entregadas: number; reintentos: number; fallidas: number; descartadas: number; aplazadas: number }

export async function entregarPendientes(admin: SupabaseClient, presupuestoMs: number): Promise<ResumenEntregas> {
  const inicio = Date.now();
  const resumen: ResumenEntregas = { reclamadas: 0, intentadas: 0, entregadas: 0, reintentos: 0, fallidas: 0, descartadas: 0, aplazadas: 0 };

  const { data: reclamadas, error } = await admin.rpc('api_webhooks_reclamar_entregas', { p_limite: LIMITE_ENTREGAS });
  if (error) throw new Error(`api_webhooks_reclamar_entregas: ${error.message}`);
  const entregas = (reclamadas ?? []) as Array<{ id: string; webhook_id: string; evento_id: string; intentos: number }>;
  resumen.reclamadas = entregas.length;
  if (entregas.length === 0) return resumen;

  const idsWebhook = [...new Set(entregas.map((e) => e.webhook_id))];
  const idsEvento = [...new Set(entregas.map((e) => e.evento_id))];
  const [{ data: webhooks, error: e1 }, { data: eventos, error: e2 }] = await Promise.all([
    admin.from('api_webhooks').select(COLUMNAS_WEBHOOK).in('id', idsWebhook),
    admin.from('api_eventos').select('id, studio_id, tipo, recurso, recurso_id, creado_en, datos').in('id', idsEvento),
  ]);
  if (e1 || e2) throw new Error(`leer webhooks/eventos: ${(e1 ?? e2)!.message}`);
  const webhookPorId = new Map(((webhooks ?? []) as FilaWebhook[]).map((w) => [w.id, w]));
  const eventoPorId = new Map(((eventos ?? []) as FilaEvento[]).map((e) => [e.id, e]));

  // Acceso por (estudio, dueña del webhook) y API activada por estudio: una
  // consulta por par, no por entrega.
  const accesos = new Map<string, Promise<AccesoVigente>>();
  const activadas = new Map<string, Promise<boolean>>();
  const acceso = (w: FilaWebhook) => {
    const k = `${w.studio_id}:${w.creado_por}`;
    if (!accesos.has(k)) accesos.set(k, accesoVigente(admin, w.studio_id, w.creado_por));
    return accesos.get(k)!;
  };
  const activada = (studioId: string) => {
    if (!activadas.has(studioId)) activadas.set(studioId, apiActivada(admin, studioId));
    return activadas.get(studioId)!;
  };

  const claves = clavesDelEntorno();
  const porWebhook = new Map<string, typeof entregas>();
  for (const e of entregas) porWebhook.set(e.webhook_id, [...(porWebhook.get(e.webhook_id) ?? []), e]);

  await mapLimit([...porWebhook.entries()], WEBHOOKS_EN_PARALELO, async ([webhookId, suyas]) => {
    try {
      await entregarAUnWebhook(admin, webhookPorId.get(webhookId) ?? null, suyas, eventoPorId, {
        acceso, activada, claves, inicio, presupuestoMs, resumen,
      });
    } catch (err) {
      // Un webhook que falla por un error nuestro no para a los demás; sus
      // entregas vuelven solas a la cola cuando vence la reclamación.
      Sentry.captureException(err, { tags: { cron: 'api-webhooks', webhook: webhookId } });
    }
  });
  return resumen;
}

async function entregarAUnWebhook(
  admin: SupabaseClient,
  w: FilaWebhook | null,
  entregas: Array<{ id: string; webhook_id: string; evento_id: string; intentos: number }>,
  eventoPorId: Map<string, FilaEvento>,
  ctx: {
    acceso: (w: FilaWebhook) => Promise<AccesoVigente>;
    activada: (studioId: string) => Promise<boolean>;
    claves: ReturnType<typeof clavesDelEntorno>;
    inicio: number; presupuestoMs: number; resumen: ResumenEntregas;
  },
) {
  const descartar = async (ids: string[], motivo: string) => {
    if (ids.length === 0) return;
    await admin.from('api_webhook_entregas')
      .update({ estado: 'DESCARTADA', ultimo_error: motivo.slice(0, 300) })
      .in('id', ids).eq('estado', 'PENDIENTE');
    ctx.resumen.descartadas += ids.length;
  };
  const aplazar = async (ids: string[], ms: number) => {
    if (ids.length === 0) return;
    await admin.from('api_webhook_entregas')
      .update({ proximo_intento_en: new Date(Date.now() + ms).toISOString() })
      .in('id', ids).eq('estado', 'PENDIENTE');
    ctx.resumen.aplazadas += ids.length;
  };
  const todas = entregas.map((e) => e.id);

  if (!w || w.desactivado_en) return descartar(todas, 'El webhook está desactivado.');
  if (!(await ctx.activada(w.studio_id))) return descartar(todas, 'La API no está activada para el estudio.');
  const acc = await ctx.acceso(w);
  if (!acc.ok) {
    return descartar(todas, acc.motivo === 'sin_rol'
      ? 'Quien creó el webhook ya no forma parte del estudio.'
      : 'El estudio no tiene acceso a Tentare ahora mismo.');
  }
  const url = validarUrlWebhook(w.url);
  if (!url.ok) return descartar(todas, url.error);
  const secretos = secretosVigentes(w, ctx.claves, new Date());
  if (!secretos) {
    // Problema NUESTRO (la clave de cifrado), no del destino: no se gasta
    // intento ni se descarta nada; se reintenta en 30 min y se avisa.
    Sentry.captureMessage('api-webhooks: no se puede descifrar el secreto de un webhook', { level: 'error', tags: { webhook: w.id } });
    return aplazar(todas, 30 * 60_000);
  }
  const permitidos = scopesEfectivos({ credencial: [...new Set(w.tipos.filter(esTipoEvento).map(scopeDeTipo))], rolDeQuienConcedio: acc.rol, plan: acc.plan });

  let destinoCaido = false;
  for (let i = 0; i < entregas.length; i++) {
    const entrega = entregas[i];
    const restantes = entregas.slice(i).map((e) => e.id);
    if (Date.now() - ctx.inicio > ctx.presupuestoMs) return aplazar(restantes, 0);
    if (destinoCaido) return aplazar(restantes, ESPERA_DESTINO_CAIDO_MS);

    const evento = eventoPorId.get(entrega.evento_id);
    if (!evento || evento.studio_id !== w.studio_id || !esTipoEvento(evento.tipo)) {
      await descartar([entrega.id], 'El evento ya no existe.');
      continue;
    }
    if (!w.tipos.includes(evento.tipo)) {
      await descartar([entrega.id], 'El webhook ya no está suscrito a este tipo de evento.');
      continue;
    }
    if (!permitidos.includes(scopeDeTipo(evento.tipo))) {
      await descartar([entrega.id], 'Quien creó el webhook ya no puede ver este dato.');
      continue;
    }

    const intento = entrega.intentos + 1;
    const cuerpo = JSON.stringify(eventoPublico(evento));
    const resultado = await enviarWebhook(url.url, cuerpo, {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'Tentare-Evento-Id': evento.id,
      'Tentare-Evento-Tipo': evento.tipo,
      'Tentare-Entrega-Id': entrega.id,
      'Tentare-Intento': String(intento),
      [CABECERA_FIRMA]: firmar(cuerpo, secretos),
    });
    ctx.resumen.intentadas++;
    const ahora = new Date();
    const { decision, efecto } = decidirTrasIntento(resultado, intento, ahora);
    await apuntarResultado(admin, entrega.id, intento, resultado, decision, ahora);
    if (decision.estado === 'ENTREGADA') ctx.resumen.entregadas++;
    else if (decision.estado === 'PENDIENTE') ctx.resumen.reintentos++;
    else ctx.resumen.fallidas++;

    // Si se desactiva, apuntarSaludDelWebhook ya descarta todo lo pendiente suyo.
    if (await apuntarSaludDelWebhook(admin, w, resultado, efecto, ahora)) return;
    if (!esExito(resultado)) destinoCaido = true;
  }
}

async function apuntarResultado(
  admin: SupabaseClient, id: string, intento: number, r: ResultadoEnvio,
  decision: ReturnType<typeof decidirTrasIntento>['decision'], ahora: Date,
) {
  const comun = {
    intentos: intento,
    ultimo_intento_en: ahora.toISOString(),
    ultimo_estado_http: r.tipo === 'respuesta' ? r.estadoHttp : null,
    ultimo_error: describirFallo(r),
    duracion_ms: r.duracionMs,
  };
  const cambios = decision.estado === 'ENTREGADA'
    ? { ...comun, estado: 'ENTREGADA', entregada_en: ahora.toISOString() }
    : decision.estado === 'PENDIENTE'
      ? { ...comun, estado: 'PENDIENTE', proximo_intento_en: decision.proximoIntentoEn.toISOString() }
      : { ...comun, estado: 'FALLIDA' };
  const { error } = await admin.from('api_webhook_entregas').update(cambios).eq('id', id);
  if (error) Sentry.captureException(new Error(`apuntar entrega: ${error.message}`), { tags: { cron: 'api-webhooks' } });
}

/**
 * Apunta la salud del webhook tras un intento y, si toca, se lo cuenta a la
 * propietaria (salud.ts decide qué). Devuelve `true` si ha quedado desactivado.
 *
 * Cada aviso sale solo si ESTA pasada es la que cambia el estado (escritura
 * condicionada): dos pasadas del trabajador a la vez no avisan dos veces. Y la
 * clave de deduplicación lleva el inicio de la racha, por si acaso.
 */
async function apuntarSaludDelWebhook(
  admin: SupabaseClient, w: FilaWebhook, r: ResultadoEnvio,
  efecto: ReturnType<typeof decidirTrasIntento>['efecto'], ahora: Date,
): Promise<boolean> {
  const base = {
    ultimo_intento_en: ahora.toISOString(),
    ultimo_estado_http: r.tipo === 'respuesta' ? r.estadoHttp : null,
    ultimo_error: describirFallo(r),
  };
  const s = saludTrasIntento({ fallandoDesde: w.fallando_desde, avisoFallandoEn: w.aviso_fallando_en }, r, efecto, ahora);
  const racha = w.fallando_desde ?? s.fallandoDesde ?? ahora.toISOString();
  const avisar = (aviso: 'fallando' | 'desactivado' | 'recuperado', motivo?: string) => emitirAvisoWebhook({
    studioId: w.studio_id, webhookId: w.id, aviso, nombre: nombreDelWebhook(w), momento: racha,
    error: describirFallo(r), motivo,
  });

  if (esExito(r)) {
    if (s.aviso === 'recuperado') {
      const { data } = await admin.from('api_webhooks').update({ aviso_fallando_en: null })
        .eq('id', w.id).not('aviso_fallando_en', 'is', null).select('id');
      if (data?.length) await avisar('recuperado');
    }
    w.fallando_desde = null;
    w.aviso_fallando_en = null;
    await admin.from('api_webhooks').update({ ...base, ultimo_exito_en: ahora.toISOString(), fallando_desde: null, aviso_fallando_en: null }).eq('id', w.id);
    return false;
  }

  await admin.from('api_webhooks').update({ ...base, fallando_desde: s.fallandoDesde }).eq('id', w.id).is('desactivado_en', null);
  w.fallando_desde = s.fallandoDesde;

  if (s.desactivar) {
    const { data } = await admin.from('api_webhooks')
      .update({ desactivado_en: ahora.toISOString(), desactivado_motivo: s.desactivar })
      .eq('id', w.id).is('desactivado_en', null).select('id');
    // Lo que quedaba pendiente de este webhook ya no se va a mandar.
    await admin.from('api_webhook_entregas')
      .update({ estado: 'DESCARTADA', ultimo_error: 'El webhook se ha desactivado.' })
      .eq('webhook_id', w.id).eq('estado', 'PENDIENTE');
    if (data?.length) await avisar('desactivado', porQueSeDesactivo(s.desactivar));
    return true;
  }
  if (s.aviso === 'fallando') {
    const { data } = await admin.from('api_webhooks').update({ aviso_fallando_en: s.avisoFallandoEn })
      .eq('id', w.id).is('aviso_fallando_en', null).is('desactivado_en', null).select('id');
    w.aviso_fallando_en = s.avisoFallandoEn;
    if (data?.length) await avisar('fallando');
  }
  return false;
}

/** Cómo lo llama la propietaria: su descripción o, sin ella, el dominio. */
function nombreDelWebhook(w: { descripcion: string | null; url: string }): string {
  if (w.descripcion) return w.descripcion;
  try { return new URL(w.url).hostname; } catch { return 'Tu webhook'; }
}

/**
 * Barrido nocturno (cron de copias, junto a las credenciales de las
 * integraciones): vuelve a cifrar con la clave ACTUAL los secretos cifrados con
 * la anterior. Sin esto, al retirar `INTEGRACIONES_CLAVE_CIFRADO_ANTERIOR` tras
 * una rotación, esos webhooks dejarían de poder firmar. Compare-and-set sobre el
 * valor leído: un rotado entretanto no se pisa.
 */
export async function recifrarSecretosWebhooks(admin: SupabaseClient, limite = 25): Promise<{ recifrados: number; fallidos: number }> {
  const claves = clavesDelEntorno();
  if (!claves.actual) return { recifrados: 0, fallidos: 0 };
  const { data, error } = await admin.from('api_webhooks')
    .select('id, studio_id, secreto_cifrado, secreto_anterior_cifrado').order('id').limit(2000);
  if (error) return { recifrados: 0, fallidos: 1 };
  let recifrados = 0;
  let fallidos = 0;
  type Fila = { id: string; studio_id: string; secreto_cifrado: string; secreto_anterior_cifrado: string | null };
  const pendientes = ((data ?? []) as Fila[]).filter((f) =>
    secretoPideRecifrarse(f.secreto_cifrado, claves)
    || (f.secreto_anterior_cifrado !== null && secretoPideRecifrarse(f.secreto_anterior_cifrado, claves)));
  for (const f of pendientes.slice(0, limite)) {
    const recifrar = (valor: string | null) => {
      if (valor === null || !secretoPideRecifrarse(valor, claves)) return valor;
      const claro = descifrarSecretoWebhook(valor, f.studio_id, f.id, claves);
      return claro ? cifrarSecretoWebhook(claro, f.studio_id, f.id, claves) : null;
    };
    const nuevo = recifrar(f.secreto_cifrado);
    const anterior = recifrar(f.secreto_anterior_cifrado);
    if (!nuevo) { fallidos++; continue; }
    let q = admin.from('api_webhooks').update({ secreto_cifrado: nuevo, secreto_anterior_cifrado: anterior })
      .eq('id', f.id).eq('secreto_cifrado', f.secreto_cifrado);
    q = f.secreto_anterior_cifrado === null ? q.is('secreto_anterior_cifrado', null) : q.eq('secreto_anterior_cifrado', f.secreto_anterior_cifrado);
    const { error: e } = await q;
    if (e) fallidos++; else recifrados++;
  }
  return { recifrados, fallidos };
}
