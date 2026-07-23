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
  claimInstructorAccount: (email: string, authUserId: string) => Promise<Instructor | null>;
  marcarNotificacionLeida: (notiId: string) => void;
  marcarTodasLeidas: () => void;
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
    claimInstructorAccount: core.claimInstructorAccount,
    marcarNotificacionLeida: core.marcarNotificacionLeida,
    marcarTodasLeidas: core.marcarTodasLeidas,
    // Las funciones se recrean cada render en StudioProvider (no están
    // envueltas en useCallback) — mismo patrón/limitación ya existente en el
    // useMemo de useStudio(). Solo el ESTADO decide cuándo recalcular.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [core.studio, core.instructores, core.notificaciones, core.dataLoaded]);

  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}

export function useCore(): CoreContextValue {
  const ctx = useContext(CoreContext);
  if (!ctx) throw new Error('useCore() debe usarse dentro de <CoreProvider>');
  return ctx;
}
