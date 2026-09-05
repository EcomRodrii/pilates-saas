'use client';

import { useNoLeidas } from '@/lib/student/no-leidas';
import { useEstudio } from '@/components/student/contexto';

import type { ReactNode } from 'react';
import { GuardiaSesion } from '@/components/student/GuardiaSesion';
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
 *
 * Envuelve en `GuardiaSesion`: toda pantalla que use este marco exige sesión.
 * Las de acceso no lo usan — tienen su propio layout, precisamente porque son
 * las únicas a las que se llega sin haber entrado.
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
  // El punto de la campana era una rama muerta: ninguna pantalla pasaba
  // `noLeidas`. Lo pide el marco, una vez y compartido. Una pantalla puede
  // seguir pasándolo explícitamente y entonces manda el suyo.
  const { estudio } = useEstudio();
  const sinLeer = useNoLeidas(estudio.id);
  return (
    <GuardiaSesion>
      <div className="shell">
        <StudioHeader noLeidas={noLeidas || sinLeer} transparente={headerTransparente} />
        <main className="page" style={headerTransparente ? { paddingTop: 0 } : undefined}>
          <OfflineBanner />
          {children}
        </main>
        <BottomNavigation badgeReservas={badgeReservas} />
      </div>
    </GuardiaSesion>
  );
}
