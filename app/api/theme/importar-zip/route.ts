import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { r2Configurado, subirObjetoR2, borrarPrefijoR2 } from '@/lib/r2';
import { descomprimirTema, ZipInvalidoError } from '@/lib/theme-import/zip-parser';
import { contentTypeDe } from '@/lib/theme-import/content-type';

// Node runtime, no edge: `fflate` y el manejo de `Uint8Array` grandes van
// mejor aquí, y `getSupabaseAdmin`/R2 ya asumen Node en el resto del repo.
export const runtime = 'nodejs';
// Un ZIP de tema puede pesar varios MB de imágenes — el límite por defecto
// del body parser de Next (1 MB en algunos entornos) se queda corto.
export const maxDuration = 60;

// POST /api/theme/importar-zip — sube un tema exportado como .zip.
//
// Solo PROPIETARIO, mismo gate de plan que editar la marca (`PUT /api/theme`):
// esto es la misma feature, otra vía de entrada.
//
// Analiza → sube a R2 → guarda el manifest. NUNCA "reconstruye" el tema: si
// el ZIP no es compatible con el modo estático de esta versión, se guarda
// igual (para poder enseñar el motivo en el panel) con
// `estado: 'incompatible'` y el detalle exacto — nunca una aproximación
// silenciosa.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO')
    return NextResponse.json({ error: 'Solo el propietario puede importar un tema' }, { status: 403 });
  if (!(await featureDeEstudio(sesion.studioId, 'marca')))
    return NextResponse.json({ error: 'La app de marca personalizada está incluida a partir del plan Estudio. Mejora tu plan para importar un tema.' }, { status: 403 });

  if (!r2Configurado()) {
    return NextResponse.json(
      { error: 'El almacenamiento de temas importados no está configurado en este entorno.' },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  const fichero = form?.get('zip');
  if (!fichero || !(fichero instanceof File)) {
    return NextResponse.json({ error: 'Falta el fichero .zip' }, { status: 400 });
  }

  const buffer = new Uint8Array(await fichero.arrayBuffer());

  let descomprimido: ReturnType<typeof descomprimirTema>;
  try {
    descomprimido = descomprimirTema(buffer);
  } catch (e) {
    if (e instanceof ZipInvalidoError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return errorInterno('theme:importar-zip:descomprimir', e, 'No se ha podido leer el ZIP.');
  }

  const { manifest, contenidos } = descomprimido;
  const id = randomUUID();
  const prefix = `temas-importados/${sesion.studioId}/${id}/`;

  // Solo se sube a R2 lo que de verdad se va a servir: si el ZIP es
  // incompatible (por ejemplo, trae .tsx sin compilar) no tiene sentido subir
  // sus bytes — se guarda el manifest igualmente para poder EXPLICAR por qué,
  // pero sin gastar almacenamiento en algo que no se va a renderizar.
  const esCompatible = manifest.incompatibilidades.length === 0;
  if (esCompatible) {
    try {
      await Promise.all(
        [...contenidos.entries()].map(([ruta, bytes]) =>
          subirObjetoR2(`${prefix}${ruta}`, bytes, contentTypeDe(ruta))),
      );
    } catch (e) {
      // Best-effort: si algo quedó a medio subir, no dejar basura en R2.
      await borrarPrefijoR2(prefix).catch(() => {});
      return errorInterno('theme:importar-zip:subir', e, 'No se han podido subir los ficheros del tema.');
    }
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });

  const { error } = await admin.from('theme_imports').insert({
    id,
    studio_id: sesion.studioId,
    nombre: fichero.name.replace(/\.zip$/i, ''),
    manifest,
    storage_prefix: prefix,
    entry_html: esCompatible ? (manifest.entryPoints[0] ?? null) : null,
    estado: esCompatible ? 'listo' : 'incompatible',
    detalle: esCompatible ? null : manifest.incompatibilidades.join(' '),
    creado_por: sesion.userId,
  });
  if (error) {
    if (esCompatible) await borrarPrefijoR2(prefix).catch(() => {});
    return errorInterno('theme:importar-zip:guardar', error, 'No se ha podido guardar el tema importado.');
  }

  return NextResponse.json({ id, manifest, estado: esCompatible ? 'listo' : 'incompatible' });
}
