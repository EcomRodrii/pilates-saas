// Manifest PWA de NETWORK (app/network/*), distinto del raíz (app/manifest.ts,
// la landing/plataforma) y del panel de gestión (app/panel.webmanifest). Sin
// esto, "Añadir a pantalla de inicio" desde /network/alumna/inicio instalaba
// el manifest RAÍZ heredado (start_url: '/'), así que el icono instalado
// abría la landing, nunca Network — mismo bug de categoría que ya resolvió
// panel.webmanifest para el panel (ver el comentario en
// app/(dashboard)/layout.tsx).
//
// start_url apunta a /network/alumna/inicio, no a /network a secas: hoy es
// la ÚNICA pantalla logueada de autoservicio de alumna (el resto de /network
// es marketplace público o autoservicio de instructora), así que es el punto
// de entrada real tras instalar — igual criterio que panel.webmanifest
// (start_url: '/dashboard', no '/'). scope se deja en '/network' (más ancho
// que start_url, mismo patrón que panel.webmanifest con scope: '/') para que
// navegar a Descubrir/una ficha de instructora o estudio desde dentro de la
// app instalada no la "saque" de su propio scope.
//
// No hay slug de rol/estudio aquí (a diferencia del portal por estudio,
// app/portal/[slug]/manifest.webmanifest): Network no tiene marca blanca,
// es siempre la marca Tentare Network.
export async function GET() {
  return Response.json(
    {
      name: 'Tentare Network',
      short_name: 'Network',
      description: 'Tu autoservicio de alumna en Tentare Network: favoritos, mensajes y solicitudes.',
      start_url: '/network/alumna/inicio',
      scope: '/network',
      display: 'standalone',
      background_color: '#FAF9F5',
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
