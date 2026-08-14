// Servir un fichero de un tema importado — compartido por las DOS rutas que
// devuelven bytes reales de un ZIP subido:
//
//  1. `app/api/theme/importado/[id]/[[...ruta]]/route.ts` — la vista previa
//     del editor, con token firmado, CUALQUIER estado (borrador o publicado),
//     dentro del iframe en sandbox del panel.
//  2. `app/tema-publicado/[slug]/[[...ruta]]/route.ts` — el origen público
//     aislado (`imports.tentare.app`), SOLO si `publicado = true`.
//
// La lógica de "qué fichero, qué reescritura, qué datos reales enlazar" es
// idéntica en las dos — la única diferencia es CÓMO se autoriza (token vs.
// host+slug+publicado) y CÓMO se construye la URL de un asset relativo (con
// `?t=` o sin él). Por eso vive aquí una sola vez, parametrizada con
// `urlDeRuta`, en vez de duplicar ~50 líneas no triviales.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { descargarObjetoR2 } from '@/lib/r2';
import { contentTypeDe } from '@/lib/theme-import/content-type';
import { reescribirHtml, reescribirCss } from '@/lib/theme-import/reescribir-rutas';
import { enlazarPropsDeclarados, enlazarFotosDeSlots } from '@/lib/theme-import/enlazar-datos';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';
import type { ImportedThemeManifest } from '@/lib/theme-import/manifest';

export interface FilaTemaImportado {
  studio_id: string;
  storage_prefix: string;
  entry_html: string | null;
  estado: string;
  manifest: ImportedThemeManifest;
}

/**
 * Resuelve `rutaPedida` (o el `entry_html` si no se pide ninguna ruta
 * concreta) contra el manifest, lo descarga de R2, reescribe sus rutas
 * relativas con `urlDeRuta`, y —si es HTML— enlaza los datos reales del
 * estudio. Nunca "reconstruye": lee el byte real y solo toca URLs/props ya
 * documentadas en `reescribir-rutas.ts`/`enlazar-datos.ts`.
 */
export async function servirFicheroTema(
  admin: SupabaseClient,
  fila: FilaTemaImportado,
  rutaPedida: string | null,
  urlDeRuta: (rutaResuelta: string) => string | undefined,
): Promise<NextResponse> {
  if (fila.estado !== 'listo') {
    return new NextResponse('Este tema no se pudo importar en modo estático.', { status: 409 });
  }

  const ruta = rutaPedida || fila.entry_html;
  if (!ruta) return new NextResponse('No encontrado', { status: 404 });

  const manifest = fila.manifest;
  const existe = manifest.ficheros.some((f) => f.ruta === ruta);
  if (!existe) return new NextResponse('No encontrado', { status: 404 });

  const bytes = await descargarObjetoR2(`${fila.storage_prefix}${ruta}`);
  if (!bytes) return new NextResponse('No encontrado', { status: 404 });

  const tipo = contentTypeDe(ruta);
  const esRelativoDeRuta = (rutaResuelta: string): string | undefined =>
    manifest.ficheros.some((f) => f.ruta === rutaResuelta) ? urlDeRuta(rutaResuelta) : undefined;

  if (tipo.startsWith('text/html')) {
    let html = reescribirHtml(new TextDecoder().decode(bytes), ruta, esRelativoDeRuta);
    html = await enlazarDatosReales(admin, fila.studio_id, html);
    return new NextResponse(html, { headers: { 'Content-Type': tipo } });
  }
  if (tipo.startsWith('text/css')) {
    const css = reescribirCss(new TextDecoder().decode(bytes), ruta, esRelativoDeRuta);
    return new NextResponse(css, { headers: { 'Content-Type': tipo } });
  }
  // Assets (imágenes, fuentes, vídeo): bytes tal cual, sin tocar ni un byte —
  // el punto 8 del encargo ("no reemplazar assets, no cambiar dimensiones").
  return new NextResponse(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    headers: { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=1200' },
  });
}

// «TEMA ORIGINAL + TENTARE DATA → THEME RENDERER» (punto 12 del encargo): el
// nombre/color/fotos del estudio real, enlazados en cada petición sobre el
// HTML tal cual vino del ZIP — ver `lib/theme-import/enlazar-datos.ts` para
// el porqué exacto de qué se enlaza y qué NO (la lista de clases del tema,
// bloqueada por el sandbox sin `allow-same-origin` / el aislamiento de
// origen del subdominio público, decisión explícita de seguridad).
export async function enlazarDatosReales(
  admin: SupabaseClient,
  studioId: string,
  html: string,
): Promise<string> {
  const { data: estudio } = await admin
    .from('studios')
    .select('nombre, color_primario, foto_url, imagen_bienvenida_url')
    .eq('id', studioId)
    .maybeSingle();
  if (!estudio) return html;

  const propias = [estudio.imagen_bienvenida_url, estudio.foto_url] as (string | null | undefined)[];
  const conDatos = enlazarPropsDeclarados(html, {
    studioName: estudio.nombre ?? undefined,
    brand: estudio.color_primario ?? undefined,
  });
  return enlazarFotosDeSlots(conDatos, {
    welcomeHero: imagenDeEstudio('portada', propias, studioId),
    homeHero: imagenDeEstudio('banner', propias, studioId),
    centroFachada: imagenDeEstudio('banda', propias, studioId),
    // `avatarPerfil` se deja SIN enlazar a propósito: ni la vista previa del
    // editor ni el origen público tienen sesión de socia — no hay ninguna
    // foto de perfil real que poner.
  });
}
