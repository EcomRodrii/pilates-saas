import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbDeleteSumupCredenciales, dbGetSumupCredenciales } from '@/lib/db/supabase-data-admin';
import { ETIQUETA_POR_DEFECTO, normalizarEtiqueta, type LectorDatafono } from './datafono.ts';
import {
  clienteSumup, ErrorSumup, MENSAJE_CODIGO_SUMUP_MAL_ESCRITO, MENSAJE_CODIGO_SUMUP_NO_VALE, normalizarCodigoSumup,
  sumupParaEstudio, sumupPuedeCobrarAqui, type LectorSumup,
} from './sumup.ts';
import { sumupConfigurado, tokenSumup } from './sumup-oauth.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El SumUp Solo del estudio: verlo, emparejarlo, renombrarlo y darlo de baja, y
// la cuenta de SumUp de la que cuelga. Lo usa /api/terminal/lector (la misma ruta
// que el datáfono de Stripe) y /api/integrations/sumup (desconectar la cuenta).
//
// El lector es de la cuenta de SumUp del ESTUDIO: en Tentare solo se guarda cuál
// (`studios.sumup_reader_id`). Un datáfono por sede (CHECK `studios_un_solo_datafono`):
// al emparejar un Solo se olvida el de Stripe en el MISMO UPDATE.
//
// Las rutas comprueban el rol; aquí se da por hecho.
// ─────────────────────────────────────────────────────────────────────────────

const MENSAJE_RECONECTAR = 'La cuenta de SumUp del estudio hay que volver a conectarla (Configuración → Cobros y facturas → Datáfono).';

/** ¿Tentare puede ofrecer SumUp a este estudio? Su app dada de alta, sus claves y el estudio en la lista. */
export function sumupDisponible(studioId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return sumupConfigurado()
    && !!env.SUMUP_AFFILIATE_APP_ID && !!env.SUMUP_AFFILIATE_KEY && !!env.SUMUP_WEBHOOK_SECRET
    && sumupPuedeCobrarAqui(env) && sumupParaEstudio(studioId, env);
}

export const MENSAJE_COBRO_SUMUP_EN_MARCHA =
  'Hay un cobro en marcha con el datáfono de SumUp. Espera a que termine (o cancélalo en la Caja) y vuelve a intentarlo.';

/**
 * ¿Cuántos cobros de SumUp hay EN VUELO en el estudio (ventas sin cerrar y recibos
 * con referencia `sumup:`)? Con alguno, la cuenta no se cambia ni se desconecta:
 * su resultado solo lo puede contar la cuenta que lo cobró, y con otra (o sin
 * ninguna) el barrido lo daría por no empezado y lo soltaría. `null` = no se ha
 * podido mirar: quien llama no debe seguir.
 */
export async function cobrosSumupEnVuelo(admin: SupabaseClient, studioId: string): Promise<number | null> {
  const [ventas, recibos] = await Promise.all([
    admin.from('ventas_pos').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).eq('estado', 'PENDIENTE_PAGO').like('stripe_payment_intent_id', 'sumup:%'),
    admin.from('recibos').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).like('cobro_mostrador_pi', 'sumup:%'),
  ]);
  if (ventas.error || recibos.error) return null;
  return (ventas.count ?? 0) + (recibos.count ?? 0);
}

/** La cuenta de SumUp conectada del estudio, o `null`. Solo lo que se puede enseñar. */
export async function cuentaSumup(studioId: string): Promise<{ comercio: string | null } | null> {
  const c = await dbGetSumupCredenciales(studioId);
  return c ? { comercio: c.nombreComercio } : null;
}

function modeloSumup(l: LectorSumup): string {
  return l.modelo === 'virtual-solo' ? 'SumUp Solo de prueba' : 'SumUp Solo';
}

function aLector(l: LectorSumup, estado: LectorDatafono['estado']): LectorDatafono {
  return { etiqueta: l.nombre || ETIQUETA_POR_DEFECTO, modelo: modeloSumup(l), estado };
}

