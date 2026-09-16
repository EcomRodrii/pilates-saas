'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { useRol } from '@/lib/permisos';
import { puedeVer } from '@/lib/permisos-reglas';
import { useCoincideMedio } from '@/lib/hooks/use-coincide-medio';
import { estadoVentana, estadoVentanaServidor, suscribirVentana } from '@/lib/calendario/ventana-flotante';

/**
 * Solo en un ordenador. El ancho no basta: un iPad apaisado pasa de 1024 px y
 * ahí arrastrar una ventana con el dedo compite con desplazar la página. Lo que
 * separa «un ordenador» es tener un puntero fino que pasa por encima.
 */
export const CONSULTA_ESCRITORIO = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

// El cuerpo no viaja en el paquete de cada pantalla del panel: se descarga la
// primera vez que alguien la abre. Cerrada, esto es un lector de localStorage.
const Cuerpo = dynamic(() => import('./ventana-calendario-cuerpo'), { ssr: false });

/**
 * La agenda del día en una ventana que se queda flotando mientras se usa el
 * resto del panel. Se abre desde el Calendario y la monta el armazón
 * (`DashboardShell`), porque tiene que sobrevivir al cambio de pantalla.
 */
export function VentanaCalendario() {
  const estado = useSyncExternalStore(suscribirVentana, estadoVentana, estadoVentanaServidor);
  const escritorio = useCoincideMedio(CONSULTA_ESCRITORIO);
  const rol = useRol();
  if (!estado.abierta || !escritorio || !puedeVer(rol, '/calendario')) return null;
  return <Cuerpo estado={estado} />;
}
