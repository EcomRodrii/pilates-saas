'use client';

// Ficha Clínica Operativa — pestaña "Salud" del detalle de socia.
// FICHA-CLINICA.md §3 (timeline), §2 (restricciones), §4 (semáforo), §5 (riesgo).
// Solo se monta para PROPIETARIO/INSTRUCTOR (el gating vive en la página).

import { useMemo, useState, useId } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, Trash2, CheckCircle2, AlertTriangle, Activity, CalendarClock,
} from 'lucide-react';
import type {
  CondicionSalud, CategoriaCondicion, ZonaCorporal, SeveridadCondicion,
} from '@/lib/types';
import {
  semaforo, nivelRiesgo, SEMAFORO_META, RIESGO_META, RESPUESTA_META,
  RESTRICCIONES, restriccionesLegibles, revisionVencida, diasDesde,
} from '@/lib/ficha-clinica';

// ─── Etiquetas de presentación ───────────────────────────────────────────────

const CATEGORIA_LABEL: Record<CategoriaCondicion, string> = {
  LESION: 'Lesión', EMBARAZO: 'Embarazo', POSTPARTO: 'Postparto',
  CRONICA: 'Condición crónica', PROTESIS: 'Prótesis', OTRO: 'Otro',
};
const ZONA_LABEL: Record<ZonaCorporal, string> = {
  RODILLA: 'Rodilla', COLUMNA: 'Columna', HOMBRO: 'Hombro', CADERA: 'Cadera',
  CUELLO: 'Cuello', MUNECA: 'Muñeca', TOBILLO: 'Tobillo', GENERAL: 'General',
};
const SEVERIDAD_LABEL: Record<SeveridadCondicion, string> = { LEVE: 'Leve', MEDIA: 'Media', ALTA: 'Alta' };
const SEVERIDAD_COLOR: Record<SeveridadCondicion, { bg: string; text: string }> = {
  LEVE: { bg: '#D1FAE5', text: '#059669' },
  MEDIA: { bg: '#FEF3C7', text: '#92400E' },
  ALTA: { bg: '#FEE2E2', text: '#B91C1C' },
};

const CATEGORIAS: CategoriaCondicion[] = ['LESION', 'EMBARAZO', 'POSTPARTO', 'CRONICA', 'PROTESIS', 'OTRO'];
const ZONAS: ZonaCorporal[] = ['RODILLA', 'COLUMNA', 'HOMBRO', 'CADERA', 'CUELLO', 'MUNECA', 'TOBILLO', 'GENERAL'];
const SEVERIDADES: SeveridadCondicion[] = ['LEVE', 'MEDIA', 'ALTA'];

