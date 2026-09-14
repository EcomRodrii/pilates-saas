'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { StudioProvider } from '@/lib/studio-context';

// Los providers de sesión del panel, en su propio módulo para que
// `proveedores-raiz.tsx` pueda cargarlos con `next/dynamic`: así su código
// (auth-context, studio-context, supabase-data…) sale de la carga inicial de
// las rutas que no los montan. Export por defecto porque `next/dynamic` lo pide.
export default function ProveedoresSesion({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StudioProvider>{children}</StudioProvider>
    </AuthProvider>
  );
}
