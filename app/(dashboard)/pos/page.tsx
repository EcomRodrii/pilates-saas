'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingCart, X, Plus, Minus, Receipt, CheckCircle2, Search, Printer, ChevronRight, AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn, formatEuro } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { terminalCobrar, terminalEstadoCobro, terminalRegistrarLector, terminalEstadoLector, terminalReconciliacionesPendientes, terminalMarcarReconciliado, posBizumCheckout, type ReconciliacionPendiente } from '@/lib/api-client';
import { qrSvgMarkup } from '@/lib/qr-svg';
import type { ProductoPOS, VentaPOS, MetodoPago, CodigoDescuento } from '@/lib/types';
import { buscarCodigo, validarCodigoCanjeable, calcularDescuento } from '@/lib/codigos-descuento';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';

type CartItem = {
  producto: ProductoPOS;
  cantidad: number;
};

type TabCategoria = 'Todas' | 'SESION' | 'PACK' | 'PRODUCTO' | 'OTRO';

const TABS: { label: string; value: TabCategoria }[] = [
  { label: 'Todas', value: 'Todas' },
  { label: 'Sesión', value: 'SESION' },
  { label: 'Pack', value: 'PACK' },
  { label: 'Producto', value: 'PRODUCTO' },
  { label: 'Otro', value: 'OTRO' },
];
// Color por categoría para las fichas del catálogo (acento + etiqueta).
const CAT_STYLE: Record<string, { accent: string; tagBg: string; tagText: string }> = {
  SESION:   { accent: '#1D9E75', tagBg: '#E1F5EE', tagText: '#0F6E56' },
  PACK:     { accent: '#7F77DD', tagBg: '#EEEDFE', tagText: '#534AB7' },
  PRODUCTO: { accent: '#EF9F27', tagBg: '#FAEEDA', tagText: '#854F0B' },
  OTRO:     { accent: '#888780', tagBg: '#F1EFE8', tagText: '#5F5E5A' },
};
const catStyle = (c: string) => CAT_STYLE[c] ?? CAT_STYLE.OTRO;

const METODOS: { label: string; value: MetodoPago }[] = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Tarjeta', value: 'TARJETA' },
  { label: 'Bizum', value: 'BIZUM' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Datáfono', value: 'DATAFONO' },
];

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  DATAFONO: 'Datáfono',
  BIZUM: 'Bizum',
  TRANSFERENCIA: 'Transferencia',
};

