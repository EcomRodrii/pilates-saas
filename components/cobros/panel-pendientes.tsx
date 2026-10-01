'use client';

import { useState, useMemo, useEffect, useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { anfitrionPortal } from '@/lib/panel-portal';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import type { EstadoRecibo, Socio, MetodoCobro } from '@/lib/types';
import { DialogoMetodoCobro } from '@/components/cobros/dialogo-metodo-cobro';
import { CasillaRenovacion } from '@/components/cobros/casilla-renovacion';
import { MENSAJE_YA_ESTABA, esCobroConfirmado } from '@/lib/cobros/marcar-cobrado';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, copiarAlPortapapeles, formatEuro, hoyEnEstudio } from '@/lib/utils';
import { situacionRecibo, estaSinCobrar, importeIngresado, mesDelRecibo, resumirRecibos } from '@/lib/billing/situacion-recibo';
import { resumenVentasSinRecibo } from '@/lib/pos/ventas-sin-recibo';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { EmptyState } from '@/components/ui/empty-state';
import { cobrarOnlineDirecto, crearEnlaceTarjeta, enviarEmailRecibo } from '@/lib/api-client';
import { MOTIVOS_ELIMINAR_RECIBO, puedeEliminarRecibo } from '@/lib/recibos-eliminar';
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
        // Se abre al pulsarlo, al escribir o con la flecha abajo, NO al recibir el foco: el diálogo de
        // «Nuevo cobro» pone el foco aquí al abrirse y el desplegable nacía abierto, con un velo
        // encima que se comía el primer clic (el de «Crear cobro», o el de la casilla de renovación).
        onClick={() => { if (!open) { setOpen(true); setQ(''); } }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); setQ(''); }
          if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
        }}
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
  FALLIDO:   { bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', text: 'var(--destructive)', label: 'No se pudo cobrar' },
};

const BADGE_REEMBOLSADO = { bg: 'var(--muted)', text: 'var(--muted-foreground)', label: 'Reembolsado' };

type SortKey = 'reciente' | 'antiguo' | 'mayor' | 'menor';
const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Más reciente', value: 'reciente' },
  { label: 'Más antiguo',  value: 'antiguo' },
  { label: 'Mayor importe', value: 'mayor' },
  { label: 'Menor importe', value: 'menor' },
];

type MainTab = 'cobros' | 'suscripciones' | 'historial';

// Un recibo que no está cobrado sigue siendo dinero que le deben, esté donde
// esté del camino: sin enviar, en el banco, o rebotado. La regla vive en
// `estaSinCobrar` (lib/billing/situacion-recibo.ts), no aquí: antes era una
// lista de estados que se dejaba fuera el recibo DEVUELTO POR EL BANCO —deuda
// otra vez, la misma que bloquea las reservas por impago— porque `DEVUELTO`
// también es el estado de un reembolso, que no es deuda.

