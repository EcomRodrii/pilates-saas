// El icono de un estudio que no ha subido logo.
//
// Sin logo, la app instalada en el móvil de una socia y sus notificaciones
// push llevaban el icono de Tentare — marca ajena, en la pantalla de inicio de
// OTRO negocio. No hace falta ninguna foto para arreglarlo: la inicial del
// nombre sobre el color de marca que el estudio ya eligió es su propio icono,
// no uno prestado.
//
// Cero dependencias: se usa desde una Route Handler (server) y desde el
// componente que renderiza el PNG (next/og), y se prueba con `node --test`.

import { hexARgb, foregroundParaFondo } from './wcag-contrast.ts';

export const COLOR_MONOGRAMA_POR_DEFECTO = '#343825'; // oliva de marca, mismo fallback que el resto del repo

/**
 * La inicial que se pinta.
 *
 * `Array.from` y no `nombre[0]`: un nombre puede empezar por un emoji o un
 * carácter fuera del plano básico (algún estudio real empieza por un emoji en
 * el campo nombre), y `string[0]` corta ese carácter por la mitad — sale un
 * signo de interrogación en un rombo, no la inicial.
 */
export function inicialDe(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '').trim();
  if (!limpio) return '?';
  return Array.from(limpio)[0].toUpperCase();
}

/** Fondo y texto del monograma. Fondo inválido → el oliva de marca, nunca un color roto. */
export function coloresMonograma(colorPrimario: string | null | undefined): { fondo: string; texto: string } {
  const fondo = hexARgb(colorPrimario ?? '') ? (colorPrimario as string) : COLOR_MONOGRAMA_POR_DEFECTO;
  return { fondo, texto: foregroundParaFondo(fondo) };
}

/** Tamaños que sirve la ruta. Cualquier otro valor cae a 512. */
export const TAMANOS_MONOGRAMA = [192, 512] as const;
export type TamanoMonograma = (typeof TAMANOS_MONOGRAMA)[number];

export function tamanoValido(v: string | null): TamanoMonograma {
  const n = Number(v);
  return (TAMANOS_MONOGRAMA as readonly number[]).includes(n) ? (n as TamanoMonograma) : 512;
}

/**
 * La URL del icono, relativa. `nombre` y `colorPrimario` van EN la URL (no un
 * id de estudio) a propósito: dos cosas se resuelven solas con esto.
 *
 *  1. Sin ninguna consulta a BD dentro de la propia ruta de imagen — el
 *     llamador ya tiene el nombre y el color, es lo mismo que usa hoy el
 *     manifest.
 *  2. Cache por URL sin caducidad: si la propietaria cambia su color de
 *     marca, la URL cambia con él y el navegador pide un icono nuevo solo.
 *     No hace falta invalidar nada a mano.
 */
export function urlMonograma(
  nombre: string | null | undefined,
  colorPrimario: string | null | undefined,
  size: TamanoMonograma = 512,
): string {
  const params = new URLSearchParams({ inicial: inicialDe(nombre), color: coloresMonograma(colorPrimario).fondo, size: String(size) });
  return `/icono-estudio?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// El icono cuadrado del estudio, CON su logo cuando lo tiene.
//
// ⚠️ EL FALLO QUE ARREGLA. El manifest del portal ya usaba `logoUrl`… y además
// declaraba `/icon-192.png` y `/icon-512.png`, que son los de TENTARE
// (`scripts/regenerar-marca.mjs` los genera de `tentare-icono-color.svg`). Se
// habían añadido «por si el logo no es cuadrado», y ahí está el problema: un
// instalador de Android que exige un 192/512 exacto descarta el logo —que va
// como `sizes: 'any'`— y se queda con el único candidato de ese tamaño, que es
// la marca de otra empresa. La alumna acababa con el icono de Tentare en su
// pantalla de inicio.
//
// La solución no es quitar los tamaños exactos (los hacen falta), sino que esos
// tamaños exactos sean SUYOS: el logo compuesto sobre su color de marca, en un
// lienzo cuadrado. Y si no hay logo, el monograma de siempre.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Es una URL de logo que esta app puede pedir?
 *
 * ⚠️ La ruta del icono descarga esta URL en el SERVIDOR para componer el PNG,
 * así que un parámetro libre sería una puerta para hacerle pedir lo que sea a
 * donde sea (SSRF). Solo se acepta el almacenamiento público de nuestro propio
 * Supabase, que es de donde salen los logos (`subirLogoEstudio`).
 */
export function logoServible(logoUrl: string | null | undefined, baseSupabase: string | null | undefined): boolean {
  const url = (logoUrl ?? '').trim();
  const base = (baseSupabase ?? '').trim().replace(/\/$/, '');
  if (!url || !base) return false;
  return url.startsWith(`${base}/storage/v1/object/public/`);
}

/**
 * La URL del icono del estudio a un tamaño exacto. Con logo servible, el icono
 * lo lleva; sin él, la inicial. Nunca el de Tentare.
 */
export function urlIconoEstudio(
  nombre: string | null | undefined,
  colorPrimario: string | null | undefined,
  size: TamanoMonograma,
  logoUrl?: string | null,
  baseSupabase?: string | null,
): string {
  const base = urlMonograma(nombre, colorPrimario, size);
  return logoServible(logoUrl, baseSupabase)
    ? `${base}&logo=${encodeURIComponent((logoUrl as string).trim())}`
    : base;
}
