'use client';

// F2 (B2.2) — Plaza fija: sección de la ficha de la socia para asignar su hueco
// semanal recurrente. La materialización nocturna (cron) crea las reservas.

import { useMemo, useState, useId } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import type { PlazaFija } from '@/lib/types';

// Lunes primero (UX); los valores son los de extract(dow) de Postgres (0=domingo).
const DIAS: { v: number; l: string }[] = [
  { v: 1, l: 'Lunes' }, { v: 2, l: 'Martes' }, { v: 3, l: 'Miércoles' },
  { v: 4, l: 'Jueves' }, { v: 5, l: 'Viernes' }, { v: 6, l: 'Sábado' }, { v: 0, l: 'Domingo' },
];
const diaLabel = (v: number) => DIAS.find(d => d.v === v)?.l ?? '—';

function isoHoy(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const inputCls = 'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'text-xs font-semibold text-muted-foreground mb-1.5 block';

type Form = {
  diaSemana: number;
  horaInicio: string;
  salaId: string;
  tipoClaseId: string;
  spotId: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
};

function formVacio(salaId: string): Form {
  return { diaSemana: 1, horaInicio: '', salaId, tipoClaseId: '', spotId: '', vigenciaDesde: isoHoy(), vigenciaHasta: '' };
}

export function FichaPlazaFija({ socioId }: { socioId: string }) {
  const { plazasFijas, asignarPlazaFija, quitarPlazaFija, salas, tiposClase, spots } = useStudio();
  const uid = useId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aBorrar, setABorrar] = useState<PlazaFija | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState<Form>(() => formVacio(''));

  const mias = useMemo(
    () => plazasFijas
      .filter(p => p.socioId === socioId && p.estado !== 'BAJA')
      .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio)),
    [plazasFijas, socioId],
  );

  const spotsSala = spots.filter(s => s.salaId === f.salaId && s.activo);
  const puedeGuardar = !!f.salaId && !!f.horaInicio && !!f.vigenciaDesde && !guardando;

  function abrir() {
    setF(formVacio(salas[0]?.id ?? ''));
    setError(null);
    setDialogOpen(true);
  }

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    const res = await asignarPlazaFija({
      socioId,
      diaSemana: f.diaSemana,
      horaInicio: f.horaInicio.length === 5 ? `${f.horaInicio}:00` : f.horaInicio,
      salaId: f.salaId,
      tipoClaseId: f.tipoClaseId || null,
      spotId: f.spotId || null,
      vigenciaDesde: f.vigenciaDesde,
      vigenciaHasta: f.vigenciaHasta || null,
      estado: 'ACTIVA',
    });
    setGuardando(false);
    if ('error' in res) { setError(res.error); return; }
    setDialogOpen(false);
  }

  return (
    <div className="border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Plaza fija</p>
          <p className="text-xs text-muted-foreground">Su hueco semanal reservado. Se materializa en reservas automáticamente.</p>
        </div>
        <button
          onClick={abrir}
          disabled={salas.length === 0}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors disabled:opacity-40 shrink-0"
        >
          <Plus size={13} /> Añadir
        </button>
      </div>

      {mias.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Sin plaza fija. Asigna un día y hora recurrentes.</p>
      ) : (
        <div className="space-y-2">
          {mias.map(p => {
            const sala = salas.find(s => s.id === p.salaId);
            const spot = p.spotId ? spots.find(s => s.id === p.spotId) : null;
            const tipo = p.tipoClaseId ? tiposClase.find(t => t.id === p.tipoClaseId) : null;
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <CalendarClock size={14} className="text-muted-foreground shrink-0" />
                    {diaLabel(p.diaSemana)} · {p.horaInicio.slice(0, 5)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sala?.nombre ?? 'Sala'}{spot ? ` · ${spot.nombre}` : ''}{tipo ? ` · ${tipo.nombre}` : ''}
                    {' · desde '}{fechaCorta(p.vigenciaDesde)}{p.vigenciaHasta ? ` hasta ${fechaCorta(p.vigenciaHasta)}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setABorrar(p)}
                  title="Quitar plaza fija"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-muted shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Añadir plaza fija</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-dia`} className={labelCls}>Día</label>
                <select id={`${uid}-dia`} className={inputCls} value={f.diaSemana} onChange={e => setF(p => ({ ...p, diaSemana: Number(e.target.value) }))}>
                  {DIAS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-hora`} className={labelCls}>Hora</label>
                <input id={`${uid}-hora`} type="time" className={inputCls} value={f.horaInicio} onChange={e => setF(p => ({ ...p, horaInicio: e.target.value }))} />
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-sala`} className={labelCls}>Sala</label>
              <select id={`${uid}-sala`} className={inputCls} value={f.salaId} onChange={e => setF(p => ({ ...p, salaId: e.target.value, spotId: '' }))}>
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-tipo`} className={labelCls}>Tipo de clase (opcional)</label>
                <select id={`${uid}-tipo`} className={inputCls} value={f.tipoClaseId} onChange={e => setF(p => ({ ...p, tipoClaseId: e.target.value }))}>
                  <option value="">Cualquiera</option>
                  {tiposClase.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-spot`} className={labelCls}>Sitio (opcional)</label>
                <select id={`${uid}-spot`} className={inputCls} value={f.spotId} onChange={e => setF(p => ({ ...p, spotId: e.target.value }))}>
                  <option value="">Cualquiera</option>
                  {spotsSala.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-desde`} className={labelCls}>Desde</label>
                <input id={`${uid}-desde`} type="date" className={inputCls} value={f.vigenciaDesde} onChange={e => setF(p => ({ ...p, vigenciaDesde: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={`${uid}-hasta`} className={labelCls}>Hasta (opcional)</label>
                <input id={`${uid}-hasta`} type="date" className={inputCls} value={f.vigenciaHasta} onChange={e => setF(p => ({ ...p, vigenciaHasta: e.target.value }))} />
              </div>
            </div>
            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDialogOpen(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
            <button
              disabled={!puedeGuardar}
              onClick={guardar}
              className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : 'Añadir plaza fija'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aBorrar !== null}
        onOpenChange={a => { if (!a) setABorrar(null); }}
        titulo={aBorrar ? `¿Quitar la plaza fija del ${diaLabel(aBorrar.diaSemana)} ${aBorrar.horaInicio.slice(0, 5)}?` : ''}
        descripcion="Deja de generar reservas automáticas. Las reservas ya creadas no se tocan."
        textoConfirmar="Quitar"
        destructivo
        onConfirm={() => { if (aBorrar) quitarPlazaFija(aBorrar.id); setABorrar(null); }}
      />
    </div>
  );
}
