import { ImageResponse } from 'next/og';

// Generador compartido de OG/Twitter image. Cada `opengraph-image.tsx` de
// ruta es un fichero-convención de Next.js que SOLO aplica al segmento
// exacto donde vive — NO cascada a subrutas ni a rutas hermanas (verificado
// en vivo: el de app/ no llegaba a /comparativa). Por eso cada ruta que
// necesite imagen propia importa este generador en su propio fichero, en
// vez de depender de que uno solo cubra todo el sitio.
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_CONTENT_TYPE = 'image/png';

export function generarOgImage(titulo: string, subtitulo: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#0F0F0F',
          color: '#E8E8E4',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 700, color: '#fff', marginBottom: 40 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 13,
              background: '#D9C29E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#343825',
              fontWeight: 800,
              fontSize: 25,
            }}
          >
            T
          </div>
          Tentare
        </div>
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12, maxWidth: 980 }}>{titulo}</div>
        <div style={{ display: 'flex', fontSize: 24, color: '#A6A69E', marginTop: 26, maxWidth: 860 }}>{subtitulo}</div>
      </div>
    ),
    OG_IMAGE_SIZE
  );
}
