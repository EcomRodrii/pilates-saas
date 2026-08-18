import type { Metadata } from 'next';

// page.tsx es 'use client' (wizard con estado/hooks) — un layout Server
// Component es el sitio correcto para darle su propio <title>, en vez de
// heredar el de Tentare Studio (app/layout.tsx). Mismo motivo por el que
// existe este fichero en acceso/ y reanudar/: la auditoría de unificación
// Studio↔Network encontró que TODAS las pantallas 'use client' bajo
// /network heredaban el título "Software de Gestión..." — este es el tramo
// con más tráfico entrante real (el alta), así que se cierra primero.
export const metadata: Metadata = {
  title: 'Crea tu perfil de instructora | Tentare Network',
  description: 'Publica tu perfil una vez. Los estudios de Pilates y Yoga te contactan a ti cuando tu disponibilidad encaja.',
};

export default function CrearPerfilLayout({ children }: { children: React.ReactNode }) {
  return children;
}
