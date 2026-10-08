// Tarjeta regalo — operaciones de servidor. Todo pasa por las RPC de la migración
// 20261009120000 (solo `service_role`): la app comprueba rol, captcha, límite y, en la
// compra, que Stripe confirme el cobro; la base de datos decide saldo, caducidad e
// idempotencia con candado de fila. Nunca se calcula un saldo aquí.
import type { SupabaseClient } from '@supabase/supabase-js';
import { huellaCodigo, huellasIguales, pareceCodigo, type AjustesRegalo, AJUSTES_POR_DEFECTO } from './reglas.ts';

export interface TarjetaRegaloFila {
  id: string; importe_inicial: number; origen: string; comprador_nombre: string | null; comprador_email: string | null;
  destinatario_nombre: string | null; destinatario_email: string | null; mensaje: string | null;
  caduca_en: string; estado: string; anulada_motivo: string | null; socio_id: string | null;
  correo_enviado_en: string | null; creada_en: string;
}

export interface TarjetaRegaloVista extends TarjetaRegaloFila { saldo: number; estado_efectivo: string; }

type Admin = SupabaseClient;

export async function leerAjustes(admin: Admin, studioId: string): Promise<AjustesRegalo> {
  const { data } = await admin.from('regalo_ajustes').select('*').eq('studio_id', studioId).maybeSingle();
  if (!data) return AJUSTES_POR_DEFECTO;
  return {
    activo: data.activo === true,
    importesEur: (data.importes_eur as number[]) ?? AJUSTES_POR_DEFECTO.importesEur,
    permiteImporteLibre: data.permite_importe_libre !== false,
    importeMinEur: Number(data.importe_min_eur), importeMaxEur: Number(data.importe_max_eur),
    caducidadMeses: Number(data.caducidad_meses), terminos: (data.terminos as string | null) ?? null,
  };
}

