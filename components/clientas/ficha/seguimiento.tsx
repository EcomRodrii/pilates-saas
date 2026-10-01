'use client';

import { useState } from 'react';
import { AlertTriangle, Bell, CalendarClock, Check, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TarjetaFicha } from '@/components/clientas/piezas';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { borrarSeguimiento, cambiarSeguimiento, crearSeguimiento } from '@/lib/api-client';
import {
  atajosDeFecha, cuandoVence, textoVence, TITULO_SEGUIMIENTO_MAX,
} from '@/lib/clientas/seguimientos';
import type { Seguimiento } from '@/lib/clientas/use-seguimientos';
import { cn } from '@/lib/utils';

// «Seguimiento»: lo que hay que hacer con ella y cuándo («llamarla el lunes
// para ver si vuelve»). Ese día sale en «Por decidir» del Resumen de quien lo
// tiene. Marcarlo hecho, moverlo o borrarlo lo confirma el servidor antes de
// pintarlo.

export interface PersonaEquipo {
  /** Cuenta (auth). */
  uid: string;
  nombre: string;
}

export function TarjetaSeguimiento({ seguimientos, error, hoyISO, uid, equipo, puedeBorrarTodo, ella = 'ella', lo = 'la', onNuevo, onCambio, onToast }: {
  seguimientos: Seguimiento[] | null;
  error: boolean;
  hoyISO: string;
  uid: string | null;
  equipo: readonly PersonaEquipo[];
  /** La propietaria borra cualquiera; el resto, los suyos. */
  puedeBorrarTodo: boolean;
  /** «ella» / «él», y «la» / «lo» (llamarla / llamarlo). */
  ella?: string;
  lo?: string;
  onNuevo: () => void;
  onCambio: () => void;
  onToast: (texto: string) => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verHechos, setVerHechos] = useState(false);
  const [borrando, setBorrando] = useState<Seguimiento | null>(null);
  const pendientes = (seguimientos ?? []).filter(s => s.estado === 'PENDIENTE')
    .sort((a, b) => (a.venceEl ?? '9999').localeCompare(b.venceEl ?? '9999'));
  const hechos = (seguimientos ?? []).filter(s => s.estado === 'HECHA')
    .sort((a, b) => (b.completadoEn ?? '').localeCompare(a.completadoEn ?? ''));
  const nombreDe = (cuenta: string | null) => (cuenta && cuenta === uid ? 'ti' : equipo.find(p => p.uid === cuenta)?.nombre ?? 'alguien que ya no está');

  async function marcar(s: Seguimiento, hecha: boolean) {
    if (ocupado) return;
    setOcupado(s.id);
    const r = await cambiarSeguimiento(s.id, { hecha });
    setOcupado(null);
    if (!r.ok) { onToast(r.error); return; }
    onCambio();
  }
  async function moverAManana(s: Seguimiento) {
    if (ocupado) return;
    setOcupado(s.id);
    const r = await cambiarSeguimiento(s.id, { venceEl: atajosDeFecha(hoyISO)[0].venceEl });
    setOcupado(null);
    if (!r.ok) { onToast(r.error); return; }
    onToast('Movido a mañana');
    onCambio();
  }
  async function borrar(s: Seguimiento) {
    if (ocupado) return;
    setOcupado(s.id);
    const r = await borrarSeguimiento(s.id);
    setOcupado(null);
    setBorrando(null);
    if (!r.ok) { onToast(r.error); return; }
    onToast('Recordatorio borrado');
    onCambio();
  }

  return (
    <TarjetaFicha
      titulo="Seguimiento"
      icono={<Bell size={16} />}
      accion={
        <button type="button" onClick={onNuevo} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground hover:underline underline-offset-2">
          <Plus size={14} aria-hidden /> Recuérdamelo
        </button>
      }
    >
      {error ? (
        <p className="py-2 text-[13px] text-destructive">No se han podido cargar sus seguimientos.</p>
      ) : seguimientos === null ? (
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
      ) : pendientes.length === 0 ? (
        <p className="text-[13px] text-muted-foreground text-pretty">
          Nada pendiente con {ella}. Si quedaste en llamar{lo}, apúntalo y te lo recordamos ese día.
        </p>
      ) : (
        <ul className="space-y-2">
          {pendientes.map(s => {
            const cuando = s.venceEl ? cuandoVence(s.venceEl, hoyISO) : 'PROXIMO';
            const borrable = puedeBorrarTodo || s.creadaPor === uid;
            return (
              <li key={s.id} className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2.5', cuando === 'ATRASADO' ? 'border-destructive/30 bg-destructive/[0.04]' : cuando === 'HOY' ? 'border-warning/40 bg-warning/[0.06]' : 'border-border')}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Marcar hecho: ${s.titulo}`}
                  disabled={ocupado === s.id}
                  onClick={() => void marcar(s, true)}
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-input bg-card text-transparent transition-colors hover:border-foreground hover:text-muted-foreground disabled:opacity-50 [@media(pointer:coarse)]:size-6"
                >
                  <Check size={13} aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-foreground text-pretty">{s.titulo}</p>
                  <p className={cn('text-[12px]', cuando === 'ATRASADO' ? 'text-destructive' : cuando === 'HOY' ? 'text-warning' : 'text-muted-foreground')}>
                    {s.venceEl ? (cuando === 'ATRASADO' ? `Era para ${textoVence(s.venceEl, hoyISO)}` : `Para ${textoVence(s.venceEl, hoyISO)}`) : 'Sin fecha'} · {s.asignadaA === uid ? 'te toca a ti' : `le toca a ${nombreDe(s.asignadaA)}`}
                  </p>
                  {(cuando !== 'PROXIMO' || borrable) && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[12px]">
                      {cuando !== 'PROXIMO' && (
                        <button type="button" disabled={ocupado === s.id} onClick={() => void moverAManana(s)} className="font-semibold text-foreground hover:underline underline-offset-2 disabled:opacity-50">
                          Mover a mañana
                        </button>
                      )}
                      {borrable && (
                        <button type="button" disabled={ocupado === s.id} onClick={() => setBorrando(s)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive disabled:opacity-50">
                          <Trash2 size={12} aria-hidden /> Borrar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hechos.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setVerHechos(v => !v)} className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
            {verHechos ? 'Ocultar los hechos' : `Hechos (${hechos.length})`}
          </button>
          {verHechos && (
            <ul className="mt-1.5 space-y-1">
              {hechos.slice(0, 10).map(s => (
                <li key={s.id} className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                  <Check size={13} className="mt-0.5 shrink-0 text-success" aria-hidden />
                  <span className="min-w-0 flex-1 line-through decoration-muted-foreground/50">{s.titulo}</span>
                  <button type="button" disabled={ocupado === s.id} onClick={() => void marcar(s, false)} className="shrink-0 font-medium text-foreground hover:underline underline-offset-2 disabled:opacity-50">
                    Deshacer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        open={borrando !== null}
        onOpenChange={o => { if (!o && !ocupado) setBorrando(null); }}
        titulo="¿Borrar este recordatorio?"
        descripcion={borrando ? `«${borrando.titulo}» deja de salir en su ficha y en «Por decidir».` : undefined}
        textoConfirmar={ocupado ? 'Borrando…' : 'Borrar'}
        destructivo
        onConfirm={() => { if (borrando) void borrar(borrando); }}
      />
    </TarjetaFicha>
  );
}

export function DialogoRecordar({ socioId, nombre, abierto, tituloInicial, recomendacionId, hoyISO, uid, equipo, onCerrar, onHecho }: {
  socioId: string;
  nombre: string;
  abierto: boolean;
  tituloInicial: string;
  /** Si nace del aviso del Centro de Control. */
  recomendacionId?: string | null;
  hoyISO: string;
  uid: string | null;
  equipo: readonly PersonaEquipo[];
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  if (!abierto) return null;
  return (
    <ContenidoRecordar
      socioId={socioId} nombre={nombre} tituloInicial={tituloInicial} recomendacionId={recomendacionId ?? null}
      hoyISO={hoyISO} uid={uid} equipo={equipo} onCerrar={onCerrar} onHecho={onHecho}
    />
  );
}

function ContenidoRecordar({ socioId, nombre, tituloInicial, recomendacionId, hoyISO, uid, equipo, onCerrar, onHecho }: {
  socioId: string; nombre: string; tituloInicial: string; recomendacionId: string | null; hoyISO: string; uid: string | null;
  equipo: readonly PersonaEquipo[]; onCerrar: () => void; onHecho: (texto: string) => void;
}) {
  const atajos = atajosDeFecha(hoyISO);
  const [titulo, setTitulo] = useState(tituloInicial);
  const [venceEl, setVenceEl] = useState(atajos[0].venceEl);
  const [asignadaA, setAsignadaA] = useState<string>(uid ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otras = equipo.filter(p => p.uid !== uid);

  async function guardar() {
    if (enviando || !titulo.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await crearSeguimiento({ socioId, titulo: titulo.trim(), venceEl, asignadaA: asignadaA || null, recomendacionId });
      if (!r.ok) { setError(r.error); return; }
      const quien = !asignadaA || asignadaA === uid ? 'Te lo recordamos' : `Se lo recordamos a ${equipo.find(p => p.uid === asignadaA)?.nombre ?? 'esa persona'}`;
      onHecho(`${quien} ${textoVence(venceEl, hoyISO)}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><CalendarClock size={20} aria-hidden /></span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground">Recordar algo de {nombre}</DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground text-pretty">
              Ese día te sale en «Por decidir» del Resumen y en su ficha.
            </DialogDescription>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-foreground">Qué hay que hacer</span>
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value.slice(0, TITULO_SEGUIMIENTO_MAX))}
            className="w-full min-h-11 rounded-xl border border-input bg-card px-3 text-base text-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:fine)]:min-h-10 [@media(pointer:fine)]:text-[13.5px]"
          />
        </label>

        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">Cuándo</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {atajos.map(a => (
              <button
                key={a.venceEl}
                type="button"
                aria-pressed={venceEl === a.venceEl}
                onClick={() => setVenceEl(a.venceEl)}
                className={cn('min-h-10 rounded-full border px-3.5 text-[13px] font-medium transition-colors', venceEl === a.venceEl ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted')}
              >
                {a.texto}
              </button>
            ))}
            <input
              type="date"
              value={venceEl}
              min={hoyISO}
              onChange={e => { if (e.target.value) setVenceEl(e.target.value); }}
              aria-label="Otro día"
              className="min-h-10 rounded-full border border-border bg-card px-3 text-[13px] text-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </fieldset>

        {otras.length > 0 && (
          <label className="flex items-center justify-between gap-3 text-[13px] text-foreground">
            <span className="font-semibold">Quién lo hace</span>
            <select
              value={asignadaA}
              onChange={e => setAsignadaA(e.target.value)}
              className="min-h-10 rounded-xl border border-input bg-card px-3 text-[13.5px] text-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value={uid ?? ''}>Yo</option>
              {otras.map(p => <option key={p.uid} value={p.uid}>{p.nombre}</option>)}
            </select>
          </label>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />{error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={enviando || !titulo.trim()} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50">
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
