'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import type { EstadoRecibo } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { crearCheckoutStripe, enviarEmailRecibo } from '@/lib/api-client';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronUp,
  Search,
  CreditCard,
  Loader2,
  TrendingUp,
  Clock,
  Users,
  BarChart3,
  Zap,
  FileText,
  Calendar,
  ArrowRight,
  CheckCheck,
  X,
} from 'lucide-react';

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-xl border border-[#E7E7E0] bg-white px-3.5 py-2.5 text-sm font-medium text-[#1A1A1A] focus:outline-none focus:border-[#7AA80E] transition-colors';
const selectCls = inputCls + ' appearance-none cursor-pointer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isoToYearMonth(iso: string) {
  return iso.slice(0, 7);
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const BADGE: Record<string, { bg: string; text: string; label: string }> = {
  COBRADO:   { bg: '#D1FAE5', text: '#059669', label: 'Cobrado' },
  PENDIENTE: { bg: '#FEF3C7', text: '#D97706', label: 'Pendiente' },
  DEVUELTO:  { bg: '#FEE2E2', text: '#DC2626', label: 'Devuelto' },
  EN_CURSO:  { bg: '#DBEAFE', text: '#7AA80E', label: 'En curso' },
};

type SortKey = 'reciente' | 'antiguo' | 'mayor' | 'menor';
const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Más reciente', value: 'reciente' },
  { label: 'Más antiguo',  value: 'antiguo' },
  { label: 'Mayor importe', value: 'mayor' },
  { label: 'Menor importe', value: 'menor' },
];

type MainTab = 'cobros' | 'suscripciones' | 'historial';

// ─── Component ────────────────────────────────────────────────────────────────

