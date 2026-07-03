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
  body { font-family: -apple-system, Arial, sans-serif; font-size: 13px; color: #111827; padding: 40px; max-width: 680px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .title { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
  .numero { font-size: 13px; font-family: monospace; font-weight: 700; color: #6B4FA8; margin-top: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
  .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6B7280; margin-bottom: 6px; }
  .party-name { font-weight: 700; margin-bottom: 2px; }
  .party-detail { color: #6B7280; margin-bottom: 2px; }
  .meta { font-size: 12px; color: #6B7280; margin-bottom: 32px; }
  .meta strong { color: #111827; }
  table { width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #E8EAED; }
  thead tr { background: #F9FAFB; }
  th { text-align: left; padding: 10px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6B7280; }
  th:last-child { text-align: right; }
  td { padding: 14px 16px; border-top: 1px solid #E8EAED; }
  td:last-child { text-align: right; font-weight: 600; }
  .sub-row td { background: #F9FAFB; font-size: 12px; color: #6B7280; padding: 8px 16px; }
  .sub-row td:last-child { font-weight: 400; }
  .total-row td { font-weight: 900; font-size: 15px; border-top: 2px solid #E8EAED; padding: 12px 16px; }
  .footer { margin-top: 48px; font-size: 11px; color: #9CA3AF; border-top: 1px solid #F3F4F6; padding-top: 16px; }
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
    <div style="color:#6B7280">B-12345678</div>
    <div style="color:#6B7280">Calle Larios 12, Málaga</div>
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
        <div style="font-size:11px;color:#6B7280;margin-top:2px">Cuota mensual / bono</div>
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
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Facturas</h1>
          <p className="text-sm font-medium mt-0.5 text-[#6B7280]">
            {facturas.length} facturas · {kpi(totalGeneral)} € total
          </p>
        </div>
        <button
          onClick={() => exportarCSV()}
          className="flex items-center gap-2 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors bg-[#111827] hover:bg-[#1f2937]"
        >
          <Download size={14} />
          Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E8EAED] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">Este mes</p>
          <p className="text-2xl font-extrabold text-[#111827] mt-1">{kpi(totalMes)} €</p>
          {totalMesAnterior > 0 && (
            <p className={cn('text-xs font-semibold mt-1', variacion >= 0 ? 'text-[#059669]' : 'text-[#DC2626]')}>
              {variacion >= 0 ? '+' : ''}{variacion.toFixed(1)}% vs mes anterior
            </p>
          )}
        </div>
        <div className="bg-white border border-[#E8EAED] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">Base imponible</p>
          <p className="text-2xl font-extrabold text-[#111827] mt-1">{kpi(baseTotal)} €</p>
          <p className="text-xs font-medium text-[#6B7280] mt-1">sin IVA</p>
        </div>
        <div className="bg-white border border-[#E8EAED] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">IVA repercutido</p>
          <p className="text-2xl font-extrabold text-[#111827] mt-1">{kpi(ivaTotal)} €</p>
          <p className="text-xs font-medium text-[#6B7280] mt-1">21% tipo general</p>
        </div>
        <div className="bg-white border border-[#E8EAED] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">Total emitido</p>
          <p className="text-2xl font-extrabold text-[#111827] mt-1">{kpi(totalGeneral)} €</p>
          <p className="text-xs font-medium text-[#6B7280] mt-1">{filtradas.length} facturas</p>
        </div>
      </div>

      {/* Verifactu banner */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE]">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-[#BFDBFE]">
          <FileText size={15} className="text-[#2563EB]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-[#111827]">Verifactu — Próximamente</p>
          <p className="text-xs font-medium mt-0.5 text-[#2563EB]">
            Integración con AEAT en desarrollo. Las facturas se generan automáticamente al cobrar un recibo.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Buscar por número, receptor o NIF..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white rounded-xl border border-[#E8EAED] focus:outline-none focus:border-[#111827] placeholder:text-[#9CA3AF] text-[#111827] transition-colors"
          />
        </div>
        <div className="flex bg-white border border-[#E8EAED] rounded-xl overflow-hidden">
          {(['mes', 'cliente'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setAgrupador(opt)}
              className={cn(
                'px-4 py-2.5 text-sm font-semibold transition-colors capitalize',
                agrupador === opt ? 'bg-[#111827] text-white' : 'text-[#6B7280] hover:bg-gray-50'
              )}
            >
              Por {opt === 'mes' ? 'mes' : 'cliente'}
            </button>
          ))}
        </div>
      </div>

      {/* Table grouped */}
      <div className="bg-white rounded-xl border border-[#E8EAED] overflow-hidden">
        {grupos.length === 0 ? (
          <div className="text-center py-16 text-sm text-[#6B7280]">No se encontraron facturas.</div>
        ) : grupos.map(grupo => {
          const isOpen = expanded.has(grupo.key);
          return (
            <div key={grupo.key} className="border-b border-[#E8EAED] last:border-b-0">
              {/* Group header */}
              <div
                onClick={() => toggleGrupo(grupo.key)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown size={14} className="text-[#6B7280]" /> : <ChevronRight size={14} className="text-[#6B7280]" />}
                  <span className="text-sm font-bold text-[#111827] capitalize">{grupo.label}</span>
                  <span className="text-xs font-semibold text-[#6B7280]">{grupo.items.length} facturas</span>
                </div>
                <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => exportarCSV(grupo.items)}
                    className="text-xs font-semibold text-[#6B7280] hover:text-[#111827] flex items-center gap-1 transition-colors"
                  >
                    <Download size={11} />
                    CSV
                  </button>
                  <span className="text-sm font-extrabold text-[#111827]">{kpi(grupo.total)} €</span>
                </div>
              </div>

              {/* Rows */}
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-[#F3F4F6] bg-[#F9FAFB]">
                        {['Número', 'Fecha', 'Receptor', 'NIF', 'Base', 'IVA', 'Total', ''].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-[#6B7280]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {grupo.items.map(f => {
                        const socio = socioParaFactura(f.reciboId);
                        return (
                          <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs font-bold text-[#2563EB]">{f.numeroCompleto}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-[#6B7280]">{fecha(f.fechaEmision)}</td>
                            <td className="px-4 py-3 font-semibold text-[#111827]">
                              {socio
                                ? <Link href={`/socios/${socio.id}`} className="hover:text-[#2563EB] hover:underline transition-colors">{f.receptorNombre}</Link>
                                : f.receptorNombre
                              }
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-[#6B7280]">{f.receptorNIF ?? '—'}</td>
                            <td className="px-4 py-3 text-right font-medium text-[#111827]">{kpi(f.baseImponible)} €</td>
                            <td className="px-4 py-3 text-right text-[#6B7280]">{f.tipoIVA}%</td>
                            <td className="px-4 py-3 font-extrabold text-right text-[#111827]">{kpi(f.total)} €</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setPreview(f.id)}
                                  className="text-xs font-semibold text-[#6B7280] hover:text-[#111827] transition-colors"
                                >
                                  Ver
                                </button>
                                <button
                                  onClick={() => descargarPDF(f, socio)}
                                  className="text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] transition-colors flex items-center gap-1"
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
                      <tr className="border-t-2 border-[#E8EAED] bg-[#F9FAFB]">
                        <td colSpan={4} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#6B7280]">Subtotal ({grupo.items.length})</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#111827]">
                          {kpi(grupo.items.reduce((s, f) => s + f.baseImponible, 0))} €
                        </td>
                        <td />
                        <td className="px-4 py-3 text-right font-extrabold text-[#111827]">
                          {kpi(grupo.items.reduce((s, f) => s + f.total, 0))} €
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* Total footer */}
        {filtradas.length > 0 && (
          <div className="border-t-2 border-[#E8EAED] bg-[#F9FAFB] flex items-center justify-between px-5 py-3.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">TOTAL ({filtradas.length} facturas)</span>
            <div className="flex items-center gap-8 text-sm">
              <span className="text-[#6B7280] font-medium">Base: <strong className="text-[#111827]">{kpi(baseTotal)} €</strong></span>
              <span className="text-[#6B7280] font-medium">IVA: <strong className="text-[#111827]">{kpi(ivaTotal)} €</strong></span>
              <span className="text-[#6B7280] font-bold">Total: <strong className="text-[#111827] text-base">{kpi(totalGeneral)} €</strong></span>
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
                  <p className="text-2xl font-extrabold text-[#111827]">FACTURA</p>
                  <p className="text-sm font-mono font-bold text-[#6B4FA8] mt-1">{previewFactura.numeroCompleto}</p>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6B7280] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#6B7280] mb-2">Emisor</p>
                  <p className="font-bold text-[#111827]">Tentare</p>
                  <p className="text-[#6B7280]">B-12345678</p>
                  <p className="text-[#6B7280]">Calle Ejemplo 1, Málaga</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#6B7280] mb-2">Receptor</p>
                  <p className="font-bold text-[#111827]">{previewFactura.receptorNombre}</p>
                  {previewFactura.receptorNIF && <p className="text-[#6B7280]">{previewFactura.receptorNIF}</p>}
                  {previewSocio?.telefono && <p className="text-[#6B7280]">{previewSocio.telefono}</p>}
                </div>
              </div>

              <div className="text-sm mb-1 text-[#6B7280]">
                Fecha de emisión: <strong className="text-[#111827]">{fecha(previewFactura.fechaEmision)}</strong>
              </div>

              <div className="mt-6 border border-[#E8EAED] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F9FAFB] border-b border-[#E8EAED]">
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#6B7280]">Concepto</th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase text-[#6B7280]">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#E8EAED]">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-[#111827]">Servicios de pilates</p>
                        <p className="text-xs text-[#6B7280] mt-0.5">Cuota mensual / bono</p>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-[#111827]">{kpi(previewFactura.baseImponible)} €</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-[#F9FAFB]">
                    <tr className="border-t border-[#E8EAED]">
                      <td className="px-4 py-2.5 text-[#6B7280] text-sm">Base imponible</td>
                      <td className="px-4 py-2.5 text-right text-sm text-[#111827]">{kpi(previewFactura.baseImponible)} €</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-[#6B7280] text-sm">IVA ({previewFactura.tipoIVA}%)</td>
                      <td className="px-4 py-2.5 text-right text-sm text-[#111827]">{kpi(previewFactura.cuotaIVA)} €</td>
                    </tr>
                    <tr className="border-t-2 border-[#E8EAED]">
                      <td className="px-4 py-3 font-extrabold text-[#111827]">TOTAL</td>
                      <td className="px-4 py-3 text-right font-extrabold text-[#111827] text-base">{kpi(previewFactura.total)} €</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => exportarCSV([previewFactura])}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8EAED] text-sm font-semibold text-[#6B7280] hover:bg-gray-50 transition-colors"
                >
                  <Download size={14} />
                  CSV
                </button>
                <button
                  onClick={() => descargarPDF(previewFactura, previewSocio)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4F46E5] text-white text-sm font-semibold hover:bg-[#4338CA] transition-colors"
                >
                  <Download size={14} />
                  Descargar PDF
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#111827] text-white text-sm font-semibold hover:bg-[#1f2937] transition-colors"
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
