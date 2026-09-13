// Reglas PURAS de qué objetos de Storage se borran en Tentare Network — sin
// Supabase ni React, para poder probarlas con `node --test`.
//
// Por qué existe: el bucket privado `red-documentos-identidad` guarda el DNI/NIE
// (anverso y reverso), certificados y el portfolio, y hasta aquí NINGÚN código
// borraba un documento de identidad: ni al resolver la verificación, ni al
// retirar una certificación, ni al volver a subir uno borroso. La mitad de los
// objetos del bucket no los referenciaba ninguna fila.

// ⚠️ DECISIÓN DE MINIMIZACIÓN PENDIENTE DE REVISIÓN LEGAL.
// Con `false`, al resolver (aprobar O rechazar) una verificación de identidad o
// una certificación se BORRA la imagen del documento y en la fila solo queda el
// resultado, cuándo y quién lo resolvió (`documento_borrado_en`). Un moderador
// ya no podrá volver a abrir el documento después de resolver. Si asesoría
// jurídica decide que hay que conservarlo un plazo, se cambia aquí a `true` y
// el borrado pasa a ser trabajo de una purga con ese plazo — no se reescribe
// el flujo.
export const CONSERVAR_DOCUMENTO_TRAS_VERIFICAR = false;

export const BUCKET_DOCUMENTOS_RED = 'red-documentos-identidad';
export const BUCKET_AVATARS = 'avatars';

/** Prefijos con los que el cliente sube a `<auth_uid>/` (lib/network/documentos-identidad.ts, portfolio-storage.ts). */
export type PrefijoDocumento = 'identidad' | 'certificacion';

/** Lo mínimo que devuelve `storage.list()` por objeto. Las carpetas llegan con `id: null`. */
export interface ObjetoCarpeta {
  name: string;
  id: string | null;
  created_at?: string | null;
}

/** Foto de perfil de Network en el bucket público `avatars` (subirFotoPerfilNetwork). */
export function avatarNetworkDe(perfilId: string): string {
  return `network-${perfilId}`;
}

function esNombreSeguro(nombre: string): boolean {
  return nombre.length > 0 && !nombre.includes('/') && nombre !== '.' && nombre !== '..';
}

/**
 * Rutas completas a borrar al suprimir un perfil: TODO lo que cuelga de la
 * carpeta propia `<auth_uid>/` (identidad, certificaciones, portfolio).
 * Solo ficheros (las entradas con `id: null` son carpetas) y solo nombres de un
 * segmento: una ruta que no empiece por la carpeta de ESTA usuaria no sale de
 * aquí aunque el listado viniera mal.
 */
export function rutasABorrarAlSuprimirPerfil(authUserId: string, objetos: ObjetoCarpeta[]): string[] {
  if (!authUserId || authUserId.includes('/')) return [];
  return [...new Set(
    objetos
      .filter(o => o.id !== null && esNombreSeguro(o.name))
      .map(o => `${authUserId}/${o.name}`),
  )];
}

/**
 * Rutas del documento que se borran al RESOLVER una verificación o
 * certificación. Vacío si se decide conservar, o si ya no quedaba nada.
 */
export function rutasDocumentoTrasResolver(
  fila: { documento_path: string | null; documento_path_reverso?: string | null },
  conservar: boolean = CONSERVAR_DOCUMENTO_TRAS_VERIFICAR,
): string[] {
  if (conservar) return [];
  return [...new Set([fila.documento_path, fila.documento_path_reverso ?? null].filter((p): p is string => !!p))];
}

/**
 * Objetos que quedaron huérfanos al volver a subir un documento: están en la
 * carpeta propia con el prefijo del tipo, NO los referencia ninguna fila y
 * tienen al menos `margenMs` de antigüedad.
 *
 * El margen protege una subida en curso en otra pestaña (subida hecha, fila aún
 * sin registrar). Para identidad se usa 0: solo puede haber una verificación
 * viva y la limpieza corre DESPUÉS de registrar la nueva, así que sus dos caras
 * ya están referenciadas.
 */
export function huerfanosTrasRegistrar(p: {
  authUserId: string;
  objetos: ObjetoCarpeta[];
  prefijo: PrefijoDocumento;
  referenciadas: Iterable<string | null | undefined>;
  ahora: Date;
  margenMs: number;
}): string[] {
  if (!p.authUserId || p.authUserId.includes('/')) return [];
  const referenciadas = new Set([...p.referenciadas].filter((r): r is string => !!r));
  return p.objetos
    .filter(o => o.id !== null && esNombreSeguro(o.name) && o.name.startsWith(`${p.prefijo}-`))
    .filter(o => {
      if (p.margenMs <= 0) return true;
      const creado = o.created_at ? Date.parse(o.created_at) : NaN;
      // Sin fecha fiable no se borra: mejor un huérfano más que borrar una subida en curso.
      return Number.isFinite(creado) && p.ahora.getTime() - creado >= p.margenMs;
    })
    .map(o => `${p.authUserId}/${o.name}`)
    .filter(ruta => !referenciadas.has(ruta));
}

/** Estados en que la propia usuaria puede retirar una certificación (y su documento). */
export const ESTADOS_CERTIFICACION_RETIRABLE = ['pendiente', 'rechazado'] as const;
