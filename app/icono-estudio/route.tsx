import { ImageResponse } from 'next/og';
import { inicialDe, coloresMonograma, tamanoValido } from '@/lib/monograma-estudio';

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const inicial = inicialDe(searchParams.get('inicial'));
  const { fondo, texto } = coloresMonograma(searchParams.get('color'));
  const size = tamanoValido(searchParams.get('size'));

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
