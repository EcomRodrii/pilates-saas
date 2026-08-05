'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import {
  TrendingUp, TrendingDown, Minus,
  UserPlus, CreditCard, Bell,
  CheckCircle2, ChevronDown, ChevronUp,
  CalendarPlus, Zap, ArrowUpRight, RefreshCw,
  Users, BarChart3, Calendar, AlertTriangle,
  Clock, Activity, Bot, MessageSquare, Mail, CalendarX,
} from 'lucide-react';
import type { TipoActividad } from '@/lib/types';
import { cn, inicioDeSemana, finDeSemana } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { CustomChartsSection } from '@/components/dashboard/custom-charts';
import { fetchLayout, authHeader } from '@/lib/api-client';
import { dbStatsClientas } from '@/lib/supabase-data';
import { aplicarLayout, DEFAULT_LAYOUT } from '@/lib/layout-runtime';
import type { LayoutConfig } from '@/lib/layout-schema';
import { HOME_SECCIONES, ordenarSeccionesHome } from '@/lib/home-sections';
import { PageHeader } from '@/components/ui/page-header';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { useRol, puedeVerFinanzas, puedeVer, puedeGestionarClientas, puedeMoverDinero } from '@/lib/permisos';
import { Toast, useToast } from '@/components/ui/toast';
import { clasesConHuecoProximas, candidatasParaHueco } from '@/lib/booking-logic';
import { useAuth } from '@/lib/auth-context';
import { NoPuedoAsistirDialog } from '@/components/calendario/no-puedo-asistir-dialog';
import { PenalizacionesPendientes } from '@/components/dashboard/penalizaciones-pendientes';

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

// Abreviados: solo para los ejes de las gráficas, donde no cabe más.
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
// En prosa se escribe el mes entero: «a estas alturas de Jun» en mitad de una
// frase en español canta, y ahí sí hay sitio.
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// La etiqueta (Alta/Baja/…) ya se muestra aparte, así que en la actividad se
// quita el prefijo verboso "X dio de alta/baja a " y se deja solo el nombre.
function limpiarActividad(texto: string): string {
  return texto.replace(/^.*?\bdio de (?:alta|baja) a\s+/i, '').trim() || texto;
}

