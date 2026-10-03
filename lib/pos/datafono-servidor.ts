import 'server-only';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContextoCobro } from './terminal.ts';
import {
  ETIQUETA_POR_DEFECTO, MENSAJE_CODIGO_MAL_ESCRITO, direccionDelEstudio, direccionValida, mensajeErrorLector,
  nombreModelo, normalizarCodigo, normalizarEtiqueta, type DireccionLector, type LectorDatafono,
} from './datafono.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Conectar, ver, renombrar y desconectar el datáfono de Stripe del estudio.
//
// Todo va contra la cuenta Connect del estudio (`stripeAccount`): el lector es
// SUYO, igual que el dinero que cobra. En Tentare solo se guarda qué lector y en
// qué ubicación (`studios.stripe_terminal_reader_id` / `_location_id`).
//
// La ubicación de Stripe es «dónde está el datáfono» y lleva una dirección. La
// versión anterior la creaba con una inventada («Mostrador», Madrid 28001); ahora
// es la del estudio, o la que se escribe al conectar si el estudio no la tiene
// (y entonces se guarda también en el estudio: solo si le faltaba, nunca encima
// de la que ya tenía).
//
// La ruta (/api/terminal/lector) comprueba el rol; aquí se da por hecho.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaDatafonoEstudio {
  nombre: string | null;
  direccion: string | null;
  ciudad: string | null;
  codigo_postal: string | null;
  stripe_terminal_reader_id: string | null;
  stripe_terminal_location_id: string | null;
}

export async function leerFilaEstudio(admin: SupabaseClient, studioId: string): Promise<FilaDatafonoEstudio | null> {
  const { data, error } = await admin.from('studios')
    .select('nombre, direccion, ciudad, codigo_postal, stripe_terminal_reader_id, stripe_terminal_location_id')
    .eq('id', studioId).maybeSingle();
  if (error || !data) return null;
  return data as FilaDatafonoEstudio;
}

const opciones = (ctx: ContextoCobro) => ({ stripeAccount: ctx.stripeAccount });
const noExiste = (err: unknown) => err instanceof Stripe.errors.StripeError && err.code === 'resource_missing';
const detalle = (err: unknown) => (err instanceof Stripe.errors.StripeError ? `${err.code ?? err.type}: ${err.message}` : String(err));

function aLector(r: Stripe.Terminal.Reader): LectorDatafono {
  return {
    etiqueta: r.label || ETIQUETA_POR_DEFECTO,
    modelo: nombreModelo(r.device_type),
    estado: r.status === 'online' ? 'online' : r.status === 'offline' ? 'offline' : null,
  };
}

/**
 * El lector guardado, tal como lo ve Stripe ahora. `null` = ya no existe (lo
 * borraron en Stripe); `undefined` = no se ha podido preguntar (la red, Stripe
 * caído): quien lo pinte no debe darlo por desconectado.
 */
export async function leerLector(ctx: ContextoCobro, readerId: string): Promise<LectorDatafono | null | undefined> {
  try {
    const r = await ctx.stripe.terminal.readers.retrieve(readerId, {}, opciones(ctx));
    if ((r as { deleted?: boolean }).deleted) return null;
    return aLector(r as Stripe.Terminal.Reader);
  } catch (err) {
    if (noExiste(err)) return null;
    console.error('[datafono:leer]', detalle(err));
    return undefined;
  }
}

/** Crea la ubicación del estudio en Stripe, o pone al día la que ya tenía. Devuelve su id. */
async function asegurarUbicacion(
  ctx: ContextoCobro, fila: FilaDatafonoEstudio, direccion: DireccionLector,
): Promise<string> {
  const datos = {
    display_name: (fila.nombre || 'Estudio').slice(0, 100),
    address: { line1: direccion.linea, city: direccion.ciudad, postal_code: direccion.codigoPostal, country: 'ES' },
  };
  if (fila.stripe_terminal_location_id) {
    try {
      const loc = await ctx.stripe.terminal.locations.update(fila.stripe_terminal_location_id, datos, opciones(ctx));
      return loc.id;
    } catch (err) {
      // Borrada en Stripe: se crea otra. Cualquier otro fallo sube: no se
      // registra un lector en una ubicación que no sabemos si existe.
      if (!noExiste(err)) throw err;
    }
  }
  const loc = await ctx.stripe.terminal.locations.create(datos, opciones(ctx));
  return loc.id;
}

export type ResultadoConectar =
  | { ok: true; lector: LectorDatafono }
  | { ok: false; status: number; error: string; falta?: 'codigo' | 'direccion' };

/**
 * Registra el datáfono con el código que enseña en su pantalla. Si el estudio ya
 * tenía otro, el viejo se da de baja en Stripe DESPUÉS de guardar el nuevo: si
 * algo falla a medias, el estudio se queda con uno que funciona, nunca sin ninguno.
 */
