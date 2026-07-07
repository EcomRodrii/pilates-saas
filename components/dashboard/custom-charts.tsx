'use client';

import { useState } from 'react';
import { BarChart3, Plus, Trash2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { computeSerieGrafico, METRICAS_GRAFICO, AGRUPACIONES_GRAFICO } from '@/lib/dashboard-chart-engine';
import type { DashboardChart, TipoGraficoDashboard, MetricaGraficoDashboard, AgrupacionGraficoDashboard } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const inputCls = 'w-full rounded-lg border border-[#E7E7E0] px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10';
const labelCls = 'text-[11px] font-semibold uppercase tracking-wide text-[#8E8E86] mb-1.5 block';

const COLORES = ['#F7A6C4', '#7AA80E', '#0369A1', '#D97706', '#7C3AED', '#DC2626'];

function ChartLine({ points, color }: { points: { label: string; value: number }[]; color: string }) {
  const w = 400, h = 100;
  const max = Math.max(...points.map(p => p.value), 1);
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const coords = points.map((p, i) => [i * step, h - (p.value / max) * (h - 12) - 6] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = `chart-${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartBars({ points, color }: { points: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...points.map(p => p.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {points.map((p, i) => (
        <div key={i} className="flex-1 h-full flex items-end">
          <div
            className="w-full rounded-t-md transition-all"
            style={{ height: `${Math.max(3, (p.value / max) * 100)}%`, backgroundColor: color }}
            title={`${p.label}: ${p.value}`}
          />
        </div>
      ))}
    </div>
  );
}

function ChartCard({ chart, onDelete }: { chart: DashboardChart; onDelete: () => void }) {
  const { recibos, socios, reservas, sesiones, creditTransactions } = useStudio();
  const now = new Date();
  const serie = computeSerieGrafico(chart, { recibos, socios, reservas, sesiones, creditTransactions }, now);
  const total = serie.reduce((a, p) => a + p.value, 0);
  const metricaLabel = METRICAS_GRAFICO.find(m => m.metric === chart.metrica)?.nombre ?? chart.metrica;

  return (
    <div className="bg-white rounded-xl border border-[#E7E7E0] p-4 group relative">
      <button
        onClick={onDelete}
        className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#FEE2E2] text-[#8E8E86] hover:text-[#DC2626] transition-all"
        title="Eliminar gráfico"
      >
        <Trash2 size={13} />
      </button>
      <p className="text-[13px] font-semibold text-[#1A1A1A] pr-6">{chart.nombre}</p>
      <p className="text-[11px] text-[#A8A89F] mb-2">{metricaLabel}</p>
      <p className="text-[20px] font-bold text-[#1A1A1A] mb-2">{total.toLocaleString('es-ES')}</p>
      {chart.tipo === 'LINEA' ? <ChartLine points={serie} color={chart.color} /> : <ChartBars points={serie} color={chart.color} />}
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-[#C6C6BE]">{serie[0]?.label}</span>
        <span className="text-[10px] text-[#C6C6BE]">{serie[serie.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function CustomChartsSection() {
  const { dashboardCharts, addDashboardChart, deleteDashboardChart } = useStudio();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{
    nombre: string; tipo: TipoGraficoDashboard; metrica: MetricaGraficoDashboard;
    agrupacion: AgrupacionGraficoDashboard; rango: number; color: string;
  }>({
    nombre: '', tipo: 'LINEA', metrica: 'INGRESOS_COBRADOS', agrupacion: 'MES', rango: 6,
    color: COLORES[dashboardCharts.length % COLORES.length],
  });

  function crear() {
    if (!form.nombre.trim()) return;
    addDashboardChart(form);
    setForm({ nombre: '', tipo: 'LINEA', metrica: 'INGRESOS_COBRADOS', agrupacion: 'MES', rango: 6, color: COLORES[(dashboardCharts.length + 1) % COLORES.length] });
    setModalOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-[#8E8E86]" />
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Gráficos personalizados</h2>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFC8E2] text-[#171717] text-[12px] font-medium hover:bg-[#F7B3D2] transition-colors"
        >
          <Plus size={13} /> Crear gráfico
        </button>
      </div>

      {dashboardCharts.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E7E7E0] p-8 text-center">
          <p className="text-[13px] text-[#8E8E86]">Aún no has creado ningún gráfico. Elige qué métrica quieres seguir y cómo verla.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboardCharts.map(chart => (
            <ChartCard key={chart.id} chart={chart} onDelete={() => deleteDashboardChart(chart.id)} />
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo gráfico</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className={labelCls}>Nombre</label>
              <input className={inputCls} placeholder="Ej. Ingresos últimos 6 meses" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Métrica</label>
              <select className={inputCls} value={form.metrica} onChange={e => setForm(f => ({ ...f, metrica: e.target.value as MetricaGraficoDashboard }))}>
                {METRICAS_GRAFICO.map(m => <option key={m.metric} value={m.metric}>{m.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tipo</label>
                <select className={inputCls} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoGraficoDashboard }))}>
                  <option value="LINEA">Línea</option>
                  <option value="BARRAS">Barras</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Agrupar por</label>
                <select className={inputCls} value={form.agrupacion} onChange={e => setForm(f => ({ ...f, agrupacion: e.target.value as AgrupacionGraficoDashboard }))}>
                  {AGRUPACIONES_GRAFICO.map(a => <option key={a.value} value={a.value}>{a.nombre}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Cuántos periodos hacia atrás</label>
              <input type="number" min={2} max={24} className={inputCls} value={form.rango} onChange={e => setForm(f => ({ ...f, rango: Math.min(24, Math.max(2, parseInt(e.target.value, 10) || 6)) }))} />
            </div>
            <div>
              <label className={labelCls}>Color</label>
              <div className="flex gap-2">
                {COLORES.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={cn('w-7 h-7 rounded-full transition-all', form.color === c && 'ring-2 ring-offset-2 ring-[#1A1A1A]')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg bg-white border border-[#E7E7E0] text-[#1A1A1A] hover:bg-[#F5F5F1] transition-colors">
                Cancelar
              </button>
              <button onClick={crear} className="px-4 py-2 text-sm rounded-lg bg-[#FFC8E2] text-[#171717] hover:bg-[#F7B3D2] transition-colors font-medium">
                Crear gráfico
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
