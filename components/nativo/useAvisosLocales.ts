'use client';

import { useEffect } from 'react';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { borrarAvisosLocales, esAppNativa, programarAvisosLocales } from '@/lib/nativo/puente';
import { avisosLocales, huellaDeAvisosLocales, jsonParaAvisosLocales } from '@/lib/nativo/avisos-locales';
import { avisosLocalesEncendidos } from '@/lib/nativo/avisos-locales-pref';

// Lo último que se programó en este arranque: no se reprograma si no cambió nada.
let ultimaHuella: string | null = null;

/**
 * Programa en el iPhone el aviso «tu clase empieza en 15 minutos» de cada reserva
 * confirmada. Se llama desde Inicio con lo que ya cargó. En la web no hace nada.
 * Si la alumna los apagó en Preferencias, quita los que hubiera.
 */
export function useAvisosLocales(
  datos: { reservas: Reserva[]; clases: Clase[]; instructoras: Instructora[] } | null,
  estudio: string,
) {
  const reservas = datos?.reservas;
  const clases = datos?.clases;
  const instructoras = datos?.instructoras;
  useEffect(() => {
    if (!esAppNativa() || !reservas || !clases || !instructoras) return;
    if (!avisosLocalesEncendidos()) {
      if (ultimaHuella !== 'apagado') { ultimaHuella = 'apagado'; void borrarAvisosLocales(); }
      return;
    }
    const lista = avisosLocales({ reservas, clases, instructoras, estudio, ahoraMs: Date.now() });
    const huella = huellaDeAvisosLocales(lista);
    if (huella === ultimaHuella) return;
    void programarAvisosLocales(jsonParaAvisosLocales(lista)).then((n) => { if (n !== null) ultimaHuella = huella; });
  }, [reservas, clases, instructoras, estudio]);
}
