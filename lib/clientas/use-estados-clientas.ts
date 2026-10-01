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

// Varias pantallas lo piden a la vez con los MISMOS datos —la lista y la ficha
// abierta a su lado—, y cada una lo calculaba entero por su cuenta: con 25.000
// reservas, abrir una ficha desde la lista repetía el cálculo de las 300 clientas
// (perfil de CPU). Se reutiliza el último si los datos son los mismos objetos y
// la hora casi la misma: el corte del estado es de días, y cada pantalla ya fija
// su hora al montarse, así que cinco minutos de diferencia no cambian nada.
interface Calculo {
  datos: readonly unknown[];
  ahoraMs: number;
  ahora: Date;
  hechos: ReadonlyMap<string, HechosAsistencia>;
  porSocio: ReadonlyMap<string, ResultadoEstado>;
}
const MARGEN_REUTILIZAR_MS = 5 * 60_000;
let ultimoCalculo: Calculo | null = null;

function calcular(
  datos: Parameters<typeof estadosDeClientas>[0],
  ahoraMs: number,
): Calculo {
  const claves = [datos.socios, datos.suscripciones, datos.planesTarifa, datos.reservas, datos.sesiones];
  const previo = ultimoCalculo;
  if (previo && Math.abs(previo.ahoraMs - ahoraMs) < MARGEN_REUTILIZAR_MS && previo.datos.every((d, i) => d === claves[i])) {
    return previo;
  }
  const ahora = new Date(ahoraMs);
  const hechos = hechosDeAsistencia(datos.reservas, datos.sesiones, ahora);
  const porSocio = estadosDeClientas(datos, ahora, hechos);
  ultimoCalculo = { datos: claves, ahoraMs, ahora, hechos, porSocio };
  return ultimoCalculo;
}

const SIN_HECHOS: ReadonlyMap<string, HechosAsistencia> = new Map();
const SIN_ESTADOS: ReadonlyMap<string, ResultadoEstado> = new Map();

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
  const calculo = useMemo(
    () => (ahoraMs ? calcular({ socios, suscripciones, planesTarifa, reservas, sesiones }, ahoraMs) : null),
    [socios, suscripciones, planesTarifa, reservas, sesiones, ahoraMs],
  );
  const listo = completos && calculo !== null;
  const porSocio = calculo?.porSocio ?? SIN_ESTADOS;
  const conteos = useMemo(() => (listo ? contarPorEstado(porSocio) : null), [listo, porSocio]);

  return { listo, porSocio, hechos: calculo?.hechos ?? SIN_HECHOS, conteos, ahora: calculo?.ahora ?? null };
}
