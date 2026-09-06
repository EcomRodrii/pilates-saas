'use client';

import { useNoLeidas } from '@/lib/student/no-leidas';
import { useEstudio } from '@/components/student/contexto';

import type { CSSProperties, ReactNode } from 'react';
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
 *
 * `sinNav` quita la barra inferior — mismo criterio que cualquier chat real
 * (WhatsApp, iMessage): dentro de una conversación no hay tabs debajo, solo
 * el compositor. No es solo estético: `BottomNavigation` es `position: fixed`
 * calculada contra `--nav-height`, y un compositor TAMBIÉN fijo intentando
 * flotar justo encima de ella es lo que se rompía de verdad al abrir el
 * teclado en iOS Safari — los dos elementos fijos se separan del viewport
 * visual y acaban flotando a mitad de pantalla, por encima del teclado. Con
 * `sinNav`, la pantalla que lo pide pasa a controlar su propio alto completo
 * (`.page` sin el padding inferior reservado para la nav) y puede poner su
 * compositor en el flujo normal en vez de en `position: fixed`.
 */
export function StudentShell({
  children,
  noLeidas = 0,
  badgeReservas = 0,
  headerTransparente = false,
  sinNav = false,
}: {
  children: ReactNode;
  noLeidas?: number;
  badgeReservas?: number;
  headerTransparente?: boolean;
  sinNav?: boolean;
}) {
  // El punto de la campana era una rama muerta: ninguna pantalla pasaba
  // `noLeidas`. Lo pide el marco, una vez y compartido. Una pantalla puede
  // seguir pasándolo explícitamente y entonces manda el suyo.
  const { estudio } = useEstudio();
  const sinLeer = useNoLeidas(estudio.id);
  const estiloPage: CSSProperties = {};
  if (headerTransparente) estiloPage.paddingTop = 0;
  if (sinNav) estiloPage.paddingBottom = 'var(--safe-bottom)';
  return (
    <GuardiaSesion>
      <div className="shell">
        <StudioHeader noLeidas={noLeidas || sinLeer} transparente={headerTransparente} />
        <main className="page" style={Object.keys(estiloPage).length ? estiloPage : undefined}>
          <OfflineBanner />
          {children}
        </main>
        {!sinNav && <BottomNavigation badgeReservas={badgeReservas} />}
      </div>
    </GuardiaSesion>
  );
}
