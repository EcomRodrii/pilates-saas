import { ImageResponse } from 'next/og';
import { inicialDe, coloresMonograma, tamanoValido, logoServible } from '@/lib/monograma-estudio';

// El icono de un estudio que no ha subido logo — inicial de su nombre sobre
// el color de marca que ya eligió. Sirve a dos sitios que hoy caen los dos al
// icono de TENTARE cuando el estudio no tiene logo: el manifest de la PWA
// (app instalada en el móvil de una socia) y las notificaciones push
// (lib/notifications/channels.ts). Ver lib/monograma-estudio.ts para el
// porqué completo.
//
// Los datos van EN LA URL (inicial + color ya resueltos), no un id de
// estudio: sin consulta a BD dentro de esta ruta, y la URL cambia sola si la
// propietaria cambia su color — cache eterno sin invalidar nada a mano.
//
// Sin validar contra un estudio real: es texto/color arbitrario dentro de
// `<img>`/`<svg>` generado por `ImageResponse` (JSX, no HTML crudo), así que
// no hay inyección posible — como mucho, alguien pinta su propio PNG con su
// propia inicial y color, que es justo lo que hace esta ruta a propósito.
export const runtime = 'edge';

/** Tope de descarga. `subirLogoEstudio` ya acota el logo a 2 MB; esto es el
 *  cinturón por si alguna vez subió algo mayor por otra vía. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Descarga el logo y lo devuelve como `data:` para incrustarlo, o `null` si no
 * se puede usar.
 *
 * ⚠️ SE DESCARGA AQUÍ Y NO SE DEJA QUE LO HAGA `ImageResponse`. Dejándoselo a
 * él, un logo que no se pudiera bajar —borrado, red caída, un SVG que no sabe
 * pintar— no daba error: componía el icono SIN la imagen, y salía un cuadrado
 * de color liso, sin logo y sin inicial. Medido: 566 bytes de nada. Bajándolo
 * antes se sabe si hay imagen, y si no la hay se cae al monograma, que es un
 * icono de verdad.
 *
 * SVG queda fuera: `ImageResponse` no lo rasteriza, así que un logo en SVG
 * daría exactamente ese cuadrado vacío. Para esos, la inicial.
 */
async function comoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const tipo = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!tipo.startsWith('image/') || tipo === 'image/svg+xml') return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) return null;
    // Por trozos: `String.fromCharCode(...bytes)` con un logo de cientos de
    // miles de bytes revienta la pila por número de argumentos.
    let binario = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binario += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return `data:${tipo};base64,${btoa(binario)}`;
  } catch {
    // Red caída o URL que no responde: la inicial es mejor que un cuadrado en
    // blanco en la pantalla de inicio de su alumna.
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const inicial = inicialDe(searchParams.get('inicial'));
  const { fondo, texto } = coloresMonograma(searchParams.get('color'));
  const size = tamanoValido(searchParams.get('size'));

  // Con logo, el icono es SU logo sobre su color, no una inicial. Es lo que
  // hace que la app instalada en el móvil de su alumna lleve la marca correcta
  // a los tamaños exactos que pide un instalador de Android — antes, el único
  // candidato de 192/512 era el icono de Tentare.
  //
  // ⚠️ `logoServible` NO es cosmético: esta ruta DESCARGA la URL en servidor
  // para componer el PNG, así que sin esa comprobación cualquiera podría
  // hacerle pedir lo que quisiera a donde quisiera. Solo el bucket público de
  // nuestro propio Supabase.
  const logo = searchParams.get('logo');
  const logoIncrustado = logoServible(logo, process.env.NEXT_PUBLIC_SUPABASE_URL)
    ? await comoDataUrl(logo as string)
    : null;

  if (logoIncrustado) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%', height: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: fondo,
            // 16 % de aire por lado: el sistema operativo recorta el icono en
            // un círculo o un cuadrado redondeado, y un logo pegado al borde se
            // queda sin los extremos.
            padding: Math.round(size * 0.16),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoIncrustado}
            alt=""
            width={Math.round(size * 0.68)}
            height={Math.round(size * 0.68)}
            style={{ objectFit: 'contain' }}
          />
        </div>
      ),
      { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: fondo,
          color: texto,
          fontFamily: 'sans-serif',
          fontWeight: 700,
          // 55 % del lienzo, mismo criterio visual que un favicon de letra:
          // ni tan grande que roce el borde, ni tan pequeño que se pierda en
          // el icono redondeado que le pone encima el sistema operativo.
          fontSize: Math.round(size * 0.55),
        }}
      >
        {inicial}
      </div>
    ),
    {
      width: size,
      height: size,
      // Determinista por URL (ver arriba): un año es seguro porque un cambio
      // de color genera una URL nueva, nunca la misma URL con contenido
      // distinto.
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  );
}
