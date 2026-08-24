'use client';

// Primer paso del troceo del god-context (ver studio-context.tsx). `sidebar`,
// `profile-menu`, `topbar` y `help-widget` se montan en CADA página del
// dashboard y solo necesitan studio/instructores/notificaciones/dataLoaded —
// pero al vivir todo en un único StudioContext, un cambio en CUALQUIERA de
// los ~150 otros campos (marcar una reserva, cobrar un recibo) los
// re-renderiza igual. Este Context aparte aísla justo esos 4 campos.
//
// A propósito NO hace su propio fetch: StudioProvider sigue siendo la única
// fuente de la lógica de carga (pública/dashboard/sombreada) — este Provider
// solo recibe ese mismo estado por props y lo expone en un Context propio,
// con su propio useMemo, para que estos 4 componentes dejen de estar
// acoplados al árbol de re-render del resto de StudioContext. useStudio()
// sigue exponiendo estos mismos campos igual que hoy (ningún consumidor
// existente tiene que cambiar).

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Studio, Instructor, Notificacion } from '@/lib/types';
import type { NavConfigShape } from '@/lib/portal-nav';
import type { VariantesResueltas } from '@/lib/theme-variantes';
import type { TabBarStyleId, QuickLinksStyleId } from '@/lib/theme-schema';

export interface CoreContextValue {
  studio: Studio | null;
  instructores: Instructor[];
  notificaciones: Notificacion[];
  dataLoaded: boolean;
  updateStudio: (changes: Partial<Studio>) => Promise<unknown> | void;
  updateAvatarAdmin: (avatarId: string | null) => void;
  addInstructor: (fields: Omit<Instructor, 'id' | 'studioId'>, id?: string) => void;
  updateInstructor: (id: string, changes: Partial<Omit<Instructor, 'id' | 'studioId'>>) => void;
  deleteInstructor: (id: string) => void;
  marcarNotificacionLeida: (notiId: string) => void;
  marcarTodasLeidas: () => void;
  // Auditoría integral 2026-08-21 (rendimiento, hallazgo P0-2): mismo criterio
  // que el resto de este Context — `PortalShell` (el marco montado en TODAS
  // las pantallas del portal, tab bar incluida) solo necesita estos 5 campos
  // de tema/nav publicados, y antes los leía de `useStudio()`, así que
  // cualquiera de los ~85 campos del context gigante (reservar una clase,
  // marcar un favorito) lo re-renderizaba igual. Van los valores YA
  // resueltos (con la vista previa del editor de temas aplicada si la hay),
  // no el estado interno crudo — mismo dato que useStudio() expone hoy.
  navPortal: NavConfigShape;
  barraClasica: boolean;
  tabBarStyle: TabBarStyleId;
  // Solo lo consumen las pantallas del kit (vista-previa-kit.tsx,
  // portal-tema-marco.tsx) — mismo motivo de estar aquí que barraClasica.
  quickLinksStyle: QuickLinksStyleId | null;
  variantes: VariantesResueltas;
  themeIdPublicado: string | null;
  portalReact: boolean;
}

const CoreContext = createContext<CoreContextValue | null>(null);

export function CoreProvider({ children, ...core }: { children: ReactNode } & CoreContextValue) {
  const value = useMemo<CoreContextValue>(() => ({
    studio: core.studio,
    instructores: core.instructores,
    notificaciones: core.notificaciones,
    dataLoaded: core.dataLoaded,
    updateStudio: core.updateStudio,
    updateAvatarAdmin: core.updateAvatarAdmin,
    addInstructor: core.addInstructor,
    updateInstructor: core.updateInstructor,
    deleteInstructor: core.deleteInstructor,
    marcarNotificacionLeida: core.marcarNotificacionLeida,
    marcarTodasLeidas: core.marcarTodasLeidas,
    navPortal: core.navPortal,
    barraClasica: core.barraClasica,
    tabBarStyle: core.tabBarStyle,
    quickLinksStyle: core.quickLinksStyle,
    variantes: core.variantes,
    themeIdPublicado: core.themeIdPublicado,
    portalReact: core.portalReact,
    // Las funciones se recrean cada render en StudioProvider (no están
    // envueltas en useCallback) — mismo patrón/limitación ya existente en el
    // useMemo de useStudio(). Solo el ESTADO decide cuándo recalcular.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    core.studio, core.instructores, core.notificaciones, core.dataLoaded,
    core.navPortal, core.barraClasica, core.tabBarStyle, core.quickLinksStyle, core.variantes, core.themeIdPublicado, core.portalReact,
  ]);

  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}

export function useCore(): CoreContextValue {
  const ctx = useContext(CoreContext);
  if (!ctx) throw new Error('useCore() debe usarse dentro de <CoreProvider>');
  return ctx;
}
