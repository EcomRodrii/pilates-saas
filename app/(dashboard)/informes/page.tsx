'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStudio } from '@/lib/studio-context';
import { TrendingUp, Users, CreditCard, Activity, Download, FileText } from 'lucide-react';

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
    return tiposClase.map(tc => {
      const sesionesTipo = sesiones.filter(
        s => s.tipoClaseId === tc.id && !s.cancelada && new Date(s.inicio) >= periodStart
      );
      const totalAforo = sesionesTipo.reduce((s, ses) => s + ses.aforoMaximo, 0);
      const totalOcupadas = sesionesTipo.reduce((sum, ses) =>
        sum + reservas.filter(r => r.sesionId === ses.id && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA')).length, 0
      );
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

      const active30 = cohortSocios.filter(s =>
        reservas.some(r => r.socioId === s.id && sesionIds30.has(r.sesionId) && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'))
      ).length;

      const active90 = d90 <= now
        ? cohortSocios.filter(s =>
            reservas.some(r => r.socioId === s.id && sesionIds90.has(r.sesionId) && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'))
          ).length
        : -1;

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
      ['Fecha', 'Socia', 'Concepto', 'Importe (€)', 'Estado'],
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

  const simulatePDF = useCallback(() => {
    setPdfState('loading');
    setTimeout(() => { setPdfState('done'); setTimeout(() => setPdfState('idle'), 2500); }, 1200);
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
    if (value === 0) return '#ECECF1';
    const prev = revenueChart[i - 1]?.value ?? 0;
    if (i === 0 || prev === 0) return '#059669';
    const delta = value - prev;
    if (delta > 0) return '#059669';
    if (Math.abs(delta) / prev < 0.05) return '#F59E0B';
    return '#EF4444';
  }

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse p-1">
        <div className="h-8 w-56 bg-[#ECECF1] rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-xl border border-[#ECECF1]" />
          ))}
        </div>
        <div className="h-72 bg-white rounded-xl border border-[#ECECF1]" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-56 bg-white rounded-xl border border-[#ECECF1]" />
          <div className="h-56 bg-white rounded-xl border border-[#ECECF1]" />
        </div>
      </div>
    );
  }

  const LABEL_SKIP = period === 'month' ? 4 : 1;

  return (
    <div className="space-y-6" style={{ backgroundColor: '#F7F7FB', minHeight: '100%', padding: '0 0 40px' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: '#15161B' }}>
            Informes y analítica
          </h1>
          <p className="text-sm mt-0.5 font-medium" style={{ color: '#71727A' }}>
            Panel de rendimiento del estudio · {now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Period selector */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto flex-nowrap"
          style={{ backgroundColor: '#ECECF1' }}
          role="group"
          aria-label="Seleccionar periodo"
        >
          {PERIOD_OPTS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15161B]"
              style={period === opt.key
                ? { backgroundColor: '#15161B', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }
                : { color: '#71727A', backgroundColor: 'transparent' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 1: KPI cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ingresos período */}
        <div className="bg-white border border-[#ECECF1] rounded-xl p-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ backgroundColor: '#D1FAE5' }}
          >
            <TrendingUp size={17} style={{ color: '#059669' }} />
          </div>
          <p className="text-xs font-semibold mb-1" style={{ color: '#71727A' }}>Ingresos período</p>
          <p className="text-2xl font-extrabold leading-none" style={{ color: '#15161B' }}>
            {fmtEurFull(totalIngresos)}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: '#71727A' }}>cobrados en el periodo</p>
        </div>

        {/* MRR */}
        <div className="bg-white border border-[#ECECF1] rounded-xl p-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ backgroundColor: '#EDE9FE' }}
          >
            <CreditCard size={17} style={{ color: '#7C3AED' }} />
          </div>
          <p className="text-xs font-semibold mb-1" style={{ color: '#71727A' }}>MRR</p>
          <p className="text-2xl font-extrabold leading-none" style={{ color: '#15161B' }}>
            {fmtEurFull(mrr)}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: '#71727A' }}>ingresos mes actual</p>
        </div>

        {/* Ticket medio */}
        <div className="bg-white border border-[#ECECF1] rounded-xl p-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ backgroundColor: '#FEF3C7' }}
          >
            <Activity size={17} style={{ color: '#D97706' }} />
          </div>
          <p className="text-xs font-semibold mb-1" style={{ color: '#71727A' }}>Ticket medio / miembro</p>
          <p className="text-2xl font-extrabold leading-none" style={{ color: '#15161B' }}>
            {fmtEurFull(ticketMedio)}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: '#71727A' }}>por miembro en el periodo</p>
        </div>

        {/* Retención */}
        <div className="bg-white border border-[#ECECF1] rounded-xl p-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
            style={{ backgroundColor: tasaRetencion >= 80 ? '#D1FAE5' : tasaRetencion >= 60 ? '#FEF3C7' : '#FEE2E2' }}
          >
            <Users size={17} style={{ color: tasaRetencion >= 80 ? '#059669' : tasaRetencion >= 60 ? '#D97706' : '#DC2626' }} />
          </div>
          <p className="text-xs font-semibold mb-1" style={{ color: '#71727A' }}>Tasa retención</p>
          <p
            className="text-2xl font-extrabold leading-none"
            style={{ color: tasaRetencion >= 80 ? '#059669' : tasaRetencion >= 60 ? '#D97706' : '#DC2626' }}
          >
            {tasaRetencion}%
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: '#71727A' }}>
            {socios.filter(s => s.activo).length} activas de {socios.length}
          </p>
        </div>
      </div>

      {/* ── Section 2: Revenue bar chart ────────────────────────────────────── */}
      <div className="bg-white border border-[#ECECF1] rounded-xl p-6">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-base font-extrabold" style={{ color: '#15161B' }}>Evolución de ingresos</h2>
            <p className="text-xs mt-0.5" style={{ color: '#71727A' }}>Cobros realizados en el periodo seleccionado</p>
          </div>
          <div className="text-right">
            <span className="text-lg font-extrabold" style={{ color: '#15161B' }}>{fmtEurFull(totalIngresos)}</span>
            <p className="text-xs" style={{ color: '#71727A' }}>acumulado</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-5 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#059669' }} />
            <span className="text-[11px] font-medium" style={{ color: '#71727A' }}>Creciendo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#F59E0B' }} />
            <span className="text-[11px] font-medium" style={{ color: '#71727A' }}>Estable</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#EF4444' }} />
            <span className="text-[11px] font-medium" style={{ color: '#71727A' }}>Decreciendo</span>
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
                  stroke="#F1F1F6"
                  strokeWidth="1"
                />
                <text
                  x={PADDING_L - 6}
                  y={tick.y + 4}
                  textAnchor="end"
                  fontSize="9"
                  fill="#A2A3AC"
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
                      fill="#F4F4F8"
                    />
                  )}

                  {/* Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={period === 'month' ? 2 : 4}
                    fill={d.value === 0 ? '#F1F1F6' : color}
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
                      fill="#A2A3AC"
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
                        fill="#15161B"
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
                        fill="#D1FAE5"
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
            <line x1={PADDING_L} y1={CHART_H} x2={Math.max(chartW, 480)} y2={CHART_H} stroke="#ECECF1" strokeWidth="1" />
          </svg>
        </div>
      </div>

      {/* ── Section 3: 2-col grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Left: Ocupación por tipo de clase */}
        <div className="bg-white border border-[#ECECF1] rounded-xl p-6">
          <h2 className="text-base font-extrabold mb-0.5" style={{ color: '#15161B' }}>Ocupación por tipo de clase</h2>
          <p className="text-xs mb-5" style={{ color: '#71727A' }}>% plazas ocupadas sobre aforo total en el periodo</p>

          {ocupacionPorTipo.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: '#A2A3AC' }}>Sin sesiones en el periodo</p>
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
                      <span className="text-sm font-semibold" style={{ color: '#15161B' }}>{tc.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#71727A' }}>{tc.ocupadas}/{tc.aforo}</span>
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{ color: tc.pct >= 80 ? '#059669' : tc.pct >= 50 ? '#D97706' : '#71727A' }}
                      >
                        {tc.pct}%
                      </span>
                    </div>
                  </div>

                  {/* SVG horizontal bar */}
                  <svg width="100%" height="12" style={{ display: 'block' }}>
                    <rect x={0} y={2} width="100%" height={8} rx={4} fill="#F1F1F6" />
                    <rect
                      x={0}
                      y={2}
                      width={`${tc.pct}%`}
                      height={8}
                      rx={4}
                      fill={tc.color}
                    />
                  </svg>

                  <p className="text-[11px] mt-1" style={{ color: '#A2A3AC' }}>{tc.sesiones} sesiones</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Cohort retention table */}
        <div className="bg-white border border-[#ECECF1] rounded-xl p-6">
          <h2 className="text-base font-extrabold mb-0.5" style={{ color: '#15161B' }}>Retención por cohorte</h2>
          <p className="text-xs mb-5" style={{ color: '#71727A' }}>Miembros nuevos por mes y su actividad posterior</p>

          {cohortRows.every(r => r.total === 0) ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: '#A2A3AC' }}>Sin datos de cohortes suficientes</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="text-left font-semibold pb-2 pr-3" style={{ color: '#71727A' }}>Mes</th>
                    <th className="text-right font-semibold pb-2 pr-3" style={{ color: '#71727A' }}>Altas</th>
                    <th className="text-right font-semibold pb-2 pr-3" style={{ color: '#71727A' }}>Act. 30d</th>
                    <th className="text-right font-semibold pb-2 pr-3" style={{ color: '#71727A' }}>Act. 90d</th>
                    <th className="text-right font-semibold pb-2" style={{ color: '#71727A' }}>% 30d</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortRows.map((row, i) => (
                    <tr
                      key={row.mes}
                      style={{ borderTop: i > 0 ? '1px solid #F1F1F6' : 'none' }}
                    >
                      <td className="py-2 pr-3 font-semibold capitalize" style={{ color: '#15161B' }}>{row.mes}</td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: '#15161B' }}>{row.total}</td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: '#15161B' }}>{row.active30}</td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: row.active90 < 0 ? '#A2A3AC' : '#15161B' }}>
                        {row.active90 < 0 ? '—' : row.active90}
                      </td>
                      <td className="py-2 text-right">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded font-bold tabular-nums"
                          style={{
                            backgroundColor: row.pct30 >= 70 ? '#D1FAE5' : row.pct30 >= 40 ? '#FEF3C7' : '#FEE2E2',
                            color: row.pct30 >= 70 ? '#065F46' : row.pct30 >= 40 ? '#92400E' : '#991B1B',
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
        <div className="bg-white border border-[#ECECF1] rounded-xl p-6">
          <h2 className="text-base font-extrabold mb-0.5" style={{ color: '#15161B' }}>Top 5 miembros</h2>
          <p className="text-xs mb-5" style={{ color: '#71727A' }}>Más sesiones asistidas en el periodo</p>

          {topSocias.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm" style={{ color: '#A2A3AC' }}>Sin asistencias registradas</p>
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
                      <p className="text-sm font-semibold truncate" style={{ color: '#15161B' }}>
                        {s.nombre} {s.apellidos}
                      </p>
                      <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#F1F1F6' }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: i === 0 ? '#7C3AED' : '#818CF8' }}
                        />
                      </div>
                    </div>

                    <span
                      className="text-sm font-extrabold tabular-nums flex-shrink-0"
                      style={{ color: i === 0 ? '#7C3AED' : '#15161B' }}
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
        <div className="bg-white border border-[#ECECF1] rounded-xl p-6">
          <h2 className="text-base font-extrabold mb-0.5" style={{ color: '#15161B' }}>Clases más populares</h2>
          <p className="text-xs mb-5" style={{ color: '#71727A' }}>Por número de reservas en el periodo</p>

          {topClases.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm" style={{ color: '#A2A3AC' }}>Sin reservas en el periodo</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topClases.map((tc, i) => {
                const pct = Math.round((tc.count / topClases[0].count) * 100);
                return (
                  <div key={tc.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-4 text-right" style={{ color: '#A2A3AC' }}>#{i + 1}</span>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tc.color }} />
                        <span className="text-sm font-semibold" style={{ color: '#15161B' }}>{tc.nombre}</span>
                      </div>
                      <span className="text-sm font-extrabold tabular-nums" style={{ color: '#15161B' }}>
                        {tc.count}
                      </span>
                    </div>
                    {/* SVG bar */}
                    <svg width="100%" height="10" style={{ display: 'block' }}>
                      <rect x={0} y={1} width="100%" height={8} rx={4} fill="#F1F1F6" />
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
      <div className="bg-white border border-[#ECECF1] rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold" style={{ color: '#15161B' }}>Exportar datos</h2>
            <p className="text-xs mt-0.5" style={{ color: '#71727A' }}>
              Descarga los datos del periodo seleccionado
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* CSV export */}
            <button
              onClick={exportCSV}
              disabled={csvState !== 'idle'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15161B]"
              style={csvState === 'done'
                ? { backgroundColor: '#D1FAE5', color: '#065F46', borderColor: '#A7F3D0' }
                : { backgroundColor: '#fff', color: '#15161B', borderColor: '#ECECF1' }
              }
            >
              <Download size={14} />
              {csvState === 'idle' ? 'Exportar CSV'
                : csvState === 'loading' ? 'Exportando...'
                : 'Exportado ✓'}
            </button>

            {/* PDF download */}
            <button
              onClick={simulatePDF}
              disabled={pdfState !== 'idle'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15161B]"
              style={pdfState === 'done'
                ? { backgroundColor: '#D1FAE5', color: '#065F46', borderColor: '#A7F3D0' }
                : { backgroundColor: '#15161B', color: '#fff', borderColor: '#15161B' }
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
