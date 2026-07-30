// Manifest PWA del PANEL (app/(dashboard)/*), distinto del raíz
// (app/manifest.ts, la landing) y del portal por estudio
// (app/portal/[slug]/manifest.webmanifest). start_url/scope anclados al
// panel para que "Añadir a pantalla de inicio" desde dentro instale de
// verdad el panel, no la landing — ver comentario en
// app/(dashboard)/layout.tsx. No hay slug aquí porque el rol/estudio se
// resuelve tras autenticar (mismo motivo por el que /login y el manifest
// raíz se quedan con la marca paraguas "Tentare"); si algún día se necesita
// una versión por estudio, seguir el patrón de la ruta del portal.
export async function GET() {
  return Response.json(
    {
      name: 'Tentare',
      short_name: 'Tentare',
      description: 'Panel de gestión para tu estudio de pilates',
      start_url: '/dashboard',
      scope: '/',
      display: 'standalone',
      background_color: '#EEEEE8',
      theme_color: '#343825',
      orientation: 'portrait',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } },
  );
}