export async function guardarAjustes(admin: Admin, studioId: string, a: AjustesRegalo): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from('regalo_ajustes').upsert({
    studio_id: studioId, activo: a.activo, importes_eur: a.importesEur, permite_importe_libre: a.permiteImporteLibre,
    importe_min_eur: a.importeMinEur, importe_max_eur: a.importeMaxEur, caducidad_meses: a.caducidadMeses,
    terminos: a.terminos, actualizado_en: new Date().toISOString(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface NuevaTarjeta {
  studioId: string; origen: 'ONLINE' | 'MANUAL'; sessionId: string | null; paymentIntentId: string | null;
  importeEur: number; compradorNombre: string; compradorEmail: string | null;
  destinatarioNombre: string; destinatarioEmail: string | null; mensaje: string | null;
  caducidadMeses: number; metodoManual: string | null; actorTipo: 'staff' | 'webhook'; actorId: string | null;
}

export async function crearTarjeta(admin: Admin, n: NuevaTarjeta): Promise<{ ok: true; tarjetaId: string; codigo: string; creada: boolean } | { ok: false; error: string }> {
  const { data, error } = await admin.rpc('regalo_crear', {
    p_studio_id: n.studioId, p_origen: n.origen, p_session_id: n.sessionId, p_payment_intent: n.paymentIntentId,
    p_importe: n.importeEur, p_comprador_nombre: n.compradorNombre, p_comprador_email: n.compradorEmail,
    p_destinatario_nombre: n.destinatarioNombre, p_destinatario_email: n.destinatarioEmail, p_mensaje: n.mensaje,
    p_caducidad_meses: n.caducidadMeses, p_metodo_manual: n.metodoManual, p_actor_tipo: n.actorTipo, p_actor_id: n.actorId,
  });
  const fila = Array.isArray(data) ? data[0] : data;
  if (error || !fila) return { ok: false, error: error?.message ?? 'sin respuesta' };
  return { ok: true, tarjetaId: fila.tarjeta_id as string, codigo: fila.codigo as string, creada: fila.creada === true };
}

export type ResultadoCanje =
  | { ok: true; tarjetaId: string; saldo: number; caducaEn: string }
  | { ok: false; motivo: string };

/**
 * Vincula una tarjeta a la ficha de la alumna. La huella se calcula aquí y se
 * VUELVE a comparar en tiempo constante con la que devuelve la base de datos antes de
 * fiarse (no depende de que el índice no filtre por tiempo).
 */
export async function canjearCodigo(admin: Admin, studioId: string, socioId: string, codigo: string): Promise<ResultadoCanje> {
  if (!pareceCodigo(codigo)) return { ok: false, motivo: 'no-existe' };
  const huella = huellaCodigo(codigo);
  const { data, error } = await admin.rpc('regalo_vincular', { p_studio_id: studioId, p_huella: huella, p_socio_id: socioId });
  const fila = Array.isArray(data) ? data[0] : data;
  if (error || !fila) return { ok: false, motivo: 'error' };
  if (!fila.ok) return { ok: false, motivo: (fila.motivo as string) ?? 'error' };
  const { data: t } = await admin.from('tarjetas_regalo').select('codigo_hash').eq('id', fila.tarjeta_id).eq('studio_id', studioId).maybeSingle();
  if (!t || !huellasIguales(String(t.codigo_hash), huella)) return { ok: false, motivo: 'no-existe' };
  return { ok: true, tarjetaId: fila.tarjeta_id as string, saldo: Number(fila.saldo), caducaEn: String(fila.caduca_en) };
}

export async function usarSaldo(
  admin: Admin, studioId: string, tarjetaId: string, importeEur: number, idemKey: string, actorId: string | null, nota: string | null,
): Promise<{ ok: boolean; motivo?: string; saldo?: number }> {
  const { data, error } = await admin.rpc('regalo_usar', {
    p_studio_id: studioId, p_tarjeta_id: tarjetaId, p_importe: importeEur, p_idem_key: idemKey,
    p_actor_id: actorId, p_nota: nota, p_recibo_id: null,
  });
  const fila = Array.isArray(data) ? data[0] : data;
  if (error || !fila) return { ok: false, motivo: 'error' };
  return { ok: fila.ok === true, motivo: (fila.motivo as string | null) ?? undefined, saldo: fila.saldo == null ? undefined : Number(fila.saldo) };
}

export async function anularTarjeta(
  admin: Admin, studioId: string, tarjetaId: string, motivo: string, actorTipo: 'staff' | 'webhook', actorId: string | null,
): Promise<{ ok: boolean; motivo?: string; saldoRetirado?: number }> {
  const { data, error } = await admin.rpc('regalo_anular', {
    p_studio_id: studioId, p_tarjeta_id: tarjetaId, p_motivo: motivo, p_actor_tipo: actorTipo, p_actor_id: actorId,
  });
  const fila = Array.isArray(data) ? data[0] : data;
  if (error || !fila) return { ok: false, motivo: 'error' };
  return { ok: fila.ok === true, motivo: (fila.motivo as string | null) ?? undefined, saldoRetirado: fila.saldo_retirado == null ? undefined : Number(fila.saldo_retirado) };
}

const COLUMNAS_VISTA = 'id, importe_inicial, origen, comprador_nombre, comprador_email, destinatario_nombre, destinatario_email, mensaje, caduca_en, estado, anulada_motivo, socio_id, correo_enviado_en, creada_en';

async function conSaldo(admin: Admin, studioId: string, filas: TarjetaRegaloFila[]): Promise<TarjetaRegaloVista[]> {
  if (filas.length === 0) return [];
  const { data } = await admin.from('tarjetas_regalo_estado').select('tarjeta_id, saldo, estado_efectivo')
    .eq('studio_id', studioId).in('tarjeta_id', filas.map(f => f.id));
  const por = new Map((data ?? []).map(d => [d.tarjeta_id as string, d]));
  return filas.map(f => ({
    ...f, importe_inicial: Number(f.importe_inicial),
    saldo: Number(por.get(f.id)?.saldo ?? 0), estado_efectivo: String(por.get(f.id)?.estado_efectivo ?? f.estado),
  }));
}

export async function listarTarjetas(admin: Admin, studioId: string): Promise<TarjetaRegaloVista[]> {
  const { data } = await admin.from('tarjetas_regalo').select(COLUMNAS_VISTA).eq('studio_id', studioId)
    .order('creada_en', { ascending: false }).limit(500);
  return conSaldo(admin, studioId, (data ?? []) as TarjetaRegaloFila[]);
}

export async function tarjetasDeSocia(admin: Admin, studioId: string, socioId: string): Promise<TarjetaRegaloVista[]> {
  const { data } = await admin.from('tarjetas_regalo').select(COLUMNAS_VISTA).eq('studio_id', studioId)
    .eq('socio_id', socioId).order('creada_en', { ascending: false }).limit(50);
  return conSaldo(admin, studioId, (data ?? []) as TarjetaRegaloFila[]);
}

/** Pasivo vivo: lo vendido y aún no gastado de las tarjetas vigentes. NO es ingreso. */
export function pasivoVivo(tarjetas: TarjetaRegaloVista[]): number {
  return tarjetas.filter(t => t.estado_efectivo === 'ACTIVA').reduce((s, t) => s + t.saldo, 0);
}
