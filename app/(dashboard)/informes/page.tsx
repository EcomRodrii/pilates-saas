'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStudio } from '@/lib/studio-context';
import { TrendingUp, Users, CreditCard, Activity, Download, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

// ─── Utilities ────────────────────────────────────────────────────────────────

function localDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtEur(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k €`;
  return `${v.toFixed(0)} €`;
}

function fmtEurFull(v: number): string {
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ─── Period types ─────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter' | 'year';

interface PeriodOption {
  key: Period;
  label: string;
}

const PERIOD_OPTS: PeriodOption[] = [
  { key: 'week',    label: 'Esta semana' },
  { key: 'month',   label: 'Este mes' },
  { key: 'quarter', label: 'Últimos 3 meses' },
  { key: 'year',    label: 'Este año' },
];

function getPeriodStart(period: Period, now: Date): Date {
  switch (period) {
    case 'week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter':
      return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
  }
}

// ─── Chart bucket types ───────────────────────────────────────────────────────

interface Bucket {
  label: string;
  key: string;
  value: number;
}

function getChartBuckets(period: Period, now: Date): Bucket[] {
  if (period === 'week') {
    const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const start = getPeriodStart('week', now);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return {
        label: DAYS[i],
        key: localDate(d),
        value: 0,
      };
    });
  }
  if (period === 'month') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
      return {
        label: String(i + 1),
        key: localDate(d),
        value: 0,
      };
    });
  }
  if (period === 'quarter') {
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 2 + i, 1);
      return {
        label: d.toLocaleDateString('es-ES', { month: 'short' }),
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        value: 0,
      };
    });
  }
  // year → 12 months
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), i, 1);
    return {
      label: d.toLocaleDateString('es-ES', { month: 'short' }),
      key: `${now.getFullYear()}-${String(i + 1).padStart(2, '0')}`,
      value: 0,
    };
  });
}

function getBucketKey(period: Period, date: Date): string {
  if (period === 'week' || period === 'month') return localDate(date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Cohort retention helpers ─────────────────────────────────────────────────

interface CohortRow {
  mes: string;
  total: number;
  active30: number;
  active90: number;
  pct30: number;
  pct90: number;
}

// ─── Export state type ────────────────────────────────────────────────────────

type ExportState = 'idle' | 'loading' | 'done';

// ─── Component ────────────────────────────────────────────────────────────────

export default function Informes() {
  const { recibos, socios, sesiones, reservas, tiposClase, suscripciones, planesTarifa } = useStudio();

  const [period, setPeriod] = useState<Period>('month');
  const [tooltipIdx, setTooltipIdx] = useState<number | null>(null);
  const [csvState, setCsvState] = useState<ExportState>('idle');
  const [pdfState, setPdfState] = useState<ExportState>('idle');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const now = mounted ? new Date() : new Date('2026-06-29');

  // ─── Period bounds ──────────────────────────────────────────────────────────
  const periodStart = useMemo(() => getPeriodStart(period, now), [period, mounted]);

  // ─── Revenue chart buckets ──────────────────────────────────────────────────
  const revenueChart = useMemo((): Bucket[] => {
    const buckets = getChartBuckets(period, now);
    const map: Record<string, number> = {};
    buckets.forEach(b => { map[b.key] = 0; });

    recibos
      .filter(r => r.estado === 'COBRADO' && r.fechaCobro && new Date(r.fechaCobro) >= periodStart)
      .forEach(r => {
        const k = getBucketKey(period, new Date(r.fechaCobro!));
        if (k in map) map[k] = (map[k] ?? 0) + r.importe;
      });

    return buckets.map(b => ({ ...b, value: map[b.key] ?? 0 }));
  }, [recibos, period, mounted]);

  // ─── KPI: Total ingresos del período ───────────────────────────────────────
  const totalIngresos = useMemo(
    () => recibos
      .filter(r => r.estado === 'COBRADO' && r.fechaCobro && new Date(r.fechaCobro) >= periodStart)
      .reduce((s, r) => s + r.importe, 0),
    [recibos, periodStart]
  );

  // ─── KPI: MRR ──────────────────────────────────────────────────────────────
  const mrr = useMemo(() => {
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return recibos
      .filter(r => r.estado === 'COBRADO' && r.fechaCobro && getBucketKey('quarter', new Date(r.fechaCobro)) === currentMonthKey)
      .reduce((s, r) => s + r.importe, 0);
  }, [recibos, mounted]);

  // ─── KPI: Ticket medio ──────────────────────────────────────────────────────
  const ticketMedio = useMemo(() => {
    const cobrados = recibos.filter(r => r.estado === 'COBRADO' && r.fechaCobro && new Date(r.fechaCobro) >= periodStart);
    const uniqueSocias = new Set(cobrados.map(r => r.socioId)).size;
    const total = cobrados.reduce((s, r) => s + r.importe, 0);
    return uniqueSocias > 0 ? total / uniqueSocias : 0;
  }, [recibos, periodStart]);

  // ─── KPI: Tasa retención ────────────────────────────────────────────────────
  const tasaRetencion = useMemo(() => {
    const total = socios.length;
    const activas = socios.filter(s => s.activo).length;
    return total > 0 ? Math.round((activas / total) * 100) : 0;
  }, [socios]);

  // ─── Ocupación por tipo de clase ────────────────────────────────────────────
  const ocupacionPorTipo = useMemo(() => {
    // P0-28: ocupadas por sesión en UNA pasada, en vez de reservas.filter() por
    // cada sesión de cada tipo (O(tipos × sesiones × reservas)).
    const ocupadasPorSesion = new Map<string, number>();
    for (const r of reservas) {
      if (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA') {
        ocupadasPorSesion.set(r.sesionId, (ocupadasPorSesion.get(r.sesionId) ?? 0) + 1);
      }
    }
    return tiposClase.map(tc => {
      const sesionesTipo = sesiones.filter(
        s => s.tipoClaseId === tc.id && !s.cancelada && new Date(s.inicio) >= periodStart
      );
      const totalAforo = sesionesTipo.reduce((s, ses) => s + ses.aforoMaximo, 0);
      const totalOcupadas = sesionesTipo.reduce((sum, ses) => sum + (ocupadasPorSesion.get(ses.id) ?? 0), 0);
      return {
        id: tc.id,
        nombre: tc.nombre,
        color: tc.color,
        pct: totalAforo > 0 ? Math.round((totalOcupadas / totalAforo) * 100) : 0,
        sesiones: sesionesTipo.length,
        ocupadas: totalOcupadas,
        aforo: totalAforo,
      };
    }).filter(t => t.sesiones > 0).sort((a, b) => b.pct - a.pct);
  }, [tiposClase, sesiones, reservas, periodStart]);

  // ─── Cohort retention table ─────────────────────────────────────────────────
  const cohortRows = useMemo((): CohortRow[] => {
    const monthsBack = period === 'week' ? 3 : period === 'month' ? 4 : period === 'quarter' ? 6 : 12;
    const rows: CohortRow[] = [];
    for (let i = Math.min(monthsBack, 6) - 1; i >= 0; i--) {
      const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cohortEnd   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = cohortStart.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });

      const cohortSocios = socios.filter(s => {
        const fa = new Date(s.fechaAlta);
        return fa >= cohortStart && fa <= cohortEnd;
      });

      const d30 = new Date(cohortStart); d30.setDate(d30.getDate() + 30);
      const d90 = new Date(cohortStart); d90.setDate(d90.getDate() + 90);

      const sesionIds30 = new Set(sesiones.filter(s => new Date(s.inicio) >= cohortStart && new Date(s.inicio) <= d30).map(s => s.id));
      const sesionIds90 = new Set(sesiones.filter(s => new Date(s.inicio) >= cohortStart && new Date(s.inicio) <= d90).map(s => s.id));

      // P0-28: socias con reserva activa en la ventana, en UNA pasada sobre
      // reservas, en vez de reservas.some() por cada socia de la cohorte
      // (O(cohortes × socias × reservas)).
      const activos30 = new Set<string>();
      const activos90 = new Set<string>();
      for (const r of reservas) {
        if (r.estado !== 'CONFIRMADA' && r.estado !== 'ASISTIDA') continue;
        if (sesionIds30.has(r.sesionId)) activos30.add(r.socioId);
        if (sesionIds90.has(r.sesionId)) activos90.add(r.socioId);
      }

      const active30 = cohortSocios.filter(s => activos30.has(s.id)).length;
      const active90 = d90 <= now ? cohortSocios.filter(s => activos90.has(s.id)).length : -1;

      rows.push({
        mes: label,
        total: cohortSocios.length,
        active30,
        active90,
        pct30: cohortSocios.length > 0 ? Math.round((active30 / cohortSocios.length) * 100) : 0,
        pct90: active90 >= 0 && cohortSocios.length > 0 ? Math.round((active90 / cohortSocios.length) * 100) : -1,
      });
    }
    return rows;
  }, [socios, sesiones, reservas, period, mounted]);

  // ─── Top 5 socias ───────────────────────────────────────────────────────────
  const topSocias = useMemo(() => {
    const sesionIdsInRange = new Set(
      sesiones.filter(s => !s.cancelada && new Date(s.inicio) >= periodStart).map(s => s.id)
    );
    const counts: Record<string, number> = {};
    reservas
      .filter(r => (r.estado === 'ASISTIDA' || r.estado === 'CONFIRMADA') && sesionIdsInRange.has(r.sesionId))
      .forEach(r => { counts[r.socioId] = (counts[r.socioId] ?? 0) + 1; });
    return socios
      .map(s => ({ ...s, clases: counts[s.id] ?? 0 }))
      .filter(s => s.clases > 0)
      .sort((a, b) => b.clases - a.clases)
      .slice(0, 5);
  }, [socios, reservas, sesiones, periodStart]);

  // ─── Clases más populares ───────────────────────────────────────────────────
  const topClases = useMemo(() => {
    const sesionIdsInRange = new Set(
      sesiones.filter(s => !s.cancelada && new Date(s.inicio) >= periodStart).map(s => s.id)
    );
    const counts: Record<string, number> = {};
    reservas
      .filter(r => sesionIdsInRange.has(r.sesionId) && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'))
      .forEach(r => { counts[r.sesionId] = (counts[r.sesionId] ?? 0) + 1; });

    const tipoMap: Record<string, { nombre: string; color: string; count: number }> = {};
    tiposClase.forEach(tc => { tipoMap[tc.id] = { nombre: tc.nombre, color: tc.color, count: 0 }; });

    sesiones
      .filter(s => sesionIdsInRange.has(s.id))
      .forEach(s => {
        const tc = tipoMap[s.tipoClaseId];
        if (tc) tc.count += counts[s.id] ?? 0;
      });

    return Object.entries(tipoMap)
      .map(([id, v]) => ({ id, ...v }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [tiposClase, sesiones, reservas, periodStart]);

  // ─── CSV Export ─────────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    setCsvState('loading');
    const cobrados = recibos.filter(r => r.estado === 'COBRADO' && r.fechaCobro && new Date(r.fechaCobro) >= periodStart);
    const rows = [
      ['Fecha', 'Clienta', 'Concepto', 'Importe (€)', 'Estado'],
      ...cobrados.map(r => {
        const socia = socios.find(s => s.id === r.socioId);
        const nombre = socia ? `${socia.nombre} ${socia.apellidos}` : r.socioId;
        return [localDate(r.fechaCobro!), nombre, r.concepto, r.importe.toFixed(2), r.estado];
      }),
    ];
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ingresos_${localDate(now)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => { setCsvState('done'); setTimeout(() => setCsvState('idle'), 2500); }, 600);
  }, [recibos, socios, periodStart, mounted]);

  // Export real: abre el diálogo de impresión del navegador, desde el que se
  // puede "Guardar como PDF". Sin dependencias externas y funciona en todos los
  // navegadores modernos.
  const exportPDF = useCallback(() => {
    setPdfState('loading');
    // Deja repintar el estado del botón antes de bloquear con el diálogo.
    setTimeout(() => {
      window.print();
      setPdfState('done');
      setTimeout(() => setPdfState('idle'), 2500);
    }, 150);
  }, []);

  // ─── SVG chart math ─────────────────────────────────────────────────────────
  const BAR_W = period === 'month' ? 10 : 28;
  const BAR_GAP = period === 'month' ? 4 : 10;
  const CHART_H = 160;
  const PADDING_L = 44;
  const maxVal = Math.max(...revenueChart.map(d => d.value), 1);
  const chartW = revenueChart.length * (BAR_W + BAR_GAP) + PADDING_L;

  // Y-axis grid lines
  const Y_TICKS = 4;
  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
    const val = (maxVal / Y_TICKS) * i;
    const y = CHART_H - (val / maxVal) * CHART_H;
    return { val, y };
  });

  // Bar color by trend
  function barColor(i: number, value: number): string {
    if (value === 0) return 'var(--border)';
    const prev = revenueChart[i - 1]?.value ?? 0;
    if (i === 0 || prev === 0) return 'var(--success)';
    const delta = value - prev;
    if (delta > 0) return 'var(--success)';
    if (Math.abs(delta) / prev < 0.05) return '#F59E0B';
    return '#EF4444';
  }

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse p-1">
        <div className="h-8 w-56 bg-border rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-card rounded-xl border border-border" />
          ))}
        </div>
        <div className="h-72 bg-card rounded-xl border border-border" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-56 bg-card rounded-xl border border-border" />
          <div className="h-56 bg-card rounded-xl border border-border" />
        </div>
      </div>
    );
  }

  const LABEL_SKIP = period === 'month' ? 4 : 1;

  return (
    <div className="space-y-6" style={{ backgroundColor: 'var(--background)', minHeight: '100%', padding: '0 0 40px' }}>

      <PageHeader
        className="pt-2"
        title="Informes y analítica"
        description={`Panel de rendimiento del estudio · ${now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
        actions={
          <div
            className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto flex-nowrap"
            style={{ backgroundColor: 'var(--border)' }}
            role="group"
            aria-label="Seleccionar periodo"
          >
            {PERIOD_OPTS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
                style={period === opt.key
                  ? { backgroundColor: 'var(--foreground)', color: 'var(--background)', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }
                  : { color: 'var(--muted-foreground)', backgroundColor: 'transparent' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      {/* ── Section 1: KPI cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ingresos período */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))' }}
          >
            <TrendingUp size={17} style={{ color: 'var(--success)' }} />
          </div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted-foreground)' }}>Ingresos período</p>
          <p className="text-2xl font-extrabold leading-none" style={{ color: 'var(--foreground)' }}>
            {fmtEurFull(totalIngresos)}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--muted-foreground)' }}>cobrados en el periodo</p>
        </div>

        {/* MRR */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-brand-secondary/10"
          >
            <CreditCard size={17} className="text-brand-secondary" />
          </div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted-foreground)' }}>Ingresos del mes</p>
          <p className="text-2xl font-extrabold leading-none" style={{ color: 'var(--foreground)' }}>
            {fmtEurFull(mrr)}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--muted-foreground)' }}>ingresos mes actual</p>
        </div>

        {/* Ticket medio */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, var(--card))' }}
          >
            <Activity size={17} style={{ color: 'var(--warning)' }} />
          </div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted-foreground)' }}>Ticket medio / cliente</p>
          <p className="text-2xl font-extrabold leading-none" style={{ color: 'var(--foreground)' }}>
            {fmtEurFull(ticketMedio)}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--muted-foreground)' }}>por cliente en el periodo</p>
        </div>

        {/* Retención */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ backgroundColor: tasaRetencion >= 80 ? 'color-mix(in srgb, var(--success) 12%, var(--card))' : tasaRetencion >= 60 ? 'color-mix(in srgb, var(--warning) 12%, var(--card))' : 'color-mix(in srgb, var(--destructive) 12%, var(--card))' }}
          >
            <Users size={17} style={{ color: tasaRetencion >= 80 ? 'var(--success)' : tasaRetencion >= 60 ? 'var(--warning)' : 'var(--destructive)' }} />
          </div>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted-foreground)' }}>Tasa retención</p>
          <p
            className="text-2xl font-extrabold leading-none"
            style={{ color: tasaRetencion >= 80 ? 'var(--success)' : tasaRetencion >= 60 ? 'var(--warning)' : 'var(--destructive)' }}
          >
            {tasaRetencion}%
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--muted-foreground)' }}>
            {socios.filter(s => s.activo).length} activas de {socios.length}
          </p>
        </div>
      </div>

      {/* ── Section 2: Revenue bar chart ────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-base font-extrabold" style={{ color: 'var(--foreground)' }}>Evolución de ingresos</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Cobros realizados en el periodo seleccionado</p>
          </div>
          <div className="text-right">
            <span className="text-lg font-extrabold" style={{ color: 'var(--foreground)' }}>{fmtEurFull(totalIngresos)}</span>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>acumulado</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-5 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--success)' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>Creciendo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#F59E0B' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>Estable</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#EF4444' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>Decreciendo</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <svg
            width={Math.max(chartW, 480)}
            height={CHART_H + 52}
            viewBox={`0 0 ${Math.max(chartW, 480)} ${CHART_H + 52}`}
            style={{ display: 'block', minWidth: '100%' }}
            aria-label="Gráfico de ingresos"
            role="img"
          >
            {/* Y-axis grid + labels */}
            {yTicks.map(tick => (
              <g key={tick.val}>
                <line
                  x1={PADDING_L}
                  y1={tick.y}
                  x2={Math.max(chartW, 480)}
                  y2={tick.y}
                  stroke="var(--muted)"
                  strokeWidth="1"
                />
                <text
                  x={PADDING_L - 6}
                  y={tick.y + 4}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--muted-foreground)"
                  fontWeight="500"
                >
                  {fmtEur(tick.val)}
                </text>
              </g>
            ))}

            {/* Bars */}
            {revenueChart.map((d, i) => {
              const barH = Math.max((d.value / maxVal) * CHART_H, d.value > 0 ? 4 : 2);
              const x = PADDING_L + i * (BAR_W + BAR_GAP);
              const y = CHART_H - barH;
              const color = barColor(i, d.value);
              const isHovered = tooltipIdx === i;

              return (
                <g key={d.key}>
                  {/* Hover highlight */}
                  {isHovered && (
                    <rect
                      x={x - 2}
                      y={0}
                      width={BAR_W + 4}
                      height={CHART_H + 4}
                      rx={4}
                      fill="var(--muted)"
                    />
                  )}

                  {/* Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={period === 'month' ? 2 : 4}
                    fill={d.value === 0 ? 'var(--muted)' : color}
                    opacity={isHovered ? 1 : 0.88}
                    style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                    onMouseEnter={() => setTooltipIdx(i)}
                    onMouseLeave={() => setTooltipIdx(null)}
                  />

                  {/* Value label on bar (skip if bar too narrow) */}
                  {d.value > 0 && BAR_W >= 20 && (
                    <text
                      x={x + BAR_W / 2}
                      y={y - 5}
                      textAnchor="middle"
                      fontSize="9"
                      fill={color}
                      fontWeight="700"
                    >
                      {fmtEur(d.value)}
                    </text>
                  )}

                  {/* X-axis label */}
                  {(i % LABEL_SKIP === 0 || i === revenueChart.length - 1) && (
                    <text
                      x={x + BAR_W / 2}
                      y={CHART_H + 18}
                      textAnchor="middle"
                      fontSize="9"
                      fill="var(--muted-foreground)"
                      fontWeight="500"
                    >
                      {d.label}
                    </text>
                  )}

                  {/* Tooltip */}
                  {isHovered && d.value > 0 && (
                    <g>
                      <rect
                        x={Math.min(x - 24, Math.max(chartW, 480) - 96)}
                        y={y - 38}
                        width={90}
                        height={28}
                        rx={6}
                        fill="var(--foreground)"
                      />
                      <text
                        x={Math.min(x - 24, Math.max(chartW, 480) - 96) + 45}
                        y={y - 28}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#fff"
                        fontWeight="600"
                      >
                        {d.label}
                      </text>
                      <text
                        x={Math.min(x - 24, Math.max(chartW, 480) - 96) + 45}
                        y={y - 16}
                        textAnchor="middle"
                        fontSize="10"
                        fill="color-mix(in srgb, var(--success) 12%, var(--card))"
                        fontWeight="700"
                      >
                        {fmtEurFull(d.value)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* X baseline */}
            <line x1={PADDING_L} y1={CHART_H} x2={Math.max(chartW, 480)} y2={CHART_H} stroke="var(--border)" strokeWidth="1" />
          </svg>
        </div>
      </div>

      {/* ── Section 3: 2-col grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Left: Ocupación por tipo de clase */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-extrabold mb-0.5" style={{ color: 'var(--foreground)' }}>Ocupación por tipo de clase</h2>
          <p className="text-xs mb-5" style={{ color: 'var(--muted-foreground)' }}>% plazas ocupadas sobre aforo total en el periodo</p>

          {ocupacionPorTipo.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin sesiones en el periodo</p>
            </div>
          ) : (
            <div className="space-y-5">
              {ocupacionPorTipo.map(tc => (
                <div key={tc.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tc.color }}
                      />
                      <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{tc.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{tc.ocupadas}/{tc.aforo}</span>
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{ color: tc.pct >= 80 ? 'var(--success)' : tc.pct >= 50 ? 'var(--warning)' : 'var(--muted-foreground)' }}
                      >
                        {tc.pct}%
                      </span>
                    </div>
                  </div>

                  {/* SVG horizontal bar */}
                  <svg width="100%" height="12" style={{ display: 'block' }}>
                    <rect x={0} y={2} width="100%" height={8} rx={4} fill="var(--muted)" />
                    <rect
                      x={0}
                      y={2}
                      width={`${tc.pct}%`}
                      height={8}
                      rx={4}
                      fill={tc.color}
                    />
                  </svg>

                  <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>{tc.sesiones} sesiones</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Cohort retention table */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-extrabold mb-0.5" style={{ color: 'var(--foreground)' }}>Retención por cohorte</h2>
          <p className="text-xs mb-5" style={{ color: 'var(--muted-foreground)' }}>Clientes nuevos por mes y su actividad posterior</p>

          {cohortRows.every(r => r.total === 0) ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin datos de cohortes suficientes</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="text-left font-semibold pb-2 pr-3" style={{ color: 'var(--muted-foreground)' }}>Mes</th>
                    <th className="text-right font-semibold pb-2 pr-3" style={{ color: 'var(--muted-foreground)' }}>Altas</th>
                    <th className="text-right font-semibold pb-2 pr-3" style={{ color: 'var(--muted-foreground)' }}>Act. 30d</th>
                    <th className="text-right font-semibold pb-2 pr-3" style={{ color: 'var(--muted-foreground)' }}>Act. 90d</th>
                    <th className="text-right font-semibold pb-2" style={{ color: 'var(--muted-foreground)' }}>% 30d</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortRows.map((row, i) => (
                    <tr
                      key={row.mes}
                      style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                    >
                      <td className="py-2 pr-3 font-semibold capitalize" style={{ color: 'var(--foreground)' }}>{row.mes}</td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: 'var(--foreground)' }}>{row.total}</td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: 'var(--foreground)' }}>{row.active30}</td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: row.active90 < 0 ? 'var(--muted-foreground)' : 'var(--foreground)' }}>
                        {row.active90 < 0 ? '—' : row.active90}
                      </td>
                      <td className="py-2 text-right">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded font-bold tabular-nums"
                          style={{
                            backgroundColor: row.pct30 >= 70 ? 'color-mix(in srgb, var(--success) 12%, var(--card))' : row.pct30 >= 40 ? 'color-mix(in srgb, var(--warning) 12%, var(--card))' : 'color-mix(in srgb, var(--destructive) 12%, var(--card))',
                            color: row.pct30 >= 70 ? 'var(--success)' : row.pct30 >= 40 ? 'var(--warning)' : '#991B1B',
                          }}
                        >
                          {row.total > 0 ? `${row.pct30}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Leaderboard row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Top 5 socias */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-extrabold mb-0.5" style={{ color: 'var(--foreground)' }}>Top 5 clientes</h2>
          <p className="text-xs mb-5" style={{ color: 'var(--muted-foreground)' }}>Más sesiones asistidas en el periodo</p>

          {topSocias.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin asistencias registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topSocias.map((s, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const pct = Math.round((s.clases / topSocias[0].clases) * 100);
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="text-base w-6 flex-shrink-0 text-center">{medals[i] ?? `#${i + 1}`}</span>

                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}
                    >
                      {s.nombre[0]}{s.apellidos?.[0] ?? ''}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                        {s.nombre} {s.apellidos}
                      </p>
                      <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--muted)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: i === 0 ? 'var(--brand)' : 'var(--muted-foreground)' }}
                        />
                      </div>
                    </div>

                    <span
                      className="text-sm font-extrabold tabular-nums flex-shrink-0"
                      style={{ color: i === 0 ? 'var(--brand-secondary)' : 'var(--foreground)' }}
                    >
                      {s.clases}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Clases más populares */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-extrabold mb-0.5" style={{ color: 'var(--foreground)' }}>Clases más populares</h2>
          <p className="text-xs mb-5" style={{ color: 'var(--muted-foreground)' }}>Por número de reservas en el periodo</p>

          {topClases.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sin reservas en el periodo</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topClases.map((tc, i) => {
                const pct = Math.round((tc.count / topClases[0].count) * 100);
                return (
                  <div key={tc.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-4 text-right" style={{ color: 'var(--muted-foreground)' }}>#{i + 1}</span>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tc.color }} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{tc.nombre}</span>
                      </div>
                      <span className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--foreground)' }}>
                        {tc.count}
                      </span>
                    </div>
                    {/* SVG bar */}
                    <svg width="100%" height="10" style={{ display: 'block' }}>
                      <rect x={0} y={1} width="100%" height={8} rx={4} fill="var(--muted)" />
                      <rect
                        x={0}
                        y={1}
                        width={`${pct}%`}
                        height={8}
                        rx={4}
                        fill={tc.color}
                        opacity={0.85}
                      />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 5: Export ────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold" style={{ color: 'var(--foreground)' }}>Exportar datos</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Descarga los datos del periodo seleccionado
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* CSV export */}
            <button
              onClick={exportCSV}
              disabled={csvState !== 'idle'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              style={csvState === 'done'
                ? { backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))', color: 'var(--success)', borderColor: '#A7F3D0' }
                : { backgroundColor: 'var(--card)', color: 'var(--foreground)', borderColor: 'var(--border)' }
              }
            >
              <Download size={14} />
              {csvState === 'idle' ? 'Exportar CSV'
                : csvState === 'loading' ? 'Exportando...'
                : 'Exportado ✓'}
            </button>

            {/* PDF download */}
            <button
              onClick={exportPDF}
              disabled={pdfState !== 'idle'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              style={pdfState === 'done'
                ? { backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))', color: 'var(--success)', borderColor: '#A7F3D0' }
                : { backgroundColor: 'var(--foreground)', color: 'var(--background)', borderColor: 'var(--foreground)' }
              }
            >
              <FileText size={14} />
              {pdfState === 'idle' ? 'Descargar PDF'
                : pdfState === 'loading' ? 'Generando...'
                : 'Descargado ✓'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
