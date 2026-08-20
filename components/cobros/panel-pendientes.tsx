'use client';

import { useState, useMemo, useEffect, useCallback, useId, useRef } from 'react';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import type { EstadoRecibo, Socio, MetodoCobro } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, copiarAlPortapapeles, formatEuro } from '@/lib/utils';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { EmptyState } from '@/components/ui/empty-state';
import { cobrarOnlineDirecto, crearEnlaceTarjeta, enviarEmailRecibo } from '@/lib/api-client';
import {
  CheckCircle2,
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
  CheckCheck,
} from 'lucide-react';

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-brand transition-colors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  const { htmlFor, control } = useCampoAsociado(children);
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-foreground uppercase tracking-wider">{label}</label>
      {control}
    </div>
  );
}

// P0-23: selector de cliente BUSCABLE. Antes se renderizaban TODOS los socios
// activos como <option> (con 200.000, abrir el desplegable cuelga el navegador).
// Aquí se filtra por texto y se pinta como mucho un puñado de resultados.
function SocioPicker({ socios, value, onChange }: {
  socios: Socio[]; value: string; onChange: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const selected = socios.find(s => s.id === value);
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const activos = socios.filter(s => s.activo);
    const base = query
      ? activos.filter(s => `${s.nombre} ${s.apellidos} ${s.email ?? ''}`.toLowerCase().includes(query))
      : activos;
    return base.slice(0, 20);
  }, [socios, q]);
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
      <input
        className={cn(inputCls, 'relative z-50')}
        placeholder="Buscar cliente…"
        value={open ? q : (selected ? `${selected.nombre} ${selected.apellidos}` : '')}
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
          ) : results.map(s => (
            <button key={s.id} type="button"
              onClick={() => { onChange(s.id); setOpen(false); setQ(''); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
              {s.nombre} {s.apellidos}
              {s.email && <span className="text-muted-foreground text-xs ml-1.5">{s.email}</span>}
            </button>
          ))}
        </div>
      )}
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
  COBRADO:   { bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', text: 'var(--success)', label: 'Cobrado' },
  PENDIENTE: { bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', text: 'var(--warning)', label: 'Sin cobrar' },
  DEVUELTO:  { bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', text: 'var(--destructive)', label: 'Devuelto por el banco' },
  EN_CURSO:  { bg: 'color-mix(in srgb, var(--info) 12%, var(--card))', text: 'var(--brand)', label: 'Enviado al banco' },
  FALLIDO:   { bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', text: '#7A2F1D', label: 'No se pudo cobrar' },
};

type SortKey = 'reciente' | 'antiguo' | 'mayor' | 'menor';
const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Más reciente', value: 'reciente' },
  { label: 'Más antiguo',  value: 'antiguo' },
  { label: 'Mayor importe', value: 'mayor' },
  { label: 'Menor importe', value: 'menor' },
];

type MainTab = 'cobros' | 'suscripciones' | 'historial';

// Un recibo que no está cobrado sigue siendo dinero que le deben, esté donde
// esté del camino: sin enviar, en el banco, o rebotado.
const ESTADOS_SIN_COBRAR: EstadoRecibo[] = ['PENDIENTE', 'EN_CURSO', 'FALLIDO'];

// Las palabras de la máquina no son las suyas. "En curso" y "Pendientes" le
// sonaban igual; "Devuelto" y "Fallido" también. Cada estado se nombra por lo
// que significa para el negocio, no por cómo se llama el enum.
const ETIQUETA_ESTADO: Record<EstadoRecibo | 'TODOS' | 'SIN_COBRAR', string> = {
  SIN_COBRAR: 'Todo lo que me deben',
  TODOS:      'Todos los recibos',
  PENDIENTE:  'Sin cobrar todavía',
  EN_CURSO:   'Enviado al banco',
  FALLIDO:    'No se pudo cobrar',
  COBRADO:    'Cobrado',
  DEVUELTO:   'Devuelto por el banco',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PanelPendientes({ vista = 'deudas' }: { vista?: 'deudas' | 'cobrado' }) {
  const uid = useId();
  // ── Context ─────────────────────────────────────────────────────────────────
  const {
    studio,
    recibos,
    socios,
    suscripciones,
    planesTarifa,
    facturas,
    marcarCobrado,
    marcarDevuelto,
    reintentar,
    reintentarSelladoFactura,
    deleteRecibo,
    addRecibo,
    crearFacturaDirecta,
    resetDatosPilates,
  } = useStudio();

  // ── Hydration guard ─────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: el SSR pinta una fecha fija y el cliente pasa a la real tras montar. El segundo render es el OBJETIVO, no un efecto colateral; quitar el efecto reintroduce el mismatch de hidratación.
  useEffect(() => setMounted(true), []);
  const now = mounted ? new Date() : new Date('2026-06-29');

  // ── Stripe state ────────────────────────────────────────────────────────────
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);
  const [stripeToast, setStripeToast] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);
  // "Cobrar online" sobre una socia sin método guardado tenía como única
  // respuesta un texto rojo que se iba en 4 segundos: la propietaria no podía
  // hacer nada con esa información. Este estado convierte ese callejón en la
  // acción que de verdad lo resuelve — pedirle a la socia que autorice una
  // tarjeta. No es un toast a propósito: no debe desaparecer solo.
  const [pedirTarjeta, setPedirTarjeta] = useState<{ socioId: string; nombre: string } | null>(null);
  const [enlaceTarjeta, setEnlaceTarjeta] = useState<{ url: string; copiado: boolean } | null>(null);
  const [generandoEnlace, setGenerandoEnlace] = useState(false);

  // Handle Stripe redirect — use window.location to avoid useSearchParams suspension
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const success = params.get('stripe_success');
    const reciboId = params.get('recibo');
    const cancel = params.get('stripe_cancel');
    if (success && reciboId) {
      // SEGURIDAD: antes se marcaba el recibo COBRADO (y se sellaba su factura,
      // y se renovaba el bono) solo por traer este query-param en la URL —
      // cualquiera podía fabricar el enlace y dar por pagado un recibo sin que
      // Stripe hubiera cobrado nada. El webhook de checkout.session.completed
      // ya hace ese trabajo en servidor, con el importe verificado contra
      // Stripe. Aquí no se escribe: se relee el estado real.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Retorno de Stripe: lee la URL para saber si el pago se completó y la limpia con history.replaceState. Sincronización con el navegador.
      setStripeToast({ tipo: 'ok', msg: 'Pago completado. Actualizando…' });
      window.history.replaceState({}, '', '/cobros?tab=deudas');
      resetDatosPilates();
      // El webhook casi siempre llega antes que este redirect, pero por si hay
      // una carrera se relee una vez más tras un margen breve.
      const t = setTimeout(() => resetDatosPilates(), 2500);
      return () => clearTimeout(t);
    } else if (cancel) {
      setStripeToast({ tipo: 'error', msg: 'Pago cancelado.' });
      window.history.replaceState({}, '', '/cobros?tab=deudas');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stripeToast) {
      const t = setTimeout(() => setStripeToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [stripeToast]);

  // ── Vista ───────────────────────────────────────────────────────────────────
  // La fila de pestañas la lleva ahora la página (Quién me debe · Lo que he
  // cobrado · Facturas). Aquí solo queda un desvío: "Suscripciones activas",
  // que era una pestaña de pleno derecho y pasa a ser un enlace dentro de
  // "Quién me debe" — se consulta de vez en cuando, no es una de las dos cosas
  // que la dueña mira cada día.
  const [verSuscripciones, setVerSuscripciones] = useState(false);
  const mainTab: MainTab =
    vista === 'cobrado' ? 'historial' : verSuscripciones ? 'suscripciones' : 'cobros';

  // ── Cobros tab state ────────────────────────────────────────────────────────
  // 'SIN_COBRAR' = todo lo que sigue debiéndose (pendiente, en el banco o
  // fallido). Es la pregunta real de la pantalla, y antes había que componerla
  // a mano saltando entre tres pestañas de estado.
  const [statusTab, setStatusTab]   = useState<EstadoRecibo | 'TODOS' | 'SIN_COBRAR'>('SIN_COBRAR');
  const [search, setSearch]         = useState('');
  const [desde, setDesde]           = useState('');
  const [hasta, setHasta]           = useState('');
  const [sort, setSort]             = useState<SortKey>('reciente');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null);
  const [cobrandoRecibo, setCobrandoRecibo] = useState<string | null>(null); // F2 B2.6: elegir método al cobrar
  const [reintentandoFactura, setReintentandoFactura] = useState<string | null>(null);

  // ── Cobro masivo modal ──────────────────────────────────────────────────────
  const [showMasivo, setShowMasivo]               = useState(false);
  const [masivoSelected, setMasivoSelected]       = useState<Set<string>>(new Set());
  const [masivoProgress, setMasivoProgress]       = useState<'idle' | 'confirmar' | 'running' | 'done'>('idle');
  // Cerrojo síncrono anti doble-cobro: `masivoProgress` es estado async y un
  // segundo clic rapidísimo lo lee 'confirmar' (stale) antes de que React pinte
  // 'running', pasando el guard dos veces → lote cobrado por duplicado.
  const masivoEnCursoRef = useRef(false);
  const [masivoCobrando, setMasivoCobrando]       = useState(0);
  const [masivoTotal, setMasivoTotal]             = useState(0);
  // Los que la BD rechazó: sin esto el resumen final daba por cobrado todo.
  const [masivoFallidos, setMasivoFallidos]       = useState<string[]>([]);

  // ── Nueva factura modal ─────────────────────────────────────────────────────
  const [showFactura, setShowFactura] = useState(false);
  const [facturaForm, setFacturaForm] = useState({
    socioId: '',
    concepto: '',
    importe: '',
  });
  const [generandoFactura, setGenerandoFactura] = useState(false);

  async function generarFacturaDirecta() {
    const baseImponible = parseFloat(facturaForm.importe);
    if (isNaN(baseImponible) || baseImponible <= 0) return;
    const iva = studio?.ivaPorDefecto ?? 21;
    const total = Math.round(baseImponible * (1 + iva / 100) * 100) / 100;
    setGenerandoFactura(true);
    const res = await crearFacturaDirecta({
      socioId: facturaForm.socioId,
      concepto: facturaForm.concepto.trim(),
      importe: total,
    });
    setGenerandoFactura(false);
    // `cobroRegistrado` distingue el fallo del SELLADO fiscal (el recibo ya
    // se cobró) de un fallo al insertar el recibo en sí (nada se ha
    // registrado todavía). Solo en el primer caso se cierra el formulario:
    // reenviarlo tras un fallo de recibo real es seguro (nada se duplica);
    // reenviarlo tras un cobro ya registrado duplicaría el cobro.
    if (!res.ok && !('cobroRegistrado' in res)) {
      setStripeToast({ tipo: 'error', msg: `No se ha podido generar la factura: ${res.error}` });
      return;
    }
    setShowFactura(false);
    setFacturaForm({ socioId: '', concepto: '', importe: '' });
    setStripeToast(res.ok
      ? { tipo: 'ok', msg: 'Factura generada.' }
      : { tipo: 'error', msg: `Cobro registrado, pero la factura no se pudo sellar: ${res.error}. Contacta con soporte si no se resuelve sola.` });
  }

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

  const socioName = useCallback((socioId: string | null) => {
    if (!socioId) return 'Cliente de mostrador';
    const s = socios.find(s => s.id === socioId);
    return s ? `${s.nombre} ${s.apellidos}` : 'Clienta eliminada';
  }, [socios]);

  const socioInitials = useCallback((socioId: string | null) => {
    if (!socioId) return '🛒'; // venta de mostrador (sin socia)
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
      if (statusTab === 'SIN_COBRAR') {
        if (!ESTADOS_SIN_COBRAR.includes(r.estado)) return false;
      } else if (statusTab !== 'TODOS' && r.estado !== statusTab) return false;
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
    // P0-23: índices por id + recibos pendientes agrupados por socia en UNA
    // pasada. Antes: por cada suscripción activa, socios.find() + recibos.filter()
    // completos → O(activas × (socios + recibos)); abrir el modal de cobro masivo
    // con muchas socias disparaba miles de millones de operaciones.
    const socioById = new Map(socios.map(s => [s.id, s]));
    const planById = new Map(planesTarifa.map(p => [p.id, p]));
    const pendientesPorSocio = new Map<string, typeof recibos>();
    for (const r of recibos) {
      if (r.estado !== 'PENDIENTE' || !r.socioId) continue;
      const arr = pendientesPorSocio.get(r.socioId);
      if (arr) arr.push(r); else pendientesPorSocio.set(r.socioId, [r]);
    }
    return suscripciones
      .filter(s => s.estado === 'ACTIVA')
      .map(sus => ({
        sus,
        socio: socioById.get(sus.socioId),
        plan: planById.get(sus.planId),
        pendientesRecibos: pendientesPorSocio.get(sus.socioId) ?? [],
      }))
      .filter(d => d.socio != null);
  }, [suscripciones, socios, planesTarifa, recibos]);

  // Abre SIN nada marcado. Antes preseleccionaba todos los recibos pendientes
  // de todas las suscripciones activas: dos clics seguidos —abrir y confirmar—
  // cobraban el mes entero, y cada cobro emite una factura sellada y renueva la
  // suscripción. Quien decide a quién se le cobra es la dueña.
  function openMasivo() {
    setMasivoSelected(new Set());
    setMasivoProgress('idle');
    setMasivoCobrando(0);
    setMasivoTotal(0);
    setShowMasivo(true);
  }

  // Set: una socia con ≥2 suscripciones ACTIVA comparte los mismos recibos
  // pendientes (masivoData agrupa por socia), así que sin deduplicar los ids
  // salían repetidos y `alternarTodas` nunca detectaba "todo seleccionado"
  // (masivoSelected es un Set único, su size < length con duplicados).
  const idsCobrables = useMemo(
    () => [...new Set(masivoData.flatMap(d => d.pendientesRecibos.map(r => r.id)))],
    [masivoData],
  );

  function alternarTodas() {
    setMasivoSelected(prev => (prev.size === idsCobrables.length ? new Set() : new Set(idsCobrables)));
  }

  // Cuántas suscripciones se van a renovar con esta tanda: cada recibo cobrado
  // recarga el bono o extiende el mensual, así que no es solo "marcar cobrado".
  const masivoSuscripcionesAfectadas = useMemo(() => {
    const ids = new Set<string>();
    for (const r of recibos) {
      if (masivoSelected.has(r.id) && r.suscripcionId) ids.add(r.suscripcionId);
    }
    return ids.size;
  }, [recibos, masivoSelected]);

  async function ejecutarMasivo() {
    // El dinero no se cobra dos veces: cerrojo síncrono (ref) + estado.
    if (masivoEnCursoRef.current || masivoProgress === 'running') return;
    masivoEnCursoRef.current = true;
    const ids = Array.from(masivoSelected);
    setMasivoTotal(ids.length);
    setMasivoCobrando(0);
    setMasivoFallidos([]);
    setMasivoProgress('running');
    // P0-23: por lotes, cediendo el hilo entre ellos para pintar la barra y no
    // bloquear el UI. Antes se esperaba 120ms ARTIFICIALES por recibo, así que
    // cobrar 1000 recibos tardaba 2+ minutos de pura espera.
    //
    // Ahora se ESPERA cada cobro y se recogen los que fallan. Antes se llamaba a
    // `marcarCobrado` sin await y sin mirar el resultado: si la base de datos
    // rechazaba, la pantalla decía "N cobros procesados" igualmente, con sus
    // facturas y sus renovaciones pintadas sobre un cobro que no existía.
    const CHUNK = 25;
    const fallidos: string[] = [];
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const lote = ids.slice(i, i + CHUNK);
        const res = await Promise.all(lote.map(id => marcarCobrado(id)));
        res.forEach((r, j) => { if (!r.ok) fallidos.push(lote[j]); });
        setMasivoCobrando(Math.min(i + CHUNK, ids.length));
        await new Promise(r => setTimeout(r, 0));
      }
      setMasivoFallidos(fallidos);
      setMasivoProgress('done');
    } finally {
      masivoEnCursoRef.current = false;
    }
  }

  const masivoImporteTotal = useMemo(() => {
    return recibos
      .filter(r => masivoSelected.has(r.id))
      .reduce((s, r) => s + r.importe, 0);
  }, [recibos, masivoSelected]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  // Reintento off-session: cobra con la tarjeta/SEPA que la SOCIA ya tiene
  // guardada, sin generar ningún enlace ni redirigir a nadie. Antes esto
  // llamaba a crearCheckoutStripe (Checkout Session pública) y navegaba la
  // propia pestaña de quien pulsaba el botón —la propietaria— a una página
  // pidiendo una tarjeta a mano: parecía que la propietaria era quien pagaba.
  // "Cobrar online" significa "inténtalo ahora con lo que ya tiene guardado
  // la alumna", no "paga tú".
  async function cobrarOnline(reciboId: string) {
    const r = recibos.find(x => x.id === reciboId);
    if (!r || !studio || !r.socioId) return; // sin socia (venta de mostrador) no hay cobro online
    setStripeLoading(reciboId);
    const result = await cobrarOnlineDirecto({ reciboId, socioId: r.socioId });
    setStripeLoading(null);
    if ('error' in result) {
      if (result.errorCode === 'SIN_TARJETA') {
        // No es un error que la propietaria pueda arreglar leyéndolo: hace falta
        // que la SOCIA autorice un método. Se le ofrece ese camino en vez del
        // mensaje técnico.
        const socia = socios.find(s => s.id === r.socioId);
        setPedirTarjeta({
          socioId: r.socioId,
          nombre: socia ? `${socia.nombre} ${socia.apellidos ?? ''}`.trim() : 'la socia',
        });
        setEnlaceTarjeta(null);
        return;
      }
      setStripeToast({ tipo: 'error', msg: result.error });
      return;
    }
    if (result.aviso === 'COBRADO_SIN_PERSISTIR') {
      setStripeToast({ tipo: 'error', msg: result.detalle ?? 'Cobrado en Stripe, pero sin persistir — revísalo manualmente.' });
      return;
    }
    // El servidor ya dejó el recibo escrito (COBRADO, con factura sellada y
    // renovación aplicada; o EN_CURSO si es un adeudo SEPA que tarda días) —
    // resetDatosPilates() vuelve a traer todo de servidor en vez de replicar
    // aquí esa lógica de negocio (sellado/renovación), que ya está hecha y
    // probada en cobrarReciboOffSession.
    setStripeToast({ tipo: 'ok', msg: 'Cobro intentado con el método guardado de la socia. Actualizando…' });
    resetDatosPilates();
  }

  // Genera el enlace de autorización de tarjeta y lo deja copiado. Se copia en
  // vez de abrirlo: quien tiene que rellenarlo es la socia, no quien pulsa.
  // `copiarAlPortapapeles` y no `navigator.clipboard` directo — en Safari este
  // último resuelve sin copiar nada y el mensaje "Copiado" sería mentira.
  async function pedirTarjetaASocia() {
    if (!pedirTarjeta || !studio) return;
    setGenerandoEnlace(true);
    const res = await crearEnlaceTarjeta({
      studioId: studio.id, socioId: pedirTarjeta.socioId, slug: studio.slug ?? undefined,
    });
    setGenerandoEnlace(false);
    if ('error' in res) {
      setStripeToast({ tipo: 'error', msg: res.error });
      return;
    }
    setEnlaceTarjeta({ url: res.url, copiado: await copiarAlPortapapeles(res.url) });
  }

  async function cobrarYEmail(reciboId: string, metodo?: MetodoCobro) {
    const marcado = await marcarCobrado(reciboId, metodo);
    if (!marcado.ok) {
      setStripeToast({ tipo: 'error', msg: marcado.error });
      return; // sin marcar no se manda el justificante: sería un email falso
    }
    const r = recibos.find(x => x.id === reciboId);
    const socio = r ? socios.find(s => s.id === r.socioId) : null;
    const factura = facturas.find(f => f.reciboId === reciboId);
    // Sin esto la fila desaparecía de "Quién me debe" en silencio y parecía
    // que el clic no había hecho nada — el estado sí se actualizaba, solo
    // faltaba decirlo.
    setStripeToast({ tipo: 'ok', msg: r ? `Cobro registrado: ${formatEuro(r.importe)} de ${socioName(r.socioId)}.` : 'Cobro registrado.' });
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

  async function handleReintentarFactura(reciboId: string) {
    setReintentandoFactura(reciboId);
    const res = await reintentarSelladoFactura(reciboId);
    setReintentandoFactura(null);
    setStripeToast(res.ok
      ? { tipo: 'ok', msg: 'Factura generada.' }
      : { tipo: 'error', msg: `Sigue sin poder sellarse: ${res.error}` });
  }

  async function crearNuevoCobro() {
    const sus = suscripciones.find(s => s.socioId === nuevoForm.socioId && s.estado === 'ACTIVA');
    const res = await addRecibo({
      socioId: nuevoForm.socioId,
      suscripcionId: sus?.id ?? null,
      concepto: nuevoForm.concepto.trim(),
      importe: parseFloat(nuevoForm.importe),
      fechaVencimiento: nuevoForm.fechaVencimiento,
    });
    // No hay canal de toast en este panel; se deja el modal abierto en vez de
    // cerrarlo — antes se cerraba y limpiaba el formulario aunque la escritura
    // hubiera fallado, y la propietaria no tenía forma de saber que el cobro
    // nunca se guardó ni de reintentarlo sin rellenar todo otra vez.
    if (!res.ok) { window.alert(res.error); return; }
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
    const header = ['Concepto', 'Clienta', 'Importe', 'Estado', 'Vencimiento', 'Cobrado el'];
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

  function tabCount(value: EstadoRecibo | 'TODOS' | 'SIN_COBRAR') {
    if (value === 'TODOS') return recibos.length;
    if (value === 'SIN_COBRAR') return recibos.filter(r => ESTADOS_SIN_COBRAR.includes(r.estado)).length;
    return recibos.filter(r => r.estado === value).length;
  }

  const pendientesCount = recibos.filter(r => r.estado === 'PENDIENTE').length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background space-y-6 pb-10">

      {/* ── Stripe toast ─────────────────────────────────────────────────────── */}
      {stripeToast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold transition-all',
          stripeToast.tipo === 'ok'
            ? 'bg-success/10 border-[#A7F3D0] text-success'
            : 'bg-destructive/10 border-[#FECACA] text-destructive'
        )}>
          {stripeToast.tipo === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {stripeToast.msg}
        </div>
      )}

      {/* Sin método guardado: la salida real, no un error. Se explica en una
          frase POR QUÉ no se puede cobrar y qué hace el enlace, porque la
          propietaria se lo va a reenviar a una clienta y tiene que poder
          contárselo. */}
      {pedirTarjeta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-pedir-tarjeta">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-xl">
            <h3 id="titulo-pedir-tarjeta" className="text-[17px] font-bold text-foreground">
              {pedirTarjeta.nombre} no tiene tarjeta guardada
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Para cobrar sin que esté delante hace falta que ella autorice una tarjeta una vez.
              Genera el enlace y mándaselo por donde habléis normalmente: lo rellena en Stripe,
              no aquí, y su tarjeta no pasa en ningún momento por Tentare.
            </p>

            {enlaceTarjeta ? (
              <div className="mt-4 space-y-2">
                <p className="text-[12px] font-semibold text-success">
                  {enlaceTarjeta.copiado
                    ? 'Enlace copiado — pégalo en tu WhatsApp o correo.'
                    : 'Enlace listo. Cópialo a mano: tu navegador no ha dejado copiarlo solo.'}
                </p>
                {/* Visible siempre, no solo cuando falla el copiado: un enlace
                    que se anuncia copiado y no está deja a la propietaria sin
                    nada que pegar. */}
                <input
                  readOnly value={enlaceTarjeta.url}
                  onFocus={e => e.currentTarget.select()}
                  aria-label="Enlace para guardar la tarjeta"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-foreground"
                />
                <p className="text-[11px] text-muted-foreground">
                  Cuando lo complete, su tarjeta queda guardada y &laquo;Cobrar online&raquo; ya funcionará.
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => { setPedirTarjeta(null); setEnlaceTarjeta(null); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-[13px] font-bold text-foreground hover:bg-muted transition-colors"
              >
                Cerrar
              </button>
              {!enlaceTarjeta && (
                <button
                  onClick={pedirTarjetaASocia} disabled={generandoEnlace}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:brightness-95 transition-colors disabled:opacity-60"
                >
                  {generandoEnlace ? 'Generando…' : 'Generar enlace'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
              onClick={() => {
                setFacturaForm({ socioId: socios[0]?.id ?? '', concepto: '', importe: '' });
                setShowFactura(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-border bg-card text-foreground hover:bg-background transition-colors"
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
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 transition-colors"
            >
              <Plus size={15} />
              Nuevo cobro
            </button>
      </div>

      {/* ── KPI bar ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cobrado este mes */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Cobrado este mes
            </p>
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
              <TrendingUp size={15} className="text-success" />
            </div>
          </div>
          <CifraPrivada className="text-2xl font-extrabold text-success">
            {formatEuro(kpis.cobradoMes)}
          </CifraPrivada>
          <p className="text-xs text-muted-foreground mt-1">{monthLabel(thisMonth)}</p>
        </div>

        {/* Pendiente de cobro */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Pendiente cobro
            </p>
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock size={15} className="text-warning" />
            </div>
          </div>
          <CifraPrivada className="text-2xl font-extrabold text-warning">
            {formatEuro(kpis.pendienteTotal)}
          </CifraPrivada>
          <p className="text-xs text-muted-foreground mt-1">{pendientesCount} recibo{pendientesCount !== 1 ? 's' : ''} pendiente{pendientesCount !== 1 ? 's' : ''}</p>
        </div>

        {/* Clientas con deuda */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Clientas con deuda
            </p>
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Users size={15} className="text-destructive" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-destructive">
            {kpis.sociosConDeuda}
          </p>
          <p className="text-xs text-muted-foreground mt-1">cliente{kpis.sociosConDeuda !== 1 ? 's' : ''} con recibos pendientes</p>
        </div>

        {/* Media por clienta */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Ingreso medio por clienta
            </p>
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
              <BarChart3 size={15} className="text-brand-medio" />
            </div>
          </div>
          <CifraPrivada className="text-2xl font-extrabold text-foreground">
            {formatEuro(kpis.mediaXSocia)}
          </CifraPrivada>
          {/* Esta cifra y el "Ticket medio" de Informes se llamaban casi igual
              ("Media por cliente" / "Ticket medio / cliente") y miden cosas
              distintas: esta reparte lo cobrado del mes entre TODAS las clientas
              activas —paguen o no—, y la de Informes solo entre quienes pagaron.
              Con 850 clientas y 65 pagadoras salían 10 € y 130 €, las dos
              correctas, y la dueña dejó de fiarse de las dos. Cada una dice
              ahora sobre quién se calcula. */}
          <p className="text-xs text-muted-foreground mt-1">lo cobrado este mes repartido entre todas las clientas activas</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: COBROS                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {mainTab === 'cobros' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Un desplegable en vez de seis pestañas: es un filtro, no un
                sitio donde se pueda estar perdida. Abre en "todo lo que me
                deben", que es a lo que se viene a esta pantalla. */}
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor={`${uid}-estado`} className="text-xs font-semibold text-muted-foreground">
                Ver
              </label>
              <select
                id={`${uid}-estado`}
                value={statusTab}
                onChange={e => setStatusTab(e.target.value as EstadoRecibo | 'TODOS' | 'SIN_COBRAR')}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-brand transition-colors cursor-pointer"
              >
                {(['SIN_COBRAR', 'PENDIENTE', 'EN_CURSO', 'FALLIDO', 'COBRADO', 'DEVUELTO', 'TODOS'] as const).map(v => (
                  <option key={v} value={v}>
                    {ETIQUETA_ESTADO[v]} ({tabCount(v)})
                  </option>
                ))}
              </select>
            </div>

            {/* "Cobro masivo", en verde y sin más, se leía como un botón de
                pánico: no decía a quién le cobra ni si tiene vuelta atrás.
                Ahora dice lo que hace, y quien decide a quién es ella. */}
            <button
              onClick={openMasivo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-border bg-card text-foreground hover:bg-background transition-colors"
            >
              <Zap size={14} />
              Cobrar varias a la vez
            </button>
          </div>

          <p className="text-[13px] text-muted-foreground">
            <button
              onClick={() => setVerSuscripciones(true)}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Ver las {suscripciones.filter(s => s.estado === 'ACTIVA').length} suscripciones activas
            </button>
          </p>

          {/* Filters */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por concepto o cliente…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`${uid}-1`} className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Desde</label>
                <input id={`${uid}-1`} type="month" value={desde} onChange={e => setDesde(e.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`${uid}-2`} className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Hasta</label>
                <input id={`${uid}-2`} type="month" value={hasta} onChange={e => setHasta(e.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
              >
                <Download size={14} />
                CSV
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                {filtradosCobros.length} resultado{filtradosCobros.length !== 1 ? 's' : ''}
              </p>
            </div>

            {filtradosCobros.length === 0 ? (
              <EmptyState compacto icono={CreditCard} titulo="Sin recibos en esta categoría" />
            ) : (
              <div className="divide-y divide-background">
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
                        className="flex items-center gap-4 px-5 py-4 hover:bg-muted transition-colors group cursor-pointer"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        {/* Avatar */}
                        <Link
                          href={`/clientas/${r.socioId}`}
                          onClick={e => e.stopPropagation()}
                          className="shrink-0"
                        >
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-info/10 text-brand-medio">
                            {initials}
                          </div>
                        </Link>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{r.concepto}</p>
                          <p className="text-xs mt-0.5 text-muted-foreground truncate">
                            <Link
                              href={`/clientas/${r.socioId}`}
                              onClick={e => e.stopPropagation()}
                              className="hover:text-brand-medio hover:underline transition-colors"
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
                          <CifraPrivada className="text-sm font-extrabold text-foreground">
                            {formatEuro(r.importe)}
                          </CifraPrivada>
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
                                onClick={() => setCobrandoRecibo(r.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-success/10 text-success hover:bg-[#A7F3D0] transition-colors"
                                title="Marcar cobrado (elige cómo) y enviar email"
                              >
                                <CheckCircle2 size={12} />
                                Cobrar
                              </button>
                              <button
                                onClick={() => cobrarOnline(r.id)}
                                disabled={stripeLoading === r.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-brand/10 text-brand-medio hover:bg-info/10 transition-colors disabled:opacity-60"
                                title="Reintentar el cobro con la tarjeta o SEPA que ya tiene guardado la socia"
                              >
                                {stripeLoading === r.id
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <CreditCard size={12} />}
                                Online
                              </button>
                              <button
                                onClick={() => marcarDevuelto(r.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-destructive/10 transition-colors"
                                title="Marcar devuelto"
                              >
                                <XCircle size={14} className="text-destructive" />
                              </button>
                            </>
                          )}
                          {r.estado === 'COBRADO' && (
                            <>
                              {factura ? (
                                <Link
                                  href={`/facturas?ver=${factura.id}`}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-background text-muted-foreground hover:bg-border transition-colors"
                                  title="Ver factura"
                                >
                                  <FileText size={12} />
                                  {factura.numeroCompleto}
                                </Link>
                              ) : (
                                <button
                                  onClick={() => handleReintentarFactura(r.id)}
                                  disabled={reintentandoFactura === r.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-60"
                                  title="El cobro se registró pero la factura no llegó a sellarse — reintentar"
                                >
                                  {reintentandoFactura === r.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <RefreshCw size={12} />}
                                  Sin factura
                                </button>
                              )}
                              <button
                                onClick={() => marcarDevuelto(r.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-destructive/10 transition-colors"
                                title="Devolver"
                              >
                                <XCircle size={14} className="text-destructive" />
                              </button>
                            </>
                          )}
                          {r.estado === 'DEVUELTO' && (
                            <button
                              onClick={async () => {
                                const res = await reintentar(r.id);
                                if (!res.ok) window.alert(res.error);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-info/10 text-brand-medio hover:bg-info/10 transition-colors"
                            >
                              <RefreshCw size={12} />
                              Reintentar
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmEliminar(r.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-destructive/10 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={14} className="text-destructive" />
                          </button>
                        </div>

                        {/* Chevron */}
                        <div className="shrink-0 text-muted-foreground">
                          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {expanded && (
                        <div className="px-5 pb-5 bg-muted border-t border-border">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Estado</p>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: badge.bg, color: badge.text }}>
                                {badge.label}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Vencimiento</p>
                              <p className="text-sm font-semibold text-foreground">{fecha(r.fechaVencimiento)}</p>
                            </div>
                            {r.fechaCobro && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Fecha cobro</p>
                                <p className="text-sm font-semibold text-foreground">{fecha(r.fechaCobro)}</p>
                              </div>
                            )}
                            {r.fechaDevolucion && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Devolución</p>
                                <p className="text-sm font-semibold text-foreground">{fecha(r.fechaDevolucion)}</p>
                              </div>
                            )}
                            {typeof r.intentosReintento === 'number' && r.intentosReintento > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Reintentos</p>
                                <p className="text-sm font-semibold text-foreground">{r.intentosReintento}</p>
                              </div>
                            )}
                            {sus && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Plan</p>
                                <p className="text-sm font-semibold text-foreground">{planName(sus.planId)}</p>
                              </div>
                            )}
                            {factura && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Factura</p>
                                <p className="text-sm font-semibold text-brand-medio">{factura.numeroCompleto}</p>
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
        <div className="space-y-3">
          <button
            onClick={() => setVerSuscripciones(false)}
            className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Volver a quién me debe
          </button>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {suscripciones.filter(s => s.estado === 'ACTIVA').length} suscripciones activas
            </p>
          </div>

          {suscripciones.filter(s => s.estado === 'ACTIVA').length === 0 ? (
            <EmptyState
              compacto
              icono={Users}
              titulo="No hay suscripciones activas"
              cta={{ label: 'Añadir clienta con plan', href: '/clientas?nuevo=1' }}
            />
          ) : (
            <div className="overflow-x-auto">
              {/* Table header */}
              <div className="grid grid-cols-6 gap-4 px-5 py-2 bg-muted border-b border-border min-w-[700px]">
                {['Cliente', 'Plan', 'Precio/mes', 'Próximo cobro', 'Sesiones rest.', 'Acciones'].map(h => (
                  <p key={h} className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</p>
                ))}
              </div>

              <div className="divide-y divide-background">
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
                      <div key={sus.id} className="grid grid-cols-6 gap-4 px-5 py-4 items-center hover:bg-muted transition-colors group min-w-[700px]">
                        {/* Cliente */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-info/10 text-brand-medio shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/clientas/${sus.socioId}`}
                              className="text-sm font-semibold text-foreground truncate hover:text-brand-medio hover:underline block">
                              {socio ? `${socio.nombre} ${socio.apellidos}` : 'Clienta eliminada'}
                            </Link>
                          </div>
                        </div>

                        {/* Plan */}
                        <p className="text-sm text-foreground font-medium truncate">{plan?.nombre ?? '—'}</p>

                        {/* Precio */}
                        <CifraPrivada className="text-sm font-bold text-foreground">
                          {plan ? formatEuro(plan.precio) : '—'}
                        </CifraPrivada>

                        {/* Próximo cobro */}
                        <p className="text-sm text-muted-foreground">{fecha(nextCobro.toISOString())}</p>

                        {/* Sesiones restantes */}
                        <div>
                          {sus.sesionesRestantes != null ? (
                            <span className={cn(
                              'text-xs font-bold px-2 py-0.5 rounded-full',
                              sus.sesionesRestantes <= 2
                                ? 'bg-warning/10 text-warning'
                                : 'bg-success/10 text-success'
                            )}>
                              {sus.sesionesRestantes} ses.
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Ilimitadas</span>
                          )}
                        </div>

                        {/* Acciones */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="text-xs px-2.5 py-1.5 rounded-lg font-bold border border-border text-muted-foreground hover:bg-background transition-colors">
                            Cambiar plan
                          </button>
                          <button className="text-xs px-2.5 py-1.5 rounded-lg font-bold text-destructive hover:bg-destructive/10 transition-colors">
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
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: HISTORIAL                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {mainTab === 'historial' && (
        <div className="space-y-4">
          {/* Historial filters */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar cliente o concepto…"
                  value={histSearch}
                  onChange={e => setHistSearch(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`${uid}-3`} className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Mes</label>
                <input id={`${uid}-3`} type="month" value={histMes} onChange={e => setHistMes(e.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <select
                value={histEstado}
                onChange={e => setHistEstado(e.target.value as EstadoRecibo | 'TODOS')}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
              >
                <option value="TODOS">{ETIQUETA_ESTADO.TODOS}</option>
                <option value="COBRADO">{ETIQUETA_ESTADO.COBRADO}</option>
                <option value="PENDIENTE">{ETIQUETA_ESTADO.PENDIENTE}</option>
                <option value="DEVUELTO">{ETIQUETA_ESTADO.DEVUELTO}</option>
                <option value="EN_CURSO">{ETIQUETA_ESTADO.EN_CURSO}</option>
                <option value="FALLIDO">{ETIQUETA_ESTADO.FALLIDO}</option>
              </select>
              <button
                onClick={exportCSV}
                disabled={exportState === 'loading'}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors',
                  exportState === 'done'
                    ? 'bg-success/10 text-success'
                    : 'border border-border bg-card text-muted-foreground hover:bg-background hover:text-foreground'
                )}
              >
                {exportState === 'loading' && <Loader2 size={14} className="animate-spin" />}
                {exportState === 'done' && <CheckCircle2 size={14} />}
                {exportState === 'idle' && <Download size={14} />}
                {exportState === 'idle' ? 'Exportar' : exportState === 'loading' ? 'Exportando…' : 'Exportado'}
              </button>
            </div>
          </div>

          {/* Grouped by month */}
          {historialAgrupado.length === 0 ? (
            <div className="bg-card border border-border rounded-xl">
              <EmptyState compacto icono={BarChart3} titulo="Sin resultados para los filtros seleccionados" />
            </div>
          ) : (
            historialAgrupado.map(group => (
              <div key={group.ym} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Month header */}
                <div className="flex items-center justify-between px-5 py-3 bg-muted border-b border-border">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-muted-foreground" />
                    <p className="text-sm font-bold text-foreground capitalize">{group.label}</p>
                    <span className="text-xs text-muted-foreground font-medium">
                      {group.items.length} recibo{group.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <CifraPrivada className="text-sm font-extrabold text-success">
                    {formatEuro(group.total)} cobrado
                  </CifraPrivada>
                </div>

                {/* Items */}
                <div className="divide-y divide-background">
                  {group.items.map(r => {
                    const badge = BADGE[r.estado] ?? BADGE.PENDIENTE;
                    return (
                      <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-info/10 text-brand-medio shrink-0">
                          {socioInitials(r.socioId)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{r.concepto}</p>
                          <p className="text-xs text-muted-foreground truncate">{socioName(r.socioId)}</p>
                        </div>
                        <CifraPrivada className="text-sm font-bold text-foreground shrink-0">
                          {formatEuro(r.importe)}
                        </CifraPrivada>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {badge.label}
                        </span>
                        <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
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
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <Zap size={18} className="text-success" />
              Cobrar varias a la vez
            </DialogTitle>
          </DialogHeader>

          {masivoProgress === 'done' ? (
            /* Resultado: cobrados de verdad vs rechazados por la base de datos.
               Nunca "N procesados" a secas: el número tiene que cuadrar con lo
               que hay guardado, o la dueña cuadra caja contra una mentira. */
            <div className="flex flex-col items-center text-center gap-4 py-8">
              <div className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center',
                masivoFallidos.length > 0 ? 'bg-warning/10' : 'bg-success/10',
              )}>
                {masivoFallidos.length > 0
                  ? <AlertTriangle size={32} className="text-warning" />
                  : <CheckCheck size={32} className="text-success" />}
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">
                  {masivoTotal - masivoFallidos.length} cobro{masivoTotal - masivoFallidos.length !== 1 ? 's' : ''} guardado{masivoTotal - masivoFallidos.length !== 1 ? 's' : ''}
                </p>
                {masivoFallidos.length > 0 ? (
                  <p className="text-sm text-warning mt-1 max-w-sm">
                    {masivoFallidos.length} no se {masivoFallidos.length === 1 ? 'ha podido guardar' : 'han podido guardar'} y {masivoFallidos.length === 1 ? 'sigue' : 'siguen'} como pendiente{masivoFallidos.length !== 1 ? 's' : ''}.
                    No se {masivoFallidos.length === 1 ? 'ha emitido su factura' : 'han emitido sus facturas'} ni se {masivoFallidos.length === 1 ? 'ha renovado su bono' : 'han renovado sus bonos'}. Vuelve a intentarlo.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    <CifraPrivada inline>{formatEuro(masivoImporteTotal)}</CifraPrivada> marcados como cobrados
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowMasivo(false)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : masivoProgress === 'confirmar' ? (
            /* Confirmación: qué va a pasar exactamente, y que no hay vuelta atrás.
               Antes el botón de la lista ejecutaba directamente — sin decir que
               cada cobro emite una factura con numeración fiscal, renueva la
               suscripción, y que marcarlo devuelto después NO deshace nada de
               eso. La dueña que lo probó escribió: "¿le cobro a todas de golpe?
               ¿se puede deshacer?". Las dos respuestas estaban ocultas. */
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-warning bg-warning/10 p-4 space-y-2">
                <p className="text-sm font-bold text-foreground">
                  Vas a cobrar {masivoSelected.size} recibo{masivoSelected.size !== 1 ? 's' : ''} por{' '}
                  <CifraPrivada inline>
                    {formatEuro(masivoImporteTotal)}
                  </CifraPrivada>
                </p>
                <p className="text-[13px] text-muted-foreground">Al confirmar, para cada recibo:</p>
                <ul className="text-[13px] text-muted-foreground list-disc pl-5 space-y-1">
                  <li>se emite una <strong className="text-foreground">factura con número fiscal</strong>, que ya no se puede borrar;</li>
                  {masivoSuscripcionesAfectadas > 0 && (
                    <li>
                      se renuevan <strong className="text-foreground">{masivoSuscripcionesAfectadas} suscripcion{masivoSuscripcionesAfectadas !== 1 ? 'es' : ''}</strong>
                      {' '}(se recarga el bono o se alarga el mes).
                    </li>
                  )}
                </ul>
                <p className="text-[13px] font-semibold text-foreground pt-1">
                  Esto no se puede deshacer. Marcar un recibo como devuelto después no anula
                  su factura ni la renovación.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setMasivoProgress('idle')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-foreground hover:bg-background transition-colors"
                >
                  Volver a la lista
                </button>
                <button
                  onClick={ejecutarMasivo}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-success hover:bg-[#047857] transition-colors"
                >
                  Sí, cobrar {masivoSelected.size}
                </button>
              </div>
            </div>
          ) : masivoProgress === 'running' ? (
            /* Progress state */
            <div className="flex flex-col items-center text-center gap-4 py-8">
              <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center">
                <Loader2 size={32} className="text-warning animate-spin" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">
                  Cobrando {masivoCobrando} / {masivoTotal}
                </p>
                <div className="w-48 h-2 bg-border rounded-full mt-3 mx-auto overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full transition-all duration-200"
                    style={{ width: `${(masivoCobrando / masivoTotal) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Selection state */
            <>
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[13px] text-muted-foreground">
                  Marca a quién quieres cobrar.
                </p>
                {idsCobrables.length > 0 && (
                  <button
                    onClick={alternarTodas}
                    className="text-[13px] font-semibold text-brand-medio hover:underline underline-offset-2"
                  >
                    {masivoSelected.size === idsCobrables.length ? 'Quitar todas' : `Marcar todas (${idsCobrables.length})`}
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 my-2 pr-1">
                {masivoData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No hay suscripciones activas</p>
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
                            ? 'border-success bg-success/10'
                            : hasPending
                              ? 'border-warning/10 bg-warning/10 hover:border-warning'
                              : 'border-border bg-card hover:bg-muted opacity-60'
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
                            ? 'bg-success border-success'
                            : 'border-muted-foreground bg-card'
                        )}>
                          {isSelected && <CheckCircle2 size={12} className="text-white" />}
                        </div>

                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-info/10 text-brand-medio shrink-0">
                          {initials}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {socio.nombre} {socio.apellidos}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{plan?.nombre ?? '—'}</p>
                        </div>

                        {/* Amount / status */}
                        <div className="text-right shrink-0">
                          {hasPending ? (
                            <>
                              <CifraPrivada className="text-sm font-extrabold text-warning">
                                {formatEuro(pendientesRecibos.reduce((s, r) => s + r.importe, 0))}
                              </CifraPrivada>
                              <p className="text-xs text-warning">
                                {pendientesRecibos.length} pendiente{pendientesRecibos.length !== 1 ? 's' : ''}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-semibold">
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
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <p className="text-muted-foreground">
                    {masivoSelected.size} recibo{masivoSelected.size !== 1 ? 's' : ''} seleccionado{masivoSelected.size !== 1 ? 's' : ''}
                  </p>
                  <p className="font-extrabold text-foreground">
                    Total: <CifraPrivada inline>{formatEuro(masivoImporteTotal)}</CifraPrivada>
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowMasivo(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-background transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => setMasivoProgress('confirmar')}
                    disabled={masivoSelected.size === 0}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-success hover:bg-[#047857] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    <Zap size={14} />
                    Continuar ({masivoSelected.size})
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
            <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText size={18} />
              Nueva factura
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FF label="Cliente">
              <SocioPicker
                socios={socios}
                value={facturaForm.socioId}
                onChange={id => setFacturaForm(f => ({ ...f, socioId: id }))}
              />
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
              <div className="bg-muted border border-border rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Base imponible</span>
                  <span className="font-semibold text-foreground">{formatEuro(parseFloat(facturaForm.importe))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IVA {studio?.ivaPorDefecto ?? 21}%</span>
                  <span className="font-semibold text-foreground">{formatEuro((parseFloat(facturaForm.importe) * ((studio?.ivaPorDefecto ?? 21) / 100)))}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-border pt-1.5 mt-1.5">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">{formatEuro((parseFloat(facturaForm.importe) * (1 + (studio?.ivaPorDefecto ?? 21) / 100)))}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowFactura(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-background transition-colors"
            >
              Cancelar
            </button>
            <button
              disabled={!facturaForm.socioId || !facturaForm.concepto.trim() || !facturaForm.importe || generandoFactura}
              onClick={generarFacturaDirecta}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {generandoFactura ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Generar factura
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Nuevo cobro                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* F2 (B2.6): cobro sin pasarela de primera clase — elige cómo se cobró. */}
      <Dialog open={!!cobrandoRecibo} onOpenChange={open => { if (!open) setCobrandoRecibo(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">¿Cómo lo has cobrado?</DialogTitle>
            {cobrandoRecibo && (() => {
              const r = recibos.find(x => x.id === cobrandoRecibo);
              return r ? (
                <p className="text-sm text-muted-foreground">
                  {socioName(r.socioId)} — <span className="font-semibold text-foreground">{formatEuro(r.importe)}</span>
                </p>
              ) : null;
            })()}
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {([['BIZUM', 'Bizum'], ['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia'], ['TARJETA', 'Tarjeta']] as [MetodoCobro, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => { const id = cobrandoRecibo; setCobrandoRecibo(null); if (id) cobrarYEmail(id, m); }}
                className="px-3 py-2.5 rounded-lg text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { const id = cobrandoRecibo; setCobrandoRecibo(null); if (id) cobrarYEmail(id); }}
            className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Marcar cobrado sin especificar
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={showNuevoCobro} onOpenChange={open => { if (!open) setShowNuevoCobro(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Nuevo cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FF label="Cliente">
              <SocioPicker
                socios={socios}
                value={nuevoForm.socioId}
                onChange={id => setNuevoForm(f => ({ ...f, socioId: id }))}
              />
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
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-background transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={crearNuevoCobro}
              disabled={!nuevoForm.concepto.trim() || !nuevoForm.importe || !nuevoForm.socioId}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-destructive/10">
              <AlertTriangle size={24} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">Eliminar recibo</h3>
              <p className="text-sm text-muted-foreground">Esta accion no se puede deshacer.</p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setConfirmEliminar(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-background transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!confirmEliminar) return;
                  const res = await deleteRecibo(confirmEliminar);
                  setConfirmEliminar(null);
                  if (!res.ok) window.alert(res.error);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-destructive hover:bg-red-700 transition-colors"
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
