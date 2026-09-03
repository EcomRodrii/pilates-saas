'use client';

import type { ReactNode } from 'react';
import { StudioHeader } from './StudioHeader';
import { BottomNavigation } from './BottomNavigation';
import { OfflineBanner } from './OfflineBanner';

/**
 * Marco de toda pantalla autenticada. Del paquete (`components/shell/AppShell.tsx`).
 *
 * Dos diferencias con el paquete, las dos deliberadas:
 *
 *  · No llama a `aplicarTema()` en un efecto. El tema se inyecta en SERVIDOR
 *    (`app/portal/[slug]/layout.tsx` → `lib/student/tema.ts`), que es lo que
 *    evita que la primera pintura salga con la paleta de referencia y cambie
 *    a la vista de la alumna. Ver el DESIGN CONFLICT documentado en tema.ts.
 *
 *  · `noLeidas` y `badgeReservas` llegan por prop desde la pantalla, no de un
 *    contexto global. En el paquete son constantes de demostración; aquí cada
 *    pantalla pasa lo que ya ha cargado, y si no tiene el dato pasa 0 en vez
 *    de disparar una consulta propia solo para pintar un punto.
 */
export function StudentShell({
  children,
  noLeidas = 0,
  badgeReservas = 0,
  headerTransparente = false,
}: {
  children: ReactNode;
  noLeidas?: number;
  badgeReservas?: number;
  headerTransparente?: boolean;
}) {
  return (
    <div className="shell">
      <StudioHeader noLeidas={noLeidas} transparente={headerTransparente} />
      <main className="page" style={headerTransparente ? { paddingTop: 0 } : undefined}>
        <OfflineBanner />
        {children}
      </main>
      <BottomNavigation badgeReservas={badgeReservas} />
    </div>
  );
}
