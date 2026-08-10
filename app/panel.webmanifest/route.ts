// Manifest PWA del PANEL (app/(dashboard)/*), distinto del raíz
// (app/manifest.ts, la landing) y del portal por estudio
// (app/portal/[slug]/manifest.webmanifest). start_url/scope anclados al
// panel para que "Añadir a pantalla de inicio" desde dentro instale de
// verdad el panel, no la landing — ver comentario en
// app/(dashboard)/layout.tsx. No hay slug aquí porque el rol/estudio se
// resuelve tras autenticar (mismo motivo por el que /login y el manifest
// raíz se quedan con la marca paraguas "Tentare").
//
// ⚠️ Un manifest distinto por rol (Core/Manager) se evaluó y se descartó,
// no es trabajo pendiente. El patrón del portal (slug en la URL) NO es
// replicable aquí: no hay slug de rol en esta URL, y la sesión del panel
// vive en localStorage (verificarSesionStaff lee `Authorization: Bearer`,
// no cookies), así que esta ruta no tiene forma de saber quién pide el
// manifest. Las dos vías evaluadas para arreglarlo:
//  · Mutar el `href` de <link rel="manifest"> en cliente tras resolver
//    useRol() — descartado: sin garantía cross-browser (iOS Safari en
//    particular no relee el manifest de forma fiable tras el load) y con
//    condición de carrera estructural (el rol se resuelve tras el primer
//    paint; el navegador puede leer el manifest antes).
//  · Cookie de sesión para que este Server Component pueda leer el rol —
//    descartado: exigiría tocar el mecanismo de auth real (hoy 100% JWT en
//    localStorage) por un icono de pantalla de inicio, desproporcionado.
// El peor caso de dejarlo así es el comportamiento de hoy (manifest
// genérico "Tentare") — cero regresión. La distinción Core/Manager ya vive
// dentro de la app (título de pestaña + color del logo, nombreAppPorRol()
// en lib/permisos-reglas.ts), solo falta en la pantalla de inicio.
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
