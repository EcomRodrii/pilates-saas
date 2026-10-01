'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import {
  contarPorEstado, estadosDeClientas, hechosDeAsistencia,
  type ConteosEstado, type HechosAsistencia, type ResultadoEstado,
} from './estado';

// El estado de cada clienta para las pantallas del panel (lista, ficha, resumen),
// calculado en el navegador con lo que el panel ya trae: socias, suscripciones,
// reservas y sesiones, todas paginadas. Un valor derivado, no estado compartido:
// por eso vive aquí y no dentro de studio-context.
//
// `listo` es falso hasta que los datos han cargado ENTEROS: si alguna de esas
// tablas ha llegado a medias (`datosIncompletos`), un recuento sería falso, y
// ausente no es cero — las tarjetas enseñan «—».

export interface EstadosClientas {
  listo: boolean;
  porSocio: ReadonlyMap<string, ResultadoEstado>;
  hechos: ReadonlyMap<string, HechosAsistencia>;
  conteos: ConteosEstado | null;
  /** El instante con el que se ha calculado (fijo desde que se monta la pantalla). */
  ahora: Date | null;
}

const TABLAS_DEL_ESTADO = ['socios', 'suscripciones', 'reservas', 'sesiones'];

export function useEstadosClientas(): EstadosClientas {
  const { socios, suscripciones, planesTarifa, reservas, sesiones, dataLoaded, datosIncompletos } = useStudio();
  // La hora se fija al montar: leerla en cada render daría valores distintos en
  // servidor y cliente. El corte es de días, no se cruza con la pantalla abierta.
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: leer el reloj en render daría valores distintos en servidor y cliente.
    setAhoraMs(Date.now());
  }, []);

  const completos = dataLoaded && !datosIncompletos.some(t => TABLAS_DEL_ESTADO.includes(t));
  const ahora = useMemo(() => (ahoraMs ? new Date(ahoraMs) : null), [ahoraMs]);

  const hechos = useMemo(
    () => (ahora ? hechosDeAsistencia(reservas, sesiones, ahora) : new Map<string, HechosAsistencia>()),
    [reservas, sesiones, ahora],
  );
  const porSocio = useMemo(
    () => (ahora ? estadosDeClientas({ socios, suscripciones, planesTarifa, reservas, sesiones }, ahora, hechos) : new Map<string, ResultadoEstado>()),
    [socios, suscripciones, planesTarifa, reservas, sesiones, ahora, hechos],
  );
  const listo = completos && ahora !== null;
  const conteos = useMemo(() => (listo ? contarPorEstado(porSocio) : null), [listo, porSocio]);

  return { listo, porSocio, hechos, conteos, ahora };
}