export default function Pagos() {
  // ── Context ─────────────────────────────────────────────────────────────────
  const {
    recibos,
    socios,
    suscripciones,
    planesTarifa,
    facturas,
    marcarCobrado,
    marcarDevuelto,
    reintentar,
    deleteRecibo,
    cobrarTodosPendientes,
    addRecibo,
  } = useStudio();

  // ── Hydration guard ─────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const now = mounted ? new Date() : new Date('2026-06-29');

  // ── Stripe state ────────────────────────────────────────────────────────────
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);
  const [stripeToast, setStripeToast] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);

  // Handle Stripe redirect — use window.location to avoid useSearchParams suspension
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const success = params.get('stripe_success');
    const reciboId = params.get('recibo');
    const cancel = params.get('stripe_cancel');
    if (success && reciboId) {
      marcarCobrado(reciboId);
      setStripeToast({ tipo: 'ok', msg: 'Pago completado correctamente.' });
      window.history.replaceState({}, '', '/pagos');
    } else if (cancel) {
      setStripeToast({ tipo: 'error', msg: 'Pago cancelado.' });
      window.history.replaceState({}, '', '/pagos');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stripeToast) {
      const t = setTimeout(() => setStripeToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [stripeToast]);

  // ── Main tab ────────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('cobros');

  // ── Cobros tab state ────────────────────────────────────────────────────────
  const [statusTab, setStatusTab]   = useState<EstadoRecibo | 'TODOS'>('TODOS');
  const [search, setSearch]         = useState('');
  const [desde, setDesde]           = useState('');
  const [hasta, setHasta]           = useState('');
  const [sort, setSort]             = useState<SortKey>('reciente');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null);

  // ── Cobro masivo modal ──────────────────────────────────────────────────────
  const [showMasivo, setShowMasivo]               = useState(false);
  const [masivoSelected, setMasivoSelected]       = useState<Set<string>>(new Set());
  const [masivoProgress, setMasivoProgress]       = useState<'idle' | 'running' | 'done'>('idle');
  const [masivoCobrando, setMasivoCobrando]       = useState(0);
  const [masivoTotal, setMasivoTotal]             = useState(0);

  // ── Nueva factura modal ─────────────────────────────────────────────────────
  const [showFactura, setShowFactura] = useState(false);
  const [facturaForm, setFacturaForm] = useState({
    socioId: '',
    concepto: '',
    importe: '',
  });

  // ── Historial state ─────────────────────────────────────────────────────────
  const [histSearch, setHistSearch]   = useState('');
  const [histMes, setHistMes]         = useState('');
  const [histEstado, setHistEstado]   = useState<EstadoRecibo | 'TODOS'>('TODOS');
  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done'>('idle');

  // ── Nuevo recibo modal ──────────────────────────────────────────────────────
  const [showNuevoCobro, setShowNuevoCobro] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({
    socioId: socios[0]?.id ?? '',
    concepto: '',
    importe: '',
    fechaVencimiento: now.toISOString().split('T')[0],
  });

  // ── Lookups ──────────────────────────────────────────────────────────────────

  const socioName = useCallback((socioId: string) => {
    const s = socios.find(s => s.id === socioId);
    return s ? `${s.nombre} ${s.apellidos}` : 'Socia eliminada';
  }, [socios]);

  const socioInitials = useCallback((socioId: string) => {
    const s = socios.find(s => s.id === socioId);
    if (!s) return '?';
    return `${s.nombre[0] ?? ''}${s.apellidos[0] ?? ''}`.toUpperCase();
  }, [socios]);

  const planName = useCallback((planId: string) => {
    return planesTarifa.find(p => p.id === planId)?.nombre ?? 'Plan desconocido';
  }, [planesTarifa]);

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const kpis = useMemo(() => {
    const cobradoMes = recibos
      .filter(r => r.estado === 'COBRADO' && r.fechaCobro && isoToYearMonth(r.fechaCobro) === thisMonth)
      .reduce((s, r) => s + r.importe, 0);

    const pendienteTotal = recibos
      .filter(r => r.estado === 'PENDIENTE')
      .reduce((s, r) => s + r.importe, 0);

    const sociosConDeuda = new Set(
      recibos.filter(r => r.estado === 'PENDIENTE').map(r => r.socioId)
    ).size;

    const activasCount = socios.filter(s => s.activo).length;
    const mediaXSocia = activasCount > 0 ? cobradoMes / activasCount : 0;

    return { cobradoMes, pendienteTotal, sociosConDeuda, mediaXSocia };
  }, [recibos, socios, thisMonth]);

  // ── Cobros tab filtered list ──────────────────────────────────────────────────

  const filtradosCobros = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = recibos.filter(r => {
      if (statusTab !== 'TODOS' && r.estado !== statusTab) return false;
      if (q) {
        const name = socioName(r.socioId).toLowerCase();
        if (!r.concepto.toLowerCase().includes(q) && !name.includes(q)) return false;
      }
      const ym = isoToYearMonth(r.fechaVencimiento);
      if (desde && ym < desde) return false;
      if (hasta && ym > hasta) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      // Pending first within same sort
      if (sort === 'reciente') {
        if (a.estado === 'PENDIENTE' && b.estado !== 'PENDIENTE') return -1;
        if (b.estado === 'PENDIENTE' && a.estado !== 'PENDIENTE') return 1;
        return b.fechaVencimiento.localeCompare(a.fechaVencimiento);
      }
      if (sort === 'antiguo')  return a.fechaVencimiento.localeCompare(b.fechaVencimiento);
      if (sort === 'mayor')    return b.importe - a.importe;
      if (sort === 'menor')    return a.importe - b.importe;
      return 0;
    });

    return list;
  }, [recibos, statusTab, search, desde, hasta, sort, socioName]);

  // ── Historial grouped ──────────────────────────────────────────────────────

  const historialAgrupado = useMemo(() => {
    const q = histSearch.trim().toLowerCase();
    const filtered = recibos.filter(r => {
      if (histEstado !== 'TODOS' && r.estado !== histEstado) return false;
      const ym = isoToYearMonth(r.fechaVencimiento);
      if (histMes && ym !== histMes) return false;
      if (q) {
        const name = socioName(r.socioId).toLowerCase();
        if (!r.concepto.toLowerCase().includes(q) && !name.includes(q)) return false;
      }
      return true;
    });

    // Group by month of fechaVencimiento descending
    const map = new Map<string, typeof recibos>();
    for (const r of filtered) {
      const ym = isoToYearMonth(r.fechaVencimiento);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(r);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ym, items]) => ({
        ym,
        label: monthLabel(ym),
        items: items.sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento)),
        total: items.filter(i => i.estado === 'COBRADO').reduce((s, i) => s + i.importe, 0),
      }));
  }, [recibos, histSearch, histMes, histEstado, socioName]);

  // ── Cobro masivo data ──────────────────────────────────────────────────────

  const masivoData = useMemo(() => {
    // All socias with active subscriptions
    const activeSubs = suscripciones.filter(s => s.estado === 'ACTIVA');
    return activeSubs.map(sus => {
      const socio = socios.find(s => s.id === sus.socioId);
      const plan = planesTarifa.find(p => p.id === sus.planId);
      const pendientesRecibos = recibos.filter(
        r => r.socioId === sus.socioId && r.estado === 'PENDIENTE'
      );
      return { sus, socio, plan, pendientesRecibos };
    }).filter(d => d.socio != null);
  }, [suscripciones, socios, planesTarifa, recibos]);

  function openMasivo() {
    // Auto-select socias with pending recibos
    const autoSelected = new Set<string>(
      masivoData
        .filter(d => d.pendientesRecibos.length > 0)
        .flatMap(d => d.pendientesRecibos.map(r => r.id))
    );
    setMasivoSelected(autoSelected);
    setMasivoProgress('idle');
    setMasivoCobrando(0);
    setMasivoTotal(0);
    setShowMasivo(true);
  }

  async function ejecutarMasivo() {
    const ids = Array.from(masivoSelected);
    setMasivoTotal(ids.length);
    setMasivoCobrando(0);
    setMasivoProgress('running');
    for (let i = 0; i < ids.length; i++) {
      marcarCobrado(ids[i]);
      setMasivoCobrando(i + 1);
      await new Promise(r => setTimeout(r, 120));
    }
    setMasivoProgress('done');
  }

  const masivoImporteTotal = useMemo(() => {
    return recibos
      .filter(r => masivoSelected.has(r.id))
      .reduce((s, r) => s + r.importe, 0);
  }, [recibos, masivoSelected]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  async function cobrarOnline(reciboId: string) {
    const r = recibos.find(x => x.id === reciboId);
    if (!r) return;
    const socio = socios.find(s => s.id === r.socioId);
    setStripeLoading(reciboId);
    const result = await crearCheckoutStripe({
      reciboId,
      concepto: r.concepto,
      importe: r.importe,
      socioEmail: socio?.email ?? null,
      socioNombre: socio ? `${socio.nombre} ${socio.apellidos}` : 'Clienta',
    });
    setStripeLoading(null);
    if ('url' in result && result.url) {
      window.location.href = result.url;
    } else {
      const err = 'error' in result ? result.error : 'Error desconocido';
      setStripeToast({ tipo: 'error', msg: err });
    }
  }

  async function cobrarYEmail(reciboId: string) {
    marcarCobrado(reciboId);
    const r = recibos.find(x => x.id === reciboId);
    const socio = r ? socios.find(s => s.id === r.socioId) : null;
    const factura = facturas.find(f => f.reciboId === reciboId);
    if (socio?.email && r) {
      enviarEmailRecibo({
        to: socio.email,
        toName: `${socio.nombre} ${socio.apellidos}`,
        concepto: r.concepto,
        importe: r.importe,
        fechaCobro: new Date().toISOString(),
        numeroFactura: factura?.numeroCompleto,
      });
    }
  }

  function crearNuevoCobro() {
    const sus = suscripciones.find(s => s.socioId === nuevoForm.socioId && s.estado === 'ACTIVA');
    addRecibo({
      socioId: nuevoForm.socioId,
      suscripcionId: sus?.id ?? null,
      concepto: nuevoForm.concepto.trim(),
      importe: parseFloat(nuevoForm.importe),
      fechaVencimiento: nuevoForm.fechaVencimiento,
    });
    setShowNuevoCobro(false);
    setNuevoForm({
      socioId: socios[0]?.id ?? '',
      concepto: '',
      importe: '',
      fechaVencimiento: now.toISOString().split('T')[0],
    });
  }

  function exportCSV() {
    setExportState('loading');
    const header = ['Concepto', 'Socia', 'Importe', 'Estado', 'Vencimiento', 'Cobrado el'];
    const rows = filtradosCobros.map(r => [
      `"${r.concepto.replace(/"/g, '""')}"`,
      `"${socioName(r.socioId).replace(/"/g, '""')}"`,
      r.importe.toFixed(2),
      BADGE[r.estado]?.label ?? r.estado,
      r.fechaVencimiento,
      r.fechaCobro ?? '',
    ]);
    const csv = [header, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagos-${now.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setExportState('done'), 800);
    setTimeout(() => setExportState('idle'), 3000);
  }

  // ── Tab counts ────────────────────────────────────────────────────────────

  function tabCount(value: EstadoRecibo | 'TODOS') {
    if (value === 'TODOS') return recibos.length;
    return recibos.filter(r => r.estado === value).length;
  }

  const pendientesCount = recibos.filter(r => r.estado === 'PENDIENTE').length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#EEEEE8] space-y-6 pb-10">

      {/* ── Stripe toast ─────────────────────────────────────────────────────── */}
      {stripeToast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold transition-all',
          stripeToast.tipo === 'ok'
            ? 'bg-[#F0FDF4] border-[#A7F3D0] text-[#059669]'
            : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
        )}>
          {stripeToast.tipo === 'ok' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {stripeToast.msg}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A] tracking-tight">Pagos</h1>
          <p className="text-sm text-[#8E8E86] mt-0.5">
            Gestiona cobros, suscripciones y facturación
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setFacturaForm({ socioId: socios[0]?.id ?? '', concepto: '', importe: '' });
              setShowFactura(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-[#E7E7E0] bg-white text-[#1A1A1A] hover:bg-[#EEEEE8] transition-colors"
          >
            <FileText size={15} />
            Nueva factura
          </button>
          <button
            onClick={() => {
              setNuevoForm({
                socioId: socios[0]?.id ?? '',
                concepto: '',
                importe: '',
                fechaVencimiento: now.toISOString().split('T')[0],
              });
              setShowNuevoCobro(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A] hover:bg-[#F7B3D2] transition-colors"
          >
            <Plus size={15} />
            Nuevo cobro
          </button>
        </div>
      </div>

      {/* ── KPI bar ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cobrado este mes */}
        <div className="bg-white border border-[#E7E7E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#8E8E86] uppercase tracking-wider">
              Cobrado este mes
            </p>
            <div className="w-8 h-8 rounded-lg bg-[#D1FAE5] flex items-center justify-center">
              <TrendingUp size={15} className="text-[#059669]" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#059669]">
            {kpis.cobradoMes.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </p>
          <p className="text-xs text-[#A8A89F] mt-1">{monthLabel(thisMonth)}</p>
        </div>

        {/* Pendiente de cobro */}
        <div className="bg-white border border-[#E7E7E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#8E8E86] uppercase tracking-wider">
              Pendiente cobro
            </p>
            <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] flex items-center justify-center">
              <Clock size={15} className="text-[#D97706]" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#D97706]">
            {kpis.pendienteTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </p>
          <p className="text-xs text-[#A8A89F] mt-1">{pendientesCount} recibo{pendientesCount !== 1 ? 's' : ''} pendiente{pendientesCount !== 1 ? 's' : ''}</p>
        </div>

        {/* Socias con deuda */}
        <div className="bg-white border border-[#E7E7E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#8E8E86] uppercase tracking-wider">
              Miembros con deuda
            </p>
            <div className="w-8 h-8 rounded-lg bg-[#FEE2E2] flex items-center justify-center">
              <Users size={15} className="text-[#DC2626]" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#DC2626]">
            {kpis.sociosConDeuda}
          </p>
          <p className="text-xs text-[#A8A89F] mt-1">miembro{kpis.sociosConDeuda !== 1 ? 's' : ''} con recibos pendientes</p>
        </div>

        {/* Media por socia */}
        <div className="bg-white border border-[#E7E7E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#8E8E86] uppercase tracking-wider">
              Media por miembro
            </p>
            <div className="w-8 h-8 rounded-lg bg-[#FFF2F7] flex items-center justify-center">
              <BarChart3 size={15} className="text-[#7AA80E]" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1A1A]">
            {kpis.mediaXSocia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </p>
          <p className="text-xs text-[#A8A89F] mt-1">sobre miembros activos este mes</p>
        </div>
      </div>

      {/* ── Main tabs ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[#E7E7E0] overflow-x-auto">
        {([
          { value: 'cobros',        label: 'Cobros' },
          { value: 'suscripciones', label: 'Suscripciones activas' },
          { value: 'historial',     label: 'Historial' },
        ] as { value: MainTab; label: string }[]).map(t => (
          <button
            key={t.value}
            onClick={() => setMainTab(t.value)}
            className={cn(
              'px-5 py-3 text-sm font-semibold border-b-2 transition-all',
              mainTab === t.value
                ? 'border-[#1A1A1A] text-[#1A1A1A]'
                : 'border-transparent text-[#8E8E86] hover:text-[#1A1A1A] hover:border-[#E7E7E0]'
            )}
          >
            {t.label}
            {t.value === 'cobros' && pendientesCount > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#D97706] font-bold">
                {pendientesCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: COBROS                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {mainTab === 'cobros' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Status tabs */}
            <div className="flex items-center gap-1 flex-wrap">
              {([
                { label: 'Todos',      value: 'TODOS'     },
                { label: 'Pendientes', value: 'PENDIENTE' },
                { label: 'Cobrado',    value: 'COBRADO'   },
                { label: 'Devuelto',   value: 'DEVUELTO'  },
                { label: 'En curso',   value: 'EN_CURSO'  },
              ] as { label: string; value: EstadoRecibo | 'TODOS' }[]).map(({ label, value }) => {
                const count = tabCount(value);
                const active = statusTab === value;
                return (
                  <button
                    key={value}
                    onClick={() => setStatusTab(value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all',
                      active
                        ? 'bg-[#FFC8E2] text-[#171717]'
                        : 'text-[#8E8E86] hover:text-[#1A1A1A] hover:bg-white',
                    )}
                  >
                    {label}
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded-full font-bold',
                      active ? 'bg-white/20 text-white' : 'bg-[#EEEEE8] text-[#8E8E86]',
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Cobro masivo */}
            <button
              onClick={openMasivo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#059669] text-white hover:bg-[#047857] transition-colors shadow-sm"
            >
              <Zap size={14} />
              Cobro masivo
              {pendientesCount > 0 && (
                <span className="bg-white/25 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {pendientesCount}
                </span>
              )}
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white border border-[#E7E7E0] rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A89F]" />
                <input
                  type="text"
                  placeholder="Buscar por concepto o miembro…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-[#E7E7E0] bg-[#EEEEE8] pl-9 pr-3.5 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#7AA80E] transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[#8E8E86] whitespace-nowrap">Desde</label>
                <input type="month" value={desde} onChange={e => setDesde(e.target.value)}
                  className="rounded-xl border border-[#E7E7E0] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#7AA80E] transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[#8E8E86] whitespace-nowrap">Hasta</label>
                <input type="month" value={hasta} onChange={e => setHasta(e.target.value)}
                  className="rounded-xl border border-[#E7E7E0] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#7AA80E] transition-colors"
                />
              </div>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="rounded-xl border border-[#E7E7E0] bg-white px-3 py-2 text-sm font-medium text-[#1A1A1A] focus:outline-none focus:border-[#7AA80E] transition-colors appearance-none cursor-pointer"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E7E7E0] text-sm font-semibold text-[#8E8E86] hover:bg-[#EEEEE8] hover:text-[#1A1A1A] transition-colors"
              >
                <Download size={14} />
                CSV
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white border border-[#E7E7E0] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E7E7E0] flex items-center justify-between">
              <p className="text-xs font-semibold text-[#8E8E86]">
                {filtradosCobros.length} resultado{filtradosCobros.length !== 1 ? 's' : ''}
              </p>
            </div>

            {filtradosCobros.length === 0 ? (
              <div className="py-16 text-center">
                <CreditCard size={32} className="text-[#E7E7E0] mx-auto mb-3" />
                <p className="text-sm text-[#A8A89F]">Sin recibos en esta categoría</p>
              </div>
            ) : (
              <div className="divide-y divide-[#EEEEE8]">
                {filtradosCobros.map(r => {
                  const badge    = BADGE[r.estado] ?? BADGE.PENDIENTE;
                  const initials = socioInitials(r.socioId);
                  const name     = socioName(r.socioId);
                  const expanded = expandedId === r.id;
                  const sus      = suscripciones.find(s => s.id === r.suscripcionId);
                  const factura  = facturas.find(f => f.reciboId === r.id);

                  return (
                    <div key={r.id}>
                      <div
                        className="flex items-center gap-4 px-5 py-4 hover:bg-[#F5F5F1] transition-colors group cursor-pointer"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        {/* Avatar */}
                        <Link
                          href={`/socios/${r.socioId}`}
                          onClick={e => e.stopPropagation()}
                          className="shrink-0"
                        >
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-[#DBEAFE] text-[#7AA80E]">
                            {initials}
                          </div>
                        </Link>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1A1A1A] truncate">{r.concepto}</p>
                          <p className="text-xs mt-0.5 text-[#A8A89F] truncate">
                            <Link
                              href={`/socios/${r.socioId}`}
                              onClick={e => e.stopPropagation()}
                              className="hover:text-[#7AA80E] hover:underline transition-colors"
                            >
                              {name}
                            </Link>
                            {' · '}
                            <Calendar size={11} className="inline -mt-0.5" />
                            {' '}Vence {fecha(r.fechaVencimiento)}
                          </p>
                        </div>

                        {/* Amount + badge */}
                        <div className="text-right shrink-0 mr-2">
                          <p className="text-sm font-extrabold text-[#1A1A1A]">
                            {r.importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                          </p>
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: badge.bg, color: badge.text }}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div
                          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          {r.estado === 'PENDIENTE' && (
                            <>
                              <button
                                onClick={() => cobrarYEmail(r.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#D1FAE5] text-[#059669] hover:bg-[#A7F3D0] transition-colors"
                                title="Marcar cobrado y enviar email"
                              >
                                <CheckCircle size={12} />
                                Cobrar
                              </button>
                              <button
                                onClick={() => cobrarOnline(r.id)}
                                disabled={stripeLoading === r.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#FFF2F7] text-[#7AA80E] hover:bg-[#DBEAFE] transition-colors disabled:opacity-60"
                                title="Enviar enlace de pago Stripe"
                              >
                                {stripeLoading === r.id
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <CreditCard size={12} />}
                                Online
                              </button>
                              <button
                                onClick={() => marcarDevuelto(r.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 transition-colors"
                                title="Marcar devuelto"
                              >
                                <XCircle size={14} className="text-[#DC2626]" />
                              </button>
                            </>
                          )}
                          {r.estado === 'COBRADO' && (
                            <>
                              {factura && (
                                <button
                                  onClick={() => {/* TODO: abrir factura */}}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#EEEEE8] text-[#8E8E86] hover:bg-[#E7E7E0] transition-colors"
                                  title="Ver factura"
                                >
                                  <FileText size={12} />
                                  {factura.numeroCompleto}
                                </button>
                              )}
                              <button
                                onClick={() => marcarDevuelto(r.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 transition-colors"
                                title="Devolver"
                              >
                                <XCircle size={14} className="text-[#DC2626]" />
                              </button>
                            </>
                          )}
                          {r.estado === 'DEVUELTO' && (
                            <button
                              onClick={() => reintentar(r.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#DBEAFE] text-[#7AA80E] hover:bg-[#BFDBFE] transition-colors"
                            >
                              <RefreshCw size={12} />
                              Reintentar
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmEliminar(r.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={14} className="text-[#DC2626]" />
                          </button>
                        </div>

                        {/* Chevron */}
                        <div className="shrink-0 text-[#A8A89F]">
                          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {expanded && (
                        <div className="px-5 pb-5 bg-[#F5F5F1] border-t border-[#E7E7E0]">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                            <div>
                              <p className="text-xs font-semibold text-[#A8A89F] uppercase tracking-wider mb-1">Estado</p>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: badge.bg, color: badge.text }}>
                                {badge.label}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-[#A8A89F] uppercase tracking-wider mb-1">Vencimiento</p>
                              <p className="text-sm font-semibold text-[#1A1A1A]">{fecha(r.fechaVencimiento)}</p>
                            </div>
                            {r.fechaCobro && (
                              <div>
                                <p className="text-xs font-semibold text-[#A8A89F] uppercase tracking-wider mb-1">Fecha cobro</p>
                                <p className="text-sm font-semibold text-[#1A1A1A]">{fecha(r.fechaCobro)}</p>
                              </div>
                            )}
                            {r.fechaDevolucion && (
                              <div>
                                <p className="text-xs font-semibold text-[#A8A89F] uppercase tracking-wider mb-1">Devolución</p>
                                <p className="text-sm font-semibold text-[#1A1A1A]">{fecha(r.fechaDevolucion)}</p>
                              </div>
                            )}
                            {typeof r.intentosReintento === 'number' && r.intentosReintento > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-[#A8A89F] uppercase tracking-wider mb-1">Reintentos</p>
                                <p className="text-sm font-semibold text-[#1A1A1A]">{r.intentosReintento}</p>
                              </div>
                            )}
                            {sus && (
                              <div>
                                <p className="text-xs font-semibold text-[#A8A89F] uppercase tracking-wider mb-1">Plan</p>
                                <p className="text-sm font-semibold text-[#1A1A1A]">{planName(sus.planId)}</p>
                              </div>
                            )}
                            {factura && (
                              <div>
                                <p className="text-xs font-semibold text-[#A8A89F] uppercase tracking-wider mb-1">Factura</p>
                                <p className="text-sm font-semibold text-[#7AA80E]">{factura.numeroCompleto}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: SUSCRIPCIONES ACTIVAS                                             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {mainTab === 'suscripciones' && (
        <div className="bg-white border border-[#E7E7E0] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E7E7E0] flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1A1A1A]">
              {suscripciones.filter(s => s.estado === 'ACTIVA').length} suscripciones activas
            </p>
          </div>

          {suscripciones.filter(s => s.estado === 'ACTIVA').length === 0 ? (
            <div className="py-16 text-center">
              <Users size={32} className="text-[#E7E7E0] mx-auto mb-3" />
              <p className="text-sm text-[#A8A89F]">No hay suscripciones activas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Table header */}
              <div className="grid grid-cols-6 gap-4 px-5 py-2 bg-[#F5F5F1] border-b border-[#E7E7E0] min-w-[700px]">
                {['Miembro', 'Plan', 'Precio/mes', 'Próximo cobro', 'Sesiones rest.', 'Acciones'].map(h => (
                  <p key={h} className="text-xs font-bold text-[#8E8E86] uppercase tracking-wider">{h}</p>
                ))}
              </div>

              <div className="divide-y divide-[#EEEEE8]">
                {suscripciones
                  .filter(s => s.estado === 'ACTIVA')
                  .map(sus => {
                    const socio = socios.find(s => s.id === sus.socioId);
                    const plan  = planesTarifa.find(p => p.id === sus.planId);
                    const initials = socioInitials(sus.socioId);
                    // Next billing: use fechaFin if set, otherwise fechaInicio + 1 month
                    const nextCobro = sus.fechaFin
                      ? new Date(sus.fechaFin)
                      : (() => { const d = new Date(sus.fechaInicio); d.setMonth(d.getMonth() + 1); return d; })();

                    return (
                      <div key={sus.id} className="grid grid-cols-6 gap-4 px-5 py-4 items-center hover:bg-[#F5F5F1] transition-colors group min-w-[700px]">
                        {/* Miembro */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[#DBEAFE] text-[#7AA80E] shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/socios/${sus.socioId}`}
                              className="text-sm font-semibold text-[#1A1A1A] truncate hover:text-[#7AA80E] hover:underline block">
                              {socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia eliminada'}
                            </Link>
                          </div>
                        </div>

                        {/* Plan */}
                        <p className="text-sm text-[#1A1A1A] font-medium truncate">{plan?.nombre ?? '—'}</p>

                        {/* Precio */}
                        <p className="text-sm font-bold text-[#1A1A1A]">
                          {plan ? `${plan.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €` : '—'}
                        </p>

                        {/* Próximo cobro */}
                        <p className="text-sm text-[#8E8E86]">{fecha(nextCobro.toISOString())}</p>

                        {/* Sesiones restantes */}
                        <div>
                          {sus.sesionesRestantes != null ? (
                            <span className={cn(
                              'text-xs font-bold px-2 py-0.5 rounded-full',
                              sus.sesionesRestantes <= 2
                                ? 'bg-[#FEF3C7] text-[#D97706]'
                                : 'bg-[#D1FAE5] text-[#059669]'
                            )}>
                              {sus.sesionesRestantes} ses.
                            </span>
                          ) : (
                            <span className="text-xs text-[#A8A89F]">Ilimitadas</span>
                          )}
                        </div>

                        {/* Acciones */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="text-xs px-2.5 py-1.5 rounded-lg font-bold border border-[#E7E7E0] text-[#8E8E86] hover:bg-[#EEEEE8] transition-colors">
                            Cambiar plan
                          </button>
                          <button className="text-xs px-2.5 py-1.5 rounded-lg font-bold text-[#DC2626] hover:bg-red-50 transition-colors">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: HISTORIAL                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {mainTab === 'historial' && (
        <div className="space-y-4">
          {/* Historial filters */}
          <div className="bg-white border border-[#E7E7E0] rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A89F]" />
                <input
                  type="text"
                  placeholder="Buscar miembro o concepto…"
                  value={histSearch}
                  onChange={e => setHistSearch(e.target.value)}
                  className="w-full rounded-xl border border-[#E7E7E0] bg-[#EEEEE8] pl-9 pr-3.5 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#7AA80E] transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[#8E8E86] whitespace-nowrap">Mes</label>
                <input type="month" value={histMes} onChange={e => setHistMes(e.target.value)}
                  className="rounded-xl border border-[#E7E7E0] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#7AA80E] transition-colors"
                />
              </div>
              <select
                value={histEstado}
                onChange={e => setHistEstado(e.target.value as EstadoRecibo | 'TODOS')}
                className="rounded-xl border border-[#E7E7E0] bg-white px-3 py-2 text-sm font-medium text-[#1A1A1A] focus:outline-none focus:border-[#7AA80E] transition-colors appearance-none cursor-pointer"
              >
                <option value="TODOS">Todos los estados</option>
                <option value="COBRADO">Cobrado</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="DEVUELTO">Devuelto</option>
                <option value="EN_CURSO">En curso</option>
              </select>
              <button
                onClick={exportCSV}
                disabled={exportState === 'loading'}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors',
                  exportState === 'done'
                    ? 'bg-[#D1FAE5] text-[#059669]'
                    : 'border border-[#E7E7E0] bg-white text-[#8E8E86] hover:bg-[#EEEEE8] hover:text-[#1A1A1A]'
                )}
              >
                {exportState === 'loading' && <Loader2 size={14} className="animate-spin" />}
                {exportState === 'done' && <CheckCircle size={14} />}
                {exportState === 'idle' && <Download size={14} />}
                {exportState === 'idle' ? 'Exportar' : exportState === 'loading' ? 'Exportando…' : 'Exportado'}
              </button>
            </div>
          </div>

          {/* Grouped by month */}
          {historialAgrupado.length === 0 ? (
            <div className="bg-white border border-[#E7E7E0] rounded-xl py-16 text-center">
              <BarChart3 size={32} className="text-[#E7E7E0] mx-auto mb-3" />
              <p className="text-sm text-[#A8A89F]">Sin resultados para los filtros seleccionados</p>
            </div>
          ) : (
            historialAgrupado.map(group => (
              <div key={group.ym} className="bg-white border border-[#E7E7E0] rounded-xl overflow-hidden">
                {/* Month header */}
                <div className="flex items-center justify-between px-5 py-3 bg-[#F5F5F1] border-b border-[#E7E7E0]">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-[#8E8E86]" />
                    <p className="text-sm font-bold text-[#1A1A1A] capitalize">{group.label}</p>
                    <span className="text-xs text-[#A8A89F] font-medium">
                      {group.items.length} recibo{group.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-[#059669]">
                    {group.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € cobrado
                  </p>
                </div>

                {/* Items */}
                <div className="divide-y divide-[#EEEEE8]">
                  {group.items.map(r => {
                    const badge = BADGE[r.estado] ?? BADGE.PENDIENTE;
                    return (
                      <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[#DBEAFE] text-[#7AA80E] shrink-0">
                          {socioInitials(r.socioId)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1A1A1A] truncate">{r.concepto}</p>
                          <p className="text-xs text-[#A8A89F] truncate">{socioName(r.socioId)}</p>
                        </div>
                        <p className="text-sm font-bold text-[#1A1A1A] shrink-0">
                          {r.importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </p>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {badge.label}
                        </span>
                        <p className="text-xs text-[#A8A89F] shrink-0 hidden sm:block">
                          {r.fechaCobro ? fecha(r.fechaCobro) : fecha(r.fechaVencimiento)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Cobro masivo                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showMasivo} onOpenChange={open => { if (!open && masivoProgress !== 'running') setShowMasivo(false); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#1A1A1A] flex items-center gap-2">
              <Zap size={18} className="text-[#059669]" />
              Cobro masivo
            </DialogTitle>
          </DialogHeader>

          {masivoProgress === 'done' ? (
            /* Success state */
            <div className="flex flex-col items-center text-center gap-4 py-8">
              <div className="w-16 h-16 rounded-2xl bg-[#D1FAE5] flex items-center justify-center">
                <CheckCheck size={32} className="text-[#059669]" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1A1A1A]">
                  {masivoTotal} cobro{masivoTotal !== 1 ? 's' : ''} procesado{masivoTotal !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-[#8E8E86] mt-1">
                  {masivoImporteTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € marcados como cobrados
                </p>
              </div>
              <button
                onClick={() => setShowMasivo(false)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A] hover:bg-[#F7B3D2] transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : masivoProgress === 'running' ? (
            /* Progress state */
            <div className="flex flex-col items-center text-center gap-4 py-8">
              <div className="w-16 h-16 rounded-2xl bg-[#FEF3C7] flex items-center justify-center">
                <Loader2 size={32} className="text-[#D97706] animate-spin" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1A1A1A]">
                  Cobrando {masivoCobrando} / {masivoTotal}
                </p>
                <div className="w-48 h-2 bg-[#E7E7E0] rounded-full mt-3 mx-auto overflow-hidden">
                  <div
                    className="h-full bg-[#059669] rounded-full transition-all duration-200"
                    style={{ width: `${(masivoCobrando / masivoTotal) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Selection state */
            <>
              <div className="flex-1 overflow-y-auto space-y-2 my-2 pr-1">
                {masivoData.length === 0 ? (
                  <p className="text-sm text-[#A8A89F] text-center py-8">No hay suscripciones activas</p>
                ) : (
                  masivoData.map(({ sus, socio, plan, pendientesRecibos }) => {
                    if (!socio) return null;
                    const hasPending = pendientesRecibos.length > 0;
                    const isSelected = pendientesRecibos.some(r => masivoSelected.has(r.id));
                    const initials = `${socio.nombre[0] ?? ''}${socio.apellidos[0] ?? ''}`.toUpperCase();

                    return (
                      <div
                        key={sus.id}
                        className={cn(
                          'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all',
                          isSelected
                            ? 'border-[#059669] bg-[#F0FDF4]'
                            : hasPending
                              ? 'border-[#FEF3C7] bg-[#FFFBEB] hover:border-[#D97706]'
                              : 'border-[#E7E7E0] bg-white hover:bg-[#F5F5F1] opacity-60'
                        )}
                        onClick={() => {
                          if (!hasPending) return;
                          setMasivoSelected(prev => {
                            const next = new Set(prev);
                            for (const r of pendientesRecibos) {
                              if (isSelected) next.delete(r.id);
                              else next.add(r.id);
                            }
                            return next;
                          });
                        }}
                      >
                        {/* Checkbox */}
                        <div className={cn(
                          'w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-colors',
                          isSelected
                            ? 'bg-[#059669] border-[#059669]'
                            : 'border-[#D1D5DB] bg-white'
                        )}>
                          {isSelected && <CheckCircle size={12} className="text-white" />}
                        </div>

                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[#DBEAFE] text-[#7AA80E] shrink-0">
                          {initials}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1A1A1A] truncate">
                            {socio.nombre} {socio.apellidos}
                          </p>
                          <p className="text-xs text-[#A8A89F] truncate">{plan?.nombre ?? '—'}</p>
                        </div>

                        {/* Amount / status */}
                        <div className="text-right shrink-0">
                          {hasPending ? (
                            <>
                              <p className="text-sm font-extrabold text-[#D97706]">
                                {pendientesRecibos.reduce((s, r) => s + r.importe, 0)
                                  .toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                              </p>
                              <p className="text-xs text-[#D97706]">
                                {pendientesRecibos.length} pendiente{pendientesRecibos.length !== 1 ? 's' : ''}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#D1FAE5] text-[#059669] font-semibold">
                              Al dia
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-[#E7E7E0] pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <p className="text-[#8E8E86]">
                    {masivoSelected.size} recibo{masivoSelected.size !== 1 ? 's' : ''} seleccionado{masivoSelected.size !== 1 ? 's' : ''}
                  </p>
                  <p className="font-extrabold text-[#1A1A1A]">
                    Total: {masivoImporteTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowMasivo(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-[#E7E7E0] text-[#8E8E86] hover:bg-[#EEEEE8] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={ejecutarMasivo}
                    disabled={masivoSelected.size === 0}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#059669] hover:bg-[#047857] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    <Zap size={14} />
                    Cobrar seleccionadas ({masivoSelected.size}) · {masivoImporteTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Nueva factura                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showFactura} onOpenChange={open => { if (!open) setShowFactura(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1A1A1A] flex items-center gap-2">
              <FileText size={18} />
              Nueva factura
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FF label="Miembro">
              <select
                className={selectCls}
                value={facturaForm.socioId}
                onChange={e => setFacturaForm(f => ({ ...f, socioId: e.target.value }))}
              >
                <option value="">Seleccionar miembro…</option>
                {socios.filter(s => s.activo).map(s => (
                  <option key={s.id} value={s.id}>{s.nombre} {s.apellidos}</option>
                ))}
              </select>
            </FF>
            <FF label="Concepto">
              <input
                className={inputCls}
                placeholder="Cuota mensual Pilates — Jun 2026"
                value={facturaForm.concepto}
                onChange={e => setFacturaForm(f => ({ ...f, concepto: e.target.value }))}
              />
            </FF>
            <FF label="Importe (€ sin IVA)">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                placeholder="85.00"
                value={facturaForm.importe}
                onChange={e => setFacturaForm(f => ({ ...f, importe: e.target.value }))}
              />
            </FF>
            {facturaForm.importe && !isNaN(parseFloat(facturaForm.importe)) && (
              <div className="bg-[#F5F5F1] border border-[#E7E7E0] rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-[#8E8E86]">Base imponible</span>
                  <span className="font-semibold text-[#1A1A1A]">{parseFloat(facturaForm.importe).toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#8E8E86]">IVA 21%</span>
                  <span className="font-semibold text-[#1A1A1A]">{(parseFloat(facturaForm.importe) * 0.21).toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-[#E7E7E0] pt-1.5 mt-1.5">
                  <span className="text-[#1A1A1A]">Total</span>
                  <span className="text-[#1A1A1A]">{(parseFloat(facturaForm.importe) * 1.21).toFixed(2)} €</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowFactura(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-[#E7E7E0] text-[#8E8E86] hover:bg-[#EEEEE8] transition-colors"
            >
              Cancelar
            </button>
            <button
              disabled={!facturaForm.socioId || !facturaForm.concepto.trim() || !facturaForm.importe}
              onClick={() => {
                // generarFactura would be called here when available in context
                setShowFactura(false);
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A] hover:bg-[#F7B3D2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <FileText size={14} />
              Generar factura
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Nuevo cobro                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={showNuevoCobro} onOpenChange={open => { if (!open) setShowNuevoCobro(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1A1A1A]">Nuevo cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FF label="Miembro">
              <select
                className={selectCls}
                value={nuevoForm.socioId}
                onChange={e => setNuevoForm(f => ({ ...f, socioId: e.target.value }))}
              >
                {socios.filter(s => s.activo).map(s => (
                  <option key={s.id} value={s.id}>{s.nombre} {s.apellidos}</option>
                ))}
              </select>
            </FF>
            <FF label="Concepto">
              <input
                className={inputCls}
                placeholder="Mensual Ilimitado — Jul 2026"
                value={nuevoForm.concepto}
                onChange={e => setNuevoForm(f => ({ ...f, concepto: e.target.value }))}
              />
            </FF>
            <div className="grid grid-cols-2 gap-4">
              <FF label="Importe (€)">
                <input
                  type="number" min="0" step="0.01"
                  className={inputCls}
                  placeholder="85.00"
                  value={nuevoForm.importe}
                  onChange={e => setNuevoForm(f => ({ ...f, importe: e.target.value }))}
                />
              </FF>
              <FF label="Vencimiento">
                <input
                  type="date"
                  className={inputCls}
                  value={nuevoForm.fechaVencimiento}
                  onChange={e => setNuevoForm(f => ({ ...f, fechaVencimiento: e.target.value }))}
                />
              </FF>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowNuevoCobro(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-[#E7E7E0] text-[#8E8E86] hover:bg-[#EEEEE8] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={crearNuevoCobro}
              disabled={!nuevoForm.concepto.trim() || !nuevoForm.importe || !nuevoForm.socioId}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A] hover:bg-[#F7B3D2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Crear cobro
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Confirmar eliminar                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!confirmEliminar} onOpenChange={open => !open && setConfirmEliminar(null)}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-red-50">
              <AlertTriangle size={24} className="text-[#DC2626]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#1A1A1A] mb-1">Eliminar recibo</h3>
              <p className="text-sm text-[#8E8E86]">Esta accion no se puede deshacer.</p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setConfirmEliminar(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-[#E7E7E0] text-[#8E8E86] hover:bg-[#EEEEE8] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmEliminar) {
                    deleteRecibo(confirmEliminar);
                    setConfirmEliminar(null);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#DC2626] hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
