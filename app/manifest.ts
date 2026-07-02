import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mi Estudio Pilates',
    short_name: 'Mi Estudio',
    description: 'Portal de miembros de tu estudio de pilates',
    start_url: '/portal',
    display: 'standalone',
    background_color: '#F8F9FA',
    theme_color: '#4F46E5',
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
