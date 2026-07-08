'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingCart, X, Plus, Minus, Receipt, CheckCircle2, Search, Printer, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { ProductoPOS, VentaPOS, MetodoPago } from '@/lib/types';

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
const METODOS: { label: string; value: MetodoPago }[] = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Tarjeta', value: 'TARJETA' },
  { label: 'Bizum', value: 'BIZUM' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
];

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Modal header */}
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-foreground">Resumen de caja</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5 capitalize">{fechaLabel}</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#A8A89F] hover:text-foreground hover:bg-background transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="px-6 py-4 bg-background border-b border-border">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-xl px-4 py-3 border border-border">
              <p className="text-[11px] text-[#A8A89F] uppercase tracking-wide mb-1">Transacciones</p>
              <p className="text-[22px] font-bold text-foreground">{ventasHoy.length}</p>
            </div>
            <div className="bg-card rounded-xl px-4 py-3 border border-border">
              <p className="text-[11px] text-[#A8A89F] uppercase tracking-wide mb-1">Total recaudado</p>
              <p className="text-[22px] font-bold text-[#059669]">{grandTotal.toFixed(2)} €</p>
            </div>
          </div>
        </div>

        {/* Breakdown table */}
        <div className="px-6 py-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[#A8A89F] border-b border-border">
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
                    {row.total.toFixed(2)} €
                  </td>
                </tr>
              ))}
              {/* Grand total */}
              <tr className="border-t-2 border-[#1A1A1A]">
                <td className="pt-3 pb-1 font-bold text-foreground">Total caja</td>
                <td className="pt-3 pb-1 text-center font-bold text-foreground">{ventasHoy.length}</td>
                <td className="pt-3 pb-1 text-right font-bold text-[16px] text-[#059669]">
                  {grandTotal.toFixed(2)} €
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
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-[13px] font-medium text-[#A8A89F] cursor-not-allowed"
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
      </div>
    </div>
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
      <div className="w-16 h-16 rounded-full bg-[#ECFDF5] flex items-center justify-center animate-in zoom-in-50 duration-300">
        <CheckCircle2 size={36} className="text-[#059669]" />
      </div>
      <p className="text-[16px] font-semibold text-foreground">¡Cobrado!</p>
      <p className="text-[13px] text-muted-foreground">
        {total.toFixed(2)} € · {METODO_LABEL[metodoPago] ?? metodoPago}
      </p>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function POSPage() {
  const { socios, productosPOS, ventasPOS, addVentaPOS } = useStudio();

  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<TabCategoria>('Todas');
  const [busqueda, setBusqueda] = useState('');
  const [clienteId, setClienteId] = useState<string>('');
  const [descuento, setDescuento] = useState('');
  const [descuentoTipo, setDescuentoTipo] = useState<'€' | '%'>('€');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSale, setLastSale] = useState<{ total: number; metodoPago: MetodoPago } | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [showCerrarCaja, setShowCerrarCaja] = useState(false);
  const [posView, setPosView] = useState<'catalog' | 'cart'>('catalog');

  const today = new Date();

  // ─── Daily stats ──────────────────────────────────────────────────────────

  const ventasHoy = ventasPOS.filter(v => isSameDay(new Date(v.realizadaEn), today));
  const totalHoy = ventasHoy.reduce((sum, v) => sum + v.total, 0);
  const efectivoHoy = ventasHoy
    .filter(v => v.metodoPago === 'EFECTIVO')
    .reduce((sum, v) => sum + v.total, 0);
  const tarjetaHoy = ventasHoy
    .filter(v => v.metodoPago === 'TARJETA')
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
  }

  // ─── Totales ──────────────────────────────────────────────────────────────

  const subtotal = carrito.reduce((sum, i) => sum + i.producto.precio * i.cantidad, 0);
  const descuentoNum = parseFloat(descuento) || 0;
  const descuentoAmt = descuentoTipo === '%'
    ? (subtotal * descuentoNum) / 100
    : descuentoNum;
  const total = Math.max(0, subtotal - descuentoAmt);

  // ─── Cobrar ───────────────────────────────────────────────────────────────

  function cobrar() {
    if (carrito.length === 0 || showSuccess) return;
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
      notas: null,
    });
    setLastSale({ total, metodoPago });
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setLastSale(null);
      clearCart();
    }, 1500);
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
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-semibold text-foreground">Punto de Venta</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Terminal de cobro rápido</p>
          </div>
          <p className="text-[12px] text-[#A8A89F] hidden sm:block">↵ Enter para cobrar cuando el carrito está listo</p>
        </div>
      </div>

      {/* Daily cash summary bar */}
      <div className="shrink-0 px-6 py-2 border-b border-border bg-card flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">Hoy:</span>{' '}
            <span className="font-semibold text-foreground">{ventasHoy.length}</span>{' '}
            {ventasHoy.length === 1 ? 'venta' : 'ventas'}
          </span>
          <span className="text-[#E7E7E0]">·</span>
          <span>
            <span className="font-semibold text-[#059669]">{totalHoy.toFixed(2)} €</span>{' '}
            total
          </span>
          <span className="text-[#E7E7E0]">·</span>
          <span className="hidden sm:inline">
            <span className="font-medium text-[#059669]">{efectivoHoy.toFixed(2)} €</span>
            {' '}efectivo
          </span>
          <span className="hidden sm:inline text-[#E7E7E0]">/</span>
          <span className="hidden sm:inline">
            <span className="font-medium text-[#1D4ED8]">{tarjetaHoy.toFixed(2)} €</span>
            {' '}tarjeta
          </span>
        </div>
        <button
          onClick={() => setShowCerrarCaja(true)}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:border-[#1A1A1A] hover:text-foreground transition-colors"
        >
          Cerrar caja
        </button>
      </div>

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
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A89F]" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-border text-[13px] bg-card placeholder:text-[#A8A89F] text-foreground outline-none focus:border-[#1A1A1A] transition-colors"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {productosFiltrados.map(p => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="bg-card border border-border rounded-xl p-3 text-left hover:border-[#1A1A1A] hover:shadow-sm transition-all group"
                >
                  <p className="text-[13px] font-medium text-foreground leading-snug mb-2 line-clamp-2">
                    {p.nombre}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-foreground">
                      {p.precio.toFixed(2)} €
                    </span>
                    <span className="w-6 h-6 rounded-full bg-background group-hover:bg-[#1A1A1A] group-hover:text-white flex items-center justify-center transition-colors">
                      <Plus size={12} />
                    </span>
                  </div>
                  <span className="mt-1.5 inline-block text-[10px] text-[#A8A89F]">{p.categoria}</span>
                </button>
              ))}
              {productosFiltrados.length === 0 && (
                <div className="col-span-3 py-12 text-center text-[13px] text-[#A8A89F]">
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

            {carrito.length === 0 && !showSuccess ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 text-[#A8A89F]">
                <ShoppingCart size={28} strokeWidth={1.5} />
                <p className="text-[13px]">Añade productos del catálogo</p>
              </div>
            ) : (
              carrito.map(item => (
                <div key={item.producto.id} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{item.producto.nombre}</p>
                    <p className="text-[12px] text-muted-foreground">{item.producto.precio.toFixed(2)} € c/u</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => changeQty(item.producto.id, -1)}
                      className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-background transition-colors"
                    >
                      <Minus size={10} />
                    </button>
                    <span className="w-6 text-center text-[13px] font-medium text-foreground">{item.cantidad}</span>
                    <button
                      onClick={() => changeQty(item.producto.id, 1)}
                      className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-background transition-colors"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                  <span className="w-14 text-right text-[13px] font-semibold text-foreground shrink-0">
                    {(item.producto.precio * item.cantidad).toFixed(2)} €
                  </span>
                  <button
                    onClick={() => removeFromCart(item.producto.id)}
                    className="w-5 h-5 rounded flex items-center justify-center text-[#A8A89F] hover:text-[#DC2626] hover:bg-red-50 transition-colors shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Bottom panel */}
          {!showSuccess && (
            <div className="shrink-0 border-t border-border px-4 py-3 space-y-3">
              {/* Client selector */}
              <div className="relative">
                {clienteSeleccionado ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background">
                    <span className="text-[13px] text-foreground">
                      {clienteSeleccionado.nombre} {clienteSeleccionado.apellidos}
                    </span>
                    <button
                      onClick={() => { setClienteId(''); setBusquedaCliente(''); }}
                      className="text-[#A8A89F] hover:text-[#DC2626] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Buscar socia... (opcional)"
                      value={busquedaCliente}
                      onChange={e => setBusquedaCliente(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-[#A8A89F] text-foreground outline-none focus:border-[#1A1A1A] transition-colors"
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
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-[#A8A89F] text-foreground outline-none focus:border-[#1A1A1A] transition-colors"
                />
                <button
                  onClick={() => setDescuentoTipo(t => t === '€' ? '%' : '€')}
                  className="px-3 py-2 rounded-lg border border-border text-[13px] font-medium text-muted-foreground hover:border-[#1A1A1A] hover:text-foreground transition-colors w-12"
                >
                  {descuentoTipo}
                </button>
              </div>

              {/* Totals */}
              <div className="space-y-1 text-[13px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{subtotal.toFixed(2)} €</span>
                </div>
                {descuentoAmt > 0 && (
                  <div className="flex justify-between text-[#D97706]">
                    <span>Descuento</span>
                    <span>−{descuentoAmt.toFixed(2)} €</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-foreground text-[15px] pt-1 border-t border-border">
                  <span>Total</span>
                  <span>{total.toFixed(2)} €</span>
                </div>
              </div>

              {/* Payment method */}
              <div className="grid grid-cols-4 gap-1.5">
                {METODOS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMetodoPago(m.value)}
                    className={cn(
                      'py-1.5 rounded-lg text-[12px] font-medium border transition-colors',
                      metodoPago === m.value
                        ? 'bg-brand text-brand-foreground border-[#1A1A1A]'
                        : 'bg-card border-border text-muted-foreground hover:border-[#1A1A1A] hover:text-foreground'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={clearCart}
                  className="flex-1 py-2 rounded-lg border border-border bg-card text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-[#1A1A1A] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={cobrar}
                  disabled={carrito.length === 0}
                  className={cn(
                    'flex-[2] py-2 rounded-lg text-[13px] font-semibold transition-colors',
                    carrito.length > 0
                      ? 'bg-brand text-brand-foreground hover:brightness-95'
                      : 'bg-[#E7E7E0] text-[#A8A89F] cursor-not-allowed'
                  )}
                >
                  Cobrar {carrito.length > 0 ? `${total.toFixed(2)} €` : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent sales ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-card max-h-[220px] flex flex-col">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="text-[13px] font-semibold text-foreground">Ventas recientes</h3>
          <Link
            href="/pagos"
            className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver todas las ventas
            <ChevronRight size={12} />
          </Link>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-[#A8A89F] border-b border-border">
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
                  <td colSpan={6} className="px-6 py-6 text-center text-[#A8A89F]">
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
                    <td colSpan={2} className="px-3 py-1.5 text-right text-[11px] text-[#A8A89F]">
                      {group.ventas.length} {group.ventas.length === 1 ? 'venta' : 'ventas'}
                    </td>
                  </tr>
                  <tr className="bg-background hidden sm:table-row">
                    <td colSpan={4} className="px-6 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.label}
                    </td>
                    <td colSpan={2} className="px-6 py-1.5 text-right text-[11px] text-[#A8A89F]">
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
                          <p className="text-[10px] text-[#A8A89F] font-normal sm:hidden">
                            {v.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ')}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                          {v.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ')}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                          {v.total.toFixed(2)} €
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-[11px] font-medium',
                            v.metodoPago === 'EFECTIVO' && 'bg-[#F0FDF4] text-[#059669]',
                            v.metodoPago === 'TARJETA' && 'bg-blue-50 text-blue-700',
                            v.metodoPago === 'BIZUM' && 'bg-purple-50 text-purple-700',
                            v.metodoPago === 'TRANSFERENCIA' && 'bg-amber-50 text-[#D97706]',
                          )}>
                            {METODO_LABEL[v.metodoPago] ?? v.metodoPago}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-2.5 text-center">
                          <button className="text-[#A8A89F] hover:text-foreground transition-colors">
                            <Receipt size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Today's total row */}
                  {group.isToday && group.ventas.length > 0 && (
                    <>
                      <tr key="today-total-mobile" className="bg-[#F0FDF4] border-t border-[#059669]/20 sm:hidden">
                        <td colSpan={2} className="px-3 py-2 text-[11px] font-semibold text-[#059669] uppercase tracking-wide">
                          Total del día
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[13px] text-[#059669]">
                          {todayTotal.toFixed(2)} €
                        </td>
                        <td />
                      </tr>
                      <tr key="today-total" className="bg-[#F0FDF4] border-t border-[#059669]/20 hidden sm:table-row">
                        <td colSpan={3} className="px-6 py-2 text-[11px] font-semibold text-[#059669] uppercase tracking-wide">
                          Total del día
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[13px] text-[#059669]">
                          {todayTotal.toFixed(2)} €
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
