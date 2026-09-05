'use client';

// F2 (B2.2) — Plaza fija: sección de la ficha de la socia para asignar su hueco
// semanal recurrente. La materialización nocturna (cron) crea las reservas.
//
// La plaza se ancla por (día, hora, sala): cuando el estudio mueve la clase se
// queda apuntando a un horario sin clase, el cron no genera nada y nadie avisa.
// Por eso la fila avisa cuando no hay ninguna clase en su horario (mismo
// criterio que la bandeja «Para hoy», lib/plazas-fijas-slot.ts) y el diálogo
// repite el aviso en vivo mientras se elige el hueco nuevo.

import { useEffect, useMemo, useState, useId } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Trash2, Pencil, CalendarClock } from 'lucide-react';
import { IconoAviso } from '@/lib/iconos';
import { plazasFijasSinSesion, normalizarHoraInicio } from '@/lib/plazas-fijas-slot';
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

const AVISO_SIN_CLASE = 'No hay ninguna clase programada ese día a esa hora en esa sala en las próximas semanas. Si la clase se movió, ajusta la plaza fija a su horario nuevo.';

export function FichaPlazaFija({ socioId, onToast }: { socioId: string; onToast: (mensaje: string) => void }) {
  const { plazasFijas, asignarPlazaFija, editarPlazaFija, quitarPlazaFija, salas, tiposClase, spots, sesiones } = useStudio();
  const uid = useId();
  const [dialogOpen, setDialogOpen] = useState(false);
  // null = el diálogo está creando; una plaza = está editando esa.
  const [editando, setEditando] = useState<PlazaFija | null>(null);
  const [aBorrar, setABorrar] = useState<PlazaFija | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState<Form>(() => formVacio(''));

  // La hora entra por estado (no `Date.now()` dentro de un memo) — mismo patrón
  // y mismo motivo que bandeja-hoy.tsx: la lógica pura la recibe inyectada.
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reloj: sincroniza con el paso del TIEMPO, un sistema externo.
    setAhoraMs(Date.now());
  }, []);

  const mias = useMemo(
    () => plazasFijas
      .filter(p => p.socioId === socioId && p.estado !== 'BAJA')
      .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio)),
    [plazasFijas, socioId],
  );

  // Plazas de esta socia que apuntan a un horario donde ya no hay clase.
  const huerfanas = useMemo(
    () => new Set(ahoraMs ? plazasFijasSinSesion(mias, sesiones, ahoraMs).map(p => p.id) : []),
    [mias, sesiones, ahoraMs],
  );

  // El mismo aviso, en vivo, sobre lo que hay en el formulario: evita guardar
  // una plaza en un horario que no existe sin enterarse hasta la bandeja.
  const formSinClase = useMemo(() => {
    if (!ahoraMs || !f.horaInicio || !f.salaId || !f.vigenciaDesde) return false;
    const candidata: PlazaFija = {
      id: 'form', studioId: '', socioId, diaSemana: f.diaSemana, horaInicio: normalizarHoraInicio(f.horaInicio),
      salaId: f.salaId, tipoClaseId: f.tipoClaseId || null, spotId: null,
      vigenciaDesde: f.vigenciaDesde, vigenciaHasta: f.vigenciaHasta || null, estado: 'ACTIVA', creadaEn: '',
    };
    return plazasFijasSinSesion([candidata], sesiones, ahoraMs).length > 0;
  }, [f, sesiones, ahoraMs, socioId]);

  const spotsSala = spots.filter(s => s.salaId === f.salaId && s.activo);
  // "Hasta" es opcional (vacío = sin fecha de fin), así que solo se compara
  // cuando SÍ se ha puesto — un rango invertido no tiene ningún momento en
  // que esté activo (#873).
  const rangoInvertido = !!f.vigenciaHasta && f.vigenciaHasta < f.vigenciaDesde;
  const puedeGuardar = !!f.salaId && !!f.horaInicio && !!f.vigenciaDesde && !rangoInvertido && !guardando;

  function abrir() {
    setEditando(null);
    setF(formVacio(salas[0]?.id ?? ''));
    setError(null);
    setDialogOpen(true);
  }

  function abrirEditar(p: PlazaFija) {
    setEditando(p);
    setF({
      diaSemana: p.diaSemana,
      horaInicio: p.horaInicio.slice(0, 5),
      salaId: p.salaId,
      tipoClaseId: p.tipoClaseId ?? '',
      spotId: p.spotId ?? '',
      vigenciaDesde: p.vigenciaDesde,
      vigenciaHasta: p.vigenciaHasta ?? '',
    });
    setError(null);
    setDialogOpen(true);
  }

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    const campos = {
      diaSemana: f.diaSemana,
      horaInicio: normalizarHoraInicio(f.horaInicio),
      salaId: f.salaId,
      tipoClaseId: f.tipoClaseId || null,
      spotId: f.spotId || null,
      vigenciaDesde: f.vigenciaDesde,
      vigenciaHasta: f.vigenciaHasta || null,
    };
    // Editar conserva la fila (y su histórico); antes había que quitarla y
    // volver a crearla para moverla de hora.
    const res = editando
      ? await editarPlazaFija(editando.id, campos)
      : await asignarPlazaFija({ ...campos, socioId, estado: 'ACTIVA' });
    setGuardando(false);
    if ('error' in res) { setError(res.error); return; }
    setDialogOpen(false);
    setEditando(null);
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
          <Plus size={14} /> Añadir
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
            const sinClase = huerfanas.has(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <CalendarClock size={14} className="text-muted-foreground shrink-0" />
                    {diaLabel(p.diaSemana)} · {p.horaInicio.slice(0, 5)}
                    {p.estado === 'PAUSADA' && <span className="text-[11px] font-medium text-muted-foreground">· en pausa</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sala?.nombre ?? 'Sala'}{spot ? ` · ${spot.nombre}` : ''}{tipo ? ` · ${tipo.nombre}` : ''}
                    {' · desde '}{fechaCorta(p.vigenciaDesde)}{p.vigenciaHasta ? ` hasta ${fechaCorta(p.vigenciaHasta)}` : ''}
                  </p>
                  {sinClase && (
                    <p role="status" title={AVISO_SIN_CLASE} className="text-[11px] font-medium text-warning mt-1 flex items-center gap-1">
                      <IconoAviso size={12} className="shrink-0" aria-hidden />
                      Sin clase en este horario — edítala si la clase se movió
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => abrirEditar(p)}
                    title="Cambiar día, hora, sala o vigencia"
                    aria-label={`Editar la plaza fija del ${diaLabel(p.diaSemana)} ${p.horaInicio.slice(0, 5)}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setABorrar(p)}
                    title="Quitar plaza fija"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editando ? 'Editar plaza fija' : 'Añadir plaza fija'}</DialogTitle></DialogHeader>
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
            {/* Mismo criterio que quitar una plaza fija ("las reservas ya
                creadas no se tocan"): el cron materializa el hueco nuevo pero
                no retira lo ya generado del viejo, y sin decirlo la socia
                aparece apuntada en los dos sitios. */}
            {editando && (
              <p className="text-[11px] text-muted-foreground">
                Las reservas ya generadas en el hueco anterior no se tocan: cancélalas desde el calendario si hace falta.
              </p>
            )}
            {rangoInvertido && (
              <p role="alert" className="text-xs font-medium text-destructive">
                “Hasta” no puede ser anterior a “Desde” — ese rango nunca estaría activo.
              </p>
            )}
            {!rangoInvertido && formSinClase && (
              <p role="status" className="text-xs font-medium text-warning flex items-start gap-1.5">
                <IconoAviso size={14} className="shrink-0 mt-px" aria-hidden />
                <span>{AVISO_SIN_CLASE} Se puede guardar igual, pero no generará reservas hasta que exista esa clase.</span>
              </p>
            )}
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDialogOpen(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
            <button
              disabled={!puedeGuardar}
              onClick={guardar}
              className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir plaza fija'}
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
        onConfirm={async () => {
          if (aBorrar) {
            const res = await quitarPlazaFija(aBorrar.id);
            if (!res.ok) { onToast(res.error); return; }
          }
          setABorrar(null);
        }}
      />
    </div>
  );
}