const actividadConfig: Record<TipoActividad, { color: string; bg: string; label: string }> = {
  NUEVA_SOCIA:        { color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', label: 'Alta' },
  NUEVA_RESERVA:      { color: 'var(--brand)', bg: 'color-mix(in srgb, var(--brand) 10%, var(--card))', label: 'Reserva' },
  CANCELACION:        { color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', label: 'Cancelación' },
  PAGO_COBRADO:       { color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', label: 'Cobro' },
  PAGO_PENDIENTE:     { color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', label: 'Pendiente' },
  NUEVA_SUSCRIPCION:  { color: 'var(--brand)', bg: 'var(--accent)', label: 'Plan' },
  SUSCRIPCION_PAUSADA:{ color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', label: 'Pausa' },
  CITA_CREADA:        { color: '#0891B2', bg: '#ECFEFF', label: 'Cita' },
  CITA_COMPLETADA:    { color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', label: 'Cita ✓' },
  VENTA_POS:          { color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', label: 'Venta' },
  MENSAJE_ENVIADO:    { color: 'var(--muted-foreground)', bg: 'var(--muted)', label: 'Email' },
  SOCIA_EDITADA:      { color: '#0891B2', bg: '#ECFEFF', label: 'Edición' },
  SOCIA_ELIMINADA:    { color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', label: 'Baja' },
  PLAN_CREADO:        { color: 'var(--brand)', bg: 'var(--accent)', label: 'Plan nuevo' },
  PLAN_EDITADO:       { color: 'var(--brand)', bg: 'var(--accent)', label: 'Plan editado' },
  PLAN_ELIMINADO:     { color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', label: 'Plan borrado' },
  PLAN_ASIGNADO:      { color: 'var(--brand)', bg: 'var(--accent)', label: 'Plan asignado' },
  COBRO_MANUAL:       { color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', label: 'Cobro manual' },
  EQUIPO_ALTA:        { color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', label: 'Alta equipo' },
  EQUIPO_EDITADO:     { color: '#0891B2', bg: '#ECFEFF', label: 'Equipo editado' },
  EQUIPO_BAJA:        { color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', label: 'Baja equipo' },
  AUTOMATIZACION_CAMBIO: { color: 'var(--muted-foreground)', bg: 'var(--muted)', label: 'Automatización' },
  DECISION_GESTIONADA: { color: 'var(--brand)', bg: 'var(--accent)', label: 'Centro de Control' },
  SESION_REASIGNADA:  { color: '#0891B2', bg: '#ECFEFF', label: 'Sustitución' },
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
          <stop offset="0%" stopColor="var(--brand-medio)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand-medio)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaD} fill="url(#spark-grad)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="var(--brand-medio)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r={i === currentIdx ? 5 : 3}
            fill={i === currentIdx ? "var(--brand-medio)" : "var(--card)"} stroke="var(--brand-medio)"
            strokeWidth="2"
          />
          <text
            x={p.x}
            y={H - 6}
            textAnchor="middle"
            fontSize="11"
            fill={i === currentIdx ? 'var(--foreground)' : 'var(--muted-foreground)'}
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
              fill={i === currentIdx ? 'var(--foreground)' : 'var(--muted-foreground)'}
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
  const color = pct >= 85 ? 'var(--destructive)' : pct >= 60 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
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
  esPropia,
}: {
  sesion: ReturnType<typeof useStudio>['sesiones'][0] & {
    tipoNombre: string;
    tipoColor: string;
    salaNombre: string;
    instructorNombre: string;
  };
  isNow: boolean;
  // Punto de entrada mobile-first al motor de sustituciones: "no puedo
  // asistir" solo tiene sentido sobre la PROPIA clase de la instructora — es
  // lo mismo que ya hace app/(dashboard)/calendario, aquí desde la tarjeta que
  // ve nada más entrar, sin tener que navegar al calendario.
  esPropia: boolean;
}) {
  const { reservas, socios, checkin, cancelarReserva } = useStudio();
  const [expanded, setExpanded] = useState(isNow);
  const [showNoPuedoAsistir, setShowNoPuedoAsistir] = useState(false);

  // P0-27: Map por id en vez de socios.find() por cada reserva de la sesión.
  const socioById = useMemo(() => new Map(socios.map(s => [s.id, s])), [socios]);
  const reservasSesion = useMemo(
    () =>
      reservas
        .filter(r => r.sesionId === sesion.id && r.estado !== 'CANCELADA')
        .map(r => ({ ...r, socio: socioById.get(r.socioId) }))
        .filter(r => r.socio),
    [reservas, socioById, sesion.id]
  );

  const asistidas = reservasSesion.filter(r => r.estado === 'ASISTIDA').length;
  // A-16: % de ocupación sobre plazas realmente ocupadas (CONFIRMADA/ASISTIDA),
  // no toda reserva no cancelada (incluía espera/no-shows → superaba el 100%).
  const ocupadas = reservasSesion.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA').length;
  const pct =
    sesion.aforoMaximo > 0
      ? Math.round((ocupadas / sesion.aforoMaximo) * 100)
      : 0;
  const fillColor = pct >= 100 ? 'var(--destructive)' : pct >= 75 ? 'var(--warning)' : 'var(--success)';

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden bg-card',
        isNow ? 'border-foreground shadow-sm' : 'border-border'
      )}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted transition-colors"
      >
        {isNow && (
          <span className="shrink-0 w-2 h-2 rounded-full bg-success animate-pulse" />
        )}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: sesion.tipoColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground truncate">{sesion.tipoNombre}</p>
            {isNow && (
              <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full shrink-0">
                AHORA
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {formatHora(sesion.inicio)}–{formatHora(sesion.fin)} · {sesion.salaNombre} ·{' '}
            {sesion.instructorNombre}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {asistidas > 0 && (
            <span className="text-[11px] font-bold text-success">{asistidas}✓</span>
          )}
          <span className="text-[12px] font-semibold text-foreground">
            {reservasSesion.length}/{sesion.aforoMaximo}
          </span>
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: fillColor }}
            />
          </div>
          {expanded ? (
            <ChevronUp size={14} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-muted">
          {reservasSesion.length === 0 ? (
            <p className="text-[12px] text-muted-foreground px-4 py-3">Sin reservas aún</p>
          ) : (
            <div className="divide-y divide-muted">
              {reservasSesion.map(r => {
                const asistida = r.estado === 'ASISTIDA';
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                        asistida
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-foreground'
                      )}
                    >
                      {r.socio!.nombre[0]}
                      {r.socio!.apellidos[0]}
                    </div>
                    <Link
                      href={`/clientas/${r.socioId}`}
                      className="flex-1 min-w-0 hover:underline"
                    >
                      <p className="text-[12px] font-medium text-foreground truncate">
                        {r.socio!.nombre} {r.socio!.apellidos}
                      </p>
                    </Link>
                    {asistida ? (
                      <span className="text-[10px] font-bold text-success flex items-center gap-1 shrink-0">
                        <CheckCircle2 size={12} /> Asistió
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => checkin(r.id)}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-brand text-brand-foreground hover:brightness-95 transition-colors"
                        >
                          Check-in
                        </button>
                        <button
                          onClick={() => { void cancelarReserva(r.id); }}
                          className="text-[10px] font-medium px-2 py-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
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
          <div className="px-4 py-2.5 border-t border-muted flex items-center justify-between gap-2">
            <Link
              href="/calendario"
              className="text-[11px] font-medium text-brand-medio hover:underline"
            >
              Gestionar clase →
            </Link>
            {esPropia && (
              <button
                onClick={() => setShowNoPuedoAsistir(true)}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                <CalendarX size={11} />No puedo asistir
              </button>
            )}
          </div>
        </div>
      )}

      <NoPuedoAsistirDialog
        open={showNoPuedoAsistir}
        onOpenChange={setShowNoPuedoAsistir}
        sesion={{ id: sesion.id, inicio: sesion.inicio, tipoClase: { nombre: sesion.tipoNombre } }}
      />
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

  // Personalización de la home por estudio (reordenar/ocultar secciones). Se
  // reordena por CSS `order` sin mover el DOM. Recarga al vuelo al guardar.
  const [layout, setLayout] = useState<LayoutConfig>(DEFAULT_LAYOUT);
  useEffect(() => {
    let vivo = true;
    const cargar = () => fetchLayout().then((l) => { if (vivo) setLayout(l); }).catch(() => {});
    cargar();
    const onCambio = () => cargar();
    window.addEventListener('tentare-layout-changed', onCambio);
    return () => { vivo = false; window.removeEventListener('tentare-layout-changed', onCambio); };
  }, []);
  const homeVisibles = ordenarSeccionesHome(aplicarLayout(HOME_SECCIONES.map((s) => s.id), layout.home));
  const ordenSeccion = (id: string) => {
    const i = homeVisibles.indexOf(id);
    return i === -1 ? undefined : i; // undefined → oculta
  };
  // Props para el contenedor de cada sección: orden CSS + hidden si está oculta.
  const wrap = (id: string) => ({ style: { order: ordenSeccion(id) ?? 0 }, hidden: ordenSeccion(id) === undefined });

  // Hydration fix — avoids server/client mismatch with Date
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: el SSR pinta una fecha fija y el cliente pasa a la real tras montar. El segundo render es el OBJETIVO, no un efecto colateral; quitar el efecto reintroduce el mismatch de hidratación.
  useEffect(() => setMounted(true), []);
  // Auditoría 2026-07-29, I-4 + M-4: `new Date()` sin memoizar creaba un
  // objeto NUEVO en cada render, y `now` está en las dependencias de varios
  // useMemo pesados de abajo (sparkData, ocupación, MRR, huecos próximos,
  // candidatas) — recalculaban en CADA render, incluido uno tan ajeno como
  // abrir un toast. Pero congelarlo en un useMemo([mounted]) (la primera
  // versión de este fix) se pasaba de frenada: `now` quedaba fijo PARA
  // SIEMPRE tras montar, así que una pestaña abierta hasta medianoche seguía
  // viendo "hoy" como el día de ayer, y el saludo nunca pasaba de "Buenos
  // días". El estado + intervalo de abajo actualiza `now` cada minuto (nunca
  // en cada render) — arregla las dos cosas a la vez.
  const [now, setNow] = useState(() => new Date('2026-06-29'));
  useEffect(() => {
    if (!mounted) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [mounted]);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const hoyStr = localDate(now);
  const saludo = now.getHours() < 13 ? 'Buenos días' : now.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches';

  // P0-27: índices compartidos por sesión y del conjunto de sesiones de hoy, para
  // no hacer sesiones.find() dentro de bucles sobre reservas/socios (cuadrático).
  const sesionById = useMemo(() => new Map(sesiones.map(s => [s.id, s])), [sesiones]);
  const socioById = useMemo(() => new Map(socios.map(s => [s.id, s])), [socios]);
  const tipoClaseById = useMemo(() => new Map(tiposClase.map(t => [t.id, t])), [tiposClase]);
  // Auditoría 2026-07-29, I-5: plazas ocupadas (CONFIRMADA/ASISTIDA) por
  // sesión, contadas en una sola pasada. ocupacionMedia hacía un
  // reservas.filter() POR CADA sesión de la semana — cuadrático con estudios
  // grandes (muchas sesiones × muchas reservas).
  const ocupadasPorSesion = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reservas) {
      if (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA') {
        m.set(r.sesionId, (m.get(r.sesionId) ?? 0) + 1);
      }
    }
    return m;
  }, [reservas]);
  const sesionesHoyIds = useMemo(
    () => new Set(sesiones.filter(s => localDate(s.inicio) === hoyStr).map(s => s.id)),
    [sesiones, hoyStr],
  );
  const mesFecha = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // ── Revenue 6-month data (for sparkline) ────────────────────────────────────
  const { sparkData, sparkLabels, sparkCurrentIdx, ingresosMes, ingresosMTD, ingresosMTDPrev } =
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
      // MTD (Month-To-Date): compara el mismo tramo del mes (día 1 → hoy) contra
      // el mes anterior hasta el MISMO día. Sin esto, a mitad de mes se compara un
      // mes incompleto contra el mes anterior entero y salen caídas ficticias.
      const diaHoy = now.getDate();
      const claveMesActual = monthKey(now);
      const claveMesPrev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      let ingresosMTD = 0;
      let ingresosMTDPrev = 0;
      recibos
        .filter(r => r.estado === 'COBRADO' && r.fechaCobro)
        .forEach(r => {
          const f = new Date(r.fechaCobro!);
          const m = months.find(x => x.key === monthKey(f));
          if (m) m.total += r.importe;
          const clave = monthKey(f);
          if (clave === claveMesActual && f.getDate() <= diaHoy) ingresosMTD += r.importe;
          else if (clave === claveMesPrev && f.getDate() <= diaHoy) ingresosMTDPrev += r.importe;
        });
      return {
        sparkData: months.map(m => m.total),
        sparkLabels: months.map(m => m.label),
        sparkCurrentIdx: 5,
        ingresosMes: months[5].total,
        ingresosMesAnterior: months[4].total,
        ingresosMTD,
        ingresosMTDPrev,
      };
    }, [recibos, now]);

  // Comparativa MTD (mismo día del mes pasado), no mes-entero vs mes-parcial.
  const pctChange =
    ingresosMTDPrev > 0
      ? Math.round(((ingresosMTD - ingresosMTDPrev) / ingresosMTDPrev) * 100)
      : 0;

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const sociasActivas = useMemo(() => socios.filter(s => s.activo).length, [socios]);
  const reservasHoy = useMemo(() => reservas.filter(
    r => r.estado !== 'CANCELADA' && sesionesHoyIds.has(r.sesionId)
  ).length, [reservas, sesionesHoyIds]);

  // Ocupación media de la semana
  const ocupacionMedia = useMemo(() => {
    // El cálculo del lunes estaba a mano y fallaba justo el DOMINGO:
    // `getDate() - getDay() + 1` con `getDay() === 0` suma un día, así que la
    // ventana pasaba a ser la semana SIGUIENTE y hoy quedaba fuera. Sin clases
    // creadas para esa semana, `sessSemana` salía vacío y la ocupación se
    // mostraba como 0% con la clase de hoy llena.
    const weekStartStr = localDate(inicioDeSemana(now));
    const weekEndStr = localDate(finDeSemana(now));
    const sessSemana = sesiones.filter(
      s =>
        !s.cancelada &&
        localDate(s.inicio) >= weekStartStr &&
        localDate(s.inicio) <= weekEndStr &&
        s.aforoMaximo > 0
    );
    if (sessSemana.length === 0) return 0;
    const total = sessSemana.reduce((sum, s) => {
      // A-16: plazas ocupadas = CONFIRMADA/ASISTIDA. Antes contaba toda reserva
      // no cancelada (incluía LISTA_ESPERA y NO_ASISTIO), inflando la ocupación
      // por encima del 100% y discrepando de Informes.
      const ocupadas = ocupadasPorSesion.get(s.id) ?? 0;
      return sum + ocupadas / s.aforoMaximo;
    }, 0);
    return Math.round((total / sessSemana.length) * 100);
  }, [sesiones, ocupadasPorSesion, now]);

  // Auditoría 2026-07-29, M-3: `.find` lineal dentro de un `.map`/`.filter`
  // pese a que ya existen índices por Map — aquí se repetía 3 veces solo en
  // este bloque (planesTarifa.find) más socios.find, cuando socioById ya
  // existía y planById es trivial de construir.
  const planById = useMemo(() => new Map(planesTarifa.map(p => [p.id, p])), [planesTarifa]);

  // ── MRR ─────────────────────────────────────────────────────────────────────
  const { renovacionesProximas } = useMemo(() => {
    const activas = suscripciones.filter(s => s.estado === 'ACTIVA');
    // A-16: el MRR (ingreso recurrente) solo cuenta planes MENSUAL. Antes sumaba
    // BONO/PUNTUAL (pago único) prorrateado por sesiones → MRR y ARR (mrr*12)
    // sobrestimados en cualquier estudio que venda bonos o clases sueltas.
    const mensualMrr = activas.reduce((sum, s) => {
      const plan = planById.get(s.planId);
      return plan?.tipo === 'MENSUAL' ? sum + plan.precio : sum;
    }, 0);

    const en30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30)
      .toISOString()
      .slice(0, 10);
    const renovs = activas
      .filter(s => {
        const plan = planById.get(s.planId);
        return plan?.tipo === 'MENSUAL' && s.fechaFin && s.fechaFin >= hoyStr && s.fechaFin <= en30;
      })
      .map(s => ({
        ...s,
        socio: socioById.get(s.socioId),
        plan: planById.get(s.planId),
      }))
      .filter(r => r.socio && r.plan)
      .slice(0, 6);

    return { mrr: mensualMrr, renovacionesProximas: renovs };
  }, [suscripciones, planById, socioById, hoyStr, now]);

  // ── Clases de hoy ───────────────────────────────────────────────────────────
  const clasesHoy = useMemo(
    () =>
      sesiones
        .filter(s => !s.cancelada && localDate(s.inicio) === hoyStr)
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
        .map(s => {
          // M-3: un solo lookup en tipoClaseById en vez de dos .find() lineales
          // (nombre y color pedían cada uno el suyo sobre el mismo tipoClaseId).
          const tipo = tipoClaseById.get(s.tipoClaseId);
          return {
            ...s,
            tipoNombre: tipo?.nombre ?? 'Clase',
            tipoColor: tipo?.color ?? 'var(--muted-foreground)',
            salaNombre: salas.find(x => x.id === s.salaId)?.nombre ?? '',
            instructorNombre: instructores.find(i => i.id === s.instructorId)?.nombre ?? '',
          };
        }),
    [sesiones, hoyStr, tipoClaseById, salas, instructores]
  );

  const isNowFn = (s: { inicio: string; fin: string }) => {
    const start = new Date(s.inicio).getTime();
    const end = new Date(s.fin).getTime();
    const t = now.getTime();
    return t >= start && t <= end;
  };

  // Una instructora veía los ingresos del mes del estudio en su pantalla de
  // inicio. En una cadena con 18 instructoras eso es la cuenta de resultados del
  // negocio repartida a 18 personas, sin que nadie lo decidiera. `CifraPrivada`
  // no vale para esto: es un difuminado contra miradas de reojo, se quita con un
  // clic y no es un permiso.
  const rolActual = useRol();
  const { user } = useAuth();
  // Ficha de instructora del usuario logueado — para saber si una clase de
  // "Clases de hoy" es SUYA y ofrecerle ahí mismo "No puedo asistir", el mismo
  // criterio que ya usa app/(dashboard)/calendario.
  const yo = rolActual === 'INSTRUCTOR' ? (instructores.find(i => i.authUserId === user?.id) ?? null) : null;
  const verFinanzas = puedeVerFinanzas(rolActual);
  // Los atajos del inicio llevaban a sitios donde el rol no entra: "Nueva
  // clienta" a un alta que la RLS rechaza, "Cobrar" y "Sistema autónomo" a
  // pantallas que el guardia de ruta ya vacía. Un atajo a una puerta cerrada es
  // peor que no tener atajo.
  const gestionaClientas = puedeGestionarClientas(rolActual);
  const mueveDinero = puedeMoverDinero(rolActual);

  // ── Pagos pendientes ─────────────────────────────────────────────────────────
  const pendientes = useMemo(
    () =>
      recibos
        .filter(r => r.estado === 'PENDIENTE')
        .map(r => ({ ...r, socio: socioById.get(r.socioId ?? '') }))
        .filter(r => r.socio)
        .slice(0, 5),
    [recibos, socioById]
  );

  const pendientesTotal = useMemo(() => recibos.filter(r => r.estado === 'PENDIENTE').length, [recibos]);

  // automationLogs es un log de auditoría acumulativo (motor de notificaciones);
  // estos filtros recorrían el array completo en cada render del Dashboard,
  // incluidos los disparados por estado no relacionado (toasts, confirms).
  //
  // M-4 (auditoría 2026-07-29): antes calculaba su propio `today` con
  // `new Date()` pero solo dependía de `automationLogs` -- si esa lista no
  // cambiaba, la pestaña seguía contando "hoy" como el día en que se montó,
  // incluso pasada la medianoche. `hoyStr` viene de `now`, que ahora se
  // actualiza cada minuto (ver arriba), así que este memo recalcula solo de
  // verdad cuando el día cambia.
  const automationBriefing = useMemo(() => {
    const todayLogs = automationLogs.filter(l => l.ejecutadoEn.startsWith(hoyStr));
    const pendingAdmin = automationLogs.filter(l => l.resultado === 'PENDIENTE_ADMIN');
    const ejecutadas = todayLogs.filter(l => l.resultado === 'EJECUTADO').length;
    // 'ESPERANDO' nunca lo escribe ningún camino de ejecución: aquí marcaba
    // siempre 0 (P2-4). 'FALLIDO' sí ocurre de verdad.
    const fallidas = todayLogs.filter(l => l.resultado === 'FALLIDO').length;
    return { pendingAdmin, ejecutadas, fallidas };
  }, [automationLogs, hoyStr]);

  // ── Radar de ocupación: clases con hueco en las próximas 48h ────────────────
  const huecosProximos = useMemo(
    () => clasesConHuecoProximas({ sesiones, reservas, ahora: now }).slice(0, 5),
    [sesiones, reservas, now]
  );
  const candidatasPorSesion = useMemo(() => {
    const hoyISO = localDate(now);
    const map = new Map<string, number>();
    for (const h of huecosProximos) {
      map.set(h.sesion.id, candidatasParaHueco({ sesion: h.sesion, sesiones, socios, reservas, suscripciones, planesTarifa, hoyISO }).length);
    }
    return map;
  }, [huecosProximos, sesiones, socios, reservas, suscripciones, planesTarifa, now]);
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const [avisandoSesion, setAvisandoSesion] = useState<string | null>(null);
  async function avisarCandidatas(sesionId: string, nCandidatas: number, nombreClase: string) {
    if (nCandidatas === 0 || avisandoSesion) return;
    if (!window.confirm(`Se avisará a ${nCandidatas} socia${nCandidatas === 1 ? '' : 's'} por WhatsApp de que hay hueco en ${nombreClase}. ¿Continuar?`)) return;
    setAvisandoSesion(sesionId);
    try {
      const res = await fetch('/api/marketing/hueco/avisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ sesionId }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Error: ${data.error ?? 'no se pudo avisar'}`); return; }
      showToast(`Aviso enviado a ${data.enviados} socia${data.enviados === 1 ? '' : 's'}${data.sinTelefono ? ` (${data.sinTelefono} sin teléfono)` : ''}`);
    } catch {
      showToast('No se pudo conectar con el servidor. El aviso no se ha enviado.');
    } finally {
      setAvisandoSesion(null);
    }
  }

  // ── "10 segundos": lo que el negocio necesita ver hoy sin navegar ───────────
  const resumenHoy = useMemo(() => {
    const alumnosHoyIds = new Set(
      reservas
        .filter(r => r.estado !== 'CANCELADA' && sesionesHoyIds.has(r.sesionId))
        .map(r => r.socioId)
    );
    const bonosCaducanHoy = suscripciones.filter(s => s.estado === 'ACTIVA' && s.fechaFin === hoyStr).length;

    return { alumnosHoy: alumnosHoyIds.size, bonosCaducanHoy };
  }, [reservas, sesionesHoyIds, hoyStr, suscripciones]);

  // "Sin venir 30d" sale de la MISMA fuente que /clientas, que es a donde lleva
  // la tarjeta. Antes se recalculaba aquí con OTRA definición —exigía `activo` y
  // descartaba a quien no ha venido NUNCA, dos criterios que la RPC no aplica—,
  // así que el número de la tarjeta y el de la página a la que te manda no
  // coincidían. Compartir la fuente hace imposible que vuelvan a divergir.
  const [statsClientas, setStatsClientas] = useState({ total: 0, activas: 0, conBono: 0, inactivas30d: 0 });
  useEffect(() => {
    let vivo = true;
    void dbStatsClientas().then(r => { if (vivo) setStatsClientas(r); });
    return () => { vivo = false; };
  }, []);

  // ── Trend direction ──────────────────────────────────────────────────────────
  const TrendIcon =
    pctChange > 0 ? TrendingUp : pctChange < 0 ? TrendingDown : Minus;
  const trendColor =
    pctChange > 0 ? 'var(--success)' : pctChange < 0 ? 'var(--destructive)' : 'var(--muted-foreground)';
  const trendBg =
    pctChange > 0 ? 'color-mix(in srgb, var(--success) 12%, var(--card))' : pctChange < 0 ? 'color-mix(in srgb, var(--destructive) 12%, var(--card))' : 'var(--muted)';

  if (!mounted) return null;

  return (

    <div>
      <div className="flex flex-col gap-5">

        {/* ── Header (fijo arriba, no reordenable) ───────────────────────────── */}
        {/* El mes pasa de antetítulo a descripción: es el mismo dato, pero en
            la ranura que ocupa en todas las demás pantallas. */}
        <PageHeader
          style={{ order: -1 }}
          title={`${saludo} 👋`}
          description={<span className="capitalize">{mesFecha}</span>}
          actions={
            gestionaClientas ? (
            <>
              <Link href="/clientas?nuevo=1" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
                <UserPlus /> Nueva clienta
              </Link>
              {/* CONGELADO (feature-freeze PMF): se quitó el botón "Abrir caja" → /pos. */}
            </>
            ) : null
          }
        />

        {/* ── Hoy de un vistazo (10 segundos) ─────────────────────────────────── */}
        <div {...wrap('resumen')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { href: '/calendario', Icon: Users, value: resumenHoy.alumnosHoy, label: 'Clientas hoy', alert: false, privada: false },
            ...(verFinanzas ? [{ href: '/cobros', Icon: CreditCard, value: pendientesTotal as number | string, label: 'Pagos pendientes', alert: pendientesTotal > 0, privada: false }] : []),
            { href: '/clientas', Icon: AlertTriangle, value: resumenHoy.bonosCaducanHoy, label: 'Bonos caducan hoy', alert: resumenHoy.bonosCaducanHoy > 0, privada: false },
            { href: '/clientas', Icon: Clock, value: statsClientas.inactivas30d, label: 'Sin venir 30d', alert: statsClientas.inactivas30d > 0, privada: false },
            // Ocupación semana e Ingresos del mes ya NO van aquí: se repetían
            // tal cual (mismo número, mismo enlace a /informes) en la tarjeta
            // de Ingresos y en la fila de KPIs de más abajo, sin aportar nada
            // que esas dos no mostraran ya con más detalle (sparkline, barra,
            // comparación con el mes anterior). Carmen: "2ª fila del dashboard
            // duplica ocupación e ingresos".
          ].map(({ href, Icon, value, label, alert, privada }) => {
            // Enlazaba a /informes también para una instructora, que no puede
            // verlo: el guardia del layout la rebotaba al dashboard. Un enlace
            // que te devuelve donde estabas no es un enlace. Si no puede ir,
            // se pinta la cifra sin enlace.
            const puedeIr = puedeVer(rolActual, href);
            const estilo = {
              backgroundColor: alert ? 'color-mix(in srgb, var(--destructive) 12%, var(--card))' : 'var(--card)',
              borderColor: alert ? 'color-mix(in srgb, var(--destructive) 40%, var(--card))' : 'var(--border)',
            };
            const clase = puedeIr
              ? 'rounded-xl border p-3.5 transition-colors hover:bg-muted'
              : 'rounded-xl border p-3.5';
            const cuerpo = (
              <>
              <Icon size={15} style={{ color: alert ? 'var(--destructive)' : 'var(--muted-foreground)' }} />
              {privada ? (
                <CifraPrivada className="text-[22px] font-bold leading-none mt-2" style={{ color: alert ? 'var(--destructive)' : 'var(--foreground)' }}>{value}</CifraPrivada>
              ) : (
                <p className="text-[22px] font-bold leading-none mt-2" style={{ color: alert ? 'var(--destructive)' : 'var(--foreground)' }}>{value}</p>
              )}
              <p className="text-[10.5px] font-medium text-muted-foreground mt-1 leading-tight">{label}</p>
              </>
            );
            return puedeIr
              ? <Link key={label} href={href} className={clase} style={estilo}>{cuerpo}</Link>
              : <div key={label} className={clase} style={estilo}>{cuerpo}</div>;
          })}
        </div>
        </div>

        {/* La tarjeta enlaza a /primeros-pasos, que es configuración del
            negocio (marca, Stripe, planes, equipo) — fuera de la lista blanca
            de INSTRUCTOR. Sin este guardia, su botón "Ver todos los pasos"
            la devolvía al propio dashboard, mismo enlace-que-no-lleva-a-
            ningún-sitio que ya se evita en el resto de esta pantalla. */}
        {puedeVer(rolActual, '/primeros-pasos') && (
        <div {...wrap('onboarding')}><OnboardingChecklist /></div>
        )}

        {/* ── Automation briefing ────────────────────────────────────────────── */}
        {/* /automatizaciones solo lo ve la propietaria (BLOQUEADO_RECEPCION y
            BLOQUEADO_MANAGER lo incluyen), y ejecutar una regla exige
            `puedeMoverDinero`. Sin esta comprobación, la tarjeta llevaba a los
            otros tres roles a una pantalla que el guardia de ruta vacía. */}
        {puedeVer(rolActual, '/automatizaciones') && (
        <div {...wrap('automatizaciones')}>
        {(() => {
          const { pendingAdmin, ejecutadas, fallidas } = automationBriefing;
          return (
            <Link
              href="/automatizaciones"
              className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card/10">
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
                  {ejecutadas} acciones ejecutadas hoy{fallidas > 0 ? ` · ${fallidas} fallida${fallidas > 1 ? 's' : ''}` : ''}
                </p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-primary-foreground/40" />
            </Link>
          );
        })()}
        </div>
        )}

        {/* ── Penalizaciones pendientes de aprobar (Fase 3) ──────────────────── */}
        {/* Sin `wrap()`: no es una sección del layout personalizable (HOME_SECCIONES),
            solo se pinta si hay algo pendiente — se oculta sola (ver el componente). */}
        {mueveDinero && <PenalizacionesPendientes onToast={showToast} />}

        {/* ── Revenue card (full width) ──────────────────────────────────────── */}
        {verFinanzas && (
        <div {...wrap('ingresos')}>
        <Card>
          <CardContent className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Ingresos cobrados este mes</p>
              <div className="mt-1.5 flex items-end gap-2.5">
                <CifraPrivada className="text-4xl font-semibold leading-none tracking-tight text-foreground">
                  {ingresosMes.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
                </CifraPrivada>
                <Badge
                  variant="secondary"
                  className="mb-1"
                  style={{ backgroundColor: trendBg, color: trendColor }}
                >
                  <TrendIcon /> {pctChange > 0 ? '+' : ''}{pctChange}%
                </Badge>
              </div>
              {/* Con 0 € este mes y 0 € el pasado, esto decía «Vas por delante
                  del mismo día del mes pasado · 0 € a estas alturas de Jun»:
                  0 no va por delante de 0, y a un estudio recién creado se le
                  estaba comparando con un pasado que no existe. Cuando no hay
                  nada con qué comparar, se dice eso y ya. */}
              <p className="mt-2 text-xs text-muted-foreground">
                {ingresosMes === 0 && ingresosMTDPrev === 0 ? (
                  'Aún no has cobrado nada este mes.'
                ) : ingresosMTDPrev === 0 ? (
                  <>Es tu primer mes con cobros — todavía no hay mes anterior con el que compararlo.</>
                ) : (
                  <>
                    {pctChange > 0 ? 'Vas por delante' : pctChange < 0 ? 'Vas por detrás' : 'Vas igual'} del mismo día del mes pasado
                    {' · '}<CifraPrivada inline className="font-semibold text-foreground">{ingresosMTDPrev.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €</CifraPrivada> a estas alturas de {MESES_LARGOS[new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth()]}
                  </>
                )}
              </p>
            </div>
            <Link href="/informes" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              <BarChart3 /> Ver informe
            </Link>
          </CardContent>
          <CardContent className="h-[120px]">
            <CifraPrivada className="h-full">
              <RevenueSparkline data={sparkData} labels={sparkLabels} currentIdx={sparkCurrentIdx} />
            </CifraPrivada>
          </CardContent>
        </Card>
        </div>
        )}

        {/* ── KPI row ────────────────────────────────────────────────────────── */}
        <div {...wrap('kpis')}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* El subtítulo era siempre "N pagos pendientes". Para quien no lleva
              la caja eso es un dato de caja —y encima, con la 0109, un "0 pagos
              pendientes" falso, porque la RLS ya no le sirve los recibos. */}
          <KpiCard
            label="Clientas activas"
            value={sociasActivas}
            sub={verFinanzas
              ? `${pendientes.length} pago${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`
              : `${statsClientas.inactivas30d} sin venir en 30 días`}
            Icon={Users} tint="text-brand-secondary" tintBg="bg-brand/10" />
          {/* Único KPI de esta fila con click-through a /informes: era la única
              función que perdía la fila "Hoy de un vistazo" al quitar de ahí
              el pill duplicado de Ocupación semana. Igual que aquel pill, sin
              enlace para quien no puede ver /informes (instructora). */}
          {puedeVer(rolActual, '/informes') ? (
            <Link href="/informes" className="block rounded-2xl transition-colors hover:bg-muted">
              <Card size="sm" className="gap-2.5 pointer-events-none">
                <CardContent className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Ocupación semana</span>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-brand/10"><Activity className="size-3.5 text-brand-secondary" /></span>
                </CardContent>
                <CardContent>
                  <p className="text-3xl font-semibold leading-none tracking-tight" style={{ color: ocupacionMedia >= 85 ? 'var(--destructive)' : ocupacionMedia >= 60 ? 'var(--warning)' : 'var(--success)' }}>{ocupacionMedia}%</p>
                  <div className="mt-2"><OcupacionBar pct={ocupacionMedia} /></div>
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Card size="sm" className="gap-2.5">
              <CardContent className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">Ocupación semana</span>
                <span className="flex size-7 items-center justify-center rounded-lg bg-brand/10"><Activity className="size-3.5 text-brand-secondary" /></span>
              </CardContent>
              <CardContent>
                <p className="text-3xl font-semibold leading-none tracking-tight" style={{ color: ocupacionMedia >= 85 ? 'var(--destructive)' : ocupacionMedia >= 60 ? 'var(--warning)' : 'var(--success)' }}>{ocupacionMedia}%</p>
                <div className="mt-2"><OcupacionBar pct={ocupacionMedia} /></div>
              </CardContent>
            </Card>
          )}
          <KpiCard label="Reservas hoy" value={reservasHoy} sub={`${clasesHoy.length} clase${clasesHoy.length !== 1 ? 's' : ''} programada${clasesHoy.length !== 1 ? 's' : ''}`} Icon={Calendar} tint="text-brand-secondary" tintBg="bg-brand/10" />
          {verFinanzas && (
          <KpiCard
            label="Renovaciones 30d"
            value={renovacionesProximas.length}
            sub={renovacionesProximas.length > 0 ? `Próxima ${new Date(renovacionesProximas[0].fechaFin!).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : 'Sin vencimientos'}
            Icon={RefreshCw}
            tint="text-success"
            tintBg="bg-success/10"
          />
          )}
        </div>
        </div>

        <div {...wrap('graficos')}><CustomChartsSection /></div>

        {/* ── Main content grid ──────────────────────────────────────────────── */}
        <div {...wrap('principal')}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT: Clases hoy + Pagos pendientes */}
          <div className="lg:col-span-2 space-y-5">

            {/* Clases de hoy */}
            <div className="bg-card rounded-xl border border-border">
              <div className="flex items-center justify-between px-5 py-4 border-b border-muted">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-muted-foreground" />
                  <h2 className="text-[13px] font-semibold text-foreground">
                    Clases de hoy
                  </h2>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {clasesHoy.length} sesiones
                  </span>
                </div>
                <Link
                  href="/calendario"
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CalendarPlus size={12} /> Ver calendario
                </Link>
              </div>
              {clasesHoy.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2">
                  <Calendar size={28} className="text-border" />
                  <p className="text-[13px] text-muted-foreground">Sin clases hoy</p>
                  <Link
                    href="/calendario"
                    className="text-[12px] font-medium text-brand-medio hover:underline"
                  >
                    + Programar clase
                  </Link>
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {clasesHoy.map(s => (
                    <ClaseHoyCard key={s.id} sesion={s} isNow={isNowFn(s)} esPropia={!!yo && s.instructorId === yo.id} />
                  ))}
                </div>
              )}
            </div>

            {/* Pagos pendientes */}
            {verFinanzas && pendientes.length > 0 && (
              <div className="bg-card rounded-xl border border-border">
                <div className="flex items-center justify-between px-5 py-4 border-b border-muted">
                  <div className="flex items-center gap-2">
                    <CreditCard size={14} className="text-muted-foreground" />
                    <h2 className="text-[13px] font-semibold text-foreground">
                      Pagos pendientes
                    </h2>
                    <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
                      {pendientesTotal}
                    </span>
                  </div>
                  {pendientes.length > 1 && (
                    <button
                      onClick={() => {
                        const n = pendientes.length;
                        void cobrarTodosPendientes().then(res => {
                          showToast(res.ok ? `${n} recibo(s) cobrados` : res.error);
                        });
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/10 transition-colors"
                    >
                      <Zap size={11} /> Cobrar todos
                    </button>
                  )}
                </div>
                <div className="divide-y divide-muted">
                  {pendientes.map(r => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <Link
                        href={`/clientas/${r.socioId}`}
                        className="w-8 h-8 rounded-full bg-info/10 text-brand-medio font-bold text-[10px] flex items-center justify-center shrink-0 hover:opacity-75 transition-opacity"
                      >
                        {r.socio!.nombre[0]}
                        {r.socio!.apellidos[0]}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">
                          {r.socio!.nombre} {r.socio!.apellidos}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{r.concepto}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <CifraPrivada inline className="text-[13px] font-bold text-foreground">
                          {r.importe} €
                        </CifraPrivada>
                        <button
                          onClick={() => marcarCobrado(r.id)}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-brand text-brand-foreground hover:brightness-95 transition-colors"
                        >
                          Cobrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {pendientesTotal > 5 && (
                  <div className="px-5 py-3 border-t border-muted">
                    <Link
                      href="/cobros?tab=pendientes"
                      className="text-[11px] font-medium text-brand-medio hover:underline"
                    >
                      Ver todos los pagos pendientes →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Clases con hueco (radar de ocupación) */}
            {huecosProximos.length > 0 && (
              <div className="bg-card rounded-xl border border-border">
                <div className="flex items-center justify-between px-5 py-4 border-b border-muted">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={14} className="text-muted-foreground" />
                    <h2 className="text-[13px] font-semibold text-foreground">
                      Clases con hueco
                    </h2>
                    <span className="text-[10px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
                      {huecosProximos.length}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Próximas 48h</span>
                </div>
                <div className="divide-y divide-muted">
                  {huecosProximos.map(h => {
                    const tipo = tipoClaseById.get(h.sesion.tipoClaseId);
                    const nCandidatas = candidatasPorSesion.get(h.sesion.id) ?? 0;
                    return (
                      <div key={h.sesion.id} className="flex items-center gap-3 px-5 py-3">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: tipo?.color ?? '#999' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-foreground truncate">
                            {tipo?.nombre ?? 'Clase'} · {formatHora(h.sesion.inicio)}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {h.huecos} hueco{h.huecos === 1 ? '' : 's'} libre{h.huecos === 1 ? '' : 's'} · {nCandidatas} candidata{nCandidatas === 1 ? '' : 's'} disponible{nCandidatas === 1 ? '' : 's'}
                          </p>
                        </div>
                        <button
                          onClick={() => avisarCandidatas(h.sesion.id, nCandidatas, tipo?.nombre ?? 'la clase')}
                          disabled={nCandidatas === 0 || avisandoSesion !== null}
                          className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-40 shrink-0"
                        >
                          <MessageSquare size={11} />
                          {avisandoSesion === h.sesion.id ? 'Avisando…' : 'Avisar a candidatas'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Quick actions + Renovaciones + Actividad */}
          <div className="space-y-5">

            {/* Quick actions */}
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Acciones rápidas
              </p>
              <div className="space-y-2">
                {gestionaClientas && (
                <Link
                  href="/clientas?nuevo=1"
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-primary-foreground bg-primary hover:brightness-95 transition-colors"
                >
                  <UserPlus size={14} /> Nueva clienta
                </Link>
                )}
                <Link
                  href="/calendario"
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-foreground bg-background hover:bg-[#E9EAEC] transition-colors"
                >
                  <CalendarPlus size={14} /> Nueva reserva
                </Link>
                {mueveDinero && (
                <Link
                  href="/cobros?tab=pendientes"
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-foreground bg-background hover:bg-[#E9EAEC] transition-colors"
                >
                  <CreditCard size={14} /> Cobrar
                </Link>
                )}
                {/* CONGELADO (feature-freeze PMF): se quitó el acceso "Punto de venta" → /pos. */}
              </div>
            </div>

            {/* Renovaciones próximas — lleva el precio de cada clienta, así que es
                finanzas, no agenda. */}
            {verFinanzas && renovacionesProximas.length > 0 && (
              <div className="bg-card rounded-xl border border-border">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-muted">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={13} className="text-success" />
                    <h2 className="text-[13px] font-semibold text-foreground">
                      Renovaciones
                    </h2>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">30 días</span>
                </div>
                <div className="divide-y divide-muted">
                  {renovacionesProximas.map(r => {
                    const diasRestantes = Math.round(
                      (new Date(r.fechaFin!).getTime() - now.getTime()) / 86400000
                    );
                    const isUrgent = diasRestantes <= 5;
                    return (
                      <Link
                        key={r.id}
                        href={`/clientas/${r.socioId}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-info/10 text-brand-medio text-[10px] font-bold flex items-center justify-center shrink-0">
                          {r.socio!.nombre[0]}
                          {r.socio!.apellidos[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-foreground truncate">
                            {r.socio!.nombre} {r.socio!.apellidos}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {r.plan!.nombre}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <CifraPrivada className="text-[11px] font-bold text-foreground">
                            {r.plan!.precio} €
                          </CifraPrivada>
                          <p
                            className="text-[10px] font-semibold"
                            style={{ color: isUrgent ? 'var(--destructive)' : 'var(--muted-foreground)' }}
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
            <div className="bg-card rounded-xl border border-border">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-muted">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-foreground">Actividad</h2>
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                </div>
                <Link
                  href="/notificaciones"
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Bell size={11} /> Ver todo
                </Link>
              </div>
              <div className="divide-y divide-muted">
                {actividadReciente.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground px-4 py-6 text-center">
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
                        <p className="flex-1 text-[12px] text-foreground min-w-0 truncate">
                          {limpiarActividad(act.texto)}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {timeAgo(act.creadoEn, now)}
                        </span>
                      </>
                    );
                    return act.enlace ? (
                      <Link
                        key={act.id}
                        href={act.enlace}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors"
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
      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
