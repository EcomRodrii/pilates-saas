'use client';

import { useEffect } from 'react';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { esAppNativa, guardarClasesParaElWidget } from '@/lib/nativo/puente';
import { clasesParaElWidget, huellaDelWidget, jsonParaElWidget } from '@/lib/nativo/widget-clases';

// Lo último que se guardó en este arranque: no se reescribe (ni se recarga el
// widget) si no ha cambiado nada de lo que enseña.
let ultimaHuella: string | null = null;

/**
 * Le pasa al widget de iOS «Mi próxima clase» las próximas reservas de la
 * alumna. Se llama desde Inicio con lo que ya cargó: no pide nada de más.
 * En la web no hace nada (sale en la primera línea del efecto).
 */
export function useWidgetProximasClases(
  datos: { reservas: Reserva[]; clases: Clase[]; instructoras: Instructora[] } | null,
  estudio: string,
) {
  const reservas = datos?.reservas;
  const clases = datos?.clases;
  const instructoras = datos?.instructoras;
  useEffect(() => {
    if (!esAppNativa() || !reservas || !clases || !instructoras) return;
    const ahoraMs = Date.now();
    const lista = clasesParaElWidget({ reservas, clases, instructoras, estudio, ahoraMs });
    const huella = huellaDelWidget(lista);
    if (huella === ultimaHuella) return;
    void guardarClasesParaElWidget(jsonParaElWidget(lista, ahoraMs)).then((ok) => { if (ok) ultimaHuella = huella; });
  }, [reservas, clases, instructoras, estudio]);
}
