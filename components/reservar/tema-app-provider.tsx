'use client';

// El tema de la app de la alumna, resuelto en SERVIDOR por el layout de
// /reservar/[slug], para la parte de la página que no lee variables CSS: los
// componentes que reciben los colores por prop (`t=`: el calendario, Mi cuenta,
// la pantalla de reserva, el pago).
//
// Un contexto y no otra consulta porque `aparienciaApp` no viaja en los datos
// públicos del estudio (`/api/public/studio-data`), y un layout de Next no le
// puede pasar props a su página. Sin proveedor encima vale lo de siempre
// (`TEMA_APP_RESERVAR_POR_DEFECTO`), que es la paleta de día: cero cambio.

import { createContext, useContext, type ReactNode } from 'react';
import { TEMA_APP_RESERVAR_POR_DEFECTO, type TemaAppReservar } from '@/lib/reservar/precedencia-tema';

const TemaAppReservarContext = createContext<TemaAppReservar>(TEMA_APP_RESERVAR_POR_DEFECTO);

export function TemaAppReservarProvider({ tema, children }: { tema: TemaAppReservar; children: ReactNode }) {
  return <TemaAppReservarContext.Provider value={tema}>{children}</TemaAppReservarContext.Provider>;
}

export function useTemaAppReservar(): TemaAppReservar {
  return useContext(TemaAppReservarContext);
}
