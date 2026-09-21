'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { estadoEtapa, NOMBRE_ETAPA, TIPOS_ETAPA, type AlCompletar, type EtapaVista, type TipoEtapa } from '@/lib/opening/etapas';

interface PlanVenta { id: string; nombre: string; tipo: string; precio: number }
interface Respuesta { hoy: string; puedeCerrarVenta: boolean; etapas: EtapaVista[]; planes: PlanVenta[] }

const TONO: Record<ReturnType<typeof estadoEtapa>['tono'], string> = {
  neutro: 'text-muted-foreground',
  activo: 'text-success',
  aviso: 'text-warning',
  cerrado: 'text-muted-foreground',
};

async function pedirEtapas(): Promise<Respuesta | null> {
  try {
    const res = await fetch('/api/opening/etapas', { headers: await authHeader() });
    if (!res.ok) return null;
    // Sin dar por hecha la forma: esto vive en la home y un cuerpo inesperado
    // no puede tumbarla.
    const d = (await res.json()) as Partial<Respuesta> | null;
    if (!d || typeof d.hoy !== 'string' || typeof d.puedeCerrarVenta !== 'boolean' || !Array.isArray(d.etapas) || !Array.isArray(d.planes)) return null;
    return d as Respuesta;
  } catch {
    return null;
  }
}

const VACIO = { etapa: 'FUNDADORA' as TipoEtapa, planId: '', desde: '', hasta: '', limitePlazas: '', alCompletar: 'AVISAR' as AlCompletar };

