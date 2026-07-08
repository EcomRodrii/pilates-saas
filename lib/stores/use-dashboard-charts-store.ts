'use client';

// Store de dominio: Gráficos personalizados del dashboard (Fase B).
// Autocontenido: su estado + helpers de módulo. Sin hubs cruzados.

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId, dbInsertDashboardChart, dbDeleteDashboardChart } from '@/lib/supabase-data';
import type { DashboardChart } from '@/lib/types';

export function useDashboardChartsStore() {
  const [dashboardCharts, setDashboardCharts] = useState<DashboardChart[]>([]);

  function addDashboardChart(fields: Omit<DashboardChart, 'id' | 'studioId' | 'creadoEn'>) {
    const nuevo: DashboardChart = { ...fields, id: `chart-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    setDashboardCharts(prev => [...prev, nuevo]);
    dbInsertDashboardChart(nuevo);
  }

  function deleteDashboardChart(id: string) {
    setDashboardCharts(prev => prev.filter(c => c.id !== id));
    dbDeleteDashboardChart(id);
  }

  return { dashboardCharts, setDashboardCharts, addDashboardChart, deleteDashboardChart };
}
