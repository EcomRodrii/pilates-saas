'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// Modo privacidad del panel — mismo patrón que panel-theme.tsx (localStorage,
// por navegador, no por estudio). Existe porque recepción trabaja con el
// panel abierto en un mostrador: si se levanta un momento, cualquiera que
// pase por delante puede leer ingresos, facturas y cobros pendientes. Un
// clic los difumina sin cerrar sesión ni perder lo que se estaba haciendo.
const PRIVACY_KEY = 'panel-privacidad';

interface PanelPrivacyValue {
  oculto: boolean;
  setOculto: (v: boolean) => void;
}

const PanelPrivacyContext = createContext<PanelPrivacyValue | null>(null);

export function usePanelPrivacy(): PanelPrivacyValue {
  const ctx = useContext(PanelPrivacyContext);
  if (!ctx) throw new Error('usePanelPrivacy debe usarse dentro de PanelPrivacyProvider');
  return ctx;
}

export function PanelPrivacyProvider({ children }: { children: React.ReactNode }) {
  const [oculto, setOcultoState] = useState(false);

  useEffect(() => {
    // localStorage no existe en SSR, por eso la lectura va en el efecto y no
    // en el render (mismo motivo que panel-theme.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOcultoState(localStorage.getItem(PRIVACY_KEY) === '1');
  }, []);

  function setOculto(v: boolean) {
    setOcultoState(v);
    localStorage.setItem(PRIVACY_KEY, v ? '1' : '0');
  }

  return (
    <PanelPrivacyContext.Provider value={{ oculto, setOculto }}>
      {children}
    </PanelPrivacyContext.Provider>
  );
}
