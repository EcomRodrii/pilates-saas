'use client';

import { useMemo, useState } from 'react';
import { Ticket, Plus, Sparkles, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { esCodigoReactivacion, buscarCodigo } from '@/lib/codigos-descuento';
import type { CodigoDescuento } from '@/lib/types';

// Gestor mínimo de códigos de descuento dentro del Centro de Control.
//
// Existe porque el módulo Marketing —única UI de codigos_descuento— está
// DESACTIVADO por feature flag (MARKETING_MODULE_ENABLED=false: menú oculto y la
// ruta redirige). Sin esto el propietario no puede ver ni crear códigos, pese a
// que el POS ya los canjea y el Centro de Control los genera en las
// reactivaciones. Muestra TODOS (no solo los automáticos), porque cualquiera del
// catálogo es canjeable en el mostrador.

function estadoDe(c: CodigoDescuento, hoy: string): { texto: string; clase: string } {
  if (!c.activo) return { texto: 'Desactivado', clase: 'bg-muted text-muted-foreground' };
  if (c.expira && c.expira < hoy) return { texto: 'Caducado', clase: 'bg-muted text-muted-foreground' };
  if (c.usosMax != null && c.usos >= c.usosMax) return { texto: 'Agotado', clase: 'bg-[#D1FAE5] text-[#065F46]' };
  return { texto: 'Activo', clase: 'bg-[#FEF3C7] text-[#92400E]' };
}

function fmtFecha(iso: string | null): string {
  if (!iso) return 'sin caducidad';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

const inputCls = 'rounded-lg border border-border px-2.5 py-1.5 text-[13px] w-full focus:outline-none focus:ring-2 focus:ring-black/10';

export function CodigosDescuento() {
  const { codigosDescuento, addCodigoDescuento, toggleCodigoDescuento } = useStudio();
  const hoy = new Date().toISOString().slice(0, 10);

  const [abierto, setAbierto] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [form, setForm] = useState({ codigo: '', tipo: 'PORCENTAJE' as CodigoDescuento['tipo'], valor: '', usosMax: '', expira: '', descripcion: '' });

  const codigos = useMemo(
    () => [...codigosDescuento].sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? '')),
    [codigosDescuento],
  );

  const puedeCrear = form.codigo.trim().length > 0 && parseFloat(form.valor) > 0;

  function crear() {
    if (!puedeCrear) return;
    // El código es único por estudio (índice uq_codigo_descuento_estudio, 0049).
    // Se comprueba aquí porque addCodigoDescuento es optimista + escritura
    // fire-and-forget: sin esto, un duplicado fallaría en silencio en la BD y el
    // código aparecería en pantalla sin existir de verdad.
    if (buscarCodigo(codigosDescuento, form.codigo)) {
      setErrorAlta('Ya existe un código con ese nombre');
      return;
    }
    setErrorAlta(null);
    addCodigoDescuento({
      codigo: form.codigo.trim().toUpperCase(),
      descripcion: form.descripcion.trim() || 'Creado desde el Centro de Control',
      tipo: form.tipo,
      valor: parseFloat(form.valor),
      usosMax: form.usosMax ? parseInt(form.usosMax, 10) : null,
      expira: form.expira || null,
      activo: true,
      minImporte: null,
      soloNuevas: false,
    });
    setForm({ codigo: '', tipo: 'PORCENTAJE', valor: '', usosMax: '', expira: '', descripcion: '' });
    setAbierto(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Códigos de descuento
        </h2>
        <button
          onClick={() => setAbierto(a => !a)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {abierto ? <X size={13} /> : <Plus size={13} />}
          {abierto ? 'Cancelar' : 'Nuevo código'}
        </button>
      </div>

      <div className="rounded-3xl border border-border bg-card p-1">
        {abierto && (
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <input
                className={`${inputCls} flex-1 min-w-[140px] uppercase`}
                placeholder="CÓDIGO"
                value={form.codigo}
                onChange={e => { setForm(f => ({ ...f, codigo: e.target.value })); setErrorAlta(null); }}
              />
              <select
                className={`${inputCls} w-24`}
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as CodigoDescuento['tipo'] }))}
              >
                <option value="PORCENTAJE">%</option>
                <option value="IMPORTE_FIJO">€</option>
              </select>
              <input
                className={`${inputCls} w-24`} type="number" min={0} step="0.01" placeholder="Valor"
                value={form.valor}
                onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className={`${inputCls} w-28`} type="number" min={1} placeholder="Usos máx"
                value={form.usosMax}
                onChange={e => setForm(f => ({ ...f, usosMax: e.target.value }))}
              />
              <input
                className={`${inputCls} w-40`} type="date"
                value={form.expira}
                onChange={e => setForm(f => ({ ...f, expira: e.target.value }))}
              />
              <input
                className={`${inputCls} flex-1 min-w-[140px]`} placeholder="Descripción (opcional)"
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              />
            </div>
            {errorAlta && <p className="text-[12px] text-rose-600">{errorAlta}</p>}
            <div className="flex justify-end">
              <button
                onClick={crear}
                disabled={!puedeCrear}
                className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-brand-foreground transition-all hover:brightness-95 disabled:opacity-40"
              >
                Crear código
              </button>
            </div>
          </div>
        )}

        {codigos.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            No hay códigos. Crea uno para poder canjearlo en el POS.
          </p>
        ) : codigos.map(c => {
          const est = estadoDe(c, hoy);
          const auto = esCodigoReactivacion(c);
          const usados = c.usosMax != null ? `${c.usos}/${c.usosMax}` : String(c.usos);
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 hover:bg-muted/50">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {auto ? <Sparkles size={14} className="text-brand" /> : <Ticket size={14} className="text-muted-foreground" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-[13px] font-bold text-foreground">{c.codigo}</p>
                    {auto && <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">Automático</span>}
                  </div>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {c.tipo === 'PORCENTAJE' ? `${c.valor}%` : `${c.valor}€`} · {c.descripcion} · caduca {fmtFecha(c.expira)} · {usados} usos
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${est.clase}`}>{est.texto}</span>
                <button
                  onClick={() => toggleCodigoDescuento(c.id)}
                  className="text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {c.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
