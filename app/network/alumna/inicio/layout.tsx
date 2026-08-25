import type { Metadata } from 'next';

// Ver el comentario de app/network/reanudar/layout.tsx — mismo motivo
// (page.tsx es 'use client', un layout Server es el sitio correcto para el
// <title>). Privada y autenticada: nunca indexable.
//
// `manifest`: esta es la ÚNICA pantalla logueada de autoservicio de alumna
// hoy (F4), así que es el sitio correcto para enlazar el manifest propio de
// Network (app/network.webmanifest) — sin esto, "Añadir a pantalla de
// inicio" heredaba el manifest raíz (start_url: '/') e instalaba la landing,
// no Network. Mismo patrón que app/(dashboard)/layout.tsx con
// /panel.webmanifest — ver el comentario ahí.
export const metadata: Metadata = {
  title: 'Inicio | Tentare Network',
  description: 'Tu autoservicio de alumna en Tentare Network.',
  robots: { index: false, follow: false },
  manifest: '/network.webmanifest',
};

export default function InicioAlumnaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
