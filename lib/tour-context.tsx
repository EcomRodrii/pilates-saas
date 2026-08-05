'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { PASOS_TOUR, resolverPasoGuardado } from './tour-pasos.ts';

// Estado del tour guiado — mismo patrón que panel-privacy.tsx (localStorage,
// por navegador). A propósito NO es un query param: el tour cruza páginas
// que ya usan su propio ?tab=/?sub= (calendario, configuración...) y un
// param de tour ahí colisionaría o se perdería en cada navegación interna
// de esas pantallas.
const TOUR_KEY = 'panel-tour-paso';

interface TourValue {
  activo: boolean;
  pasoActual: number;
  totalPasos: number;
  iniciarTour: () => void;
  siguientePaso: () => void;
  pasoAnterior: () => void;
  saltarTour: () => void;
}

const TourContext = createContext<TourValue | null>(null);

export function useTour(): TourValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour debe usarse dentro de TourProvider');
  return ctx;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [pasoActual, setPasoActualState] = useState(-1);

  useEffect(() => {
    // localStorage no existe en SSR — la lectura va en el efecto, no en el
    // render (mismo motivo que panel-theme.tsx/panel-privacy.tsx). Un tour a
    // medias sobrevive a cerrar el navegador: -1 = no hay tour en marcha.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasoActualState(resolverPasoGuardado(localStorage.getItem(TOUR_KEY)));
  }, []);

  function setPasoActual(v: number) {
    setPasoActualState(v);
    if (v < 0) localStorage.removeItem(TOUR_KEY);
    else localStorage.setItem(TOUR_KEY, String(v));
  }

  return (
    <TourContext.Provider value={{
      activo: pasoActual >= 0,
      pasoActual,
      totalPasos: PASOS_TOUR.length,
      iniciarTour: () => setPasoActual(0),
      siguientePaso: () => setPasoActual(pasoActual + 1 >= PASOS_TOUR.length ? -1 : pasoActual + 1),
      pasoAnterior: () => setPasoActual(Math.max(0, pasoActual - 1)),
      saltarTour: () => setPasoActual(-1),
    }}>
      {children}
    </TourContext.Provider>
  );
}
