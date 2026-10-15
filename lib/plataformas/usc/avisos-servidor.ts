// Guardar un aviso de integrador de USC en el buzón (`usc_avisos_integrador`).
//
// Principio de buzón: se guarda y se contesta 200, SIN llamadas salientes y sin
// aplicar nada. Quien confirma es la propietaria (app/api/plataformas/usc/avisos).
// Idempotente por `huella` (única en la tabla): los 5 reintentos de USC y un
// `reclamarWebhookEvent` que falla abierto no duplican filas.
//
// ⚠️ Nunca se registra en logs ni en Sentry el cuerpo, `ProviderName` ni el
// nombre de la ubicación (un test estático lo vigila).
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clavesDelEntorno } from '../../integraciones/cifrado-credenciales.ts';
import { descifrarConfigIntegracion } from '../../integraciones/config-cifrada.ts';
import { leerAvisoIntegradorUsc } from './avisos.ts';
import { decidirEstadoAviso, normalizarNombre, textoHuellaAviso, type EstadoAviso, type EstudioCoincidente } from './avisos-decision.ts';

/** Tope del cuerpo de un aviso: los reales miden unos cientos de bytes. */
export const MAX_BYTES_AVISO = 4096;
/** Tope de filas por hora: un aviso falso no puede inundar la tabla. */
export const MAX_AVISOS_POR_HORA = 500;

export type ResultadoRegistro =
  | { resultado: 'guardado'; estado: EstadoAviso }
  | { resultado: 'ignorado'; motivo: 'formato' | 'limite' | 'cliente-ajeno' };

export async function registrarAvisoIntegrador(
  admin: SupabaseClient, cuerpo: unknown, opciones: { ahora?: number; clientIdPropio?: string | null } = {},
): Promise<ResultadoRegistro> {
  const ahora = opciones.ahora ?? Date.now();
  const lectura = leerAvisoIntegradorUsc(cuerpo, ahora);
  if (!lectura.ok) return { resultado: 'ignorado', motivo: 'formato' };
  const a = lectura.aviso;
  // Si el aviso dice de quién es y no es nuestro, no es para nosotros.
  if (a.clientId && opciones.clientIdPropio && a.clientId !== opciones.clientIdPropio.toLowerCase()) {
    return { resultado: 'ignorado', motivo: 'cliente-ajeno' };
  }

  const { count, error: errCuenta } = await admin.from('usc_avisos_integrador')
    .select('id', { count: 'exact', head: true })
    .gte('recibido_en', new Date(ahora - 3600_000).toISOString());
  if (errCuenta) throw new Error(`avisos: ${errCuenta.message}`);
  if ((count ?? 0) >= MAX_AVISOS_POR_HORA) return { resultado: 'ignorado', motivo: 'limite' };

  // Estudios con USC configurada por su cuenta y el proveedor que ya tienen.
  const { data: integraciones, error: errInt } = await admin.from('integraciones')
    .select('studio_id, config').eq('tipo', 'URBAN_SPORTS_CLUB');
  if (errInt) throw new Error(`avisos: ${errInt.message}`);
  const proveedorDe = new Map<string, string | null>();
  for (const i of integraciones ?? []) {
    const cfg = descifrarConfigIntegracion(i.studio_id as string, 'URBAN_SPORTS_CLUB', i.config, clavesDelEntorno()).config;
    const p = cfg.providerId;
    proveedorDe.set(i.studio_id as string, typeof p === 'string' && p ? p.toLowerCase() : null);
  }
  const conEsteProveedor = [...proveedorDe].filter(([, p]) => p === a.providerId).map(([s]) => s);

  let coincidencias: EstudioCoincidente[];
  const normalizado = a.providerName ? normalizarNombre(a.providerName) : null;
  if (a.tipo === 'IntegratorAssociated') {
    // TODOS los estudios, no solo los que usan USC (ver `decidirEstadoAviso`).
    const { data: estudios, error } = await admin.from('studios').select('id, nombre');
    if (error) throw new Error(`avisos: ${error.message}`);
    coincidencias = (estudios ?? [])
      .filter(s => normalizado && typeof s.nombre === 'string' && normalizarNombre(s.nombre) === normalizado)
      .map(s => ({ studioId: s.id as string, providerIdActual: proveedorDe.get(s.id as string) ?? null }));
  } else {
    coincidencias = conEsteProveedor.map(studioId => ({ studioId, providerIdActual: a.providerId }));
  }

  const { data: confirmado, error: errConf } = await admin.from('usc_avisos_integrador')
    .select('estudio_candidato_id').eq('provider_id', a.providerId)
    .eq('tipo', 'IntegratorAssociated').eq('estado', 'CONFIRMADO').maybeSingle();
  if (errConf) throw new Error(`avisos: ${errConf.message}`);
  const candidatoElegido = coincidencias.length === 1 ? coincidencias[0].studioId : null;
  // Otro estudio que ya tiene este proveedor (confirmado, o pegado a mano) hace de él un conflicto.
  const confirmadoPor = (confirmado?.estudio_candidato_id as string | null | undefined)
    ?? conEsteProveedor.find(s => s !== candidatoElegido) ?? null;

  const { estado, candidato } = decidirEstadoAviso({ tipo: a.tipo, providerId: a.providerId, coincidencias, confirmadoPor });
  const huella = createHash('sha256').update(textoHuellaAviso(a)).digest('hex');
  const { error } = await admin.from('usc_avisos_integrador').upsert({
    huella, tipo: a.tipo, provider_id: a.providerId, location_id: a.locationId,
    provider_nombre: a.providerName, nombre_normalizado: normalizado, ubicacion_nombre: a.locationName,
    inicio: a.inicio, fin: a.fin, modificado_usc: a.modificado, estado, estudio_candidato_id: candidato,
  }, { onConflict: 'huella', ignoreDuplicates: true });
  if (error) throw new Error(`avisos: ${error.message}`);
  return { resultado: 'guardado', estado };
}
