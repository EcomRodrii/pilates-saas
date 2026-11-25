'use client';

import { useEffect } from 'react';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { esAppNativa, guardarClasesParaElWidget } from '@/lib/nativo/puente';
import { clasesParaElWidget, jsonParaElWidget } from '@/lib/nativo/widget-clases';

/**
 * Le pasa al widget de iOS «Mi próxima clase» las próximas reservas de la
 * alumna. Se llama desde Inicio con lo que ya cargó: no pide nada de más.
 * En la web no hace nada (sale en la primera línea del efecto).
 *
 * ⚠️ Se escribe cada vez que Inicio carga, sin recordar «lo último guardado»:
 * al cerrar sesión se borra desde otro sitio y esa memoria dejaba el widget
 * vacío al volver a entrar. Reescribir además renueva la fecha de guardado.
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
    void guardarClasesParaElWidget(jsonParaElWidget(lista, ahoraMs));
  }, [reservas, clases, instructoras, estudio]);
}
