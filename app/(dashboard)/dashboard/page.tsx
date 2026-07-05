'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import {
  TrendingUp, TrendingDown, Minus,
  UserPlus, ShoppingCart, CreditCard, Bell,
  CheckCircle2, ChevronDown, ChevronUp,
  CalendarPlus, Zap, ArrowUpRight, RefreshCw,
  Users, BarChart3, Calendar, AlertTriangle,
  Clock, Activity, Bot, MessageSquare, Mail,
} from 'lucide-react';
import type { TipoActividad } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localDate(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function monthKey(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function timeAgo(iso: string, now: Date) {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const actividadConfig: Record<TipoActividad, { color: string; bg: string; label: string }> = {
  NUEVA_SOCIA:        { color: '#059669', bg: '#ECFDF5', label: 'Alta' },
  NUEVA_RESERVA:      { color: '#2563EB', bg: '#EFF6FF', label: 'Reserva' },
  CANCELACION:        { color: '#DC2626', bg: '#FEF2F2', label: 'Cancelación' },
  PAGO_COBRADO:       { color: '#059669', bg: '#ECFDF5', label: 'Cobro' },
  PAGO_PENDIENTE:     { color: '#D97706', bg: '#FFFBEB', label: 'Pendiente' },
  NUEVA_SUSCRIPCION:  { color: '#7C3AED', bg: '#F5F3FF', label: 'Plan' },
  SUSCRIPCION_PAUSADA:{ color: '#D97706', bg: '#FFFBEB', label: 'Pausa' },
  CITA_CREADA:        { color: '#0891B2', bg: '#ECFEFF', label: 'Cita' },
  CITA_COMPLETADA:    { color: '#059669', bg: '#ECFDF5', label: 'Cita ✓' },
  VENTA_POS:          { color: '#059669', bg: '#ECFDF5', label: 'Venta' },
  MENSAJE_ENVIADO:    { color: '#6B7280', bg: '#F9FAFB', label: 'Email' },
};

// ─── Sparkline SVG Chart ──────────────────────────────────────────────────────

function RevenueSparkline({
  data,
  labels,
  currentIdx,
}: {
  data: number[];
  labels: string[];
  currentIdx: number;
}) {
  const W = 900;
  const H = 120;
  const PAD = { top: 16, bottom: 28, left: 8, right: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data, 1);

  const pts = data.map((v, i) => ({
    x: PAD.left + (i / (data.length - 1)) * innerW,
    y: PAD.top + innerH - (v / maxVal) * innerH,
    v,
    label: labels[i],
  }));

  const pathD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const areaD =
    pathD +
    ` L${pts[pts.length - 1].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)}` +
    ` L${pts[0].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#111827" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#111827" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaD} fill="url(#spark-grad)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r={i === currentIdx ? 5 : 3}
            fill={i === currentIdx ? '#111827' : '#fff'}
            stroke="#111827"
            strokeWidth="2"
          />
          <text
            x={p.x}
            y={H - 6}
            textAnchor="middle"
            fontSize="11"
            fill={i === currentIdx ? '#111827' : '#9CA3AF'}
            fontWeight={i === currentIdx ? '700' : '400'}
          >
            {p.label}
          </text>
          {p.v > 0 && (
            <text
              x={p.x}
              y={p.y - 9}
              textAnchor="middle"
              fontSize="10"
              fill={i === currentIdx ? '#111827' : '#6B7280'}
              fontWeight={i === currentIdx ? '700' : '400'}
            >
              {p.v >= 1000 ? `${(p.v / 1000).toFixed(1)}k` : p.v.toFixed(0)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ─── Ocupación week bar ───────────────────────────────────────────────────────

function OcupacionBar({ pct }: { pct: number }) {
  const color = pct >= 85 ? '#DC2626' : pct >= 60 ? '#D97706' : '#059669';
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-semibold w-8 text-right" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

// ─── KPI card (shadcn) ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, Icon, tint, tintBg }: {
  label: string;
  value: React.ReactNode;
  sub: string;
  Icon: React.ElementType;
  tint: string;
  tintBg: string;
}) {
  return (
    <Card size="sm" className="gap-2.5">
      <CardContent className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className={cn('flex size-7 items-center justify-center rounded-lg', tintBg)}>
          <Icon className={cn('size-3.5', tint)} />
        </span>
      </CardContent>
      <CardContent>
        <p className="text-3xl font-semibold leading-none tracking-tight text-foreground">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ─── Clase card expandible ────────────────────────────────────────────────────

function ClaseHoyCard({
  sesion,
  isNow,
}: {
  sesion: ReturnType<typeof useStudio>['sesiones'][0] & {
    tipoNombre: string;
    tipoColor: string;
    salaNombre: string;
    instructorNombre: string;
  };
  isNow: boolean;
}) {
  const { reservas, socios, checkin, cancelarReserva } = useStudio();
  const [expanded, setExpanded] = useState(isNow);

  const reservasSesion = useMemo(
    () =>
      reservas
        .filter(r => r.sesionId === sesion.id && r.estado !== 'CANCELADA')
        .map(r => ({ ...r, socio: socios.find(s => s.id === r.socioId) }))
        .filter(r => r.socio),
    [reservas, socios, sesion.id]
  );

  const asistidas = reservasSesion.filter(r => r.estado === 'ASISTIDA').length;
  const pct =
    sesion.aforoMaximo > 0
      ? Math.round((reservasSesion.length / sesion.aforoMaximo) * 100)
      : 0;
  const fillColor = pct >= 100 ? '#DC2626' : pct >= 75 ? '#D97706' : '#059669';

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden bg-white',
        isNow ? 'border-[#111827] shadow-sm' : 'border-[#E8EAED]'
      )}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#F9FAFB] transition-colors"
      >
        {isNow && (
          <span className="shrink-0 w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
        )}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: sesion.tipoColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-[#111827] truncate">{sesion.tipoNombre}</p>
            {isNow && (
              <span className="text-[10px] font-bold text-[#059669] bg-[#ECFDF5] px-1.5 py-0.5 rounded-full shrink-0">
                AHORA
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#9CA3AF] truncate">
            {formatHora(sesion.inicio)}–{formatHora(sesion.fin)} · {sesion.salaNombre} ·{' '}
            {sesion.instructorNombre}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {asistidas > 0 && (
            <span className="text-[11px] font-bold text-[#059669]">{asistidas}✓</span>
          )}
          <span className="text-[12px] font-semibold text-[#374151]">
            {reservasSesion.length}/{sesion.aforoMaximo}
          </span>
          <div className="w-16 h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: fillColor }}
            />
          </div>
          {expanded ? (
            <ChevronUp size={14} className="text-[#9CA3AF]" />
          ) : (
            <ChevronDown size={14} className="text-[#9CA3AF]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#F3F4F6]">
          {reservasSesion.length === 0 ? (
            <p className="text-[12px] text-[#9CA3AF] px-4 py-3">Sin reservas aún</p>
          ) : (
            <div className="divide-y divide-[#F9FAFB]">
              {reservasSesion.map(r => {
                const asistida = r.estado === 'ASISTIDA';
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                        asistida
                          ? 'bg-[#ECFDF5] text-[#059669]'
                          : 'bg-[#F3F4F6] text-[#374151]'
                      )}
                    >
                      {r.socio!.nombre[0]}
                      {r.socio!.apellidos[0]}
                    </div>
                    <Link
                      href={`/socios/${r.socioId}`}
                      className="flex-1 min-w-0 hover:underline"
                    >
                      <p className="text-[12px] font-medium text-[#111827] truncate">
                        {r.socio!.nombre} {r.socio!.apellidos}
                      </p>
                    </Link>
                    {asistida ? (
                      <span className="text-[10px] font-bold text-[#059669] flex items-center gap-1 shrink-0">
                        <CheckCircle2 size={12} /> Asistió
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => checkin(r.id)}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#111827] text-white hover:bg-[#1f2937] transition-colors"
                        >
                          Check-in
                        </button>
                        <button
                          onClick={() => cancelarReserva(r.id)}
                          className="text-[10px] font-medium px-2 py-1 rounded-lg text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#DC2626] transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-[#F9FAFB]">
            <Link
              href="/calendario"
              className="text-[11px] font-medium text-[#2563EB] hover:underline"
            >
              Gestionar clase →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    socios,
    suscripciones,
    sesiones,
    reservas,
    recibos,
    planesTarifa,
    tiposClase,
    instructores,
    salas,
    marcarCobrado,
    cobrarTodosPendientes,
    actividadReciente,
    automationLogs,
    resetDatosPilates,
  } = useStudio();

  // Hydration fix — avoids server/client mismatch with Date
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const now = mounted ? new Date() : new Date('2026-06-29');

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const hoyStr = localDate(now);
  const saludo = now.getHours() < 13 ? 'Buenos días' : now.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches';
  const mesFecha = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // ── Revenue 6-month data (for sparkline) ────────────────────────────────────
  const { sparkData, sparkLabels, sparkCurrentIdx, ingresosMes, ingresosMesAnterior } =
    useMemo(() => {
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return {
          key: monthKey(d),
          label: MONTH_LABELS[d.getMonth()],
          isCurrent: i === 5,
          total: 0,
        };
      });
      recibos
        .filter(r => r.estado === 'COBRADO' && r.fechaCobro)
        .forEach(r => {
          const m = months.find(x => x.key === monthKey(r.fechaCobro!));
          if (m) m.total += r.importe;
        });
      return {
        sparkData: months.map(m => m.total),
        sparkLabels: months.map(m => m.label),
        sparkCurrentIdx: 5,
        ingresosMes: months[5].total,
        ingresosMesAnterior: months[4].total,
      };
    }, [recibos, now]);

  const pctChange =
    ingresosMesAnterior > 0
      ? Math.round(((ingresosMes - ingresosMesAnterior) / ingresosMesAnterior) * 100)
      : 0;

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const sociasActivas = socios.filter(s => s.activo).length;
  const reservasHoy = reservas.filter(
    r => r.estado !== 'CANCELADA' && sesiones.find(s => s.id === r.sesionId && localDate(s.inicio) === hoyStr)
  ).length;

  // Ocupación media de la semana
  const ocupacionMedia = useMemo(() => {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // lunes
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = localDate(weekStart);
    const weekEndStr = localDate(weekEnd);
    const sessSemana = sesiones.filter(
      s =>
        !s.cancelada &&
        localDate(s.inicio) >= weekStartStr &&
        localDate(s.inicio) <= weekEndStr &&
        s.aforoMaximo > 0
    );
    if (sessSemana.length === 0) return 0;
    const total = sessSemana.reduce((sum, s) => {
      const ocupadas = reservas.filter(
        r => r.sesionId === s.id && r.estado !== 'CANCELADA'
      ).length;
      return sum + ocupadas / s.aforoMaximo;
    }, 0);
    return Math.round((total / sessSemana.length) * 100);
  }, [sesiones, reservas, now]);

  // ── MRR ─────────────────────────────────────────────────────────────────────
  const { mrr, renovacionesProximas } = useMemo(() => {
    const activas = suscripciones.filter(s => s.estado === 'ACTIVA');
    const mensualMrr = activas.reduce((sum, s) => {
      const plan = planesTarifa.find(p => p.id === s.planId);
      if (!plan) return sum;
      if (plan.tipo === 'MENSUAL') return sum + plan.precio;
      if (plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL')
        return sum + plan.precio / (plan.sesiones ?? 4);
      return sum;
    }, 0);

    const en30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30)
      .toISOString()
      .slice(0, 10);
    const renovs = activas
      .filter(s => {
        const plan = planesTarifa.find(p => p.id === s.planId);
        return plan?.tipo === 'MENSUAL' && s.fechaFin && s.fechaFin >= hoyStr && s.fechaFin <= en30;
      })
      .map(s => ({
        ...s,
        socio: socios.find(x => x.id === s.socioId),
        plan: planesTarifa.find(p => p.id === s.planId),
      }))
      .filter(r => r.socio && r.plan)
      .slice(0, 6);

    return { mrr: mensualMrr, renovacionesProximas: renovs };
  }, [suscripciones, planesTarifa, socios, hoyStr, now]);

  // ── Clases de hoy ───────────────────────────────────────────────────────────
  const clasesHoy = useMemo(
    () =>
      sesiones
        .filter(s => !s.cancelada && localDate(s.inicio) === hoyStr)
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
        .map(s => ({
          ...s,
          tipoNombre: tiposClase.find(t => t.id === s.tipoClaseId)?.nombre ?? 'Clase',
          tipoColor: tiposClase.find(t => t.id === s.tipoClaseId)?.color ?? '#6B7280',
          salaNombre: salas.find(x => x.id === s.salaId)?.nombre ?? '',
          instructorNombre: instructores.find(i => i.id === s.instructorId)?.nombre ?? '',
        })),
    [sesiones, hoyStr, tiposClase, salas, instructores]
  );

  const isNowFn = (s: { inicio: string; fin: string }) => {
    const start = new Date(s.inicio).getTime();
    const end = new Date(s.fin).getTime();
    const t = now.getTime();
    return t >= start && t <= end;
  };

  // ── Pagos pendientes ─────────────────────────────────────────────────────────
  const pendientes = useMemo(
    () =>
      recibos
        .filter(r => r.estado === 'PENDIENTE')
        .map(r => ({ ...r, socio: socios.find(s => s.id === r.socioId) }))
        .filter(r => r.socio)
        .slice(0, 5),
    [recibos, socios]
  );

  // ── Trend direction ──────────────────────────────────────────────────────────
  const TrendIcon =
    pctChange > 0 ? TrendingUp : pctChange < 0 ? TrendingDown : Minus;
  const trendColor =
    pctChange > 0 ? '#059669' : pctChange < 0 ? '#DC2626' : '#6B7280';
  const trendBg =
    pctChange > 0 ? '#ECFDF5' : pctChange < 0 ? '#FEF2F2' : '#F9FAFB';

  if (!mounted) return null;

  return (

    <div className="min-h-screen bg-background">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-medium text-muted-foreground capitalize">{mesFecha}</p>
            <h1 className="text-[26px] font-semibold text-foreground mt-0.5 tracking-tight">
              {saludo} 👋
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/socios?nuevo=1" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              <UserPlus /> Nuevo miembro
            </Link>
            <Link href="/pos" className={cn(buttonVariants({ size: 'lg' }))}>
              <ShoppingCart /> Abrir caja
            </Link>
          </div>
        </div>

        {/* ── Automation briefing ────────────────────────────────────────────── */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const todayLogs = automationLogs.filter(l => l.ejecutadoEn.startsWith(today));
          const pendingAdmin = automationLogs.filter(l => l.resultado === 'PENDIENTE_ADMIN');
          const ejecutadas = todayLogs.filter(l => l.resultado === 'EJECUTADO').length;
          return (
            <Link
              href="/automatizaciones"
              className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Bot className="size-4 text-primary-foreground/80" />
              </div>
              <div className="min-w-0 flex-1">
                {pendingAdmin.length === 0 ? (
                  <p className="text-[13px] font-medium">Sistema autónomo — hoy no tienes nada pendiente</p>
                ) : (
                  <p className="text-[13px] font-medium">
                    Sistema autónomo —{' '}
                    <span className="text-amber-300">{pendingAdmin.length} caso{pendingAdmin.length > 1 ? 's' : ''} requiere tu atención</span>
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-primary-foreground/50">
                  {ejecutadas} acciones ejecutadas hoy · {automationLogs.filter(l => l.resultado === 'ESPERANDO').length} esperando respuesta
                </p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-primary-foreground/40" />
            </Link>
          );
        })()}

        {/* ── Revenue card (full width) ──────────────────────────────────────── */}
        <Card>
          <CardContent className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Ingresos cobrados este mes</p>
              <div className="mt-1.5 flex items-end gap-2.5">
                <p className="text-4xl font-semibold leading-none tracking-tight text-foreground">
                  {ingresosMes.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
                </p>
                <Badge
                  variant="secondary"
                  className="mb-1"
                  style={{ backgroundColor: trendBg, color: trendColor }}
                >
                  <TrendIcon /> {pctChange > 0 ? '+' : ''}{pctChange}%
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                MRR estimado <span className="font-semibold text-foreground">{mrr.toFixed(0)} €</span>
                {' · '}ARR <span className="font-semibold text-emerald-600">{(mrr * 12).toFixed(0)} €</span>
              </p>
            </div>
            <Link href="/informes" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              <BarChart3 /> Ver informe
            </Link>
          </CardContent>
          <CardContent className="h-[120px]">
            <RevenueSparkline data={sparkData} labels={sparkLabels} currentIdx={sparkCurrentIdx} />
          </CardContent>
        </Card>

        {/* ── KPI row ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Miembros activos" value={sociasActivas} sub={`${pendientes.length} pago${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`} Icon={Users} tint="text-sky-600" tintBg="bg-sky-50" />
          <Card size="sm" className="gap-2.5">
            <CardContent className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Ocupación semana</span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-amber-50"><Activity className="size-3.5 text-amber-600" /></span>
            </CardContent>
            <CardContent>
              <p className="text-3xl font-semibold leading-none tracking-tight" style={{ color: ocupacionMedia >= 85 ? '#DC2626' : ocupacionMedia >= 60 ? '#D97706' : '#059669' }}>{ocupacionMedia}%</p>
              <div className="mt-2"><OcupacionBar pct={ocupacionMedia} /></div>
            </CardContent>
          </Card>
          <KpiCard label="Reservas hoy" value={reservasHoy} sub={`${clasesHoy.length} clase${clasesHoy.length !== 1 ? 's' : ''} programada${clasesHoy.length !== 1 ? 's' : ''}`} Icon={Calendar} tint="text-violet-600" tintBg="bg-violet-50" />
          <KpiCard
            label="Renovaciones 30d"
            value={renovacionesProximas.length}
            sub={renovacionesProximas.length > 0 ? `Próxima ${new Date(renovacionesProximas[0].fechaFin!).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : 'Sin vencimientos'}
            Icon={RefreshCw}
            tint="text-emerald-600"
            tintBg="bg-emerald-50"
          />
        </div>

        {/* ── Main content grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT: Clases hoy + Pagos pendientes */}
          <div className="lg:col-span-2 space-y-5">

            {/* Clases de hoy */}
            <div className="bg-white rounded-xl border border-[#E8EAED]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-[#6B7280]" />
                  <h2 className="text-[13px] font-semibold text-[#111827]">
                    Clases de hoy
                  </h2>
                  <span className="text-[11px] font-medium text-[#9CA3AF]">
                    {clasesHoy.length} sesiones
                  </span>
                </div>
                <Link
                  href="/calendario"
                  className="flex items-center gap-1 text-[11px] font-medium text-[#6B7280] hover:text-[#111827] transition-colors"
                >
                  <CalendarPlus size={12} /> Ver calendario
                </Link>
              </div>
              {clasesHoy.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2">
                  <Calendar size={28} className="text-[#E5E7EB]" />
                  <p className="text-[13px] text-[#9CA3AF]">Sin clases hoy</p>
                  <Link
                    href="/calendario"
                    className="text-[12px] font-medium text-[#2563EB] hover:underline"
                  >
                    + Programar clase
                  </Link>
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {clasesHoy.map(s => (
                    <ClaseHoyCard key={s.id} sesion={s} isNow={isNowFn(s)} />
                  ))}
                </div>
              )}
            </div>

            {/* Pagos pendientes */}
            {pendientes.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E8EAED]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
                  <div className="flex items-center gap-2">
                    <CreditCard size={14} className="text-[#6B7280]" />
                    <h2 className="text-[13px] font-semibold text-[#111827]">
                      Pagos pendientes
                    </h2>
                    <span className="text-[10px] font-bold text-[#DC2626] bg-[#FEF2F2] px-1.5 py-0.5 rounded-full">
                      {recibos.filter(r => r.estado === 'PENDIENTE').length}
                    </span>
                  </div>
                  {pendientes.length > 1 && (
                    <button
                      onClick={cobrarTodosPendientes}
                      className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5] transition-colors"
                    >
                      <Zap size={11} /> Cobrar todos
                    </button>
                  )}
                </div>
                <div className="divide-y divide-[#F9FAFB]">
                  {pendientes.map(r => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <Link
                        href={`/socios/${r.socioId}`}
                        className="w-8 h-8 rounded-full bg-[#DBEAFE] text-[#2563EB] font-bold text-[10px] flex items-center justify-center shrink-0 hover:opacity-75 transition-opacity"
                      >
                        {r.socio!.nombre[0]}
                        {r.socio!.apellidos[0]}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#111827] truncate">
                          {r.socio!.nombre} {r.socio!.apellidos}
                        </p>
                        <p className="text-[11px] text-[#9CA3AF] truncate">{r.concepto}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[13px] font-bold text-[#111827]">
                          {r.importe} €
                        </span>
                        <button
                          onClick={() => marcarCobrado(r.id)}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#111827] text-white hover:bg-[#1f2937] transition-colors"
                        >
                          Cobrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {recibos.filter(r => r.estado === 'PENDIENTE').length > 5 && (
                  <div className="px-5 py-3 border-t border-[#F9FAFB]">
                    <Link
                      href="/pagos"
                      className="text-[11px] font-medium text-[#2563EB] hover:underline"
                    >
                      Ver todos los pagos pendientes →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Quick actions + Renovaciones + Actividad */}
          <div className="space-y-5">

            {/* Quick actions */}
            <div className="bg-white rounded-xl border border-[#E8EAED] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] mb-3">
                Acciones rápidas
              </p>
              <div className="space-y-2">
                <Link
                  href="/socios?nuevo=1"
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#111827] hover:bg-[#1F2937] transition-colors"
                >
                  <UserPlus size={14} /> Nuevo miembro
                </Link>
                <Link
                  href="/calendario"
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-[#374151] bg-[#F4F5F7] hover:bg-[#E9EAEC] transition-colors"
                >
                  <CalendarPlus size={14} /> Nueva reserva
                </Link>
                <Link
                  href="/pagos"
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-[#374151] bg-[#F4F5F7] hover:bg-[#E9EAEC] transition-colors"
                >
                  <CreditCard size={14} /> Cobrar
                </Link>
                <Link
                  href="/pos"
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-[#374151] bg-[#F4F5F7] hover:bg-[#E9EAEC] transition-colors"
                >
                  <ShoppingCart size={14} /> Punto de venta
                </Link>
              </div>
            </div>

            {/* Renovaciones próximas */}
            {renovacionesProximas.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E8EAED]">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#F3F4F6]">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={13} className="text-[#059669]" />
                    <h2 className="text-[13px] font-semibold text-[#111827]">
                      Renovaciones
                    </h2>
                  </div>
                  <span className="text-[10px] font-bold text-[#6B7280]">30 días</span>
                </div>
                <div className="divide-y divide-[#F9FAFB]">
                  {renovacionesProximas.map(r => {
                    const diasRestantes = Math.round(
                      (new Date(r.fechaFin!).getTime() - now.getTime()) / 86400000
                    );
                    const isUrgent = diasRestantes <= 5;
                    return (
                      <Link
                        key={r.id}
                        href={`/socios/${r.socioId}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F9FAFB] transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#DBEAFE] text-[#2563EB] text-[10px] font-bold flex items-center justify-center shrink-0">
                          {r.socio!.nombre[0]}
                          {r.socio!.apellidos[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[#111827] truncate">
                            {r.socio!.nombre} {r.socio!.apellidos}
                          </p>
                          <p className="text-[11px] text-[#9CA3AF] truncate">
                            {r.plan!.nombre}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] font-bold text-[#111827]">
                            {r.plan!.precio} €
                          </p>
                          <p
                            className="text-[10px] font-semibold"
                            style={{ color: isUrgent ? '#DC2626' : '#9CA3AF' }}
                          >
                            {diasRestantes}d
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Activity feed */}
            <div className="bg-white rounded-xl border border-[#E8EAED]">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#F3F4F6]">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-[#111827]">Actividad</h2>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
                </div>
                <Link
                  href="/notificaciones"
                  className="flex items-center gap-1 text-[11px] font-medium text-[#6B7280] hover:text-[#111827] transition-colors"
                >
                  <Bell size={11} /> Ver todo
                </Link>
              </div>
              <div className="divide-y divide-[#F9FAFB]">
                {actividadReciente.length === 0 ? (
                  <p className="text-[12px] text-[#9CA3AF] px-4 py-6 text-center">
                    Sin actividad reciente
                  </p>
                ) : (
                  actividadReciente.slice(0, 10).map(act => {
                    const cfg = actividadConfig[act.tipo];
                    const inner = (
                      <>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{ backgroundColor: cfg.bg, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <p className="flex-1 text-[12px] text-[#374151] min-w-0 truncate">
                          {act.texto}
                        </p>
                        <span className="text-[10px] text-[#9CA3AF] shrink-0">
                          {timeAgo(act.creadoEn, now)}
                        </span>
                      </>
                    );
                    return act.enlace ? (
                      <Link
                        key={act.id}
                        href={act.enlace}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F9FAFB] transition-colors"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div
                        key={act.id}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        {inner}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
