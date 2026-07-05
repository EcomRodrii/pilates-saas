'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import { Search, Download, FileText, TrendingUp, Euro, ChevronDown, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function mesAnio(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function kpi(val: number) {
  return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type AgrupadorFact = 'mes' | 'cliente';

export default function Facturas() {
  const { facturas, recibos, socios } = useStudio();

  const [busqueda, setBusqueda] = useState('');
  const [agrupador, setAgrupador] = useState<AgrupadorFact>('mes');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────────

  function socioParaFactura(reciboId: string) {
    const recibo = recibos.find(r => r.id === reciboId);
    if (!recibo) return null;
    return socios.find(s => s.id === recibo.socioId) ?? null;
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  // ── derived ───────────────────────────────────────────────────────────────────

  const filtradas = useMemo(() =>
    facturas
      .filter(f =>
        !busqueda ||
        f.numeroCompleto.toLowerCase().includes(busqueda.toLowerCase()) ||
        f.receptorNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        (f.receptorNIF ?? '').toLowerCase().includes(busqueda.toLowerCase())
      )
      .sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision)),
    [facturas, busqueda]
  );

  const totalMes = useMemo(() =>
    facturas.filter(f => f.fechaEmision.startsWith(currentMonth)).reduce((s, f) => s + f.total, 0),
    [facturas, currentMonth]
  );

  const totalMesAnterior = useMemo(() =>
    facturas.filter(f => f.fechaEmision.startsWith(lastMonth)).reduce((s, f) => s + f.total, 0),
    [facturas, lastMonth]
  );

  const variacion = totalMesAnterior > 0 ? ((totalMes - totalMesAnterior) / totalMesAnterior) * 100 : 0;

  const totalGeneral = useMemo(() => filtradas.reduce((s, f) => s + f.total, 0), [filtradas]);
  const baseTotal = useMemo(() => filtradas.reduce((s, f) => s + f.baseImponible, 0), [filtradas]);
  const ivaTotal = useMemo(() => filtradas.reduce((s, f) => s + f.cuotaIVA, 0), [filtradas]);

  // ── grouping ──────────────────────────────────────────────────────────────────

  const grupos = useMemo(() => {
    if (agrupador === 'mes') {
      const byMes = new Map<string, typeof filtradas>();
      filtradas.forEach(f => {
        const k = f.fechaEmision.slice(0, 7);
        if (!byMes.has(k)) byMes.set(k, []);
        byMes.get(k)!.push(f);
      });
      return Array.from(byMes.entries()).map(([k, items]) => ({
        key: k,
        label: mesAnio(items[0].fechaEmision),
        items,
        total: items.reduce((s, f) => s + f.total, 0),
      }));
    } else {
      const byCliente = new Map<string, typeof filtradas>();
      filtradas.forEach(f => {
        const k = f.receptorNombre;
        if (!byCliente.has(k)) byCliente.set(k, []);
        byCliente.get(k)!.push(f);
      });
      return Array.from(byCliente.entries())
        .map(([k, items]) => ({ key: k, label: k, items, total: items.reduce((s, f) => s + f.total, 0) }))
        .sort((a, b) => b.total - a.total);
    }
  }, [filtradas, agrupador]);

  // ── actions ───────────────────────────────────────────────────────────────────

  function toggleGrupo(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function exportarCSV(items: typeof filtradas = filtradas) {
    const headers = ['Número', 'Fecha', 'Receptor', 'NIF', 'Base imp.', 'IVA %', 'Cuota IVA', 'Total'];
    const rows = items.map(f => [
      f.numeroCompleto,
      fecha(f.fechaEmision),
      f.receptorNombre,
      f.receptorNIF ?? '',
      f.baseImponible.toFixed(2),
      f.tipoIVA + '%',
      f.cuotaIVA.toFixed(2),
      f.total.toFixed(2),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'facturas.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function descargarPDF(f: typeof previewFactura, socio: typeof previewSocio) {
    if (!f) return;
    const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Factura ${f.numeroCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Arial, sans-serif; font-size: 13px; color: #15161B; padding: 40px; max-width: 680px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .title { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
  .numero { font-size: 13px; font-family: monospace; font-weight: 700; color: #4B3FD6; margin-top: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
  .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #71727A; margin-bottom: 6px; }
  .party-name { font-weight: 700; margin-bottom: 2px; }
  .party-detail { color: #71727A; margin-bottom: 2px; }
  .meta { font-size: 12px; color: #71727A; margin-bottom: 32px; }
  .meta strong { color: #15161B; }
  table { width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #ECECF1; }
  thead tr { background: #F4F4F8; }
  th { text-align: left; padding: 10px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #71727A; }
  th:last-child { text-align: right; }
  td { padding: 14px 16px; border-top: 1px solid #ECECF1; }
  td:last-child { text-align: right; font-weight: 600; }
  .sub-row td { background: #F4F4F8; font-size: 12px; color: #71727A; padding: 8px 16px; }
  .sub-row td:last-child { font-weight: 400; }
  .total-row td { font-weight: 900; font-size: 15px; border-top: 2px solid #ECECF1; padding: 12px 16px; }
  .footer { margin-top: 48px; font-size: 11px; color: #A2A3AC; border-top: 1px solid #F1F1F6; padding-top: 16px; }
  @media print {
    body { padding: 20px; }
    @page { size: A4; margin: 20mm; }
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="title">FACTURA</div>
    <div class="numero">${f.numeroCompleto}</div>
  </div>
  <div style="text-align:right">
    <div style="font-weight:700">Tentare</div>
    <div style="color:#71727A">B-12345678</div>
    <div style="color:#71727A">Calle Larios 12, Málaga</div>
  </div>
</div>
<div class="parties">
  <div>
    <div class="party-label">Emisor</div>
    <div class="party-name">Tentare</div>
    <div class="party-detail">B-12345678</div>
    <div class="party-detail">Calle Larios 12, 29001 Málaga</div>
  </div>
  <div>
    <div class="party-label">Receptor</div>
    <div class="party-name">${f.receptorNombre}</div>
    ${f.receptorNIF ? `<div class="party-detail">${f.receptorNIF}</div>` : ''}
    ${socio?.telefono ? `<div class="party-detail">${socio.telefono}</div>` : ''}
    ${socio?.email ? `<div class="party-detail">${socio.email}</div>` : ''}
  </div>
</div>
<div class="meta">Fecha de emisión: <strong>${fecha(f.fechaEmision)}</strong></div>
<table>
  <thead><tr><th>Concepto</th><th style="text-align:right">Importe</th></tr></thead>
  <tbody>
    <tr>
      <td>
        <div style="font-weight:600">Servicios de pilates</div>
        <div style="font-size:11px;color:#71727A;margin-top:2px">Cuota mensual / bono</div>
      </td>
      <td>${fmt(f.baseImponible)} €</td>
    </tr>
  </tbody>
  <tfoot>
    <tr class="sub-row"><td>Base imponible</td><td>${fmt(f.baseImponible)} €</td></tr>
    <tr class="sub-row"><td>IVA (${f.tipoIVA}%)</td><td>${fmt(f.cuotaIVA)} €</td></tr>
    <tr class="total-row"><td>TOTAL</td><td>${fmt(f.total)} €</td></tr>
  </tfoot>
</table>
<div class="footer">Documento generado el ${new Date().toLocaleDateString('es-ES')} · Tentare · B-12345678</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  const previewFactura = preview ? facturas.find(f => f.id === preview) : null;
  const previewSocio = previewFactura ? socioParaFactura(previewFactura.reciboId) : null;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#15161B] tracking-tight">Facturas</h1>
          <p className="text-sm font-medium mt-0.5 text-[#71727A]">
            {facturas.length} facturas · {kpi(totalGeneral)} € total
          </p>
        </div>
        <button
          onClick={() => exportarCSV()}
          className="flex items-center gap-2 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors bg-[#15161B] hover:bg-[#2A2B34]"
        >
          <Download size={14} />
          Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#ECECF1] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#71727A]">Este mes</p>
          <p className="text-2xl font-extrabold text-[#15161B] mt-1">{kpi(totalMes)} €</p>
          {totalMesAnterior > 0 && (
            <p className={cn('text-xs font-semibold mt-1', variacion >= 0 ? 'text-[#059669]' : 'text-[#DC2626]')}>
              {variacion >= 0 ? '+' : ''}{variacion.toFixed(1)}% vs mes anterior
            </p>
          )}
        </div>
        <div className="bg-white border border-[#ECECF1] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#71727A]">Base imponible</p>
          <p className="text-2xl font-extrabold text-[#15161B] mt-1">{kpi(baseTotal)} €</p>
          <p className="text-xs font-medium text-[#71727A] mt-1">sin IVA</p>
        </div>
        <div className="bg-white border border-[#ECECF1] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#71727A]">IVA repercutido</p>
          <p className="text-2xl font-extrabold text-[#15161B] mt-1">{kpi(ivaTotal)} €</p>
          <p className="text-xs font-medium text-[#71727A] mt-1">21% tipo general</p>
        </div>
        <div className="bg-white border border-[#ECECF1] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#71727A]">Total emitido</p>
          <p className="text-2xl font-extrabold text-[#15161B] mt-1">{kpi(totalGeneral)} €</p>
          <p className="text-xs font-medium text-[#71727A] mt-1">{filtradas.length} facturas</p>
        </div>
      </div>

      {/* Verifactu banner */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-[#EEEBFF] border border-[#BFDBFE]">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-[#BFDBFE]">
          <FileText size={15} className="text-[#4B3FD6]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-[#15161B]">Verifactu — Próximamente</p>
          <p className="text-xs font-medium mt-0.5 text-[#4B3FD6]">
            Integración con AEAT en desarrollo. Las facturas se generan automáticamente al cobrar un recibo.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#71727A]" />
          <input
            type="text"
            placeholder="Buscar por número, receptor o NIF..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white rounded-xl border border-[#ECECF1] focus:outline-none focus:border-[#15161B] placeholder:text-[#A2A3AC] text-[#15161B] transition-colors"
          />
        </div>
        <div className="flex bg-white border border-[#ECECF1] rounded-xl overflow-hidden">
          {(['mes', 'cliente'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setAgrupador(opt)}
              className={cn(
                'px-4 py-2.5 text-sm font-semibold transition-colors capitalize',
                agrupador === opt ? 'bg-[#15161B] text-white' : 'text-[#71727A] hover:bg-gray-50'
              )}
            >
              Por {opt === 'mes' ? 'mes' : 'cliente'}
            </button>
          ))}
        </div>
      </div>

      {/* Table grouped */}
      <div className="bg-white rounded-xl border border-[#ECECF1] overflow-hidden">
        {grupos.length === 0 ? (
          <div className="text-center py-16 text-sm text-[#71727A]">No se encontraron facturas.</div>
        ) : grupos.map(grupo => {
          const isOpen = expanded.has(grupo.key);
          return (
            <div key={grupo.key} className="border-b border-[#ECECF1] last:border-b-0">
              {/* Group header */}
              <div
                onClick={() => toggleGrupo(grupo.key)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown size={14} className="text-[#71727A]" /> : <ChevronRight size={14} className="text-[#71727A]" />}
                  <span className="text-sm font-bold text-[#15161B] capitalize">{grupo.label}</span>
                  <span className="text-xs font-semibold text-[#71727A]">{grupo.items.length} facturas</span>
                </div>
                <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => exportarCSV(grupo.items)}
                    className="text-xs font-semibold text-[#71727A] hover:text-[#15161B] flex items-center gap-1 transition-colors"
                  >
                    <Download size={11} />
                    CSV
                  </button>
                  <span className="text-sm font-extrabold text-[#15161B]">{kpi(grupo.total)} €</span>
                </div>
              </div>

              {/* Rows */}
              {isOpen && (
                <>
                <div className="lg:hidden divide-y divide-[#F1F1F6] border-t border-[#F1F1F6]">
                  {grupo.items.map(f => {
                    const socio = socioParaFactura(f.reciboId);
                    return (
                      <div key={f.id} className="px-4 py-3.5 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[12px] font-bold text-[#4B3FD6]">{f.numeroCompleto}</p>
                          <p className="text-[14px] font-semibold text-[#15161B] truncate mt-0.5">{f.receptorNombre}</p>
                          <p className="text-[12px] text-[#71727A] mt-0.5">{fecha(f.fechaEmision)} · IVA {f.tipoIVA}%</p>
                          <div className="flex items-center gap-4 mt-1.5">
                            <button onClick={() => setPreview(f.id)} className="text-[12px] font-semibold text-[#71727A]">Ver</button>
                            <button onClick={() => descargarPDF(f, socio)} className="text-[12px] font-semibold text-[#6355FF] inline-flex items-center gap-1">
                              <Download size={11} /> PDF
                            </button>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[15px] font-extrabold text-[#15161B] whitespace-nowrap">{kpi(f.total)} €</p>
                          <p className="text-[11px] text-[#A2A3AC] whitespace-nowrap">base {kpi(f.baseImponible)} €</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="px-4 py-3 flex items-center justify-between bg-[#F4F4F8]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#71727A]">Subtotal ({grupo.items.length})</span>
                    <span className="text-[15px] font-extrabold text-[#15161B]">{kpi(grupo.items.reduce((s, f) => s + f.total, 0))} €</span>
                  </div>
                </div>

                <div className="overflow-x-auto hidden lg:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-[#F1F1F6] bg-[#F4F4F8]">
                        {['Número', 'Fecha', 'Receptor', 'NIF', 'Base', 'IVA', 'Total', ''].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-[#71727A]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F1F6]">
                      {grupo.items.map(f => {
                        const socio = socioParaFactura(f.reciboId);
                        return (
                          <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs font-bold text-[#4B3FD6]">{f.numeroCompleto}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-[#71727A]">{fecha(f.fechaEmision)}</td>
                            <td className="px-4 py-3 font-semibold text-[#15161B]">
                              {socio
                                ? <Link href={`/socios/${socio.id}`} className="hover:text-[#4B3FD6] hover:underline transition-colors">{f.receptorNombre}</Link>
                                : f.receptorNombre
                              }
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-[#71727A]">{f.receptorNIF ?? '—'}</td>
                            <td className="px-4 py-3 text-right font-medium text-[#15161B]">{kpi(f.baseImponible)} €</td>
                            <td className="px-4 py-3 text-right text-[#71727A]">{f.tipoIVA}%</td>
                            <td className="px-4 py-3 font-extrabold text-right text-[#15161B]">{kpi(f.total)} €</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setPreview(f.id)}
                                  className="text-xs font-semibold text-[#71727A] hover:text-[#15161B] transition-colors"
                                >
                                  Ver
                                </button>
                                <button
                                  onClick={() => descargarPDF(f, socio)}
                                  className="text-xs font-semibold text-[#6355FF] hover:text-[#4B3FD6] transition-colors flex items-center gap-1"
                                >
                                  <Download size={11} />
                                  PDF
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#ECECF1] bg-[#F4F4F8]">
                        <td colSpan={4} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#71727A]">Subtotal ({grupo.items.length})</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#15161B]">
                          {kpi(grupo.items.reduce((s, f) => s + f.baseImponible, 0))} €
                        </td>
                        <td />
                        <td className="px-4 py-3 text-right font-extrabold text-[#15161B]">
                          {kpi(grupo.items.reduce((s, f) => s + f.total, 0))} €
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                </>
              )}
            </div>
          );
        })}

        {/* Total footer */}
        {filtradas.length > 0 && (
          <div className="border-t-2 border-[#ECECF1] bg-[#F4F4F8] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-3.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#71727A]">TOTAL ({filtradas.length} facturas)</span>
            <div className="flex items-center gap-4 sm:gap-8 text-sm flex-wrap">
              <span className="text-[#71727A] font-medium">Base: <strong className="text-[#15161B]">{kpi(baseTotal)} €</strong></span>
              <span className="text-[#71727A] font-medium">IVA: <strong className="text-[#15161B]">{kpi(ivaTotal)} €</strong></span>
              <span className="text-[#71727A] font-bold">Total: <strong className="text-[#15161B] text-base">{kpi(totalGeneral)} €</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Invoice preview modal */}
      {previewFactura && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Mock invoice */}
            <div className="p-8">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <p className="text-2xl font-extrabold text-[#15161B]">FACTURA</p>
                  <p className="text-sm font-mono font-bold text-[#4B3FD6] mt-1">{previewFactura.numeroCompleto}</p>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#71727A] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#71727A] mb-2">Emisor</p>
                  <p className="font-bold text-[#15161B]">Tentare</p>
                  <p className="text-[#71727A]">B-12345678</p>
                  <p className="text-[#71727A]">Calle Ejemplo 1, Málaga</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#71727A] mb-2">Receptor</p>
                  <p className="font-bold text-[#15161B]">{previewFactura.receptorNombre}</p>
                  {previewFactura.receptorNIF && <p className="text-[#71727A]">{previewFactura.receptorNIF}</p>}
                  {previewSocio?.telefono && <p className="text-[#71727A]">{previewSocio.telefono}</p>}
                </div>
              </div>

              <div className="text-sm mb-1 text-[#71727A]">
                Fecha de emisión: <strong className="text-[#15161B]">{fecha(previewFactura.fechaEmision)}</strong>
              </div>

              <div className="mt-6 border border-[#ECECF1] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F4F4F8] border-b border-[#ECECF1]">
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#71727A]">Concepto</th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase text-[#71727A]">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#ECECF1]">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-[#15161B]">Servicios de pilates</p>
                        <p className="text-xs text-[#71727A] mt-0.5">Cuota mensual / bono</p>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-[#15161B]">{kpi(previewFactura.baseImponible)} €</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-[#F4F4F8]">
                    <tr className="border-t border-[#ECECF1]">
                      <td className="px-4 py-2.5 text-[#71727A] text-sm">Base imponible</td>
                      <td className="px-4 py-2.5 text-right text-sm text-[#15161B]">{kpi(previewFactura.baseImponible)} €</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-[#71727A] text-sm">IVA ({previewFactura.tipoIVA}%)</td>
                      <td className="px-4 py-2.5 text-right text-sm text-[#15161B]">{kpi(previewFactura.cuotaIVA)} €</td>
                    </tr>
                    <tr className="border-t-2 border-[#ECECF1]">
                      <td className="px-4 py-3 font-extrabold text-[#15161B]">TOTAL</td>
                      <td className="px-4 py-3 text-right font-extrabold text-[#15161B] text-base">{kpi(previewFactura.total)} €</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => exportarCSV([previewFactura])}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#ECECF1] text-sm font-semibold text-[#71727A] hover:bg-gray-50 transition-colors"
                >
                  <Download size={14} />
                  CSV
                </button>
                <button
                  onClick={() => descargarPDF(previewFactura, previewSocio)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#6355FF] text-white text-sm font-semibold hover:bg-[#4B3FD6] transition-colors"
                >
                  <Download size={14} />
                  Descargar PDF
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#15161B] text-white text-sm font-semibold hover:bg-[#2A2B34] transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
