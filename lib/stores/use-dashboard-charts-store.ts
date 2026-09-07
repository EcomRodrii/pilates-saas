'use client';

// Store de dominio: Gráficos personalizados del dashboard (Fase B).
// Autocontenido: su estado + helpers de módulo. Sin hubs cruzados.

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId, dbInsertDashboardChart, dbDeleteDashboardChart } from '@/lib/supabase-data';
import type { ResultadoEscritura } from '@/lib/errores';
import type { DashboardChart } from '@/lib/types';

export function useDashboardChartsStore() {
  const [dashboardCharts, setDashboardCharts] = useState<DashboardChart[]>([]);

  // ⚠️ Las dos eran optimistas y sin mirar atrás: se pintaba (o se quitaba) el
  // gráfico y la escritura salía sin `await`, con dos helpers que además se
  // tragaban su propio error. El gráfico creado se veía perfecto hasta la
  // siguiente recarga, donde ya no estaba; y el borrado desaparecía para
  // volver solo. En los dos casos, un botón que parecía funcionar y no.
  //
  // Se deshace lo pintado —no se deja la pantalla contando algo que no está en
  // la base— y se devuelve el motivo para que quien llame lo enseñe.
  async function addDashboardChart(fields: Omit<DashboardChart, 'id' | 'studioId' | 'creadoEn'>): Promise<ResultadoEscritura> {
    const nuevo: DashboardChart = { ...fields, id: `chart-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    setDashboardCharts(prev => [...prev, nuevo]);
    const res = await dbInsertDashboardChart(nuevo);
    if (!res.ok) setDashboardCharts(prev => prev.filter(c => c.id !== nuevo.id));
    return res;
  }

  async function deleteDashboardChart(id: string): Promise<ResultadoEscritura> {
    const anterior = dashboardCharts.find(c => c.id === id);
    setDashboardCharts(prev => prev.filter(c => c.id !== id));
    const res = await dbDeleteDashboardChart(id);
    if (!res.ok && anterior) setDashboardCharts(prev => [...prev, anterior]);
    return res;
  }

  return { dashboardCharts, setDashboardCharts, addDashboardChart, deleteDashboardChart };
}
