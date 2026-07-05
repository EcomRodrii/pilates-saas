'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { ArrowLeftRight, TrendingUp, CreditCard, ShoppingCart, FileText, Download, Search } from 'lucide-react';
import Link from 'next/link';

type FiltroTipo = 'todas' | 'cobro' | 'pos' | 'devolucion';

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Transacciones() {
  const { recibos, ventasPOS, socios, facturas } = useStudio();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroTipo>('todas');

  // Unifica recibos cobrados + ventas POS en una sola lista de movimientos
  const movimientos = useMemo(() => {
    const cobros = recibos
      .filter(r => r.estado === 'COBRADO' || r.estado === 'DEVUELTO')
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
    const headers = ['Fecha', 'Tipo', 'Concepto', 'Miembro', 'Método', 'Importe'];
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
    cobro: { label: 'Cobro', color: '#15803D', bg: '#DCFCE7' },
    pos: { label: 'POS', color: '#1D4ED8', bg: '#DBEAFE' },
    devolucion: { label: 'Devolución', color: '#B91C1C', bg: '#FEE2E2' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Transacciones</h1>
          <p className="text-sm font-medium mt-0.5 text-[#6B7280]">
            Todos los movimientos económicos del estudio
          </p>
        </div>
        <button
          onClick={exportarCSV}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111827] text-white text-sm font-semibold hover:bg-[#1f2937] transition-colors"
        >
          <Download size={14} />
          Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total neto', value: fmt(totalNeto) + ' €', icon: TrendingUp, color: '#4F46E5', bg: '#EEF2FF' },
          { label: 'Cobros suscripción', value: fmt(totalCobros) + ' €', icon: CreditCard, color: '#15803D', bg: '#DCFCE7' },
          { label: 'Ventas POS', value: fmt(totalPOS) + ' €', icon: ShoppingCart, color: '#1D4ED8', bg: '#DBEAFE' },
          { label: 'Devoluciones', value: fmt(totalDev) + ' €', icon: ArrowLeftRight, color: '#B91C1C', bg: '#FEE2E2' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-[#E8EAED] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">{k.label}</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: k.bg }}>
                <k.icon size={14} style={{ color: k.color }} />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-[#111827]">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros + búsqueda */}
      <div className="bg-white rounded-2xl border border-[#E8EAED] overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[#E8EAED]">
          <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E8EAED] rounded-xl px-3 py-2 flex-1 min-w-[200px]">
            <Search size={14} className="text-[#9CA3AF] shrink-0" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por concepto o miembro..."
              className="bg-transparent text-sm text-[#111827] placeholder:text-[#9CA3AF] outline-none flex-1"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto flex-nowrap">
            {FILTROS.map(f => (
              <button
                key={f.value}
                onClick={() => setFiltro(f.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={filtro === f.value
                  ? { backgroundColor: '#111827', color: '#fff' }
                  : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-[#9CA3AF] ml-auto">{filtrados.length} movimientos</span>
        </div>

        {/* Tarjetas (móvil) */}
        <div className="lg:hidden divide-y divide-[#F3F4F6]">
          {filtrados.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-[#9CA3AF]">
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
                    <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap">{fechaCorta(m.fecha)}</span>
                  </div>
                  <p className="text-[14px] font-semibold text-[#111827] truncate">{m.concepto}</p>
                  <p className="text-[12px] text-[#6B7280] truncate mt-0.5">
                    {m.miembro}{m.metodo ? ` · ${m.metodo}` : ''}
                  </p>
                  {m.facturaId && (
                    <Link href="/facturas" className="text-[11px] text-[#4F46E5] hover:underline inline-flex items-center gap-1 mt-1">
                      <FileText size={10} /> Ver factura
                    </Link>
                  )}
                </div>
                <p className="text-[15px] font-extrabold whitespace-nowrap shrink-0"
                  style={{ color: m.importe < 0 ? '#B91C1C' : '#111827' }}>
                  {m.importe < 0 ? '-' : ''}{fmt(Math.abs(m.importe))} €
                </p>
              </div>
            );
          })}
          {filtrados.length > 0 && (
            <div className="px-4 py-3.5 flex items-center justify-between bg-[#F9FAFB]">
              <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">Total ({filtrados.length})</span>
              <span className="text-[15px] font-extrabold text-[#111827]">{fmt(filtrados.reduce((s, m) => s + m.importe, 0))} €</span>
            </div>
          )}
        </div>

        {/* Tabla (escritorio) */}
        <div className="overflow-x-auto hidden lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F9FAFB] border-b border-[#E8EAED]">
                {['Fecha', 'Tipo', 'Concepto', 'Miembro', 'Método', 'Importe', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#6B7280] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-[#9CA3AF]">
                    No hay movimientos para los filtros seleccionados
                  </td>
                </tr>
              ) : filtrados.map(m => {
                const badge = TIPO_BADGE[m.tipo];
                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-[#6B7280] font-medium">
                      {fechaCorta(m.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                        style={{ color: badge.color, backgroundColor: badge.bg }}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-[#111827] max-w-[220px] truncate">
                      {m.concepto}
                    </td>
                    <td className="px-4 py-3">
                      {m.miembroId
                        ? <Link href={`/socios/${m.miembroId}`} className="text-[#4F46E5] hover:underline font-medium">{m.miembro}</Link>
                        : <span className="text-[#6B7280]">{m.miembro}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-[#6B7280] text-xs">
                      {m.metodo ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-extrabold text-right whitespace-nowrap"
                      style={{ color: m.importe < 0 ? '#B91C1C' : '#111827' }}>
                      {m.importe < 0 ? '-' : ''}{fmt(Math.abs(m.importe))} €
                    </td>
                    <td className="px-4 py-3">
                      {m.facturaId && (
                        <Link href="/facturas" className="text-xs text-[#6B7280] hover:text-[#111827] flex items-center gap-1 transition-colors">
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
                <tr className="bg-[#F9FAFB] border-t-2 border-[#E8EAED]">
                  <td colSpan={5} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#6B7280]">
                    Total ({filtrados.length})
                  </td>
                  <td className="px-4 py-3 font-extrabold text-right text-[#111827] text-base">
                    {fmt(filtrados.reduce((s, m) => s + m.importe, 0))} €
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
