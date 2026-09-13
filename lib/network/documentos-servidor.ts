// SERVER-ONLY — operaciones de Storage de Tentare Network con el cliente
// service_role. Sin alias `@/` (solo imports relativos `.ts` y un `import type`)
// para que `node --test` lo pueda probar con un cliente falso: aquí vive el
// orden de los borrados, que es justo lo que no puede fallar en silencio.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BUCKET_AVATARS, BUCKET_DOCUMENTOS_RED, CONSERVAR_DOCUMENTO_TRAS_VERIFICAR,
  avatarNetworkDe, huerfanosTrasRegistrar, rutasABorrarAlSuprimirPerfil, rutasDocumentoTrasResolver,
  type ObjetoCarpeta, type PrefijoDocumento,
} from './supresion-documentos.ts';

const PAGINA_LISTADO = 1000;
const LOTE_BORRADO = 100;

type Admin = SupabaseClient;

export async function listarCarpetaPropia(
  admin: Admin, authUserId: string,
): Promise<{ ok: true; objetos: ObjetoCarpeta[] } | { ok: false; error: string }> {
  const objetos: ObjetoCarpeta[] = [];
  for (let offset = 0; ; offset += PAGINA_LISTADO) {
    const { data, error } = await admin.storage.from(BUCKET_DOCUMENTOS_RED).list(authUserId, { limit: PAGINA_LISTADO, offset });
    if (error) return { ok: false, error: error.message };
    const pagina = (data ?? []) as ObjetoCarpeta[];
    objetos.push(...pagina);
    if (pagina.length < PAGINA_LISTADO) break;
  }
  return { ok: true, objetos };
}

export async function borrarRutas(
  admin: Admin, bucket: string, rutas: string[],
): Promise<{ ok: true; borradas: number } | { ok: false; error: string }> {
  let borradas = 0;
  for (let i = 0; i < rutas.length; i += LOTE_BORRADO) {
    const { data, error } = await admin.storage.from(bucket).remove(rutas.slice(i, i + LOTE_BORRADO));
    if (error) return { ok: false, error: error.message };
    borradas += (data ?? []).length;
  }
  return { ok: true, borradas };
}

/**
 * Tras registrar un documento nuevo, borra los que quedaron sin fila al volver
 * a subir (origen de los huérfanos del bucket). Mejor esfuerzo: nunca lanza ni
 * tumba el registro que acaba de salir bien — un huérfano que sobreviva lo
 * recoge la siguiente limpieza o el listado de `scripts/`.
 */
export async function limpiarHuerfanosTrasRegistrar(admin: Admin, p: {
  authUserId: string; perfilId: string; prefijo: PrefijoDocumento; margenMs: number; ahora?: Date;
}): Promise<number> {
  try {
    const listado = await listarCarpetaPropia(admin, p.authUserId);
    if (!listado.ok) { console.error('[network:huerfanos] listado', listado.error); return 0; }

    const { data, error } = p.prefijo === 'identidad'
      ? await admin.from('red_verificaciones_identidad').select('documento_path, documento_path_reverso').eq('perfil_id', p.perfilId)
      : await admin.from('red_certificaciones').select('documento_path').eq('perfil_id', p.perfilId);
    // Sin saber qué está referenciado no se borra nada.
    if (error) { console.error('[network:huerfanos] referencias', error.message); return 0; }
    const filas = (data ?? []) as { documento_path: string | null; documento_path_reverso?: string | null }[];

    const rutas = huerfanosTrasRegistrar({
      authUserId: p.authUserId,
      objetos: listado.objetos,
      prefijo: p.prefijo,
      referenciadas: filas.flatMap(f => [f.documento_path, f.documento_path_reverso]),
      ahora: p.ahora ?? new Date(),
      margenMs: p.margenMs,
    });
    if (rutas.length === 0) return 0;
    const borrado = await borrarRutas(admin, BUCKET_DOCUMENTOS_RED, rutas);
    if (!borrado.ok) { console.error('[network:huerfanos] borrado', borrado.error); return 0; }
    return borrado.borradas;
  } catch (e) {
    console.error('[network:huerfanos]', e instanceof Error ? e.message : e);
    return 0;
  }
}

/**
 * Al resolver una verificación de identidad o una certificación: borra el
 * binario y deja la fila con resultado + fecha + quién (ya escritos por quien
 * llama) y `documento_borrado_en`. Primero Storage y DESPUÉS la fila: si Storage
 * falla, el path sigue apuntando al objeto y se puede reintentar; al revés
 * quedaría un DNI sin ninguna fila que lo encuentre.
 */
