// Extrae el color de marca DECLARADO por un tema importado, para precargar
// un tema NATIVO nuevo — la dirección contraria a enlazar-datos.ts (que
// escribe el dato real DENTRO del ZIP en cada petición). Aquí se lee el
// `default` tal cual lo trae el diseño, del HTML ORIGINAL sin enlazar
// (`contenidoFuenteDeFichero`, no `servirFicheroTema`): si se leyera la
// versión ya servida, `brand` ya habría sido sustituido por el color que el
// estudio tuviera guardado ANTES — se extraería el dato equivocado.
//
// Por qué solo el color, y no fotos ni texto (ver el pedido completo del
// fundador): las fotos de `<image-slot>` viven en R2 bajo el origen aislado
// del importador, sin URL pública estable fuera de él — copiarlas a donde
// vive de verdad la imagen de un tema nativo es un problema de migración de
// activos aparte, no una extracción de texto. Y `studioName` en el ZIP es un
// placeholder del diseño ("Estudio Alma"), no dato útil: el nombre real del
// estudio ya está en `studios.nombre`. El color de marca es lo único que es
// a la vez extraíble con certeza (contrato documentado, `data-props`) y
// directamente útil en un `ThemeConfig`.
//
// Mismo mecanismo de lectura que `enlazarPropsDeclarados` (el propio export
// declara sus props editables en `<script data-dc-script data-props="...">`),
// pero LEE en vez de escribir. Puro: nada de red ni de Supabase aquí.

import { hexARgb } from '../wcag-contrast.ts';

function decodificarEntidadesHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * El `default` de la prop `brand` declarada en `data-props`, si el HTML la
 * trae y su valor es un hex de verdad — `null` en cualquier otro caso (sin
 * `data-props`, sin `brand`, JSON roto, o un valor que no es un color). Nunca
 * lanza: un ZIP mal formado no puede tumbar la extracción, solo dejarla sin
 * nada que ofrecer.
 */
export function extraerColorDeclarado(html: string): string | null {
  const m = /<script[^>]*\bdata-dc-script\b[^>]*\bdata-props="([^"]*)"[^>]*>/.exec(html);
  if (!m) return null;

  let props: Record<string, { default?: unknown }>;
  try {
    props = JSON.parse(decodificarEntidadesHtml(m[1]));
  } catch {
    return null;
  }
  if (!props || typeof props !== 'object') return null;

  const valor = props.brand?.default;
  if (typeof valor !== 'string') return null;
  return hexARgb(valor) ? valor : null;
}