// ─── Date helpers ──────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateLabel(date: Date, today: Date): string {
  if (isSameDay(date, today)) return 'Hoy';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Ayer';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTimeOrDate(date: Date, today: Date): string {
  if (isSameDay(date, today)) {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ─── Cerrar Caja Modal ─────────────────────────────────────────────────────

type CerrarCajaModalProps = {
  ventasHoy: VentaPOS[];
  onClose: () => void;
};

function CerrarCajaModal({ ventasHoy, onClose }: CerrarCajaModalProps) {
  const [showPrintTooltip, setShowPrintTooltip] = useState(false);

  const hoy = new Date();
  const fechaLabel = hoy.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Breakdown by payment method
  const breakdown = METODOS.map(m => {
    const rows = ventasHoy.filter(v => v.metodoPago === m.value);
    return {
      label: m.label,
      value: m.value,
      count: rows.length,
      total: rows.reduce((sum, v) => sum + v.total, 0),
    };
  });

  const grandTotal = ventasHoy.reduce((sum, v) => sum + v.total, 0);

  return (
    <DashboardSheet
      open
      onClose={onClose}
      label="Resumen de caja"
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      sheetClassName="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
    >
      <>
        {/* Modal header */}
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-foreground">Resumen de caja</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5 capitalize">{fechaLabel}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="px-6 py-4 bg-background border-b border-border">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-xl px-4 py-3 border border-border">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Transacciones</p>
              <p className="text-[22px] font-bold text-foreground">{ventasHoy.length}</p>
            </div>
            <div className="bg-card rounded-xl px-4 py-3 border border-border">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Total recaudado</p>
              <p className="text-[22px] font-bold text-success">{formatEuro(grandTotal)}</p>
            </div>
          </div>
        </div>

        {/* Breakdown table */}
        <div className="px-6 py-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left pb-2 font-medium">Método de pago</th>
                <th className="text-center pb-2 font-medium">Operaciones</th>
                <th className="text-right pb-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map(row => (
                <tr key={row.value} className={cn('border-b border-border last:border-0', row.count === 0 && 'opacity-40')}>
                  <td className="py-2.5 text-foreground font-medium">{row.label}</td>
                  <td className="py-2.5 text-center text-muted-foreground">{row.count}</td>
                  <td className="py-2.5 text-right font-semibold text-foreground">
                    {formatEuro(row.total)}
                  </td>
                </tr>
              ))}
              {/* Grand total */}
              <tr className="border-t-2 border-foreground">
                <td className="pt-3 pb-1 font-bold text-foreground">Total caja</td>
                <td className="pt-3 pb-1 text-center font-bold text-foreground">{ventasHoy.length}</td>
                <td className="pt-3 pb-1 text-right font-bold text-[16px] text-success">
                  {formatEuro(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-border flex gap-2">
          <div className="relative">
            <button
              disabled
              onMouseEnter={() => setShowPrintTooltip(true)}
              onMouseLeave={() => setShowPrintTooltip(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-[13px] font-medium text-muted-foreground cursor-not-allowed"
            >
              <Printer size={14} />
              Imprimir
            </button>
            {showPrintTooltip && (
              <div className="absolute bottom-full left-0 mb-2 px-2.5 py-1.5 bg-brand text-brand-foreground text-[11px] rounded-lg whitespace-nowrap">
                Próximamente
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-brand text-brand-foreground text-[13px] font-semibold hover:brightness-95 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </>
    </DashboardSheet>
  );
}

// ─── Success overlay ───────────────────────────────────────────────────────

type SuccessOverlayProps = {
  total: number;
  metodoPago: MetodoPago;
};

function SuccessOverlay({ total, metodoPago }: SuccessOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-center bg-card rounded-lg animate-in fade-in duration-200">
      <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in-50 duration-300">
        <CheckCircle2 size={36} className="text-success" />
      </div>
      <p className="text-[16px] font-semibold text-foreground">¡Cobrado!</p>
      <p className="text-[13px] text-muted-foreground">
        {formatEuro(total)} · {METODO_LABEL[metodoPago] ?? metodoPago}
      </p>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function POSPage() {
  const { socios, productosPOS, ventasPOS, addVentaPOS, studio, codigosDescuento, registrarUsoCodigo } = useStudio();

  // Estado del cobro con datáfono (Stripe Terminal) y del emparejamiento.
  const [terminal, setTerminal] = useState<{ fase: 'idle' | 'esperando' | 'error'; mensaje?: string }>({ fase: 'idle' });
  const [lectorEmparejado, setLectorEmparejado] = useState<boolean | null>(null);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<TabCategoria>('Todas');
  const [busqueda, setBusqueda] = useState('');
  const [clienteId, setClienteId] = useState<string>('');
  const [descuento, setDescuento] = useState('');
  const [descuentoTipo, setDescuentoTipo] = useState<'€' | '%'>('€');
  // Canje de código de descuento (p.ej. el de reactivación que envía el Centro
  // de Control). Se guarda el código entero para recalcular el importe en vivo.
  const [codigoTexto, setCodigoTexto] = useState('');
  const [codigoAplicado, setCodigoAplicado] = useState<CodigoDescuento | null>(null);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSale, setLastSale] = useState<{ total: number; metodoPago: MetodoPago } | null>(null);
  // PR-5 — Bizum presencial: URL del Checkout que el cliente abre/escanea.
  const [bizum, setBizum] = useState<{ url: string; total: number } | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [showCerrarCaja, setShowCerrarCaja] = useState(false);
  // "Ventas recientes" colapsada por defecto: el catálogo + ticket (lo que se
  // usa el 95% del tiempo cobrando) se queda con toda la altura.
  const [showVentas, setShowVentas] = useState(false);
  const [posView, setPosView] = useState<'catalog' | 'cart'>('catalog');

  // A-14 (backstop): cobros por datáfono confirmados en Stripe sin venta
  // registrada (el POS se cerró tras el tap). El webhook los deja marcados;
  // aquí se listan para completarlos con un clic.
  const [reconciliaciones, setReconciliaciones] = useState<ReconciliacionPendiente[]>([]);
  const refrescarReconciliaciones = useCallback(async () => {
    setReconciliaciones(await terminalReconciliacionesPendientes());
  }, []);
  useEffect(() => { refrescarReconciliaciones(); }, [refrescarReconciliaciones]);

  const today = new Date();

  // ─── Daily stats ──────────────────────────────────────────────────────────

  const ventasHoy = ventasPOS.filter(v => isSameDay(new Date(v.realizadaEn), today));
  const totalHoy = ventasHoy.reduce((sum, v) => sum + v.total, 0);
  const efectivoHoy = ventasHoy
    .filter(v => v.metodoPago === 'EFECTIVO')
    .reduce((sum, v) => sum + v.total, 0);
  // Datáfono es un cobro con tarjeta → cuenta en "Tarjeta" (antes se quedaba
  // fuera y la cabecera mostraba Tarjeta=0 aunque se cobrara por datáfono).
  const tarjetaHoy = ventasHoy
    .filter(v => v.metodoPago === 'TARJETA' || v.metodoPago === 'DATAFONO')
    .reduce((sum, v) => sum + v.total, 0);

  // ─── Carrito helpers ──────────────────────────────────────────────────────

  function addToCart(producto: ProductoPOS) {
    setCarrito(prev => {
      const existing = prev.find(i => i.producto.id === producto.id);
      if (existing) {
        return prev.map(i =>
          i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCarrito(prev =>
      prev
        .map(i => i.producto.id === id ? { ...i, cantidad: i.cantidad + delta } : i)
        .filter(i => i.cantidad > 0)
    );
  }

  function removeFromCart(id: string) {
    setCarrito(prev => prev.filter(i => i.producto.id !== id));
  }

  function clearCart() {
    setCarrito([]);
    setDescuento('');
    setClienteId('');
    setBusquedaCliente('');
    setMetodoPago('EFECTIVO');
    setCodigoTexto('');
    setCodigoAplicado(null);
    setCodigoError(null);
  }

  // ─── Totales ──────────────────────────────────────────────────────────────

  const subtotal = carrito.reduce((sum, i) => sum + i.producto.precio * i.cantidad, 0);
  // Clamp a ≥0: `min=0` del input no impide teclear/pegar un negativo, que
  // convertiría el "descuento" en un recargo (cobrar de más).
  const descuentoNum = Math.max(0, parseFloat(descuento) || 0);
  const descuentoManual = descuentoTipo === '%'
    ? (subtotal * descuentoNum) / 100
    : descuentoNum;
  // El descuento del código se recalcula sobre el subtotal ACTUAL: si el carrito
  // cambia tras aplicarlo, el importe se ajusta solo (nunca queda obsoleto).
  const descuentoCodigo = codigoAplicado ? calcularDescuento(codigoAplicado, subtotal) : 0;
  const descuentoAmt = Math.min(subtotal, descuentoManual + descuentoCodigo);
  const total = Math.max(0, subtotal - descuentoAmt);

  // Aplica un código escrito en el mostrador: lo busca en el catálogo del estudio
  // y valida vigencia/usos/mínimo contra el subtotal actual (lógica pura testeada).
  function aplicarCodigo() {
    const encontrado = buscarCodigo(codigosDescuento, codigoTexto);
    const r = validarCodigoCanjeable(encontrado, { hoyISO: new Date().toISOString(), subtotal });
    if (!r.ok) { setCodigoAplicado(null); setCodigoError(r.motivo); return; }
    setCodigoAplicado(encontrado);
    setCodigoError(null);
  }

  function quitarCodigo() {
    setCodigoAplicado(null);
    setCodigoTexto('');
    setCodigoError(null);
  }

  // ─── Cobrar ───────────────────────────────────────────────────────────────

  // Registra la venta en el SaaS (genera recibo + factura sellada) y muestra el
  // éxito. Es el paso común tras cualquier método de pago.
  function finalizarVenta() {
    addVentaPOS({
      socioId: clienteId || null,
      items: carrito.map(i => ({
        productoId: i.producto.id,
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        precio: i.producto.precio,
      })),
      subtotal,
      descuento: descuentoAmt,
      total,
      metodoPago,
      notas: codigoAplicado ? `Código aplicado: ${codigoAplicado.codigo}` : null,
    });
    // Canje efectivo: suma el uso para que los de un solo uso dejen de valer.
    if (codigoAplicado) registrarUsoCodigo(codigoAplicado.id);
    setLastSale({ total, metodoPago });
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setLastSale(null);
      clearCart();
    }, 1500);
  }

  // A-14: registra la venta de un cobro por datáfono que quedó pendiente (el POS
  // se cerró tras el tap). Genera venta + recibo + factura por el importe cobrado
  // (línea única, sin desglose porque el carrito original se perdió) y marca el
  // cobro reconciliado.
  async function registrarReconciliacion(r: ReconciliacionPendiente) {
    addVentaPOS({
      socioId: null,
      items: [{ productoId: 'reconciliacion', nombre: r.concepto || 'Cobro datáfono', cantidad: 1, precio: r.importe }],
      subtotal: r.importe,
      descuento: 0,
      total: r.importe,
      metodoPago: 'DATAFONO',
      notas: `Cobro reconciliado del datáfono (${r.paymentIntentId})`,
    });
    await terminalMarcarReconciliado({ paymentIntentId: r.paymentIntentId, importe: r.importe, concepto: r.concepto });
    await refrescarReconciliaciones();
  }

  async function cobrar() {
    // Bloquea también en estado 'error': tras un fallo/timeout de datáfono hay
    // que descartar el aviso ("Entendido" → idle) antes de reintentar, para no
    // lanzar un 2º cobro mientras el 1er PaymentIntent pueda seguir vivo.
    if (carrito.length === 0 || showSuccess || bizum || terminal.fase !== 'idle') return;

    // Pago con datáfono físico: se lanza el importe al lector y se espera a que
    // la clienta pase la tarjeta; solo al confirmarse se registra la venta.
    if (metodoPago === 'DATAFONO') {
      if (!studio) return;
      setTerminal({ fase: 'esperando', mensaje: 'Enviando al datáfono…' });
      const r = await terminalCobrar({
        studioId: studio.id,
        amount: Math.round(total * 100),
        concepto: carrito.map(i => i.producto.nombre).join(', ') || 'Venta POS',
      });
      if (!r.ok || !r.paymentIntentId) {
        setTerminal({ fase: 'error', mensaje: r.error ?? 'No se pudo iniciar el cobro' });
        return;
      }
      setTerminal({ fase: 'esperando', mensaje: 'Acerque la tarjeta al datáfono' });
      const pi = r.paymentIntentId;
      const deadline = Date.now() + 90000;
      const conceptoVenta = carrito.map(i => i.producto.nombre).join(', ') || 'Venta POS';
      const totalVenta = total;
      const poll = async () => {
        const e = await terminalEstadoCobro({ studioId: studio.id, paymentIntentId: pi });
        if (e.status === 'succeeded') {
          setTerminal({ fase: 'idle' });
          finalizarVenta();
          // A-14: la venta ya quedó registrada aquí → marca el cobro reconciliado
          // para que el backstop del webhook no lo muestre como pendiente.
          terminalMarcarReconciliado({ paymentIntentId: pi, importe: totalVenta, concepto: conceptoVenta })
            .then(() => refrescarReconciliaciones());
          return;
        }
        if (e.status === 'canceled' || e.error) {
          setTerminal({ fase: 'error', mensaje: e.error ?? 'Cobro cancelado en el datáfono' });
          void refrescarReconciliaciones();
          return;
        }
        if (Date.now() > deadline) {
          setTerminal({ fase: 'error', mensaje: 'Se agotó el tiempo. Si la tarjeta llegó a pasarse, el cobro saldrá arriba en "cobros por datáfono sin registrar" — compruébalo antes de volver a cobrar para no cobrar dos veces.' });
          void refrescarReconciliaciones();
          return;
        }
        setTimeout(poll, 1500);
      };
      setTimeout(poll, 1500);
      return;
    }

    // Bizum presencial: genera el Checkout Bizum y muestra un QR para que el
    // cliente pague desde su móvil. Si Stripe/Bizum no está disponible, cae al
    // registro manual (etiqueta), como el comportamiento anterior.
    if (metodoPago === 'BIZUM') {
      const conceptoVenta = carrito.map(i => i.producto.nombre).join(', ') || 'Venta POS';
      const r = await posBizumCheckout({ amount: Math.round(total * 100), concepto: conceptoVenta });
      if (r.url) {
        setBizum({ url: r.url, total });
        return;
      }
      // fallback: registro manual (el cobro Bizum se hizo/hará por fuera).
      finalizarVenta();
      return;
    }

    finalizarVenta();
  }

  // Empareja el datáfono (en test, un lector simulado; en real pediría el código).
  async function configurarDatafono() {
    setConfigMsg('Emparejando datáfono…');
    const r = await terminalRegistrarLector();
    if (r.ok) {
      setLectorEmparejado(true);
      setConfigMsg(r.test ? 'Datáfono simulado emparejado (modo pruebas).' : 'Datáfono emparejado.');
    } else {
      setConfigMsg(r.error ?? 'No se pudo emparejar el datáfono');
    }
    setTimeout(() => setConfigMsg(null), 4000);
  }

  // ─── Keyboard shortcut ────────────────────────────────────────────────────

  const cobrarRef = useRef(cobrar);
  cobrarRef.current = cobrar;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && carrito.length > 0 && !showSuccess) {
      cobrarRef.current();
    }
  }, [carrito.length, showSuccess]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Al abrir el POS, comprobar si hay datáfono emparejado (para mostrar el aviso).
  useEffect(() => {
    let vivo = true;
    terminalEstadoLector().then(r => { if (vivo) setLectorEmparejado(r.emparejado ?? false); });
    return () => { vivo = false; };
  }, []);

  // ─── Filtered products ────────────────────────────────────────────────────

  const productosFiltrados = productosPOS.filter(p => {
    const matchTab = tab === 'Todas' || p.categoria === tab;
    const matchSearch = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchTab && matchSearch;
  });

  // ─── Client filtered ──────────────────────────────────────────────────────

  const sociosFiltrados = socios.filter(s =>
    busquedaCliente.length > 0 &&
    `${s.nombre} ${s.apellidos}`.toLowerCase().includes(busquedaCliente.toLowerCase())
  ).slice(0, 5);

  const clienteSeleccionado = socios.find(s => s.id === clienteId);

  // ─── Sales table grouping ─────────────────────────────────────────────────

  type DateGroup = {
    dateKey: string;
    label: string;
    ventas: VentaPOS[];
    isToday: boolean;
  };

  const sortedVentas = [...ventasPOS].sort(
    (a, b) => new Date(b.realizadaEn).getTime() - new Date(a.realizadaEn).getTime()
  );

  const groupMap = new Map<string, DateGroup>();
  for (const v of sortedVentas) {
    const d = new Date(v.realizadaEn);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        dateKey: key,
        label: formatDateLabel(d, today),
        ventas: [],
        isToday: isSameDay(d, today),
      });
    }
    groupMap.get(key)!.ventas.push(v);
  }
  const dateGroups = Array.from(groupMap.values());
  const todayGroup = dateGroups.find(g => g.isToday);
  const todayTotal = todayGroup ? todayGroup.ventas.reduce((s, v) => s + v.total, 0) : 0;

  return (
    <div className="fixed inset-0 lg:left-56 top-14 lg:top-0 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--background)', zIndex: 10 }}>
      {/* Barra superior única: título + resumen de caja + acciones */}
      <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-border bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
          <div className="shrink-0 hidden md:flex items-center gap-3 pr-1">
            <h1 className="text-[15px] font-bold text-foreground whitespace-nowrap">Punto de venta</h1>
            <div className="w-px h-7 bg-border" />
          </div>
          <div className="shrink-0 rounded-xl bg-background shadow-sm px-3.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" /> Ventas hoy
            </p>
            <p className="text-[16px] font-bold text-foreground leading-tight mt-1 tabular-nums">{ventasHoy.length}</p>
          </div>
          <div className="shrink-0 rounded-xl bg-background shadow-sm px-3.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" /> Total caja
            </p>
            <p className="text-[16px] font-bold text-foreground leading-tight mt-1 tabular-nums">{formatEuro(totalHoy)}</p>
          </div>
          <div className="shrink-0 hidden sm:block rounded-xl bg-background shadow-sm px-3.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" /> Efectivo
            </p>
            <p className="text-[16px] font-bold text-foreground leading-tight mt-1 tabular-nums">{formatEuro(efectivoHoy)}</p>
          </div>
          <div className="shrink-0 hidden sm:block rounded-xl bg-background shadow-sm px-3.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-info" /> Tarjeta
            </p>
            <p className="text-[16px] font-bold text-foreground leading-tight mt-1 tabular-nums">{formatEuro(tarjetaHoy)}</p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {configMsg && <span className="hidden sm:inline text-[12px] text-muted-foreground">{configMsg}</span>}
          <button
            onClick={configurarDatafono}
            title="Emparejar el datáfono con este estudio"
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-medium transition-colors',
              lectorEmparejado
                ? 'border-border text-success hover:border-foreground'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
            )}
          >
            <CreditCard size={13} /> {lectorEmparejado ? 'Datáfono listo' : 'Configurar datáfono'}
          </button>
          <button
            onClick={() => setShowCerrarCaja(true)}
            title="Ver el resumen de caja del día"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-foreground/25 bg-foreground/[0.04] text-[12px] font-semibold text-foreground hover:bg-foreground/[0.08] transition-colors"
          >
            <Receipt size={13} /> Cerrar caja
          </button>
        </div>
      </div>

      {/* A-14: cobros por datáfono confirmados en Stripe pero sin venta registrada */}
      {reconciliaciones.length > 0 && (
        <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-amber-200 bg-amber-50">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[12px] font-bold text-amber-800">
                {reconciliaciones.length} cobro{reconciliaciones.length !== 1 ? 's' : ''} por datáfono sin registrar
              </p>
              <p className="text-[11px] text-amber-700">
                La tarjeta se cobró pero la venta no llegó a guardarse (el POS se cerró). Regístrala para emitir su factura.
              </p>
              <div className="flex flex-col gap-1.5 pt-0.5">
                {reconciliaciones.map((r) => (
                  <div key={r.paymentIntentId} className="flex items-center justify-between gap-2 rounded-lg bg-card border border-amber-200 px-3 py-1.5">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-foreground truncate">{r.concepto || 'Cobro datáfono'}</p>
                      <p className="text-[11px] text-muted-foreground">{formatEuro(r.importe)} · {new Date(r.creadoEn).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button
                      onClick={() => registrarReconciliacion(r)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[12px] font-bold hover:bg-amber-700 transition-colors"
                    >
                      Registrar venta
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile tab switcher - hidden on desktop */}
      <div className="lg:hidden shrink-0 flex items-center gap-1 px-4 py-2 bg-card border-b border-border">
        <button
          onClick={() => setPosView('catalog')}
          className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-colors ${posView === 'catalog' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground'}`}
        >
          Catálogo
        </button>
        <button
          onClick={() => setPosView('cart')}
          className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-colors relative ${posView === 'cart' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground'}`}
        >
          Carrito
          {carrito.length > 0 && (
            <span className="ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[#EF4444] text-white">
              {carrito.reduce((s, i) => s + i.cantidad, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Split layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: Catalog (60%) ────────────────────────────────────────── */}
        <div className={`${posView === 'cart' ? 'hidden' : 'flex'} lg:flex w-full lg:w-[60%] flex-col border-r border-border overflow-hidden bg-background`}>
          {/* Search */}
          <div className="shrink-0 px-4 pt-4 pb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-border text-[13px] bg-card placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="shrink-0 px-4 pb-3 flex gap-1.5 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                  tab === t.value
                    ? 'bg-brand text-brand-foreground'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
              {productosFiltrados.map(p => {
                const cs = catStyle(p.categoria);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    style={{ borderLeftColor: cs.accent }}
                    className="bg-card border border-border border-l-[3px] rounded-r-xl rounded-l-sm p-3 text-left hover:border-foreground hover:shadow-sm transition-all group flex flex-col"
                  >
                    <span
                      className="inline-block self-start text-[9.5px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 mb-1.5"
                      style={{ backgroundColor: cs.tagBg, color: cs.tagText }}
                    >
                      {p.categoria}
                    </span>
                    <p className="text-[13.5px] font-bold text-foreground leading-snug mb-2.5 line-clamp-2 min-h-[2.5em]">
                      {p.nombre}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">
                        {formatEuro(p.precio)}
                      </span>
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
                        style={{ backgroundColor: cs.tagBg, color: cs.tagText }}
                      >
                        <Plus size={14} />
                      </span>
                    </div>
                  </button>
                );
              })}
              {productosFiltrados.length === 0 && (
                <div className="col-span-full py-12 text-center text-[13px] text-muted-foreground">
                  Sin resultados
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Cart (40%) ──────────────────────────────────────────── */}
        <div className={`${posView === 'catalog' ? 'hidden' : 'flex'} lg:flex w-full lg:w-[40%] flex-col bg-card overflow-hidden relative`}>
          <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-2">
            <ShoppingCart size={15} className="text-muted-foreground" />
            <h2 className="text-[14px] font-semibold text-foreground">Ticket actual</h2>
            {carrito.length > 0 && (
              <span className="ml-auto text-[11px] bg-brand text-brand-foreground rounded-full px-2 py-0.5">
                {carrito.reduce((s, i) => s + i.cantidad, 0)}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 relative">
            {/* Success overlay */}
            {showSuccess && lastSale && (
              <SuccessOverlay total={lastSale.total} metodoPago={lastSale.metodoPago} />
            )}

            {/* Bizum presencial: QR para que el cliente pague desde su móvil */}
            {bizum && !showSuccess && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card/95 text-center px-6">
                <p className="text-[15px] font-semibold text-foreground">Cobro por Bizum · {formatEuro(bizum.total)}</p>
                <div className="w-40 h-40" dangerouslySetInnerHTML={{ __html: qrSvgMarkup(bizum.url) }} />
                <p className="text-[12px] text-muted-foreground max-w-[240px]">Pídele al cliente que escanee el código y confirme el pago en su app bancaria.</p>
                <a href={bizum.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-brand underline">Abrir enlace de pago</a>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setBizum(null)} className="px-4 py-2 rounded-lg text-[13px] font-medium border border-border text-muted-foreground">
                    Cancelar
                  </button>
                  <button onClick={() => { setBizum(null); finalizarVenta(); }} className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-brand text-brand-foreground">
                    Cobro realizado
                  </button>
                </div>
              </div>
            )}

            {/* Datáfono: overlay de espera / error */}
            {terminal.fase !== 'idle' && !showSuccess && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-card/95 text-center px-6">
                {terminal.fase === 'esperando' ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-[#E1F5EE] flex items-center justify-center">
                      <CreditCard size={28} className="text-[#0F6E56]" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-foreground flex items-center justify-center gap-2">
                        <Loader2 size={15} className="animate-spin" /> {terminal.mensaje}
                      </p>
                      <p className="text-[20px] font-extrabold text-foreground mt-1">{formatEuro(total)}</p>
                      <p className="text-[12px] text-muted-foreground mt-1">Esperando el pago en el datáfono…</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                      <AlertTriangle size={26} className="text-destructive" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">No se pudo cobrar</p>
                      <p className="text-[12px] text-muted-foreground mt-1 max-w-[240px]">{terminal.mensaje}</p>
                    </div>
                    <button
                      onClick={() => setTerminal({ fase: 'idle' })}
                      className="px-4 py-2 rounded-lg border border-border text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                    >
                      Entendido
                    </button>
                  </>
                )}
              </div>
            )}

            {carrito.length === 0 && !showSuccess ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground px-6">
                <div className="w-14 h-14 rounded-full bg-background border border-border flex items-center justify-center">
                  <ShoppingCart size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-foreground">Ticket vacío</p>
                  <p className="text-[12px] mt-1">Toca un producto del catálogo para empezar la venta.</p>
                </div>
              </div>
            ) : (
              carrito.map(item => (
                <div key={item.producto.id} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{item.producto.nombre}</p>
                    <p className="text-[12px] text-muted-foreground">{formatEuro(item.producto.precio)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => changeQty(item.producto.id, -1)}
                      aria-label="Restar unidad"
                      className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-background transition-colors"
                    >
                      <Minus size={10} />
                    </button>
                    <span className="w-6 text-center text-[13px] font-medium text-foreground">{item.cantidad}</span>
                    <button
                      onClick={() => changeQty(item.producto.id, 1)}
                      aria-label="Añadir unidad"
                      className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-background transition-colors"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                  <span className="w-14 text-right text-[13px] font-semibold text-foreground shrink-0">
                    {formatEuro((item.producto.precio * item.cantidad))}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.producto.id)}
                    aria-label="Quitar del carrito"
                    className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Bottom panel — solo cuando hay algo que cobrar */}
          {!showSuccess && carrito.length > 0 && (
            <div className="shrink-0 border-t border-border px-4 py-3 space-y-3">
              {/* Client selector */}
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">¿A nombre de quién?</p>
              <div className="relative">
                {clienteSeleccionado ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background">
                    <span className="text-[13px] text-foreground">
                      {clienteSeleccionado.nombre} {clienteSeleccionado.apellidos}
                    </span>
                    <button
                      onClick={() => { setClienteId(''); setBusquedaCliente(''); }}
                      aria-label="Quitar cliente"
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Buscar clienta... (opcional)"
                      value={busquedaCliente}
                      onChange={e => setBusquedaCliente(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors"
                    />
                    {sociosFiltrados.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-md overflow-hidden z-10">
                        {sociosFiltrados.map(s => (
                          <button
                            key={s.id}
                            onClick={() => { setClienteId(s.id); setBusquedaCliente(''); }}
                            className="w-full text-left px-3 py-2 text-[13px] text-foreground hover:bg-background transition-colors"
                          >
                            {s.nombre} {s.apellidos}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Discount */}
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Descuento"
                  value={descuento}
                  onChange={e => setDescuento(e.target.value)}
                  min={0}
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors"
                />
                <button
                  onClick={() => setDescuentoTipo(t => t === '€' ? '%' : '€')}
                  className="px-3 py-2 rounded-lg border border-border text-[13px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors w-12"
                >
                  {descuentoTipo}
                </button>
              </div>

              {/* Código de descuento (p.ej. el de reactivación del Centro de Control) */}
              {codigoAplicado ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-warning truncate">{codigoAplicado.codigo}</p>
                    <p className="text-[11px] text-warning/80 truncate">{codigoAplicado.descripcion}</p>
                  </div>
                  <button onClick={quitarCodigo} className="text-[12px] font-semibold text-warning hover:underline shrink-0">
                    Quitar
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Código de descuento"
                      value={codigoTexto}
                      onChange={e => { setCodigoTexto(e.target.value); setCodigoError(null); }}
                      onKeyDown={e => e.key === 'Enter' && aplicarCodigo()}
                      className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] uppercase placeholder:normal-case placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors"
                    />
                    <button
                      onClick={aplicarCodigo}
                      disabled={!codigoTexto.trim()}
                      className="px-3 py-2 rounded-lg border border-border text-[13px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      Aplicar
                    </button>
                  </div>
                  {codigoError && <p className="mt-1 text-[11px] text-rose-600">{codigoError}</p>}
                </div>
              )}

              {/* Totals */}
              <div className="space-y-1 text-[13px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatEuro(subtotal)}</span>
                </div>
                {descuentoAmt > 0 && (
                  <div className="flex justify-between text-warning">
                    <span>Descuento</span>
                    <span>−{formatEuro(descuentoAmt)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg bg-background border border-border px-3 py-2 mt-1">
                  <span className="text-[13px] font-semibold text-foreground">Total</span>
                  <span className="text-[20px] font-extrabold text-foreground tabular-nums">{formatEuro(total)}</span>
                </div>
              </div>

              {/* Payment method */}
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Método de pago</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {METODOS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMetodoPago(m.value)}
                    className={cn(
                      'py-1.5 rounded-lg text-[12px] font-medium border transition-colors',
                      metodoPago === m.value
                        ? 'bg-brand text-brand-foreground border-foreground'
                        : 'bg-card border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Aviso factura simplificada: por encima de 400 € sin socia,
                  Hacienda exige factura completa con los datos del cliente. */}
              {total > 400 && !clienteId && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Venta de <strong>{formatEuro(total)}</strong> sin clienta: se emitirá como <strong>ticket
                    simplificado</strong>. Por encima de 400 € Hacienda exige factura completa — asigna una clienta
                    (con NIF) arriba para incluir sus datos.
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={clearCart}
                  className="flex-1 py-2 rounded-lg border border-border bg-card text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={cobrar}
                  disabled={carrito.length === 0}
                  className={cn(
                    'flex-[2] py-3 rounded-lg text-[14px] font-bold transition-colors flex items-center justify-center gap-2',
                    carrito.length > 0
                      ? 'bg-brand text-brand-foreground hover:brightness-95'
                      : 'bg-border text-muted-foreground cursor-not-allowed'
                  )}
                >
                  {metodoPago === 'DATAFONO'
                    ? <><CreditCard size={15} /> Enviar al datáfono {formatEuro(total)}</>
                    : <><Receipt size={15} /> Cobrar {formatEuro(total)}</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Ventas recientes (colapsable: prioriza catálogo + ticket) ──────── */}
      <div className="shrink-0 border-t border-border bg-card flex flex-col">
        <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between shrink-0">
          <button
            onClick={() => setShowVentas(v => !v)}
            className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity"
          >
            <ChevronRight size={14} className={cn('text-muted-foreground transition-transform', showVentas && 'rotate-90')} />
            <h3 className="text-[13px] font-semibold">Ventas recientes</h3>
            <span className="text-[12px] font-normal text-muted-foreground">· {ventasHoy.length} hoy · {formatEuro(totalHoy)}</span>
          </button>
          <Link
            href="/cobros?tab=pendientes"
            className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver todas las ventas
            <ChevronRight size={12} />
          </Link>
        </div>
        {showVentas && (
        <div className="overflow-auto max-h-[220px] border-t border-border">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left px-3 sm:px-6 py-2 font-medium">Fecha / Hora</th>
                <th className="text-left px-3 py-2 font-medium">Cliente</th>
                <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Artículos</th>
                <th className="text-right px-3 py-2 font-medium">Total</th>
                <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Pago</th>
                <th className="text-center px-3 sm:px-6 py-2 font-medium">Ticket</th>
              </tr>
            </thead>
            <tbody>
              {dateGroups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-muted-foreground">
                    Sin ventas todavía
                  </td>
                </tr>
              )}
              {dateGroups.map(group => (
                <React.Fragment key={group.dateKey}>
                  {/* Date separator */}
                  <tr className="bg-background sm:hidden">
                    <td colSpan={2} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.label}
                    </td>
                    <td colSpan={2} className="px-3 py-1.5 text-right text-[11px] text-muted-foreground">
                      {group.ventas.length} {group.ventas.length === 1 ? 'venta' : 'ventas'}
                    </td>
                  </tr>
                  <tr className="bg-background hidden sm:table-row">
                    <td colSpan={4} className="px-6 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.label}
                    </td>
                    <td colSpan={2} className="px-6 py-1.5 text-right text-[11px] text-muted-foreground">
                      {group.ventas.length} {group.ventas.length === 1 ? 'venta' : 'ventas'}
                    </td>
                  </tr>
                  {/* Sale rows */}
                  {group.ventas.map(v => {
                    const socio = socios.find(s => s.id === v.socioId);
                    const clienteNombre = socio
                      ? `${socio.nombre} ${socio.apellidos}`
                      : 'Cliente sin registrar';
                    const fechaHora = formatTimeOrDate(new Date(v.realizadaEn), today);
                    return (
                      <tr key={v.id} className="border-b border-border last:border-0 hover:bg-background transition-colors">
                        <td className="px-3 sm:px-6 py-2.5 text-muted-foreground font-mono">{fechaHora}</td>
                        <td className="px-3 py-2.5 text-foreground font-medium">
                          {clienteNombre}
                          <p className="text-[10px] text-muted-foreground font-normal sm:hidden">
                            {v.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ')}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                          {v.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ')}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                          {formatEuro(v.total)}
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-[11px] font-medium',
                            v.metodoPago === 'EFECTIVO' && 'bg-success/10 text-success',
                            v.metodoPago === 'TARJETA' && 'bg-blue-50 text-blue-700',
                            v.metodoPago === 'BIZUM' && 'bg-purple-50 text-purple-700',
                            v.metodoPago === 'TRANSFERENCIA' && 'bg-amber-50 text-warning',
                          )}>
                            {METODO_LABEL[v.metodoPago] ?? v.metodoPago}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-2.5 text-center">
                          <button className="text-muted-foreground hover:text-foreground transition-colors">
                            <Receipt size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Today's total row */}
                  {group.isToday && group.ventas.length > 0 && (
                    <>
                      <tr key="today-total-mobile" className="bg-success/10 border-t border-success/20 sm:hidden">
                        <td colSpan={2} className="px-3 py-2 text-[11px] font-semibold text-success uppercase tracking-wide">
                          Total del día
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[13px] text-success">
                          {formatEuro(todayTotal)}
                        </td>
                        <td />
                      </tr>
                      <tr key="today-total" className="bg-success/10 border-t border-success/20 hidden sm:table-row">
                        <td colSpan={3} className="px-6 py-2 text-[11px] font-semibold text-success uppercase tracking-wide">
                          Total del día
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[13px] text-success">
                          {formatEuro(todayTotal)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Cerrar caja modal */}
      {showCerrarCaja && (
        <CerrarCajaModal
          ventasHoy={ventasHoy}
          onClose={() => setShowCerrarCaja(false)}
        />
      )}
    </div>
  );
}