function isoHoy(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ─── Formulario (crear / editar condición) ───────────────────────────────────

type FormState = {
  categoria: CategoriaCondicion;
  etiqueta: string;
  zona: ZonaCorporal | null;
  severidad: SeveridadCondicion;
  restricciones: string[];
  inicio: string;
  revisarEn: string;
  notas: string;
};

function formVacio(now: Date): FormState {
  return { categoria: 'LESION', etiqueta: '', zona: null, severidad: 'MEDIA', restricciones: [], inicio: isoHoy(now), revisarEn: '', notas: '' };
}

function CondicionDialog({
  open, onClose, onSave, inicial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (f: FormState) => void;
  inicial: FormState;
}) {
  const uid = useId();
  const [f, setF] = useState<FormState>(inicial);
  // Reinicia el estado cada vez que cambia la condición editada.
  const [key, setKey] = useState('');
  const k = `${inicial.etiqueta}|${inicial.inicio}|${open}`;
  if (k !== key) { setKey(k); setF(inicial); }

  const catalogo = f.zona ? RESTRICCIONES[f.zona] : [];

  function toggleRestriccion(codigo: string) {
    setF(prev => ({
      ...prev,
      restricciones: prev.restricciones.includes(codigo)
        ? prev.restricciones.filter(c => c !== codigo)
        : [...prev.restricciones, codigo],
    }));
  }

  const puedeGuardar = f.etiqueta.trim().length > 0 && f.inicio;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{inicial.etiqueta ? 'Editar condición' : 'Nueva condición de salud'}</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Categoría */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Tipo</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIAS.map(c => (
                <button key={c} type="button" onClick={() => setF(p => ({ ...p, categoria: c }))}
                  className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
                    f.categoria === c ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {CATEGORIA_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          {/* Etiqueta */}
          <div>
            <label htmlFor={`${uid}-1`} className="text-xs font-semibold text-muted-foreground mb-1.5 block">Descripción</label>
            <input id={`${uid}-1`} value={f.etiqueta} onChange={e => setF(p => ({ ...p, etiqueta: e.target.value }))}
              placeholder="Tendinitis hombro derecho, embarazo 22 sem…"
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {/* Zona + severidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-2`} className="text-xs font-semibold text-muted-foreground mb-1.5 block">Zona corporal</label>
              <select id={`${uid}-2`} value={f.zona ?? ''} onChange={e => setF(p => ({ ...p, zona: (e.target.value || null) as ZonaCorporal | null, restricciones: [] }))}
                className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Sin zona (general/sistémica)</option>
                {ZONAS.map(z => <option key={z} value={z}>{ZONA_LABEL[z]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Severidad</label>
              <div className="flex gap-1.5">
                {SEVERIDADES.map(s => (
                  <button key={s} type="button" onClick={() => setF(p => ({ ...p, severidad: s }))}
                    className={cn('flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors',
                      f.severidad === s ? 'border-foreground' : 'border-border text-muted-foreground')}
                    style={f.severidad === s ? { backgroundColor: SEVERIDAD_COLOR[s].bg, color: SEVERIDAD_COLOR[s].text, borderColor: SEVERIDAD_COLOR[s].text } : undefined}>
                    {SEVERIDAD_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Restricciones */}
          {f.zona && catalogo.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Restricciones ({ZONA_LABEL[f.zona]})</label>
              <div className="flex flex-wrap gap-1.5">
                {catalogo.map(r => {
                  const on = f.restricciones.includes(r.codigo);
                  const dura = r.codigo.startsWith('NO_');
                  return (
                    <button key={r.codigo} type="button" onClick={() => toggleRestriccion(r.codigo)}
                      className={cn('text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
                        on ? 'border-transparent' : 'border-border text-muted-foreground hover:text-foreground')}
                      style={on ? { backgroundColor: dura ? '#FEE2E2' : '#FEF3C7', color: dura ? '#B91C1C' : '#92400E' } : undefined}>
                      {r.etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-3`} className="text-xs font-semibold text-muted-foreground mb-1.5 block">Inicio</label>
              <input id={`${uid}-3`} type="date" value={f.inicio} onChange={e => setF(p => ({ ...p, inicio: e.target.value }))}
                className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label htmlFor={`${uid}-4`} className="text-xs font-semibold text-muted-foreground mb-1.5 block">Revisar el (opcional)</label>
              <input id={`${uid}-4`} type="date" value={f.revisarEn} onChange={e => setF(p => ({ ...p, revisarEn: e.target.value }))}
                className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          {/* Notas */}
          <div>
            <label htmlFor={`${uid}-5`} className="text-xs font-semibold text-muted-foreground mb-1.5 block">Notas (opcional)</label>
            <textarea id={`${uid}-5`} value={f.notas} onChange={e => setF(p => ({ ...p, notas: e.target.value }))} rows={2}
              placeholder="Contexto que no cabe en una restricción…"
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancelar</button>
          <button disabled={!puedeGuardar} onClick={() => onSave(f)}
            className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed">
            Guardar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tarjeta de condición (hito de la línea de tiempo) ───────────────────────

function CondicionCard({ c, now, onEdit, onAlta, onDelete }: {
  c: CondicionSalud; now: Date;
  onEdit: () => void; onAlta: () => void; onDelete: () => void;
}) {
  const activa = c.estado === 'ACTIVA';
  const sev = SEVERIDAD_COLOR[c.severidad];
  const vencida = revisionVencida(c, now);
  return (
    <div className={cn('relative rounded-xl border p-4', activa ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn('font-semibold text-sm', activa ? 'text-foreground' : 'text-muted-foreground')}>{c.etiqueta}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: sev.bg, color: sev.text }}>{SEVERIDAD_LABEL[c.severidad]}</span>
            {!activa && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Resuelta</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {CATEGORIA_LABEL[c.categoria]}{c.zona ? ` · ${ZONA_LABEL[c.zona]}` : ''} · {fechaCorta(c.inicio)}{c.fin ? ` → ${fechaCorta(c.fin)}` : ''}
          </p>
          {c.restricciones.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {restriccionesLegibles(c).map((r, i) => (
                <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-border text-muted-foreground">{r}</span>
              ))}
            </div>
          )}
          {c.notas && <p className="text-xs text-muted-foreground mt-2 italic">{c.notas}</p>}
          {activa && c.revisarEn && (
            <p className={cn('text-[11px] mt-2 flex items-center gap-1', vencida ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
              <CalendarClock size={12} />
              {vencida ? `Revisión vencida hace ${diasDesde(c.revisarEn, now)} días` : `Revisar el ${fechaCorta(c.revisarEn)}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {activa && (
            <button onClick={onAlta} title="Dar de alta / resolver" className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-muted"><CheckCircle2 size={15} /></button>
          )}
          <button onClick={onEdit} title="Editar" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><Pencil size={14} /></button>
          <button onClick={onDelete} title="Eliminar" className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-muted"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── Pestaña completa ────────────────────────────────────────────────────────

export function FichaSalud({ socioId, now }: { socioId: string; now: Date }) {
  const { condicionesSalud, respuestasSesion, addCondicion, updateCondicion, deleteCondicion } = useStudio();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<CondicionSalud | null>(null);

  const condiciones = useMemo(
    () => condicionesSalud.filter(c => c.socioId === socioId).sort((a, b) => b.inicio.localeCompare(a.inicio)),
    [condicionesSalud, socioId],
  );

  // Evolución post-clase (§8): más recientes primero; las últimas alimentan el riesgo.
  const respuestas = useMemo(
    () => respuestasSesion.filter(r => r.socioId === socioId).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
    [respuestasSesion, socioId],
  );

  const nivel = semaforo(condiciones);
  const meta = SEMAFORO_META[nivel];
  const riesgo = nivelRiesgo(condiciones, respuestas.slice(0, 3), now);
  const rmeta = RIESGO_META[riesgo.nivel];
  const activas = condiciones.filter(c => c.estado === 'ACTIVA');

  function abrirNueva() { setEditando(null); setDialogOpen(true); }
  function abrirEditar(c: CondicionSalud) { setEditando(c); setDialogOpen(true); }

  function guardar(f: FormState) {
    const payload = {
      socioId,
      categoria: f.categoria,
      etiqueta: f.etiqueta.trim(),
      zona: f.zona,
      severidad: f.severidad,
      restricciones: f.zona ? f.restricciones : [],
      estado: 'ACTIVA' as const,
      inicio: f.inicio,
      fin: null,
      revisarEn: f.revisarEn || null,
      notas: f.notas.trim() || null,
      creadoPor: null,
    };
    if (editando) {
      updateCondicion(editando.id, { ...payload, estado: editando.estado, fin: editando.fin });
    } else {
      addCondicion(payload);
    }
    setDialogOpen(false);
    setEditando(null);
  }

  const inicial: FormState = editando
    ? {
        categoria: editando.categoria, etiqueta: editando.etiqueta, zona: editando.zona,
        severidad: editando.severidad, restricciones: editando.restricciones,
        inicio: editando.inicio.slice(0, 10), revisarEn: editando.revisarEn?.slice(0, 10) ?? '',
        notas: editando.notas ?? '',
      }
    : formVacio(now);

  return (
    <div>
      {/* Cabecera: semáforo + riesgo */}
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-border p-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden>{meta.emoji}</span>
          <div>
            <p className="text-sm font-bold" style={{ color: meta.color }}>{meta.label}</p>
            <p className="text-xs text-muted-foreground">{activas.length === 0 ? 'Sin condiciones activas' : `${activas.length} condición(es) activa(s)`}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Activity size={13} /> {rmeta.label}</p>
            <span className="text-xs font-bold" style={{ color: rmeta.color }}>{riesgo.score}/10</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden" title={`Severidad ${riesgo.desglose.severidad} · Restricciones ${riesgo.desglose.restriccionesDuras} · Revisiones ${riesgo.desglose.revisiones}`}>
            <div className="h-full rounded-full transition-all" style={{ width: `${riesgo.score * 10}%`, backgroundColor: rmeta.color }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Ayuda de atención, no un diagnóstico médico.</p>
        </div>
      </div>

      {/* Evolución post-clase (§8) */}
      {respuestas.length > 0 && (
        <div className="rounded-xl border border-border p-4 mb-5">
          <p className="text-xs font-semibold text-muted-foreground mb-2.5">Evolución tras las últimas clases</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {respuestas.slice(0, 12).reverse().map(r => {
              const rm = RESPUESTA_META[r.respuesta];
              return (
                <span key={r.id} title={`${rm.label} · ${fechaCorta(r.creadoEn)}${r.nota ? ` · ${r.nota}` : ''}`}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm"
                  style={{ backgroundColor: rm.bg }} aria-label={rm.label}>
                  {rm.emoji}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">De la más antigua (izq.) a la más reciente (der.). Las últimas influyen en el riesgo.</p>
        </div>
      )}

      {/* Línea de tiempo */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-muted-foreground">{condiciones.length} registro(s) en la ficha</p>
        <button onClick={abrirNueva} className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors">
          <Plus size={13} /> Añadir condición
        </button>
      </div>

      {condiciones.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-xl">
          <AlertTriangle size={28} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">Ficha de salud vacía</p>
          <p className="text-xs text-muted-foreground mt-1">Registra lesiones, embarazo o condiciones que influyan en la clase.</p>
          <button onClick={abrirNueva} className="mt-4 text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors">Añadir la primera</button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {condiciones.map(c => (
            <CondicionCard key={c.id} c={c} now={now}
              onEdit={() => abrirEditar(c)}
              onAlta={() => updateCondicion(c.id, { estado: 'RESUELTA', fin: isoHoy(now) })}
              onDelete={() => { if (confirm(`¿Eliminar "${c.etiqueta}" de la ficha?`)) deleteCondicion(c.id); }}
            />
          ))}
        </div>
      )}

      <CondicionDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditando(null); }} onSave={guardar} inicial={inicial} />
    </div>
  );
}
