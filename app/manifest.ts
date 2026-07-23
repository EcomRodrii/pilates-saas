import type { MetadataRoute } from 'next';

// Manifest de la PLATAFORMA (landing + panel de gestión). El portal de socias
// tiene el suyo propio POR ESTUDIO en app/portal/[slug]/manifest.webmanifest —
// ese es el de la "app de marca"; este representa a Tentare.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tentare',
    short_name: 'Tentare',
    description: 'Software para estudios de pilates: reservas, cobros y sustituciones',
    start_url: '/',
    display: 'standalone',
    background_color: '#EEEEE8',
    theme_color: '#6D28D9',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
