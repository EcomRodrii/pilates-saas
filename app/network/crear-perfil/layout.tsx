import type { Metadata } from 'next';
import { LEGAL } from '@/lib/legal-info';

// page.tsx es 'use client' (wizard con estado/hooks) — un layout Server
// Component es el sitio correcto para darle su propio <title>, en vez de
// heredar el de Tentare Studio (app/layout.tsx). Mismo motivo por el que
// existe este fichero en acceso/ y reanudar/: la auditoría de unificación
// Studio↔Network encontró que TODAS las pantallas 'use client' bajo
// /network heredaban el título "Software de Gestión..." — este es el tramo
// con más tráfico entrante real (el alta), así que se cierra primero.
//
// `alternates.canonical`: esta ruta es indexable de verdad (auditoría SEO
// 2026-08-18, ver el comentario de EXCEPCIONES_INDEXABLES en
// lib/seo/paginas.ts) — sin canonical explícito, cualquier querystring que
// llegue pegado (utm_*, etc.) se indexaría como una URL distinta.
export const metadata: Metadata = {
  title: 'Crea tu perfil de instructora | Tentare Network',
  description: 'Publica tu perfil una vez. Los estudios de Pilates y Yoga te contactan a ti cuando tu disponibilidad encaja.',
  alternates: { canonical: `${LEGAL.url}/network/crear-perfil` },
};

export default function CrearPerfilLayout({ children }: { children: React.ReactNode }) {
  return children;
}