// Etapas de lanzamiento dentro de la tarjeta de apertura: qué plan se vende en
// cada etapa, hasta cuándo, con qué cupo, y qué hacer al llenarse (lo elige el
// estudio; el cierre lo hace la BD, migr 20260921161026).
export function EtapasLanzamiento() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void pedirEtapas().then(d => { if (vivo && d) setDatos(d); });
    return () => { vivo = false; };
  }, []);

  async function recargar() {
    const d = await pedirEtapas();
    if (d) setDatos(d);
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/opening/etapas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null;
        setError(j?.error ?? 'No se pudo guardar. Inténtalo de nuevo.');
        return;
      }
      setForm(VACIO);
      setAbierto(false);
      await recargar();
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/opening/etapas?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: await authHeader() });
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null;
        setError(j?.error ?? 'No se pudo borrar.');
        return;
      }
      setBorrando(null);
      await recargar();
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    }
  }

  if (!datos) return null;
  const { etapas, planes, hoy, puedeCerrarVenta } = datos;
  const campo = 'h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground';

  return (
    <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-foreground">Etapas de lanzamiento</p>
        {!abierto && planes.length > 0 && (
          <button type="button" onClick={() => setAbierto(true)} className="flex items-center gap-1 text-[12px] font-medium text-brand-secondary hover:underline">
            <Plus size={13} /> Añadir etapa
          </button>
        )}
      </div>

      {etapas.length === 0 && !abierto && (
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          {planes.length === 0
            ? <>Crea primero el plan que quieres vender (por ejemplo, una cuota Fundadora a precio especial) en <Link href="/productos" className="text-brand-secondary hover:underline">Paquetes</Link>.</>
            : 'Vende las primeras plazas a un precio especial y con fecha límite, por ejemplo una cuota Fundadora.'}
        </p>
      )}

      {etapas.length > 0 && (
        <ul className="mt-2 space-y-2">
          {etapas.map(e => {
            const est = estadoEtapa(e, hoy);
            return (
              <li key={e.id} className="rounded-lg border border-border px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground">
                      {NOMBRE_ETAPA[e.etapa]}{e.planNombre ? ` · ${e.planNombre}` : ''}
                    </p>
                    <p className={`text-[11.5px] ${TONO[est.tono]}`}>{est.texto}</p>
                  </div>
                  <span className="shrink-0 text-[12px] tabular-nums text-foreground">
                    {e.limitePlazas !== null ? `${e.ventas} de ${e.limitePlazas}` : `${e.ventas} ${e.ventas === 1 ? 'vendida' : 'vendidas'}`}
                  </span>
                </div>
                {e.limitePlazas !== null && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand-secondary" style={{ width: `${Math.min(100, (e.ventas / e.limitePlazas) * 100)}%` }} />
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {e.alCompletar === 'CERRAR' ? 'Al llenarse o terminar, se cierra la venta' : 'Al llenarse o terminar, solo te avisamos'}
                  </span>
                  {borrando === e.id ? (
                    <span className="flex items-center gap-2 text-[11.5px]">
                      <button type="button" onClick={() => void borrar(e.id)} className="font-medium text-destructive hover:underline">Borrar</button>
                      <button type="button" onClick={() => setBorrando(null)} className="text-muted-foreground hover:underline">Cancelar</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setBorrando(e.id)} aria-label={`Borrar etapa ${NOMBRE_ETAPA[e.etapa]}`} className="rounded p-1 text-muted-foreground hover:bg-muted">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {abierto && (
        <form onSubmit={(ev) => void guardar(ev)} className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-[11.5px] text-muted-foreground">Etapa
            <select value={form.etapa} onChange={ev => setForm({ ...form, etapa: ev.target.value as TipoEtapa })} className={campo}>
              {TIPOS_ETAPA.map(t => <option key={t} value={t}>{NOMBRE_ETAPA[t]}</option>)}
            </select>
          </label>
          <label className="text-[11.5px] text-muted-foreground">Plan que se vende
            <select required value={form.planId} onChange={ev => setForm({ ...form, planId: ev.target.value })} className={campo}>
              <option value="">Elige un plan</option>
              {planes.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.precio} €</option>)}
            </select>
          </label>
          <label className="text-[11.5px] text-muted-foreground">Desde
            <input required type="date" value={form.desde} onChange={ev => setForm({ ...form, desde: ev.target.value })} className={campo} />
          </label>
          <label className="text-[11.5px] text-muted-foreground">Hasta (incluido)
            <input required type="date" value={form.hasta} min={form.desde || undefined} onChange={ev => setForm({ ...form, hasta: ev.target.value })} className={campo} />
          </label>
          <label className="text-[11.5px] text-muted-foreground">Plazas (vacío = sin límite)
            <input type="number" min={1} inputMode="numeric" value={form.limitePlazas} onChange={ev => setForm({ ...form, limitePlazas: ev.target.value })} className={campo} />
          </label>
          <fieldset className="text-[11.5px] text-muted-foreground">
            <legend>Cuando se llene o termine</legend>
            <label className="mt-1 flex items-center gap-1.5 text-[12px] text-foreground">
              <input type="radio" name="al-completar" checked={form.alCompletar === 'AVISAR'} onChange={() => setForm({ ...form, alCompletar: 'AVISAR' })} />
              Solo avisarme
            </label>
            {puedeCerrarVenta ? (
              <label className="flex items-center gap-1.5 text-[12px] text-foreground">
                <input type="radio" name="al-completar" checked={form.alCompletar === 'CERRAR'} onChange={() => setForm({ ...form, alCompletar: 'CERRAR' })} />
                Cerrar la venta del plan
              </label>
            ) : (
              <span className="mt-0.5 block text-[11px] leading-snug">Cerrar la venta del plan solo lo puede elegir quien gestiona los cobros.</span>
            )}
          </fieldset>
          {form.alCompletar === 'CERRAR' && (
            <p className="text-[11px] leading-snug text-muted-foreground sm:col-span-2">
              El plan dejará de venderse en tu web y en la app. Las cuotas ya vendidas siguen igual. Si dos personas compran a la vez justo en la última plaza, puede venderse una de más.
            </p>
          )}
          <div className="flex items-center gap-2 sm:col-span-2">
            <button type="submit" disabled={guardando} className="h-9 rounded-lg bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar etapa'}
            </button>
            <button type="button" onClick={() => { setAbierto(false); setError(null); }} className="h-9 px-2 text-[12px] text-muted-foreground hover:underline">Cancelar</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
