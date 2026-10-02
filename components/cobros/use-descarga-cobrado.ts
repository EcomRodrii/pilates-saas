'use client';

// «Descargar» lo COBRADO de un tramo: el mismo fichero en «Lo que he cobrado», en
// «Para tu gestoría», en Informes y en el cierre (`csvLoCobrado`). Si la lectura
// falla no se descarga nada: un fichero más corto parecería completo.

import { useState } from 'react';
import { csvLoCobrado, descargarCsv } from '@/lib/billing/export-cobrado';
import { dbRecibosCobradosParaExport } from '@/lib/supabase-data';
import type { Tramo } from '@/lib/cobros/lo-cobrado';
import type { AvisosCobros } from './use-acciones-recibo';

export function useDescargaCobrado(avisos: AvisosCobros) {
  // La clave del tramo que se está bajando (o se acaba de bajar), para el botón que lo pidió.
  const [estado, setEstado] = useState<{ clave: string; fase: 'loading' | 'done' } | null>(null);

  async function descargar(t: Tramo) {
    if (estado?.fase === 'loading') return;
    const clave = `${t.desde}_${t.hasta}`;
    setEstado({ clave, fase: 'loading' });
    const filas = await dbRecibosCobradosParaExport(t.desde, t.hasta);
    if (!filas) {
      setEstado(null);
      avisos.error('No se ha podido preparar el fichero. Inténtalo otra vez en un momento.');
      return;
    }
    descargarCsv(csvLoCobrado(filas), `cobrado-${clave}.csv`);
    setEstado({ clave, fase: 'done' });
    setTimeout(() => setEstado(e => (e?.clave === clave && e.fase === 'done' ? null : e)), 3000);
  }

  return {
    descargar,
    fase: (t: Tramo): 'idle' | 'loading' | 'done' => (estado?.clave === `${t.desde}_${t.hasta}` ? estado.fase : 'idle'),
    ocupado: estado?.fase === 'loading',
  };
}
