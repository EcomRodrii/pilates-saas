'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useRol } from '@/lib/permisos';
import { puedeVer } from '@/lib/permisos-reglas';
import { useCoincideMedio } from '@/lib/hooks/use-coincide-medio';
import { CONSULTA_ESCRITORIO } from '@/lib/panel/escritorio';
import { estadoVentana, estadoVentanaServidor, suscribirVentana } from '@/lib/calendario/ventana-flotante';


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
  const visible = estado.abierta && escritorio && puedeVer(rol, '/calendario');

  // Cerrar no la quita de golpe: sigue montada mientras se anima su salida y
  // es ella la que avisa al terminar. Ajustar el estado durante el render es el
  // patrón de React para «cambió una prop» (sin efecto ni fotograma de más).
  const [montada, setMontada] = useState(visible);
  if (visible && !montada) setMontada(true);
  const alSalir = useCallback(() => setMontada(false), []);

  if (!montada) return null;
  return <Cuerpo estado={estado} saliendo={!visible} alSalir={alSalir} />;
}