// El badge de un DEVUELTO depende de quién devolvió el dinero: el banco (la
// clienta sigue debiendo) o el estudio (reembolso). El estado solo no lo dice.
function badgeDe(r: Parameters<typeof situacionRecibo>[0]) {
  if (r.estado === 'DEVUELTO' && situacionRecibo(r) === 'REEMBOLSADO') return BADGE_REEMBOLSADO;
  return BADGE[r.estado] ?? BADGE.PENDIENTE;
}

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
  // DEVUELTO es dos cosas: el banco rechazó el adeudo (se sigue debiendo) o el
  // estudio reembolsó el dinero. Cada fila lo distingue con su badge.
  DEVUELTO:   'Devuelto (banco o reembolso)',
  ANULADO:    'Anulado al cancelar la cuota',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PanelPendientes({ vista = 'deudas', onToast, acciones }: {
  vista?: 'deudas' | 'cobrado';
  onToast: (mensaje: string) => void;
  /**
   * Acciones que aporta la página y se pintan en la MISMA fila que las del
   * panel. Antes la página ponía su botón en su propio `flex justify-end` y el
   * panel los suyos en otro justo debajo: tres acciones en dos filas
   * escalonadas, cada una pegada a la derecha, con un hueco enorme a la
   * izquierda. Se leía como algo mal colocado, no como una barra de acciones.
   */
  acciones?: React.ReactNode;
}) {
  const uid = useId();
  // ── Context ─────────────────────────────────────────────────────────────────
  const {
    studio,
    recibos,
    socios,
    suscripciones,
    planesTarifa,
    facturas,
    ventasPOS,
    marcarCobrado,
    marcarCobradoVarios,
    marcarDevuelto,
    reintentar,
    reintentarSelladoFactura,
    deleteRecibo,
    addRecibo,
    crearFacturaDirecta,
    resetDatosPilates,
  } = useStudio();
  // ¿Emite facturas este estudio? (`Studio.modoFacturacion`). Mientras carga,
  // como si sí: sin que desaparezcan botones al cargar.
  const emite = studio ? studio.modoFacturacion === 'verifactu' : true;

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
      // Los errores se quedan más tiempo que los "ok" (4s de siempre): el fallo
      // de sellado de factura tras "Cobrar" ahora explica QUÉ pasar a
      // continuación ("reintenta desde Sin factura...") — 4s no bastan para
      // leerlo, y era justo la brevedad del aviso equivalente (`dbError`, 6s,
      // en un canal sin relación visible con el clic) lo que hacía parecer que
      // el cobro se había perdido.
      const t = setTimeout(() => setStripeToast(null), stripeToast.tipo === 'error' ? 10000 : 4000);
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
  // Eliminar un recibo pide un motivo (lista cerrada) y el servidor decide si se puede:
  // el diálogo se queda abierto con su explicación si lo rechaza.
  const [motivoEliminar, setMotivoEliminar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  function cerrarEliminar() {
    setConfirmEliminar(null);
    setMotivoEliminar(null);
    setErrorEliminar(null);
  }
  async function confirmarEliminar() {
    if (!confirmEliminar || !motivoEliminar || eliminando) return;
    setEliminando(true);
    setErrorEliminar(null);
    const res = await deleteRecibo(confirmEliminar, motivoEliminar);
    setEliminando(false);
    if (res.ok) { cerrarEliminar(); return; }
    setErrorEliminar(res.error);
  }
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
  // La respuesta no llegó y al releer no figuran cobrados: ni «guardado» ni «fallido».
  const [masivoSinConfirmar, setMasivoSinConfirmar] = useState<string[]>([]);
  const [masivoYaEstaban, setMasivoYaEstaban]     = useState(0);

  // ── Nueva factura modal ─────────────────────────────────────────────────────
  const [showFactura, setShowFactura] = useState(false);
  const [facturaForm, setFacturaForm] = useState({
    socioId: '',
    concepto: '',
    importe: '',
  });
  const [generandoFactura, setGenerandoFactura] = useState(false);
  // Cerrojo SÍNCRONO (como el del cobro masivo): `generandoFactura` no llega a tiempo de parar un segundo
  // clic, y cada envío acuña un recibo con id nuevo.
  const facturaEnCursoRef = useRef(false);

  async function generarFacturaDirecta() {
    if (generandoFactura || facturaEnCursoRef.current) return;
    const baseImponible = parseFloat(facturaForm.importe);
    if (isNaN(baseImponible) || baseImponible <= 0) return;
    facturaEnCursoRef.current = true;
    try {
      await crearYCobrarFacturaDirecta(baseImponible);
    } finally {
      facturaEnCursoRef.current = false;
    }
  }

  async function crearYCobrarFacturaDirecta(baseImponible: number) {
    const iva = studio?.ivaPorDefecto ?? 21;
    const total = Math.round(baseImponible * (1 + iva / 100) * 100) / 100;
    setGenerandoFactura(true);
    const res = await crearFacturaDirecta({
      socioId: facturaForm.socioId,
      concepto: facturaForm.concepto.trim(),
      importe: total,
    });
    setGenerandoFactura(false);
    // Tres desenlaces con el recibo YA creado, y solo el cuarto deja reenviar:
    //  · `cobroRegistrado`: el dinero entró y falló el SELLADO fiscal;
    //  · `cobroSinConfirmar`: el recibo existe pero el servidor no confirmó el cobro
    //    (está en «Quién me debe»);
    //  · sin ninguno de los dos, no se creó nada: reenviar el formulario es seguro.
    // En los dos primeros se cierra el formulario: reenviarlo duplicaría el cobro.
    if (!res.ok && !('cobroRegistrado' in res) && !('cobroSinConfirmar' in res)) {
      setStripeToast({ tipo: 'error', msg: `No se ha podido generar la factura: ${res.error}` });
      return;
    }
    setShowFactura(false);
    setFacturaForm({ socioId: '', concepto: '', importe: '' });
    setStripeToast(res.ok
      ? { tipo: 'ok', msg: 'Factura generada.' }
      : 'cobroSinConfirmar' in res
        ? { tipo: 'error', msg: `La factura no se ha generado. ${res.error}` }
        : { tipo: 'error', msg: `Cobro registrado. ${res.error}` });
  }

  // ── Historial state ─────────────────────────────────────────────────────────
  const [histSearch, setHistSearch]   = useState('');
  const [histMes, setHistMes]         = useState('');
  const [histEstado, setHistEstado]   = useState<EstadoRecibo | 'TODOS'>('TODOS');
  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done'>('idle');

  // El formulario de «Nuevo cobro» en blanco. Una sola definición: el estado, el botón que lo abre y
  // el reinicio tras crear tenían cada uno la suya, y dos habían vuelto a la fecha en UTC.
  function formularioNuevoCobro() {
    return {
      socioId: socios[0]?.id ?? '',
      concepto: '',
      importe: '',
      // `hoyEnEstudio`, no `toISOString()`: este campo es una columna `date` y
      // `toISOString` da la fecha en UTC. Un cobro creado a las 00:20 de Madrid
      // nacía vencido ayer — es decir, en rojo desde el primer segundo. Mismo
      // arreglo que ya llevan `marcarCobrado` y el alta de socia.
      fechaVencimiento: hoyEnEstudio(now),
      // Sin marcar por defecto: un cobro suelto es una venta, no una renovación. Solo lo
      // marca quien lo dice, y solo cuenta si la clienta tiene un plan activo que renovar.
      esRenovacion: false,
    };
  }
  // ── Nuevo recibo modal ──────────────────────────────────────────────────────
  const [showNuevoCobro, setShowNuevoCobro] = useState(false);
  const [nuevoForm, setNuevoForm] = useState(formularioNuevoCobro);

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

  // El mes del ESTUDIO, no el del navegador (F0).
  const thisMonth = hoyEnEstudio(now).slice(0, 7);

  const kpis = useMemo(() => {
    // Una sola cuenta para todo (lib/billing/situacion-recibo.ts): lo cobrado es
    // NETO de reembolsos y cuenta en su mes de cobro; lo que se debe y lo que
    // está en el banco van por separado.
    const delMes = resumirRecibos(recibos.filter(r => r.fechaCobro?.slice(0, 7) === thisMonth));
    const total = resumirRecibos(recibos);

    // ⚠️ La lista de abajo («Todo lo que me deben», `estaSinCobrar`) enseña lo
    // que se debe Y lo que está en el banco, cada recibo con su estado. Antes
    // esta tarjeta sumaba las dos cosas como «pendiente»; ahora la cifra grande
    // es solo lo que se debe (sin cobrar, rechazado o devuelto por el banco), y
    // lo enviado al banco va debajo con su nombre: aún no es deuda, puede
    // entrar mañana. Las dos cifras juntas suman exactamente la lista.
    const activasCount = socios.filter(s => s.activo).length;
    // Lo cobrado a CLIENTAS: una venta de mostrador sin clienta no se reparte
    // entre las clientas activas.
    const mediaXSocia = activasCount > 0 ? delMes.ingresadoClientas / activasCount : 0;

    return {
      cobradoMes: delMes.ingresado,
      pendienteTotal: total.porCobrar + total.impagado,
      enCursoTotal: total.enCurso,
      sociosConDeuda: total.nClientasConDeuda,
      mediaXSocia,
    };
  }, [recibos, socios, thisMonth]);

  // Una sola cuenta para los dos sitios que la enseñan (el enlace de arriba y
  // la cabecera del panel): antes cada uno la recalculaba por su lado.
  const activas = suscripciones.filter(s => s.estado === 'ACTIVA').length;

  // ── Cobros tab filtered list ──────────────────────────────────────────────────

  const filtradosCobros = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = recibos.filter(r => {
      if (statusTab === 'SIN_COBRAR') {
        if (!estaSinCobrar(r)) return false;
      } else if (statusTab !== 'TODOS' && r.estado !== statusTab) return false;
      if (q) {
        const name = socioName(r.socioId).toLowerCase();
        if (!r.concepto.toLowerCase().includes(q) && !name.includes(q)) return false;
      }
      // Lo cobrado se filtra por su mes de cobro; lo demás, por el de vencimiento.
      const ym = mesDelRecibo(r);
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

  // Ventas del TPV cobradas sin recibo: no suman en este historial ni en
  // ninguna cifra. Se dice cuántas son en vez de dejar que falten en silencio.
  const ventasSinRecibo = useMemo(() => resumenVentasSinRecibo(ventasPOS), [ventasPOS]);

  const historialAgrupado = useMemo(() => {
    const q = histSearch.trim().toLowerCase();
    const filtered = recibos.filter(r => {
      if (histEstado !== 'TODOS' && r.estado !== histEstado) return false;
      const ym = mesDelRecibo(r);
      if (histMes && ym !== histMes) return false;
      if (q) {
        const name = socioName(r.socioId).toLowerCase();
        if (!r.concepto.toLowerCase().includes(q) && !name.includes(q)) return false;
      }
      return true;
    });

    // ⚠️ Agrupado por el mes de COBRO de lo cobrado (y por el de vencimiento de
    // lo demás), no por vencimiento a secas. La cabecera de cada mes dice
    // «X € cobrado»: con vencimiento, una renovación cobrada en agosto con
    // vencimiento en octubre sumaba en octubre, y este historial daba 206 € de
    // agosto mientras el KPI de arriba, Inicio e Informes daban 424 €.
    const map = new Map<string, typeof recibos>();
    for (const r of filtered) {
      const ym = mesDelRecibo(r);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(r);
    }

    const fechaOrden = (r: (typeof recibos)[number]) => (r.fechaCobro && situacionRecibo(r) !== 'POR_COBRAR' ? r.fechaCobro : r.fechaVencimiento);
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ym, items]) => ({
        ym,
        label: monthLabel(ym),
        items: items.sort((a, b) => fechaOrden(b).localeCompare(fechaOrden(a))),
        // Neto: un reembolso parcial ya no cuenta como cobrado.
        total: items.reduce((s, i) => s + importeIngresado(i), 0),
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
    setMasivoSinConfirmar([]);
    setMasivoYaEstaban(0);
    setMasivoProgress('running');
    // Por el servidor, en lotes y en serie (`marcarCobradoVarios`), y se cuenta
    // lo que DIJO de cada recibo. Antes se llamaba a `marcarCobrado` sin await y
    // sin mirar el resultado: la pantalla decía "N cobros procesados" con la base
    // de datos intacta, con sus facturas y renovaciones pintadas encima.
    //
    // Un cobro con la factura pendiente de sellar cuenta como guardado: el dinero
    // SÍ se registró, y la fila queda con su botón "Sin factura" en Cobrado.
    try {
      const desenlaces = await marcarCobradoVarios(ids, undefined, setMasivoCobrando);
      setMasivoFallidos(desenlaces.filter(d => !esCobroConfirmado(d) && d.resultado !== 'sin_confirmar').map(d => d.reciboId));
      setMasivoSinConfirmar(desenlaces.filter(d => d.resultado === 'sin_confirmar').map(d => d.reciboId));
      setMasivoYaEstaban(desenlaces.filter(d => d.resultado === 'ya_estaba' || d.resultado === 'cobrado_al_releer').length);
      // El dinero entró pero el plan (bono o mensual) no se pudo entregar: no es un fallo
      // del cobro, pero alguien tiene que renovarlo a mano.
      const sinRenovar = desenlaces.filter(d => d.resultado === 'aplicada' && d.renovacionFallida).length;
      if (sinRenovar > 0) {
        setStripeToast({
          tipo: 'error',
          msg: `${sinRenovar} ${sinRenovar === 1 ? 'cobro registrado' : 'cobros registrados'}, pero sin poder renovar el plan: renuévalo a mano desde la ficha de la clienta.`,
        });
      }
    } catch {
      // No debería lanzar (la red ya se trata dentro), pero si lo hiciera no se
      // puede afirmar nada de ninguno.
      setMasivoSinConfirmar(ids);
    } finally {
      setMasivoProgress('done');
      masivoEnCursoRef.current = false;
    }
  }

  const masivoConProblemas = masivoFallidos.length + masivoSinConfirmar.length > 0;
  const masivoGuardados = masivoTotal - masivoFallidos.length - masivoSinConfirmar.length - masivoYaEstaban;

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
    // `cobroRegistrado` distingue el fallo del SELLADO fiscal (el dinero ya se
    // registró como cobrado; solo falló la factura, típicamente por el NIF del
    // ESTUDIO en Configuración → Mi estudio) de un fallo real al marcar el
    // cobro (nada se registró). Solo en el segundo caso no se manda el
    // justificante: sería un email falso. En el primero, la socia SÍ pagó, así
    // que el email debe salir igual — lo único que falta es la factura, y esa
    // fila ya tiene su botón "Sin factura" en la pestaña Cobrado para
    // reintentar el sellado.
    if (!marcado.ok && !('cobroRegistrado' in marcado)) {
      setStripeToast({ tipo: 'error', msg: marcado.error });
      return;
    }
    // Ya estaba cobrado (otra pestaña, otro dispositivo, Stripe): no es un error
    // y no se manda otro justificante por un cobro que no ha hecho este clic.
    if (marcado.ok && marcado.yaEstaba) {
      setStripeToast({ tipo: 'ok', msg: MENSAJE_YA_ESTABA });
      return;
    }
    const r = recibos.find(x => x.id === reciboId);
    const socio = r ? socios.find(s => s.id === r.socioId) : null;
    // Sin esto la fila desaparecía de "Quién me debe" en silencio y parecía
    // que el clic no había hecho nada — el estado sí se actualizaba, solo
    // faltaba decirlo. Y si el sellado falló, el toast lo dice explícito (en
    // vez del `dbError` global, que se autodescarta a los 6s sin relación
    // visible con este clic) y se queda más tiempo en pantalla (ver el efecto
    // de arriba) que un "ok" normal.
    setStripeToast(marcado.ok
      ? { tipo: 'ok', msg: r ? `Cobro registrado: ${formatEuro(r.importe)} de ${socioName(r.socioId)}.` : 'Cobro registrado.' }
      : { tipo: 'error', msg: `${marcado.error} Si no aparece, reintenta desde "Sin factura" en la pestaña Cobrado.` });
    if (socio?.email && r) {
      // Concepto, importe y número de factura los lee el servidor del recibo ya
      // cobrado (y de su factura, si se selló): no los del estado de esta pantalla.
      enviarEmailRecibo({
        to: socio.email,
        toName: `${socio.nombre} ${socio.apellidos}`,
        reciboId,
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

  // El plan activo de la clienta elegida en «Nuevo cobro»: el que se renovaría al cobrarlo si
  // se marca la casilla, y el que el recibo lleva enlazado.
  const susNuevoCobro = useMemo(
    () => suscripciones.find(s => s.socioId === nuevoForm.socioId && s.estado === 'ACTIVA'),
    [suscripciones, nuevoForm.socioId],
  );

  async function crearNuevoCobro() {
    const sus = susNuevoCobro;
    const res = await addRecibo({
      socioId: nuevoForm.socioId,
      suscripcionId: sus?.id ?? null,
      concepto: nuevoForm.concepto.trim(),
      importe: parseFloat(nuevoForm.importe),
      fechaVencimiento: nuevoForm.fechaVencimiento,
      // Al cobrarlo, el servidor solo entrega el plan (recarga el bono o extiende la mensual) si
      // el recibo viene marcado como renovación. Sin plan activo no hay nada que renovar.
      esRenovacion: !!sus && nuevoForm.esRenovacion,
    });
    // No hay canal de toast en este panel; se deja el modal abierto en vez de
    // cerrarlo — antes se cerraba y limpiaba el formulario aunque la escritura
    // hubiera fallado, y la propietaria no tenía forma de saber que el cobro
    // nunca se guardó ni de reintentarlo sin rellenar todo otra vez.
    if (!res.ok) { onToast(res.error); return; }
    setShowNuevoCobro(false);
    setNuevoForm(formularioNuevoCobro());
  }

  function exportCSV() {
    setExportState('loading');
    const header = ['Concepto', 'Clienta', 'Importe', 'Devuelto', 'Estado', 'Vencimiento', 'Cobrado el'];
    const rows = filtradosCobros.map(r => [
      `"${r.concepto.replace(/"/g, '""')}"`,
      `"${socioName(r.socioId).replace(/"/g, '""')}"`,
      r.importe.toFixed(2),
      (r.importeDevuelto ?? 0).toFixed(2),
      badgeDe(r).label,
      r.fechaVencimiento,
      r.fechaCobro ?? '',
    ]);
    const csv = [header, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagos-${hoyEnEstudio(now)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setExportState('done'), 800);
    setTimeout(() => setExportState('idle'), 3000);
  }

  // ── Tab counts ────────────────────────────────────────────────────────────

  function tabCount(value: EstadoRecibo | 'TODOS' | 'SIN_COBRAR') {
    if (value === 'TODOS') return recibos.length;
    if (value === 'SIN_COBRAR') return recibos.filter(estaSinCobrar).length;
    return recibos.filter(r => r.estado === value).length;
  }

  // Mismo criterio que la cifra que acompaña: lo que se DEBE (sin el dinero
  // que está en el banco, que va en su propia línea). Si el importe suma los
  // rechazados, el recuento tiene que sumarlos también, o la tarjeta se
  // contradice consigo misma («178 € en 1 recibo»).
  const pendientesCount = recibos.filter(r => {
    const s = situacionRecibo(r);
    return s === 'POR_COBRAR' || s === 'IMPAGADO';
  }).length;

  // ── Acciones de un recibo ─────────────────────────────────────────────────
  // Las mismas en las dos maquetas: pequeñas en la fila del ordenador, y a
  // tamaño de dedo (44 px y con su nombre escrito) en el detalle que se abre al
  // tocar la fila en un móvil o un iPad. Con el dedo no llevan `title`: la fila
  // del ordenador ya los tiene, y dos botones con el mismo título son dos.
  function accionesRecibo(r: (typeof recibos)[number], factura: (typeof facturas)[number] | undefined, tactil: boolean) {
    const chip = tactil
      ? 'flex min-h-11 items-center gap-1.5 px-4 rounded-xl text-sm font-bold transition-colors'
      : 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors';
    const icono = tactil ? 15 : 12;
    const rojo = tactil
      ? 'flex min-h-11 items-center gap-1.5 px-4 rounded-xl text-sm font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors'
      : 'w-8 h-8 flex items-center justify-center rounded-xl hover:bg-destructive/10 transition-colors';
    const titulo = (t: string) => (tactil ? undefined : t);
    return (
      <>
        {/* FALLIDO se cobra exactamente igual que PENDIENTE — no es un
            estado ciego. El dunning ya agotó sus 3 reintentos
            automáticos (lib/billing/dunning.ts), pero
            cobrarReciboOffSession (lib/billing/stripe-cobros.ts)
            acepta explícitamente 'PENDIENTE' o 'FALLIDO' como
            "recuperación manual tras agotar el dunning": el backend
            siempre soportó reintentar un FALLIDO a mano, solo que
            esta fila nunca ofrecía ningún botón para hacerlo — con
            el estado en rojo "No se pudo cobrar" y ni un solo botón
            visible, "Cobrar online" pulsado aquí no hacía nada
            porque el botón, sencillamente, no existía. */}
        {/* DEVUELTO entra aquí también: el banco devolvió el recibo, o
            sea que el dinero NO está y sigue siendo deuda. Sin este
            botón, un recibo devuelto no tenía NINGUNA vía de UI para
            resolverse — y con el bloqueo por impago encendido dejaba a
            la socia sin poder reservar indefinidamente.
            ⚠️ Pero solo el devuelto POR EL BANCO. Un DEVUELTO también puede
            ser un REEMBOLSO del estudio (Stripe o devolución en la caja), y
            ofrecer «Cobrar» ahí cobraba otra vez un dinero que se acababa de
            devolver. Se decide por la situación, no por el estado. */}
        {(situacionRecibo(r) === 'POR_COBRAR' || situacionRecibo(r) === 'IMPAGADO') && (
          <>
            <button
              onClick={() => setCobrandoRecibo(r.id)}
              className={cn(chip, 'bg-success/10 text-success hover:bg-[#A7F3D0]')}
              title={titulo('Marcar cobrado (elige cómo) y enviar email')}
            >
              <CheckCircle2 size={icono} />
              Cobrar
            </button>
            <button
              onClick={() => cobrarOnline(r.id)}
              disabled={stripeLoading === r.id}
              className={cn(chip, 'bg-brand/10 text-brand-medio hover:bg-info/10 disabled:opacity-60')}
              title={titulo('Reintentar el cobro con la tarjeta o SEPA que ya tiene guardado la socia')}
            >
              {stripeLoading === r.id
                ? <Loader2 size={icono} className="animate-spin" />
                : <CreditCard size={icono} />}
              {tactil ? 'Cobrar online' : 'Online'}
            </button>
            <button
              onClick={async () => {
                const res = await marcarDevuelto(r.id);
                if (!res.ok) onToast(res.error);
              }}
              className={rojo}
              title={titulo('Marcar devuelto')}
            >
              <XCircle size={tactil ? 15 : 14} className="text-destructive" />
              {tactil && 'Marcar devuelto'}
            </button>
          </>
        )}
        {r.estado === 'COBRADO' && (
          <>
            {/* C-2 paso 1 (59ª auditoría): antes este botón se
                ocultaba si el método (p.ej. EFECTIVO) no factura
                solo — razonable para el aviso de Sentry, pero aquí
                dejaba 3 cobros en efectivo por 255 € que la
                propietaria no podía ver ni resolver desde ningún
                sitio del panel. `emiteFacturaAutomatica` decide
                qué se FACTURA SOLA al cobrar, no qué se enseña
                aquí: un cobro COBRADO sin factura siempre se
                puede sellar a mano, sea cual sea su método. El
                botón llama a `reintentarSelladoFactura` (nunca a
                `crearFacturaDirecta`, que crearía un recibo
                nuevo y duplicaría el cobro — I-11). */}
            {/* Con el estudio sin facturas desde Tentare, un cobro sin factura
                es lo normal: ni chip rojo ni «reintentar». */}
            {factura ? (
              <Link
                href={`/facturas?ver=${factura.id}`}
                className={cn(chip, 'bg-background text-muted-foreground hover:bg-border')}
                title={titulo('Ver factura')}
              >
                <FileText size={icono} />
                {factura.numeroCompleto}
              </Link>
            ) : !emite ? null : (
              <button
                onClick={() => handleReintentarFactura(r.id)}
                disabled={reintentandoFactura === r.id}
                className={cn(chip, 'bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-60')}
                title={titulo('El cobro se registró pero la factura no llegó a sellarse — reintentar')}
              >
                {reintentandoFactura === r.id
                  ? <Loader2 size={icono} className="animate-spin" />
                  : <RefreshCw size={icono} />}
                Sin factura
              </button>
            )}
            <button
              onClick={async () => {
                const res = await marcarDevuelto(r.id);
                if (!res.ok) onToast(res.error);
              }}
              className={rojo}
              title={titulo('Devolver')}
            >
              <XCircle size={tactil ? 15 : 14} className="text-destructive" />
              {tactil && 'Devolver'}
            </button>
          </>
        )}
        {r.estado === 'DEVUELTO' && situacionRecibo(r) === 'IMPAGADO' && (
          <button
            onClick={async () => {
              const res = await reintentar(r.id);
              if (!res.ok) onToast(res.error);
            }}
            className={cn(chip, 'bg-info/10 text-brand-medio hover:bg-info/10')}
          >
            <RefreshCw size={icono} />
            Reintentar
          </button>
        )}
        {/* Un recibo cobrado, devuelto o en curso no se elimina (se devuelve), ni uno con factura. */}
        {puedeEliminarRecibo(r, { tieneFactura: !!factura }).ok && (
          <button
            onClick={() => setConfirmEliminar(r.id)}
            className={rojo}
            title={titulo('Eliminar')}
          >
            <Trash2 size={tactil ? 15 : 14} className="text-destructive" />
            {tactil && 'Eliminar'}
          </button>
        )}
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background space-y-6 pb-10">

      {/* ── Stripe toast ─────────────────────────────────────────────────────── */}
      {/* En portal, igual que el aviso de tarjeta de abajo: `.panel-page-in` deja
          un transform en la página y un `fixed` dentro se ancla a ella, no a la
          pantalla. En un móvil, con la lista bajada, el aviso salía arriba del
          todo de la página, fuera de la vista. */}
      {stripeToast && createPortal(
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold transition-all',
          stripeToast.tipo === 'ok'
            ? 'bg-success/10 border-[#A7F3D0] text-success'
            : 'bg-destructive/10 border-[#FECACA] text-destructive'
        )}>
          {stripeToast.tipo === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {stripeToast.msg}
        </div>,
        anfitrionPortal(),
      )}

      {/* Sin método guardado: la salida real, no un error. Se explica en una
          frase POR QUÉ no se puede cobrar y qué hace el enlace, porque la
          propietaria se lo va a reenviar a una clienta y tiene que poder
          contárselo. */}
      {pedirTarjeta && createPortal(
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
        </div>,
        anfitrionPortal(),
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
            {acciones}
            {emite && (
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
            )}
            <button
              onClick={() => {
                setNuevoForm(formularioNuevoCobro());
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
          <p className="text-xs text-muted-foreground mt-1">{monthLabel(thisMonth)} · con IVA, ya restado lo devuelto</p>
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
          <p className="text-xs text-muted-foreground mt-1">{pendientesCount} recibo{pendientesCount !== 1 ? 's' : ''} sin cobrar</p>
          {kpis.enCursoTotal > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              y <CifraPrivada inline className="font-semibold text-foreground">{formatEuro(kpis.enCursoTotal)}</CifraPrivada> enviados al banco, sin confirmar
            </p>
          )}
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
          <p className="text-xs text-muted-foreground mt-1">clienta{kpis.sociosConDeuda !== 1 ? 's' : ''} con recibos sin cobrar</p>
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
          <p className="text-xs text-muted-foreground mt-1">lo cobrado a clientas este mes repartido entre todas las clientas activas</p>
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
              {/* En singular cuando hay una: «Ver las 1 suscripciones activas» es
                  lo que salía con un solo plan vivo, que es justo el caso de un
                  estudio recién empezado — la primera pantalla de cobros que ve
                  nadie. */}
              {activas === 1 ? 'Ver la suscripción activa' : `Ver las ${activas} suscripciones activas`}
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
                  const badge    = badgeDe(r);
                  const initials = socioInitials(r.socioId);
                  const name     = socioName(r.socioId);
                  const expanded = expandedId === r.id;
                  const sus      = suscripciones.find(s => s.id === r.suscripcionId);
                  const factura  = facturas.find(f => f.reciboId === r.id);

                  return (
                    <div key={r.id}>
                      {/* En el móvil la fila es una rejilla de dos líneas —nombre e
                          importe arriba, concepto y estado debajo— hecha con los
                          MISMOS elementos que la de escritorio: `contents` los suelta
                          en la rejilla y desde `sm` vuelven a su sitio. Nada se pinta
                          dos veces, así que un texto sigue siendo uno solo.

                          Antes, en un teléfono, solo cabían las iniciales, el importe
                          y el estado: los botones de la fila, invisibles hasta pasar
                          el ratón, seguían ocupando su ancho y dejaban el nombre en
                          0 px. Y seguían ahí aunque no se vieran: un toque en la
                          mitad derecha podía caer en «Marcar devuelto». Con el dedo,
                          las acciones van en el detalle que se abre al tocar la fila. */}
                      <div
                        data-recibo={r.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 px-4 py-4 sm:flex sm:gap-4 sm:px-5 hover:bg-muted transition-colors group cursor-pointer"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        {/* Avatar */}
                        <Link
                          href={`/clientas/${r.socioId}`}
                          onClick={e => e.stopPropagation()}
                          className="col-start-1 row-start-1 row-span-2 shrink-0"
                        >
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-info/10 text-brand-medio">
                            {initials}
                          </div>
                        </Link>

                        {/* Info */}
                        <div className="contents sm:block sm:flex-1 sm:min-w-0">
                          <p className="col-start-2 row-start-2 min-w-0 truncate text-xs text-muted-foreground sm:text-sm sm:font-semibold sm:text-foreground">{r.concepto}</p>
                          <p className="col-start-2 row-start-1 min-w-0 truncate text-sm font-semibold text-foreground sm:mt-0.5 sm:text-xs sm:font-normal sm:text-muted-foreground">
                            <Link
                              href={`/clientas/${r.socioId}`}
                              onClick={e => e.stopPropagation()}
                              // Con el dedo el nombre es parte de la fila: tocarlo la
                              // abre. La ficha está a un toque dentro del detalle.
                              className="pointer-events-none sm:pointer-events-auto hover:text-brand-medio hover:underline transition-colors"
                            >
                              {name}
                            </Link>
                            <span className="hidden sm:inline">
                              {' · '}
                              <Calendar size={11} className="inline -mt-0.5" />
                              {' '}Vence {fecha(r.fechaVencimiento)}
                            </span>
                          </p>
                        </div>

                        {/* Amount + badge */}
                        <div className="contents sm:block sm:text-right sm:shrink-0 sm:mr-2">
                          <CifraPrivada className="col-start-3 row-start-1 justify-self-end text-sm font-extrabold text-foreground">
                            {formatEuro(r.importe)}
                          </CifraPrivada>
                          <span
                            className="col-start-3 row-start-2 justify-self-end whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: badge.bg, color: badge.text }}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Acciones en la fila: solo desde `lg`, que es donde caben. Con
                            ratón aparecen al pasar por encima; con el dedo (un iPad en
                            horizontal) no hay «pasar por encima», así que se ven siempre. */}
                        <div
                          className="hidden lg:flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          {accionesRecibo(r, factura, false)}
                        </div>

                        {/* Chevron */}
                        <div className="col-start-4 row-start-1 row-span-2 shrink-0 text-muted-foreground">
                          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {expanded && (
                        <div className="px-4 sm:px-5 pb-5 bg-muted border-t border-border">
                          {/* Por debajo de `lg` las acciones de la fila no se pintan: van
                              aquí, a tamaño de dedo, con la ficha de la alumna al lado. */}
                          <div className="lg:hidden flex flex-wrap gap-2 pt-4" onClick={e => e.stopPropagation()}>
                            {accionesRecibo(r, factura, true)}
                            {r.socioId && (
                              <Link
                                href={`/clientas/${r.socioId}`}
                                className="flex min-h-11 items-center gap-1.5 px-4 rounded-xl text-sm font-bold border border-border bg-card text-foreground hover:bg-background transition-colors"
                              >
                                Ver su ficha
                              </Link>
                            )}
                          </div>
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
              {activas === 1 ? '1 suscripción activa' : `${activas} suscripciones activas`}
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
            <>
            {/* Auditoría integral 2026-08-21 (UX, hallazgo P1): esta tabla era
                un grid de 6 columnas con `min-w-[700px]` forzado dentro de
                `overflow-x-auto` — en móvil obligaba a hacer scroll horizontal
                para ver el nombre de la clienta o el próximo cobro. Mismo
                módulo (Cobros) que `panel-facturas.tsx` ya resuelve bien con
                un `lg:hidden`/`hidden lg:block` — se replica aquí ese mismo
                patrón, sin inventar uno nuevo. Las ACCIONES ya no dependen de
                hover (`opacity-0 group-hover:opacity-100`, inalcanzable en
                móvil sin ratón): visibles siempre en ambas vistas. */}
            <div className="lg:hidden divide-y divide-background">
              {suscripciones
                .filter(s => s.estado === 'ACTIVA')
                .map(sus => {
                  const socio = socios.find(s => s.id === sus.socioId);
                  const plan  = planesTarifa.find(p => p.id === sus.planId);
                  const initials = socioInitials(sus.socioId);
                  const nextCobro = sus.fechaFin
                    ? new Date(sus.fechaFin)
                    : (() => { const d = new Date(sus.fechaInicio); d.setMonth(d.getMonth() + 1); return d; })();

                  return (
                    <div key={sus.id} className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-info/10 text-brand-medio shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/clientas/${sus.socioId}`}
                            className="text-sm font-semibold text-foreground truncate hover:text-brand-medio hover:underline block">
                            {socio ? `${socio.nombre} ${socio.apellidos}` : 'Clienta eliminada'}
                          </Link>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{plan?.nombre ?? '—'}</p>
                        </div>
                        <CifraPrivada className="text-sm font-bold text-foreground shrink-0">
                          {plan ? formatEuro(plan.precio) : '—'}
                        </CifraPrivada>
                      </div>
                      <div className="flex items-center justify-between mt-2.5 pl-11">
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">Próximo: {fecha(nextCobro.toISOString())}</p>
                          {sus.sesionesRestantes != null ? (
                            <span className={cn(
                              'text-xs font-bold px-2 py-0.5 rounded-full',
                              sus.sesionesRestantes <= 2 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                            )}>
                              {sus.sesionesRestantes} ses.
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Ilimitadas</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2.5 pl-11">
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

            <div className="overflow-x-auto hidden lg:block">
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
            </>
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

          {ventasSinRecibo.n > 0 && (
            <p role="note" className="text-xs text-muted-foreground m-0 px-1">
              {ventasSinRecibo.n === 1 ? 'Una venta' : `${ventasSinRecibo.n} ventas`} de la caja
              {' '}(<CifraPrivada inline className="font-semibold text-foreground">{formatEuro(ventasSinRecibo.total)}</CifraPrivada>)
              {' '}{ventasSinRecibo.n === 1 ? 'se cobró sin recibo y no cuenta' : 'se cobraron sin recibo y no cuentan'} en estas cifras
              {' '}ni en Inicio o Informes: no {ventasSinRecibo.n === 1 ? 'la sumamos' : 'las sumamos'} para no inventar un cobro que nadie registró.
            </p>
          )}

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
                    const badge = badgeDe(r);
                    // El cobro se registró pero la factura no llegó a sellarse
                    // (NIF del estudio inválido/vacío en el momento del cobro,
                    // red...) — "Lo que he cobrado" es el sitio natural donde
                    // alguien busca esto, y hasta ahora esta vista no ofrecía
                    // NINGÚN botón para arreglarlo (solo existía, oculto tras
                    // hover, en la vista "Quién me debe" filtrada por estado).
                    // SIEMPRE visible, sin gating de hover: es la recuperación
                    // de un fallo, no una acción rutinaria que deba esconderse.
                    // C-2 paso 1 (59ª auditoría): sin gating por método tampoco
                    // — `emiteFacturaAutomatica` decide qué se factura SOLA al
                    // cobrar, no qué se puede sellar a mano después. Antes esto
                    // ocultaba los cobros en efectivo sin factura, que son
                    // justo los que la propietaria no podía ver en ningún otro
                    // sitio del panel.
                    const sinFactura = r.estado === 'COBRADO'
                      && !facturas.some(f => f.reciboId === r.id);
                    return (
                      // Móvil: misma rejilla de dos líneas que «Quién me debe»
                      // (nombre e importe arriba, concepto y estado debajo) y
                      // «Sin factura» en una tercera, a tamaño de dedo. Antes la
                      // columna del nombre quedaba en 0 px en cuanto la fila
                      // llevaba ese botón.
                      <div key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 sm:flex sm:gap-4 sm:px-5">
                        <div className="col-start-1 row-start-1 row-span-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-info/10 text-brand-medio shrink-0">
                          {socioInitials(r.socioId)}
                        </div>
                        <div className="contents sm:block sm:flex-1 sm:min-w-0">
                          <p className="col-start-2 row-start-2 min-w-0 truncate text-xs text-muted-foreground sm:text-sm sm:font-semibold sm:text-foreground">{r.concepto}</p>
                          <p className="col-start-2 row-start-1 min-w-0 truncate text-sm font-semibold text-foreground sm:text-xs sm:font-normal sm:text-muted-foreground">{socioName(r.socioId)}</p>
                        </div>
                        <CifraPrivada className="col-start-3 row-start-1 justify-self-end text-sm font-bold text-foreground shrink-0">
                          {formatEuro(r.importe)}
                        </CifraPrivada>
                        <span
                          className="col-start-3 row-start-2 justify-self-end whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {badge.label}
                        </span>
                        <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                          {r.fechaCobro ? fecha(r.fechaCobro) : fecha(r.fechaVencimiento)}
                        </p>
                        {sinFactura && (
                          <button
                            onClick={() => handleReintentarFactura(r.id)}
                            disabled={reintentandoFactura === r.id}
                            className="col-start-2 col-span-2 row-start-3 justify-self-start mt-1 sm:mt-0 min-h-11 pointer-fine:min-h-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-60 shrink-0"
                            title="El cobro se registró pero la factura no llegó a sellarse — reintentar"
                          >
                            {reintentandoFactura === r.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <RefreshCw size={12} />}
                            Sin factura
                          </button>
                        )}
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
        {/* `sm:max-w-lg` y no `max-w-lg`: el base de DialogContent ya deja 1rem
            de margen a cada lado en el móvil, y un `max-w-lg` a secas lo pisaba
            (tailwind-merge se queda con el último) — el diálogo iba de borde a
            borde de la pantalla. */}
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
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
                masivoConProblemas ? 'bg-warning/10' : 'bg-success/10',
              )}>
                {masivoConProblemas
                  ? <AlertTriangle size={32} className="text-warning" />
                  : <CheckCheck size={32} className="text-success" />}
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">
                  {masivoGuardados} cobro{masivoGuardados !== 1 ? 's' : ''} guardado{masivoGuardados !== 1 ? 's' : ''}
                </p>
                {masivoYaEstaban > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {masivoYaEstaban} ya {masivoYaEstaban === 1 ? 'estaba cobrado' : 'estaban cobrados'}.
                  </p>
                )}
                {masivoSinConfirmar.length > 0 && (
                  <p className="text-sm text-warning mt-1 max-w-sm">
                    {masivoSinConfirmar.length} no se {masivoSinConfirmar.length === 1 ? 'ha' : 'han'} podido confirmar.
                    Comprueba si {masivoSinConfirmar.length === 1 ? 'figura cobrado' : 'figuran cobrados'} antes de volver a intentarlo.
                  </p>
                )}
                {masivoFallidos.length > 0 ? (
                  <p className="text-sm text-warning mt-1 max-w-sm">
                    {masivoFallidos.length} no se {masivoFallidos.length === 1 ? 'ha podido guardar' : 'han podido guardar'} y {masivoFallidos.length === 1 ? 'sigue' : 'siguen'} como pendiente{masivoFallidos.length !== 1 ? 's' : ''}.
                    No se {masivoFallidos.length === 1 ? 'ha emitido su factura' : 'han emitido sus facturas'} ni se {masivoFallidos.length === 1 ? 'ha renovado su bono' : 'han renovado sus bonos'}. Vuelve a intentarlo.
                  </p>
                ) : !masivoConProblemas && (
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
      <DialogoMetodoCobro
        abierto={!!cobrandoRecibo}
        detalle={cobrandoRecibo && (() => {
          const r = recibos.find(x => x.id === cobrandoRecibo);
          return r ? <>{socioName(r.socioId)} — <span className="font-semibold text-foreground">{formatEuro(r.importe)}</span></> : null;
        })()}
        onCerrar={() => setCobrandoRecibo(null)}
        onElegir={m => { const id = cobrandoRecibo; setCobrandoRecibo(null); if (id) cobrarYEmail(id, m); }}
      />

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
                // Otra clienta, otro plan: la casilla no se arrastra de una a otra.
                onChange={id => setNuevoForm(f => ({ ...f, socioId: id, esRenovacion: false }))}
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
            {susNuevoCobro && (
              <CasillaRenovacion
                planNombre={planName(susNuevoCobro.planId)}
                marcada={nuevoForm.esRenovacion}
                onCambio={esRenovacion => setNuevoForm(f => ({ ...f, esRenovacion }))}
              />
            )}
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
      <Dialog open={!!confirmEliminar} onOpenChange={open => { if (!open && !eliminando) cerrarEliminar(); }}>
        <DialogContent className="max-w-sm" data-testid="dialogo-eliminar-recibo">
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-destructive/10">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Eliminar recibo</h3>
                <p className="text-sm text-muted-foreground">
                  No se puede deshacer. Se guarda quién lo elimina, cuándo y por qué.
                </p>
              </div>
            </div>
            <fieldset className="space-y-1.5" disabled={eliminando}>
              <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                ¿Por qué lo eliminas?
              </legend>
              {MOTIVOS_ELIMINAR_RECIBO.map(m => (
                <label key={m.codigo} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="motivo-eliminar-recibo"
                    value={m.codigo}
                    checked={motivoEliminar === m.codigo}
                    onChange={() => setMotivoEliminar(m.codigo)}
                  />
                  {m.etiqueta}
                </label>
              ))}
            </fieldset>
            {errorEliminar && (
              <p role="alert" data-testid="error-eliminar-recibo" className="text-[13px] text-destructive">
                {errorEliminar}
              </p>
            )}
            <div className="flex gap-3 w-full">
              <button
                onClick={cerrarEliminar}
                disabled={eliminando}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-background transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                data-testid="confirmar-eliminar-recibo"
                onClick={confirmarEliminar}
                disabled={!motivoEliminar || eliminando}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-destructive hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {eliminando ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