export async function conectarLector(
  ctx: ContextoCobro,
  admin: SupabaseClient,
  p: { codigo: unknown; nombre: unknown; direccion: unknown },
): Promise<ResultadoConectar> {
  const fila = await leerFilaEstudio(admin, ctx.studioId);
  if (!fila) return { ok: false, status: 500, error: 'No se ha podido leer el estudio. Inténtalo otra vez.' };

  // En el modo de prueba de Stripe no hay datáfono de verdad: se registra uno
  // simulado (`simulated-wpe`, o el simulado que se escriba).
  const escrito = normalizarCodigo(p.codigo);
  const codigo = ctx.esTest ? (escrito?.startsWith('simulated-') ? escrito : 'simulated-wpe') : escrito;
  if (!codigo) return { ok: false, status: 400, error: MENSAJE_CODIGO_MAL_ESCRITO, falta: 'codigo' };

  const delEstudio = direccionDelEstudio(fila);
  const escrita = direccionValida(p.direccion as Parameters<typeof direccionValida>[0]);
  const direccion = escrita ?? delEstudio;
  if (!direccion) {
    return { ok: false, status: 400, error: 'Falta la dirección del estudio: Stripe pide dónde está el datáfono.', falta: 'direccion' };
  }
  const etiqueta = normalizarEtiqueta(p.nombre);

  let locationId: string;
  try {
    locationId = await asegurarUbicacion(ctx, fila, direccion);
  } catch (err) {
    console.error('[datafono:ubicacion]', detalle(err));
    return { ok: false, status: 502, error: 'Stripe no ha aceptado la dirección del datáfono. Revísala y vuelve a intentarlo.', falta: 'direccion' };
  }
  // La ubicación se guarda ya, aunque el lector falle: el reintento la reutiliza
  // en vez de dejar otra huérfana en la cuenta del estudio.
  if (locationId !== fila.stripe_terminal_location_id) {
    await admin.from('studios').update({ stripe_terminal_location_id: locationId }).eq('id', ctx.studioId);
  }

  let reader: Stripe.Terminal.Reader;
  try {
    reader = await ctx.stripe.terminal.readers.create(
      { registration_code: codigo, location: locationId, label: etiqueta }, opciones(ctx),
    );
  } catch (err) {
    console.error('[datafono:registrar]', detalle(err));
    const e = err instanceof Stripe.errors.StripeError ? err : null;
    const codigoNoVale = e?.param === 'registration_code' || /registration code/i.test(e?.message ?? '');
    return { ok: false, status: 400, error: mensajeErrorLector(e, etiqueta), ...(codigoNoVale ? { falta: 'codigo' as const } : {}) };
  }

  const { error: errGuardar } = await admin.from('studios')
    .update({ stripe_terminal_reader_id: reader.id, stripe_terminal_location_id: locationId })
    .eq('id', ctx.studioId);
  if (errGuardar) {
    // Registrado en Stripe pero sin guardar aquí: se da de baja para que el
    // reintento no choque con un lector a medias.
    await ctx.stripe.terminal.readers.del(reader.id, {}, opciones(ctx)).catch(() => {});
    console.error('[datafono:guardar]', errGuardar.message);
    return { ok: false, status: 500, error: 'No se ha podido guardar el datáfono. Genera otro código y vuelve a intentarlo.' };
  }

  const anterior = fila.stripe_terminal_reader_id;
  if (anterior && anterior !== reader.id) {
    await ctx.stripe.terminal.readers.del(anterior, {}, opciones(ctx))
      .catch(err => { if (!noExiste(err)) console.error('[datafono:baja-anterior]', detalle(err)); });
  }
  if (!delEstudio && escrita) {
    await admin.from('studios')
      .update({ direccion: escrita.linea, codigo_postal: escrita.codigoPostal, ciudad: escrita.ciudad })
      .eq('id', ctx.studioId);
  }
  return { ok: true, lector: aLector(reader) };
}

export async function renombrarLector(
  ctx: ContextoCobro, readerId: string, nombre: unknown,
): Promise<{ ok: true; lector: LectorDatafono } | { ok: false; status: number; error: string }> {
  try {
    const r = await ctx.stripe.terminal.readers.update(readerId, { label: normalizarEtiqueta(nombre) }, opciones(ctx));
    return { ok: true, lector: aLector(r as Stripe.Terminal.Reader) };
  } catch (err) {
    console.error('[datafono:renombrar]', detalle(err));
    if (noExiste(err)) return { ok: false, status: 404, error: 'Ese datáfono ya no está conectado.' };
    return { ok: false, status: 502, error: 'No se ha podido cambiar el nombre. Inténtalo otra vez.' };
  }
}

/** Da de baja el lector en Stripe y lo olvida aquí. La ubicación se queda para el siguiente. */
export async function desconectarLector(
  ctx: ContextoCobro, admin: SupabaseClient, readerId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    await ctx.stripe.terminal.readers.del(readerId, {}, opciones(ctx));
  } catch (err) {
    if (!noExiste(err)) {
      console.error('[datafono:desconectar]', detalle(err));
      return { ok: false, status: 502, error: 'Stripe no ha respondido. Inténtalo otra vez en un momento.' };
    }
  }
  const { error } = await admin.from('studios')
    .update({ stripe_terminal_reader_id: null })
    .eq('id', ctx.studioId).eq('stripe_terminal_reader_id', readerId);
  if (error) return { ok: false, status: 500, error: 'No se ha podido guardar. Inténtalo otra vez.' };
  return { ok: true };
}