export async function purgarDocumentoResuelto(admin: Admin, p: {
  tipo: 'identidad' | 'certificacion';
  id: string;
  fila: { documento_path: string | null; documento_path_reverso?: string | null };
  conservar?: boolean;
}): Promise<{ documentoBorrado: boolean }> {
  const rutas = rutasDocumentoTrasResolver(p.fila, p.conservar ?? CONSERVAR_DOCUMENTO_TRAS_VERIFICAR);
  if (rutas.length === 0) return { documentoBorrado: false };

  const borrado = await borrarRutas(admin, BUCKET_DOCUMENTOS_RED, rutas);
  if (!borrado.ok) {
    console.error('[network:purga-documento] storage', p.tipo, borrado.error);
    return { documentoBorrado: false };
  }

  const tabla = p.tipo === 'identidad' ? 'red_verificaciones_identidad' : 'red_certificaciones';
  const cambios = p.tipo === 'identidad'
    ? { documento_path: null, documento_path_reverso: null, documento_borrado_en: new Date().toISOString() }
    : { documento_path: null, documento_borrado_en: new Date().toISOString() };
  const { error } = await admin.from(tabla).update(cambios).eq('id', p.id);
  if (error) console.error('[network:purga-documento] fila', p.tipo, error.message);
  // El binario ya no existe aunque la fila no se haya podido anotar: eso es lo
  // que importa para la minimización, y el enlace firmado fallará con 404.
  return { documentoBorrado: true };
}

export type ResultadoSupresionPerfil =
  | { ok: true; perfilId: string; documentosBorrados: number; fotoBorrada: boolean }
  | { ok: false; codigo: 'SIN_PERFIL' | 'LECTURA' | 'STORAGE' | 'FILA'; mensaje: string };

/**
 * Supresión del perfil de Network a petición de su titular. NO borra la cuenta
 * de Auth (puede ser socia, instructora o propietaria en Tentare).
 *
 * Orden deliberado: 1) documentos del bucket privado, 2) foto pública,
 * 3) comprobar que la carpeta quedó vacía, 4) fila `red_perfiles` (el resto de
 * tablas `red_*` cuelgan de ella en CASCADE). Si falla un paso de Storage, la
 * fila sigue viva y todo es reintentable; nunca se devuelve `ok` si algo dijo no.
 */
export async function suprimirPerfilNetwork(admin: Admin, authUserId: string): Promise<ResultadoSupresionPerfil> {
  const { data: perfil, error: errPerfil } = await admin
    .from('red_perfiles').select('id').eq('auth_user_id', authUserId).maybeSingle();
  if (errPerfil) return { ok: false, codigo: 'LECTURA', mensaje: 'No hemos podido leer tu perfil. No se ha borrado nada.' };
  if (!perfil) return { ok: false, codigo: 'SIN_PERFIL', mensaje: 'No tienes ningún perfil de Network.' };
  const perfilId = (perfil as { id: string }).id;

  const errorStorage = {
    ok: false as const, codigo: 'STORAGE' as const,
    mensaje: 'No hemos podido borrar tus documentos. Tu perfil sigue existiendo; vuelve a intentarlo en unos minutos.',
  };

  const listado = await listarCarpetaPropia(admin, authUserId);
  if (!listado.ok) return errorStorage;
  const rutas = rutasABorrarAlSuprimirPerfil(authUserId, listado.objetos);
  const docs = await borrarRutas(admin, BUCKET_DOCUMENTOS_RED, rutas);
  if (!docs.ok) return errorStorage;

  const foto = await borrarRutas(admin, BUCKET_AVATARS, [avatarNetworkDe(perfilId)]);
  if (!foto.ok) return errorStorage;

  const comprobacion = await listarCarpetaPropia(admin, authUserId);
  if (!comprobacion.ok || rutasABorrarAlSuprimirPerfil(authUserId, comprobacion.objetos).length > 0) return errorStorage;

  const { error: errBorrar, count } = await admin
    .from('red_perfiles').delete({ count: 'exact' }).eq('id', perfilId).eq('auth_user_id', authUserId);
  if (errBorrar || !count) {
    return {
      ok: false, codigo: 'FILA',
      mensaje: 'Tus documentos y tu foto ya se han borrado, pero tu perfil no. Vuelve a intentarlo.',
    };
  }

  // Registro mínimo de la supresión, sin datos personales: ni la cuenta, ni el
  // nombre, ni IP ni navegador — solo que ocurrió, sobre qué id (que ya no
  // resuelve a nadie) y cuánto se borró. Nunca tumba la supresión ya hecha.
  try {
    const { error } = await admin.from('plataforma_auditoria').insert({
      actor_auth_user_id: null,
      actor_nombre: 'Titular del perfil (autoservicio)',
      accion: 'network.perfil.suprimido',
      objetivo_tipo: 'red_perfil',
      objetivo_id: perfilId,
      resumen: 'Perfil de Network suprimido a petición de su titular',
      despues: { documentos_borrados: docs.borradas, foto_borrada: foto.borradas > 0 },
    });
    if (error) console.error('[network:supresion] auditoría', error.message);
  } catch (e) {
    console.error('[network:supresion] auditoría', e instanceof Error ? e.message : e);
  }

  return { ok: true, perfilId, documentosBorrados: docs.borradas, fotoBorrada: foto.borradas > 0 };
}
