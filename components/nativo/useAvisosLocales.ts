'use client';

import { useEffect } from 'react';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { borrarAvisosLocales, esAppNativa, programarAvisosLocales } from '@/lib/nativo/puente';
import { avisosLocales, jsonParaAvisosLocales } from '@/lib/nativo/avisos-locales';
import { avisosLocalesEncendidos } from '@/lib/nativo/avisos-locales-pref';

/**
 * Programa en el iPhone el aviso «tu clase empieza en 15 minutos» de cada reserva
 * confirmada. Se llama desde Inicio con lo que ya cargó. En la web no hace nada.
 * Si la alumna los apagó en Preferencias, quita los que hubiera.
 *
 * ⚠️ Se programa cada vez que Inicio carga, sin recordar «lo último»: apagarlos
 * y cerrar sesión los borran desde otro sitio, y esa memoria hacía que al
 * encenderlos otra vez (o volver a entrar) no se programara nada.
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
      void borrarAvisosLocales();
      return;
    }
    const lista = avisosLocales({ reservas, clases, instructoras, estudio, ahoraMs: Date.now() });
    void programarAvisosLocales(jsonParaAvisosLocales(lista));
  }, [reservas, clases, instructoras, estudio]);
}