async function cliente(studioId: string) {
  const t = await tokenSumup(studioId);
  if (!t.ok) return { ok: false as const, motivo: t.motivo };
  return { ok: true as const, c: clienteSumup({ token: t.token }), mc: t.merchantCode };
}

/**
 * El Solo guardado, como lo ve SumUp ahora. `null` = ya no está en la cuenta (o la
 * cuenta se desconectó); `undefined` = no se ha podido preguntar: quien lo pinte
 * no debe darlo por desconectado.
 */
export async function leerLectorSumup(studioId: string, readerId: string): Promise<LectorDatafono | null | undefined> {
  const k = await cliente(studioId);
  if (!k.ok) return k.motivo === 'sin-conectar' ? null : undefined;
  try {
    const l = await k.c.obtenerLector(k.mc, readerId);
    if (!l || l.estado === 'expired') return null;
    // Encendido o no: lo dice su estado de conexión. Si no contesta, sin saber.
    const estado = await k.c.estadoLector(k.mc, readerId)
      .then(s => (s.conectado ? 'online' as const : 'offline' as const))
      .catch(() => null);
    return aLector(l, estado);
  } catch (err) {
    console.error('[sumup:leer-lector]', err instanceof Error ? err.message : err);
    return undefined;
  }
}

export type ResultadoConectarSumup =
  | { ok: true; lector: LectorDatafono }
  | { ok: false; status: number; error: string; falta?: 'codigo' | 'cuenta' };

/**
 * Empareja el Solo con el código que enseña su pantalla y lo deja como el datáfono
 * de la sede (olvidando el de Stripe, si lo había). El Solo anterior de SumUp se da
 * de baja DESPUÉS de guardar el nuevo: si algo falla a medias, la sede se queda con
 * uno que funciona, nunca sin ninguno.
 */
export async function conectarLectorSumup(
  admin: SupabaseClient, studioId: string, p: { codigo: unknown; nombre: unknown; anterior: string | null },
): Promise<ResultadoConectarSumup> {
  const codigo = normalizarCodigoSumup(p.codigo);
  if (!codigo) return { ok: false, status: 400, error: MENSAJE_CODIGO_SUMUP_MAL_ESCRITO, falta: 'codigo' };
  const k = await cliente(studioId);
  if (!k.ok) {
    return k.motivo === 'no-disponible'
      ? { ok: false, status: 503, error: 'SumUp no responde ahora mismo. Inténtalo en un momento.' }
      : { ok: false, status: 409, error: k.motivo === 'reconectar' ? MENSAJE_RECONECTAR : 'Primero hay que conectar la cuenta de SumUp del estudio.', falta: 'cuenta' };
  }
  const nombre = normalizarEtiqueta(p.nombre);
  let lector: LectorSumup;
  try {
    lector = await k.c.emparejarLector(k.mc, { codigo, nombre });
  } catch (err) {
    console.error('[sumup:emparejar]', err instanceof ErrorSumup ? `${err.status} ${err.codigo ?? ''} ${err.message}` : err);
    if (err instanceof ErrorSumup && err.caducado) return { ok: false, status: 409, error: MENSAJE_RECONECTAR, falta: 'cuenta' };
    if (err instanceof ErrorSumup && err.status >= 400 && err.status < 500) {
      return { ok: false, status: 400, error: MENSAJE_CODIGO_SUMUP_NO_VALE, falta: 'codigo' };
    }
    return { ok: false, status: 502, error: 'No se ha podido conectar con SumUp. Inténtalo otra vez en un momento.' };
  }
  if (lector.estado === 'expired') return { ok: false, status: 400, error: MENSAJE_CODIGO_SUMUP_NO_VALE, falta: 'codigo' };

  const { error } = await admin.from('studios')
    .update({ sumup_reader_id: lector.id, stripe_terminal_reader_id: null })
    .eq('id', studioId);
  if (error) {
    // Emparejado en SumUp pero sin guardar aquí: se da de baja para que el
    // reintento no choque con un lector a medias.
    await k.c.borrarLector(k.mc, lector.id).catch(() => {});
    console.error('[sumup:guardar-lector]', error.message);
    return { ok: false, status: 500, error: 'No se ha podido guardar el datáfono. Vuelve a pulsar Conectar en el Solo y escribe el código nuevo.' };
  }
  if (p.anterior && p.anterior !== lector.id) {
    await k.c.borrarLector(k.mc, p.anterior).catch(err => console.error('[sumup:baja-anterior]', err instanceof Error ? err.message : err));
  }
  return { ok: true, lector: aLector(lector, null) };
}

