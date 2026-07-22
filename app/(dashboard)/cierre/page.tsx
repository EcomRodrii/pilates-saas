'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, Plus, Pencil, Trash2, Info, ShieldCheck, Mail, Send, Check } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { serializeCsv } from '@/lib/csv';
import { computeCierreAnual, desglosarIvaDesdeTotal, type CierreLinea } from '@/lib/fiscal/cierre-engine';
import type { IngresoManual } from '@/lib/types';

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface FormState {
  id: string | null;
  fecha: string;
  concepto: string;
  cliente: string;
  nif: string;
  total: string;
  tipoIva: string;
  nota: string;
}
const emptyForm = (anio: number, ivaDef: number): FormState => ({
  id: null, fecha: `${anio}-01-01`, concepto: '', cliente: '', nif: '', total: '', tipoIva: String(ivaDef), nota: '',
});

export default function CierreDeAnoPage() {
  const { facturas, studio } = useStudio();
  const ivaDef = studio?.ivaPorDefecto ?? 21;

  const [anio, setAnio] = useState<number>(() => new Date().getFullYear());
  const [manuales, setManuales] = useState<IngresoManual[]>([]);
  // Año al que pertenecen los `manuales` ya cargados. Derivar la carga de aquí
  // (en vez de un setState(true) al entrar en el effect) evita el "setState
  // síncrono dentro de un effect".
  const [manualesAnio, setManualesAnio] = useState<number | null>(null);
  const cargando = manualesAnio !== anio;
  const [form, setForm] = useState<FormState>(() => emptyForm(new Date().getFullYear(), ivaDef));
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<IngresoManual | null>(null);

  // Envío a la gestoría
  const [envOpen, setEnvOpen] = useState(false);
  const [gestEmail, setGestEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [envResult, setEnvResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Años disponibles: los de las facturas + el año actual.
  const anios = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const f of facturas) { const y = Number((f.fechaEmision ?? '').slice(0, 4)); if (y > 2000) set.add(y); }
    return [...set].sort((a, b) => b - a);
  }, [facturas]);

  const cargarManuales = useCallback(async (year: number) => {
    try {
      const res = await fetch(`/api/ingresos-manuales?anio=${year}`, { headers: { ...(await authHeader()) } });
      const data = await res.json();
      setManuales(res.ok ? (data.ingresos ?? []) : []);
    } catch { setManuales([]); }
    finally { setManualesAnio(year); }
  }, []);

  // Carga de datos al cambiar de año: caso legítimo de fetch-en-effect (el
  // setState va dentro del callback async, tras el await). La regla del
  // react-compiler lo marca igualmente por precaución; se silencia a conciencia.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarManuales(anio); }, [anio, cargarManuales]);

  const cierre = useMemo(
    () => computeCierreAnual({ facturas, ingresosManuales: manuales, anio }),
    [facturas, manuales, anio],
  );

  // ── Guardar / editar ────────────────────────────────────────────────────────
  const abrirNuevo = () => { setForm(emptyForm(anio, ivaDef)); setErrorForm(null); setMostrarForm(true); };
  const abrirEditar = (m: IngresoManual) => {
    setForm({ id: m.id, fecha: m.fecha, concepto: m.concepto, cliente: m.cliente ?? '', nif: m.nif ?? '', total: String(m.total), tipoIva: String(m.tipoIVA), nota: m.nota ?? '' });
    setErrorForm(null); setMostrarForm(true);
  };

  const guardar = async () => {
    setGuardando(true); setErrorForm(null);
    try {
      const body = { id: form.id ?? undefined, fecha: form.fecha, concepto: form.concepto, cliente: form.cliente, nif: form.nif, total: Number(form.total.replace(',', '.')), tipoIva: Number(form.tipoIva.replace(',', '.')), nota: form.nota };
      const res = await fetch('/api/ingresos-manuales', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErrorForm(data.error ?? 'No se ha podido guardar.'); return; }
      const ing: IngresoManual = data.ingreso;
      // Solo lo mostramos si cae en el año seleccionado.
      const enAnio = ing.fecha.slice(0, 4) === String(anio);
      setManuales(prev => {
        const sin = prev.filter(x => x.id !== ing.id);
        return enAnio ? [...sin, ing].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)) : sin;
      });
      setMostrarForm(false);
    } catch { setErrorForm('Error de red. Inténtalo de nuevo.'); }
    finally { setGuardando(false); }
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    const id = borrar.id;
    setManuales(prev => prev.filter(x => x.id !== id));
    setBorrar(null);
    await fetch('/api/ingresos-manuales', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  // Previsualización del total al escribir el importe.
  const previaDesglose = useMemo(() => {
    const t = Number(form.total.replace(',', '.')); const tv = Number(form.tipoIva.replace(',', '.'));
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(tv)) return null;
    return desglosarIvaDesdeTotal(t, tv);
  }, [form.total, form.tipoIva]);

  // ── Exportar ─────────────────────────────────────────────────────────────────
  const descargarCsv = () => {
    const headers = ['Fecha', 'Nº factura', 'Origen', 'Cliente', 'NIF', 'Base imponible', 'Tipo IVA', 'Cuota IVA', 'Total'];
    const rows = cierre.lineas.map((l: CierreLinea) => [
      l.fecha, l.numero ?? '', l.origen === 'FACTURA' ? 'Factura Tentare' : 'Manual', l.nombre, l.nif ?? '',
      l.base.toFixed(2), String(l.tipoIva), l.cuota.toFixed(2), l.total.toFixed(2),
    ]);
    const csv = serializeCsv(headers, rows);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cierre-${anio}-libro-facturas.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const imprimir = () => {
    const est = studio?.nombre ?? 'Mi estudio';
    const filas = cierre.trimestres.map(t => `<tr><td>T${t.trimestre}</td><td class="r">${t.num}</td><td class="r">${eur(t.base)}</td><td class="r">${eur(t.cuota)}</td><td class="r">${eur(t.total)}</td></tr>`).join('');
    const ivas = cierre.porIva.map(v => `<tr><td>${v.tipoIva}%</td><td class="r">${eur(v.base)}</td><td class="r">${eur(v.cuota)}</td></tr>`).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cierre ${anio} · ${est}</title>
      <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:40px;max-width:760px;margin:0 auto}
      h1{font-size:24px;margin:0 0 4px}.sub{color:#666;font-size:13px;margin:0 0 24px}
      table{width:100%;border-collapse:collapse;margin:10px 0 26px;font-size:13px}
      th,td{padding:8px 10px;border-bottom:1px solid #e5e2da;text-align:left}.r{text-align:right;font-variant-numeric:tabular-nums}
      tfoot td{font-weight:700;border-top:2px solid #cfcabf}h2{font-size:15px;margin:24px 0 6px}
      .grid{display:flex;gap:14px;margin-bottom:22px}.k{flex:1;border:1px solid #e5e2da;border-radius:10px;padding:12px}
      .k .l{font-size:11px;color:#666}.k .v{font-size:20px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums}
      .note{font-size:11px;color:#888;margin-top:24px;line-height:1.5}</style></head><body>
      <h1>Cierre de año ${anio}</h1><p class="sub">${est} · resumen de ingresos y de IVA repercutido para la gestoría</p>
      <div class="grid">
        <div class="k"><div class="l">Base imponible</div><div class="v">${eur(cierre.totales.base)}</div></div>
        <div class="k"><div class="l">IVA repercutido</div><div class="v">${eur(cierre.totales.cuota)}</div></div>
        <div class="k"><div class="l">Total facturado</div><div class="v">${eur(cierre.totales.total)}</div></div>
      </div>
      <h2>Resumen por trimestre</h2>
      <table><thead><tr><th>Trimestre</th><th class="r">Nº</th><th class="r">Base</th><th class="r">IVA</th><th class="r">Total</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td>Año ${anio}</td><td class="r">${cierre.totales.numFacturas + cierre.totales.numManuales}</td><td class="r">${eur(cierre.totales.base)}</td><td class="r">${eur(cierre.totales.cuota)}</td><td class="r">${eur(cierre.totales.total)}</td></tr></tfoot></table>
      <h2>IVA por tipo</h2>
      <table><thead><tr><th>Tipo</th><th class="r">Base</th><th class="r">Cuota</th></tr></thead><tbody>${ivas}</tbody></table>
      <p class="note">Incluye ${cierre.totales.numFacturas} facturas emitidas en Tentare${cierre.totales.numManuales ? ` y ${cierre.totales.numManuales} ingreso(s) añadido(s) a mano` : ''}. Recopilación de ingresos y de IVA repercutido — no incluye gastos ni IVA soportado, y no sustituye la presentación de impuestos, que realiza la gestoría.</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 250);
  };

  const abrirEnvio = () => {
    setGestEmail(studio?.gestoriaEmail ?? '');
    setEnvResult(null);
    setEnvOpen(true);
  };
  const enviarGestoria = async () => {
    setEnviando(true); setEnvResult(null);
    try {
      const res = await fetch('/api/cierre/enviar-gestoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ anio, email: gestEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setEnvResult({ ok: false, msg: data.error ?? 'No se ha podido enviar.' }); return; }
      setEnvResult({ ok: true, msg: `Enviado a ${data.email}` });
    } catch { setEnvResult({ ok: false, msg: 'Error de red. Inténtalo de nuevo.' }); }
    finally { setEnviando(false); }
  };

  const facturasAnio = useMemo(() => cierre.lineas.filter(l => l.origen === 'FACTURA'), [cierre]);
  const totalAnual = cierre.totales.numFacturas + cierre.totales.numManuales;

  return (
    <div className="space-y-6" style={{ minHeight: '100%', padding: '0 0 40px' }}>
      <PageHeader
        title="Cierre de año"
        description="Todo lo facturado y el IVA que repercutiste en el año, cuadrado y listo para tu gestoría. Sale de tus facturas ya selladas — no tienes que rehacer ningún Excel."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={descargarCsv}><Download className="size-4" /> CSV</Button>
            <Button variant="outline" onClick={imprimir}><Printer className="size-4" /> Imprimir / PDF</Button>
            <Button onClick={abrirEnvio}><Mail className="size-4" /> Enviar a mi gestoría</Button>
          </div>
        }
      />

      {/* Selector de año */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--border)' }}>
        {anios.map(y => (
          <button
            key={y}
            onClick={() => setAnio(y)}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            style={y === anio ? { backgroundColor: 'var(--foreground)', color: 'var(--background)' } : { color: 'var(--muted-foreground)' }}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Aviso de honestidad */}
      <div className="flex gap-2.5 items-start rounded-xl border border-border bg-accent px-4 py-3 text-sm">
        <Info className="size-4 shrink-0 mt-0.5 text-brand" aria-hidden />
        <p className="text-foreground/85 leading-relaxed m-0">
          <b>Esto recopila tus ingresos y el IVA repercutido</b>, no es tu declaración. No incluye gastos ni IVA soportado, y no se presenta a Hacienda — el cierre lo valida y presenta tu gestoría. Tentare te da el paquete hecho.
        </p>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border p-5" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
          <div className="text-xs font-medium opacity-70">Total facturado</div>
          <div className="text-2xl font-extrabold tracking-tight mt-2 tabular-nums">{eur(cierre.totales.total)}</div>
          <div className="text-xs opacity-60 mt-0.5">IVA incluido · {totalAnual} ingresos</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs font-medium text-muted-foreground">Base imponible</div>
          <div className="text-2xl font-extrabold tracking-tight mt-2 tabular-nums">{eur(cierre.totales.base)}</div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">lo que declaras como ingreso</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs font-medium text-muted-foreground">IVA repercutido</div>
          <div className="text-2xl font-extrabold tracking-tight mt-2 tabular-nums">{eur(cierre.totales.cuota)}</div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">para cuadrar tus 303 / 390</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs font-medium text-muted-foreground">Facturas emitidas</div>
          <div className="text-2xl font-extrabold tracking-tight mt-2 tabular-nums">{cierre.totales.numFacturas}</div>
          <div className="text-xs mt-1 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
            <ShieldCheck className="size-3.5" /> {cierre.sellado.selladas}/{cierre.sellado.totalFacturas} selladas
          </div>
        </div>
      </div>

      {/* Trimestres */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold m-0">Resumen trimestral de IVA</h2>
          <span className="text-xs text-muted-foreground">Cada trimestre debería cuadrar con el modelo 303 que presentó tu gestoría</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-semibold px-5 py-3">Trimestre</th>
                <th className="text-right font-semibold px-5 py-3">Facturas</th>
                <th className="text-right font-semibold px-5 py-3">Base imponible</th>
                <th className="text-right font-semibold px-5 py-3">IVA repercutido</th>
                <th className="text-right font-semibold px-5 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {cierre.trimestres.map(t => (
                <tr key={t.trimestre} className="border-t border-border">
                  <td className="text-left font-semibold px-5 py-3">T{t.trimestre} · {['ene–mar', 'abr–jun', 'jul–sep', 'oct–dic'][t.trimestre - 1]}</td>
                  <td className="text-right px-5 py-3 text-muted-foreground">{t.num}</td>
                  <td className="text-right px-5 py-3">{eur(t.base)}</td>
                  <td className="text-right px-5 py-3">{eur(t.cuota)}</td>
                  <td className="text-right px-5 py-3">{eur(t.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-extrabold" style={{ backgroundColor: 'var(--secondary)' }}>
                <td className="text-left px-5 py-3.5">Año {anio}</td>
                <td className="text-right px-5 py-3.5 text-muted-foreground">{totalAnual}</td>
                <td className="text-right px-5 py-3.5">{eur(cierre.totales.base)}</td>
                <td className="text-right px-5 py-3.5">{eur(cierre.totales.cuota)}</td>
                <td className="text-right px-5 py-3.5">{eur(cierre.totales.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* IVA por tipo + sellado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border"><h2 className="text-base font-bold m-0">IVA por tipo</h2></div>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-semibold px-5 py-3">Tipo</th>
                <th className="text-right font-semibold px-5 py-3">Base</th>
                <th className="text-right font-semibold px-5 py-3">Cuota</th>
              </tr>
            </thead>
            <tbody>
              {cierre.porIva.length === 0 && <tr><td colSpan={3} className="px-5 py-6 text-center text-muted-foreground">Sin ingresos este año.</td></tr>}
              {cierre.porIva.map(v => (
                <tr key={v.tipoIva} className="border-t border-border">
                  <td className="text-left font-semibold px-5 py-3">{v.tipoIva}%</td>
                  <td className="text-right px-5 py-3">{eur(v.base)}</td>
                  <td className="text-right px-5 py-3">{eur(v.cuota)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold m-0">Sellado fiscal</h2>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl grid place-items-center shrink-0 bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight tabular-nums">{cierre.sellado.selladas} / {cierre.sellado.totalFacturas} selladas</div>
              <div className="text-xs text-muted-foreground">Cadena Verifactu · numeración correlativa</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed m-0">
            Cada factura lleva su huella encadenada. Si tu gestoría pide el libro registro de facturas emitidas, se exporta con el botón CSV de arriba.
          </p>
        </section>
      </div>

      {/* Mensual */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border"><h2 className="text-base font-bold m-0">Facturación mensual {anio}</h2></div>
        <MonthlyBars meses={cierre.meses.map(m => m.total)} />
      </section>

      {/* Ingresos manuales */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold m-0">Ingresos cobrados fuera de Tentare</h2>
            <p className="text-xs text-muted-foreground mt-1 mb-0 max-w-lg">¿Cobraste algo en efectivo, por transferencia o en otra plataforma? Añádelo a mano para que el cierre esté completo. Se suma a los totales, marcado como manual (sin factura de Tentare).</p>
          </div>
          {!mostrarForm && <Button variant="outline" onClick={abrirNuevo}><Plus className="size-4" /> Añadir ingreso</Button>}
        </div>

        {mostrarForm && (
          <div className="px-5 py-4 border-b border-border bg-accent/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-concepto">Concepto *</Label>
                <Input id="cm-concepto" value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Taller de fin de semana" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-fecha">Fecha *</Label>
                <Input id="cm-fecha" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-total">Importe cobrado (IVA incl.) *</Label>
                <Input id="cm-total" inputMode="decimal" value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))} placeholder="120,00" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-iva">Tipo de IVA (%)</Label>
                <Input id="cm-iva" inputMode="decimal" value={form.tipoIva} onChange={e => setForm(f => ({ ...f, tipoIva: e.target.value }))} placeholder="21" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-cliente">Cliente (opcional)</Label>
                <Input id="cm-cliente" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} placeholder="Nombre o empresa" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cm-nif">NIF (opcional)</Label>
                <Input id="cm-nif" value={form.nif} onChange={e => setForm(f => ({ ...f, nif: e.target.value }))} placeholder="Para el 347" />
              </div>
            </div>
            {previaDesglose && (
              <p className="text-xs text-muted-foreground mt-3 mb-0 tabular-nums">
                Se desglosará en <b className="text-foreground">{eur(previaDesglose.base)}</b> de base + <b className="text-foreground">{eur(previaDesglose.cuota)}</b> de IVA.
              </p>
            )}
            {errorForm && <p className="text-xs text-destructive mt-2 mb-0">{errorForm}</p>}
            <div className="flex gap-2 mt-4">
              <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Añadir'}</Button>
              <Button variant="ghost" onClick={() => setMostrarForm(false)} disabled={guardando}>Cancelar</Button>
            </div>
          </div>
        )}

        {cargando ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : manuales.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nada añadido para {anio}. Todo lo que cobraste fuera de Tentare va aquí.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-semibold px-5 py-3">Fecha</th>
                  <th className="text-left font-semibold px-5 py-3">Concepto</th>
                  <th className="text-right font-semibold px-5 py-3">Base</th>
                  <th className="text-right font-semibold px-5 py-3">IVA</th>
                  <th className="text-right font-semibold px-5 py-3">Total</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {manuales.map(m => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="text-left px-5 py-3 text-muted-foreground">{m.fecha.slice(8, 10)}/{m.fecha.slice(5, 7)}</td>
                    <td className="text-left px-5 py-3">
                      <span className="font-semibold">{m.concepto}</span>
                      {m.cliente && <span className="text-muted-foreground"> · {m.cliente}</span>}
                    </td>
                    <td className="text-right px-5 py-3">{eur(m.baseImponible)}</td>
                    <td className="text-right px-5 py-3">{eur(m.cuotaIVA)} <span className="text-muted-foreground text-xs">({m.tipoIVA}%)</span></td>
                    <td className="text-right px-5 py-3 font-semibold">{eur(m.total)}</td>
                    <td className="text-right px-5 py-3 whitespace-nowrap">
                      <button onClick={() => abrirEditar(m)} className="text-muted-foreground hover:text-foreground p-1.5" aria-label="Editar"><Pencil className="size-4" /></button>
                      <button onClick={() => setBorrar(m)} className="text-muted-foreground hover:text-destructive p-1.5" aria-label="Eliminar"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Libro de facturas (preview) */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold m-0">Libro de facturas emitidas</h2>
          <span className="text-xs text-muted-foreground">Registro de IVA repercutido — vista previa</span>
        </div>
        {facturasAnio.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Sin facturas emitidas en {anio}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-semibold px-5 py-3">Nº</th>
                  <th className="text-left font-semibold px-5 py-3">Fecha</th>
                  <th className="text-left font-semibold px-5 py-3">Cliente</th>
                  <th className="text-right font-semibold px-5 py-3">Base</th>
                  <th className="text-right font-semibold px-5 py-3">IVA</th>
                  <th className="text-right font-semibold px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {facturasAnio.slice(0, 8).map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="text-left px-5 py-3 font-semibold">{l.numero}</td>
                    <td className="text-left px-5 py-3 text-muted-foreground">{l.fecha.slice(8, 10)}/{l.fecha.slice(5, 7)}</td>
                    <td className="text-left px-5 py-3">{l.nombre}</td>
                    <td className="text-right px-5 py-3">{eur(l.base)}</td>
                    <td className="text-right px-5 py-3">{eur(l.cuota)}</td>
                    <td className="text-right px-5 py-3 font-semibold">{eur(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-t border-border text-sm text-muted-foreground">
          <span>Mostrando {Math.min(8, facturasAnio.length)} de <b className="text-foreground tabular-nums">{facturasAnio.length}</b> facturas del año</span>
          <button onClick={descargarCsv} className="text-brand font-semibold">Descargar libro completo (CSV) →</button>
        </div>
      </section>

      {/* Modelo 347 */}
      <section className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4">
        <div className="size-9 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}>347</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">Modelo 347 · operaciones con terceros</div>
          <div className="text-xs text-muted-foreground mt-0.5">Clientes que te pagaron más de <b className="tabular-nums">3.005,06 €</b> en el año (declaración informativa de febrero).</div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}>
          {cierre.candidatos347.length === 0 ? 'Ninguno este año' : `${cierre.candidatos347.length} a revisar`}
        </span>
      </section>
      {cierre.candidatos347.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden -mt-2">
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {cierre.candidatos347.map((c, i) => (
                <tr key={i} className="border-t border-border first:border-t-0">
                  <td className="text-left px-5 py-3 font-semibold">{c.nombre}</td>
                  <td className="text-left px-5 py-3 text-muted-foreground">{c.nif ?? '—'}</td>
                  <td className="text-right px-5 py-3 font-semibold">{eur(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-3xl">
        <b className="text-muted-foreground">De dónde sale cada dato:</b> se calcula en vivo a partir de tus facturas emitidas en Tentare (base imponible, tipo y cuota de IVA, fecha, NIF y sello Verifactu) más los ingresos que añades a mano. Tentare <b>no</b> presenta impuestos ni sustituye a tu asesor: registra ingresos, no gastos ni IVA soportado.
      </p>

      <ConfirmDialog
        open={!!borrar}
        onOpenChange={(v) => { if (!v) setBorrar(null); }}
        titulo="¿Eliminar este ingreso?"
        descripcion={borrar ? `"${borrar.concepto}" · ${eur(borrar.total)}. No se puede deshacer.` : undefined}
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={confirmarBorrado}
      />

      {/* Enviar a la gestoría */}
      <Dialog open={envOpen} onOpenChange={(v) => { setEnvOpen(v); if (!v) setEnvResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar el cierre {anio} a tu gestoría</DialogTitle>
            <DialogDescription>
              Le llegará el resumen del año ({eur(cierre.totales.total)} facturado) y el libro de facturas emitidas en CSV. Podrá responder directamente a tu estudio.
            </DialogDescription>
          </DialogHeader>

          {envResult?.ok ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-accent px-4 py-3 text-sm">
              <span className="size-7 rounded-full grid place-items-center shrink-0 bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"><Check className="size-4" /></span>
              <span>{envResult.msg}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gest-email">Email de la gestoría</Label>
              <Input id="gest-email" type="email" value={gestEmail} onChange={(e) => setGestEmail(e.target.value)} placeholder="gestoria@ejemplo.com" autoFocus />
              {studio?.gestoriaEmail && <p className="text-xs text-muted-foreground mt-0.5">Guardado la última vez. Puedes cambiarlo.</p>}
              {envResult && !envResult.ok && <p className="text-xs text-destructive mt-1">{envResult.msg}</p>}
            </div>
          )}

          <DialogFooter>
            {envResult?.ok ? (
              <DialogClose render={<Button />}>Cerrar</DialogClose>
            ) : (
              <>
                <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                <Button onClick={enviarGestoria} disabled={enviando || !gestEmail.trim()}>
                  {enviando ? 'Enviando…' : <><Send className="size-4" /> Enviar</>}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Barras mensuales, escaladas al máximo del año.
function MonthlyBars({ meses }: { meses: number[] }) {
  const max = Math.max(1, ...meses);
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k` : String(Math.round(n));
  return (
    <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-end px-4 sm:px-5 py-6" style={{ height: 200 }}>
      {meses.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-2 h-full justify-end min-w-0">
          <div className="text-[9px] font-bold text-muted-foreground tabular-nums whitespace-nowrap">{v > 0 ? fmtK(v) : ''}</div>
          <div className="w-full rounded-t-md" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: 'linear-gradient(180deg, var(--brand-secondary, var(--brand)), var(--brand))', minHeight: 3 }} title={`${MESES[i]}: ${eur(v)}`} />
          <div className="text-[10px] text-muted-foreground">{MESES[i][0]}</div>
        </div>
      ))}
    </div>
  );
}
