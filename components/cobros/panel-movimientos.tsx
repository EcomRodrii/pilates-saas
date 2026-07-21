'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { ArrowLeftRight, TrendingUp, CreditCard, ShoppingCart, FileText, Download, Search } from 'lucide-react';
import Link from 'next/link';
import { CifraPrivada } from '@/components/ui/cifra-privada';

type FiltroTipo = 'todas' | 'cobro' | 'pos' | 'devolucion';

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PanelMovimientos() {
  const { recibos, ventasPOS, socios, facturas } = useStudio();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroTipo>('todas');

  // Unifica recibos cobrados + ventas POS en una sola lista de movimientos
  const movimientos = useMemo(() => {
    // C-10: toda venta POS genera un recibo `rec-pos-*` COBRADO (studio-context
    // addVentaPOS) Y aparece en `ventasPOS`. Contar ambos duplicaba el POS en
    // totalCobros/totalNeto y en la lista. Se excluyen los recibos POS de la
    // fuente de cobros; el POS se cuenta una sola vez vía `ventas` (abajo), que
    // además conserva el método de pago.
    const cobros = recibos
      .filter(r => (r.estado === 'COBRADO' || r.estado === 'DEVUELTO') && !r.id.startsWith('rec-pos-'))
      .map(r => {
        const socio = socios.find(s => s.id === r.socioId);
        return {
          id: r.id,
          tipo: r.estado === 'DEVUELTO' ? 'devolucion' : 'cobro' as const,
          fecha: r.fechaCobro ?? r.fechaVencimiento,
          concepto: r.concepto,
          importe: r.estado === 'DEVUELTO' ? -r.importe : r.importe,
          miembro: socio ? `${socio.nombre} ${socio.apellidos}` : '—',
          miembroId: socio?.id ?? null,
          metodo: null as string | null,
          facturaId: facturas.find(f => f.reciboId === r.id)?.id ?? null,
        };
      });

    const ventas = ventasPOS.map(v => {
      const socio = v.socioId ? socios.find(s => s.id === v.socioId) : null;
      return {
        id: v.id,
        tipo: 'pos' as const,
        fecha: v.realizadaEn,
        concepto: v.items.length > 0 ? v.items.map(i => i.nombre).join(', ') : 'Venta POS',
        importe: v.total,
        miembro: socio ? `${socio.nombre} ${socio.apellidos}` : 'Cliente anónimo',
        miembroId: socio?.id ?? null,
        metodo: v.metodoPago,
        facturaId: null,
      };
    });

    return [...cobros, ...ventas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [recibos, ventasPOS, socios, facturas]);

  const filtrados = useMemo(() => {
    return movimientos.filter(m => {
      if (filtro !== 'todas' && m.tipo !== filtro) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        return m.concepto.toLowerCase().includes(q) || m.miembro.toLowerCase().includes(q);
      }
      return true;
    });
  }, [movimientos, filtro, busqueda]);

  const totalCobros = movimientos.filter(m => m.tipo === 'cobro').reduce((s, m) => s + m.importe, 0);
  const totalPOS = movimientos.filter(m => m.tipo === 'pos').reduce((s, m) => s + m.importe, 0);
  const totalDev = movimientos.filter(m => m.tipo === 'devolucion').reduce((s, m) => s + Math.abs(m.importe), 0);
  const totalNeto = totalCobros + totalPOS - totalDev;

  function exportarCSV() {
    const headers = ['Fecha', 'Tipo', 'Concepto', 'Cliente', 'Método', 'Importe'];
    const rows = filtrados.map(m => [
      fechaCorta(m.fecha),
      m.tipo === 'cobro' ? 'Cobro suscripción' : m.tipo === 'pos' ? 'Venta POS' : 'Devolución',
      m.concepto,
      m.miembro,
      m.metodo ?? '—',
      m.importe.toFixed(2),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transacciones.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const FILTROS: { value: FiltroTipo; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'cobro', label: 'Cobros' },
    { value: 'pos', label: 'POS' },
    { value: 'devolucion', label: 'Devoluciones' },
  ];

  const TIPO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    cobro: { label: 'Cobro', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
    pos: { label: 'POS', color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 12%, var(--card))' },
    devolucion: { label: 'Devolución', color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={exportarCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-sm font-semibold hover:brightness-95 transition-colors"
          >
            <Download size={14} />
            Exportar CSV
          </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total neto', value: fmt(totalNeto) + ' €', icon: TrendingUp, color: 'var(--brand)', bg: 'color-mix(in srgb, var(--brand) 10%, var(--card))' },
          { label: 'Cobros suscripción', value: fmt(totalCobros) + ' €', icon: CreditCard, color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))' },
          { label: 'Ventas POS', value: fmt(totalPOS) + ' €', icon: ShoppingCart, color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 12%, var(--card))' },
          { label: 'Devoluciones', value: fmt(totalDev) + ' €', icon: ArrowLeftRight, color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))' },
        ].map(k => (
          <div key={k.label} className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{k.label}</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: k.bg }}>
                <k.icon size={14} style={{ color: k.color }} />
              </div>
            </div>
            <CifraPrivada className="text-2xl font-extrabold text-foreground">{k.value}</CifraPrivada>
          </div>
        ))}
      </div>

      {/* Filtros + búsqueda */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
          <div className="flex items-center gap-2 bg-muted border border-border rounded-xl px-3 py-2 flex-1 min-w-[200px]">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por concepto o miembro..."
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto flex-nowrap">
            {FILTROS.map(f => (
              <button
                key={f.value}
                onClick={() => setFiltro(f.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={filtro === f.value
                  ? { backgroundColor: 'var(--foreground)', color: 'var(--background)' }
                  : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-auto">{filtrados.length} movimientos</span>
        </div>

        {/* Tarjetas (móvil) */}
        <div className="lg:hidden divide-y divide-muted">
          {filtrados.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No hay movimientos para los filtros seleccionados
            </div>
          ) : filtrados.map(m => {
            const badge = TIPO_BADGE[m.tipo];
            return (
              <div key={m.id} className="px-4 py-3.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                      style={{ color: badge.color, backgroundColor: badge.bg }}>
                      {badge.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fechaCorta(m.fecha)}</span>
                  </div>
                  <p className="text-[14px] font-semibold text-foreground truncate">{m.concepto}</p>
                  <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                    {m.miembro}{m.metodo ? ` · ${m.metodo}` : ''}
                  </p>
                  {m.facturaId && (
                    <Link href="/cobros?tab=facturas" className="text-[11px] text-brand hover:underline inline-flex items-center gap-1 mt-1">
                      <FileText size={10} /> Ver factura
                    </Link>
                  )}
                </div>
                <CifraPrivada className="text-[15px] font-extrabold whitespace-nowrap shrink-0"
                  style={{ color: m.importe < 0 ? 'var(--destructive)' : 'var(--foreground)' }}>
                  {m.importe < 0 ? '-' : ''}{fmt(Math.abs(m.importe))} €
                </CifraPrivada>
              </div>
            );
          })}
          {filtrados.length > 0 && (
            <div className="px-4 py-3.5 flex items-center justify-between bg-muted">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total ({filtrados.length})</span>
              <CifraPrivada inline className="text-[15px] font-extrabold text-foreground">{fmt(filtrados.reduce((s, m) => s + m.importe, 0))} €</CifraPrivada>
            </div>
          )}
        </div>

        {/* Tabla (escritorio) */}
        <div className="overflow-x-auto hidden lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                {['Fecha', 'Tipo', 'Concepto', 'Cliente', 'Método', 'Importe', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-muted">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No hay movimientos para los filtros seleccionados
                  </td>
                </tr>
              ) : filtrados.map(m => {
                const badge = TIPO_BADGE[m.tipo];
                return (
                  <tr key={m.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-medium">
                      {fechaCorta(m.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                        style={{ color: badge.color, backgroundColor: badge.bg }}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[220px] truncate">
                      {m.concepto}
                    </td>
                    <td className="px-4 py-3">
                      {m.miembroId
                        ? <Link href={`/clientas/${m.miembroId}`} className="text-brand hover:underline font-medium">{m.miembro}</Link>
                        : <span className="text-muted-foreground">{m.miembro}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {m.metodo ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-extrabold text-right whitespace-nowrap"
                      style={{ color: m.importe < 0 ? 'var(--destructive)' : 'var(--foreground)' }}>
                      <CifraPrivada inline>{m.importe < 0 ? '-' : ''}{fmt(Math.abs(m.importe))} €</CifraPrivada>
                    </td>
                    <td className="px-4 py-3">
                      {m.facturaId && (
                        <Link href="/cobros?tab=facturas" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                          <FileText size={11} />
                          Factura
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot>
                <tr className="bg-muted border-t-2 border-border">
                  <td colSpan={5} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Total ({filtrados.length})
                  </td>
                  <td className="px-4 py-3 font-extrabold text-right text-foreground text-base">
                    <CifraPrivada inline>{fmt(filtrados.reduce((s, m) => s + m.importe, 0))} €</CifraPrivada>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
