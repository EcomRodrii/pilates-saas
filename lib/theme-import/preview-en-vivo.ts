// Vista previa EN VIVO del editor de código — sin persistir nada en R2/BD.
// El editor debouncea (~500 ms) y llama al endpoint que usa esto en cada
// pausa de escritura; lo que se ve en el iframe nunca es "lo guardado", es
// "lo que hay ahora mismo en el editor".
//
// ⚠️ Alcance deliberado, dos casos distintos según qué clase de fichero se
// edita — no un motor genérico de sustitución de cualquier fichero en
// cualquier posición del árbol de dependencias:
//
//  - Editando un HTML: se renderiza ESE fichero como página (con su propio
//    `reescribirHtml`/`enlazarDatosReales`), usando el texto del editor tal
//    cual en vez de leerlo de R2. Sus CSS/imágenes enlazadas se resuelven
//    del último GUARDADO (o el original) — la vista previa de un cambio de
//    HTML no depende de que también estés editando su CSS a la vez.
//  - Editando un CSS: no hay "página" que renderizar desde un CSS suelto,
//    así que se renderiza el HTML de entrada (`entry_html`) normal, y el
//    texto del editor se añade como una CAPA extra de `<style>` justo antes
//    de `</head>` — la cascada CSS hace que gane sobre el stylesheet ya
//    enlazado sin tener que reescribir ningún `<link>` a un fichero que aún
//    no existe en ningún sitio (nada se ha guardado todavía). Esto NO es una
//    sustitución 1 a 1 del fichero: si la edición QUITA una regla, la vieja
//    sigue aplicándose hasta guardar. Vale para iterar en caliente; "cómo
//    queda de verdad" es Guardar + Ver publicado.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { descargarObjetoR2 } from '@/lib/r2';
import { reescribirHtml } from '@/lib/theme-import/reescribir-rutas';
import { enlazarDatosReales, type FilaTemaImportado } from '@/lib/theme-import/servir';

export interface EdicionEnVivo {
  ruta: string;
  contenido: string;
}

export async function resolverPreviewEnVivo(
  admin: SupabaseClient,
  fila: FilaTemaImportado,
  edicion: EdicionEnVivo,
  urlDeRuta: (rutaResuelta: string) => string | undefined,
): Promise<NextResponse> {
  if (fila.estado !== 'listo') {
    return new NextResponse('Este tema no se pudo importar en modo estático.', { status: 409 });
  }

  const manifest = fila.manifest;
  const fichero = manifest.ficheros.find((f) => f.ruta === edicion.ruta);
  if (!fichero || (fichero.clase !== 'html' && fichero.clase !== 'css')) {
    return NextResponse.json({ error: 'Solo se puede previsualizar HTML o CSS del tema.' }, { status: 400 });
  }

  const esRelativoDeRuta = (rutaResuelta: string): string | undefined =>
    manifest.ficheros.some((f) => f.ruta === rutaResuelta) ? urlDeRuta(rutaResuelta) : undefined;

  if (fichero.clase === 'html') {
    let html = reescribirHtml(edicion.contenido, edicion.ruta, esRelativoDeRuta);
    html = await enlazarDatosReales(admin, fila.studio_id, html);
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  }

  // CSS: renderiza el HTML de entrada normal (editado-si-existe, original si
  // no — igual que `servirFicheroTema`) y le añade el CSS del editor como
  // capa extra.
  const entryRuta = fila.entry_html;
  if (!entryRuta) return new NextResponse('No encontrado', { status: 404 });
  const entryEditado = fila.rutas_editadas?.includes(entryRuta) ?? false;
  const claveEntry = entryEditado ? `${fila.storage_prefix}editado/${entryRuta}` : `${fila.storage_prefix}${entryRuta}`;
  const bytes = await descargarObjetoR2(claveEntry);
  if (!bytes) return new NextResponse('No encontrado', { status: 404 });

  let html = reescribirHtml(new TextDecoder().decode(bytes), entryRuta, esRelativoDeRuta);
  html = await enlazarDatosReales(admin, fila.studio_id, html);

  const capa = `<style data-preview-en-vivo="${edicion.ruta}">\n${edicion.contenido}\n</style>`;
  html = html.includes('</head>') ? html.replace('</head>', `${capa}\n</head>`) : `${html}${capa}`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