export async function renombrarLectorSumup(
  studioId: string, readerId: string, nombre: unknown,
): Promise<{ ok: true; lector: LectorDatafono } | { ok: false; status: number; error: string }> {
  const k = await cliente(studioId);
  if (!k.ok) return { ok: false, status: 409, error: MENSAJE_RECONECTAR };
  try {
    return { ok: true, lector: aLector(await k.c.renombrarLector(k.mc, readerId, normalizarEtiqueta(nombre)), null) };
  } catch (err) {
    console.error('[sumup:renombrar]', err instanceof Error ? err.message : err);
    if (err instanceof ErrorSumup && err.status === 404) return { ok: false, status: 404, error: 'Ese datáfono ya no está conectado.' };
    return { ok: false, status: 502, error: 'No se ha podido cambiar el nombre. Inténtalo otra vez.' };
  }
}

/**
 * Lo da de baja en SumUp y lo olvida aquí. Si la cuenta ya no responde (se
 * desconectó en SumUp), se olvida igual: en Tentare no puede quedar un datáfono al
 * que no se puede mandar nada.
 */
export async function desconectarLectorSumup(
  admin: SupabaseClient, studioId: string, readerId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const k = await cliente(studioId);
  if (k.ok) {
    try {
      await k.c.borrarLector(k.mc, readerId);
    } catch (err) {
      console.error('[sumup:desconectar]', err instanceof Error ? err.message : err);
      return { ok: false, status: 502, error: 'SumUp no ha respondido. Inténtalo otra vez en un momento.' };
    }
  } else if (k.motivo === 'no-disponible') {
    return { ok: false, status: 503, error: 'SumUp no responde ahora mismo. Inténtalo en un momento.' };
  }
  const { error } = await admin.from('studios')
    .update({ sumup_reader_id: null })
    .eq('id', studioId).eq('sumup_reader_id', readerId);
  if (error) return { ok: false, status: 500, error: 'No se ha podido guardar. Inténtalo otra vez.' };
  return { ok: true };
}

/**
 * Desconecta la cuenta de SumUp: da de baja su Solo (si lo hay) y borra la
 * credencial. Los cobros ya hechos no cambian y el dinero sigue en su cuenta.
 */
export async function desconectarCuentaSumup(
  admin: SupabaseClient, studioId: string, readerId: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const enVuelo = await cobrosSumupEnVuelo(admin, studioId);
  if (enVuelo === null) return { ok: false, status: 503, error: 'No hemos podido comprobar los cobros en marcha. Inténtalo otra vez.' };
  if (enVuelo > 0) return { ok: false, status: 409, error: MENSAJE_COBRO_SUMUP_EN_MARCHA };
  if (readerId) {
    const r = await desconectarLectorSumup(admin, studioId, readerId);
    // Sin poder dar de baja el Solo, se olvida igual: sin cuenta no se le puede mandar nada.
    if (!r.ok) {
      const { error } = await admin.from('studios').update({ sumup_reader_id: null }).eq('id', studioId).eq('sumup_reader_id', readerId);
      if (error) return { ok: false, status: 500, error: 'No se ha podido guardar. Inténtalo otra vez.' };
    }
  }
  const borrada = await dbDeleteSumupCredenciales(studioId);
  if (!borrada) return { ok: false, status: 500, error: 'No se ha podido desconectar la cuenta. Inténtalo otra vez.' };
  return { ok: true };
}
