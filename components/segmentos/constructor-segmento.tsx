'use client';

import { useState } from 'react';
import { Plus, Trash2, X, Bookmark } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { CampoPersonalizado } from '@/lib/types';
import type { SegmentoCliente, DefinicionSegmento, CondicionSegmento, CampoSegmento, Comparador } from '@/lib/segmentos/tipos';
import { CAMPOS_FIJOS_META } from '@/lib/segmentos/tipos';

const inputCls =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors';
const selectCls = inputCls + ' appearance-none';

const ETIQUETA_COMPARADOR: Record<Comparador, string> = {
  igual: 'es', distinto: 'no es', mayor_que: 'es mayor que', menor_que: 'es menor que',
  es_verdadero: 'sí', es_falso: 'no',
};

function opcionesCampo(camposPersonalizados: CampoPersonalizado[]): { valor: CampoSegmento; etiqueta: string }[] {
  const fijos = (Object.keys(CAMPOS_FIJOS_META) as (keyof typeof CAMPOS_FIJOS_META)[])
    .map(k => ({ valor: k as CampoSegmento, etiqueta: CAMPOS_FIJOS_META[k].etiqueta }));
  const extra = camposPersonalizados
    .filter(c => c.activo)
    .map(c => ({ valor: `campo_extra:${c.id}` as CampoSegmento, etiqueta: c.etiqueta }));
  return [...fijos, ...extra];
}

function metaDeCampo(campo: CampoSegmento, camposPersonalizados: CampoPersonalizado[]): { tipo: 'numero' | 'booleano' | 'texto'; comparadores: Comparador[]; opciones?: string[] } {
  if (campo.startsWith('campo_extra:')) {
    const campoId = campo.slice('campo_extra:'.length);
    const def = camposPersonalizados.find(c => c.id === campoId);
    if (!def) return { tipo: 'texto', comparadores: ['igual', 'distinto'] };
    if (def.tipo === 'numero') return { tipo: 'numero', comparadores: ['mayor_que', 'menor_que', 'igual'] };
    if (def.tipo === 'booleano') return { tipo: 'booleano', comparadores: ['es_verdadero', 'es_falso'] };
    return { tipo: 'texto', comparadores: ['igual', 'distinto'], opciones: def.tipo === 'seleccion' ? def.opciones : undefined };
  }
  return CAMPOS_FIJOS_META[campo as keyof typeof CAMPOS_FIJOS_META];
}

function condicionVacia(camposDisponibles: { valor: CampoSegmento }[]): CondicionSegmento {
  const primero = camposDisponibles[0]?.valor ?? 'sin_bono_activo';
  return { campo: primero, comparador: 'es_verdadero', valor: null };
}

function FilaCondicion({
  cond, onChange, onEliminar, camposPersonalizados,
}: {
  cond: CondicionSegmento;
  onChange: (c: CondicionSegmento) => void;
  onEliminar: () => void;
  camposPersonalizados: CampoPersonalizado[];
}) {
  const opciones = opcionesCampo(camposPersonalizados);
  const meta = metaDeCampo(cond.campo, camposPersonalizados);

  function cambiarCampo(campo: CampoSegmento) {
    const nuevaMeta = metaDeCampo(campo, camposPersonalizados);
    onChange({ campo, comparador: nuevaMeta.comparadores[0], valor: nuevaMeta.tipo === 'booleano' ? null : '' });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select className={selectCls + ' flex-1 min-w-[180px]'} value={cond.campo} onChange={e => cambiarCampo(e.target.value as CampoSegmento)}>
        {opciones.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </select>

      <select
        className={selectCls + ' w-auto shrink-0'}
        value={cond.comparador}
        onChange={e => onChange({ ...cond, comparador: e.target.value as Comparador })}
      >
        {meta.comparadores.map(c => <option key={c} value={c}>{ETIQUETA_COMPARADOR[c]}</option>)}
      </select>

      {meta.tipo === 'booleano' ? null : meta.opciones ? (
        <select className={selectCls + ' w-40 shrink-0'} value={String(cond.valor ?? '')} onChange={e => onChange({ ...cond, valor: e.target.value })}>
          <option value="">Elige…</option>
          {meta.opciones.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={meta.tipo === 'numero' ? 'number' : 'text'}
          className={inputCls + ' w-32 shrink-0'}
          value={cond.valor === null ? '' : String(cond.valor)}
          onChange={e => onChange({ ...cond, valor: meta.tipo === 'numero' ? Number(e.target.value) : e.target.value })}
          placeholder={meta.tipo === 'numero' ? 'días' : 'valor'}
        />
      )}

      <button type="button" onClick={onEliminar} aria-label="Eliminar condición" className="text-muted-foreground hover:text-destructive shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}

/** Modal de listar/crear/editar/borrar segmentos, más el botón "Segmentos" que lo abre. */
export function ConstructorSegmentos({
  segmentos, camposPersonalizados, onCrear, onActualizar, onEliminar, onAplicar,
}: {
  segmentos: SegmentoCliente[];
  camposPersonalizados: CampoPersonalizado[];
  onCrear: (nombre: string, condiciones: DefinicionSegmento) => Promise<{ ok: boolean; error?: string }>;
  onActualizar: (id: string, changes: { nombre?: string; condiciones?: DefinicionSegmento }) => Promise<{ ok: boolean; error?: string }>;
  onEliminar: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onAplicar: (segmento: SegmentoCliente | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<SegmentoCliente | null>(null);
  const [nombre, setNombre] = useState('');
  const [operador, setOperador] = useState<'AND' | 'OR'>('AND');
  const [condiciones, setCondiciones] = useState<CondicionSegmento[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opciones = opcionesCampo(camposPersonalizados);

  function empezarNuevo() {
    setEditando(null);
    setNombre('');
    setOperador('AND');
    setCondiciones([condicionVacia(opciones)]);
    setError(null);
  }

  function empezarEdicion(seg: SegmentoCliente) {
    setEditando(seg);
    setNombre(seg.nombre);
    setOperador(seg.condiciones.operador);
    setCondiciones(seg.condiciones.condiciones);
    setError(null);
  }

  async function guardar() {
    if (!nombre.trim()) { setError('Ponle un nombre al segmento'); return; }
    if (condiciones.length === 0) { setError('Añade al menos una condición'); return; }
    setGuardando(true);
    setError(null);
    const def: DefinicionSegmento = { operador, condiciones };
    const res = editando
      ? await onActualizar(editando.id, { nombre: nombre.trim(), condiciones: def })
      : await onCrear(nombre.trim(), def);
    setGuardando(false);
    if (!res.ok) { setError(res.error ?? 'No se ha podido guardar el segmento'); return; }
    setEditando(null);
    setNombre('');
    setCondiciones([]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setAbierto(true); if (condiciones.length === 0 && !editando) empezarNuevo(); }}
        className="px-3 py-1.5 rounded-lg text-[12px] font-medium border bg-card text-muted-foreground border-border hover:border-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 shrink-0"
      >
        <Bookmark size={13} /> Segmentos{segmentos.length > 0 ? ` (${segmentos.length})` : ''}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Segmentos de clientes</DialogTitle>
          </DialogHeader>

          {!editando && condiciones.length === 0 && segmentos.length > 0 && (
            <div className="space-y-2 mb-4">
              {segmentos.map(seg => (
                <div key={seg.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <button type="button" onClick={() => { onAplicar(seg); setAbierto(false); }} className="text-[13px] font-medium text-foreground text-left flex-1 hover:underline">
                    {seg.nombre}
                    <span className="block text-[11px] text-muted-foreground font-normal">
                      {seg.condiciones.condiciones.length} condición{seg.condiciones.condiciones.length === 1 ? '' : 'es'} · {seg.condiciones.operador}
                    </span>
                  </button>
                  <button type="button" onClick={() => empezarEdicion(seg)} className="text-[11px] text-muted-foreground hover:text-foreground">Editar</button>
                  <button
                    type="button"
                    onClick={async () => { if (confirm(`¿Borrar el segmento "${seg.nombre}"?`)) await onEliminar(seg.id); }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Borrar ${seg.nombre}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {(editando || condiciones.length > 0) && (
            <div className="space-y-3">
              <input
                className={inputCls}
                placeholder="Nombre del segmento (p. ej. «Riesgo de baja»)"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
              />

              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                Cumple
                <select className={selectCls + ' w-auto'} value={operador} onChange={e => setOperador(e.target.value as 'AND' | 'OR')}>
                  <option value="AND">todas</option>
                  <option value="OR">alguna</option>
                </select>
                de estas condiciones:
              </div>

              <div className="space-y-2">
                {condiciones.map((c, i) => (
                  <FilaCondicion
                    key={i}
                    cond={c}
                    camposPersonalizados={camposPersonalizados}
                    onChange={nueva => setCondiciones(prev => prev.map((p, idx) => idx === i ? nueva : p))}
                    onEliminar={() => setCondiciones(prev => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCondiciones(prev => [...prev, condicionVacia(opciones)])}
                className="text-[12px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Plus size={13} /> Añadir condición
              </button>

              {error && <p className="text-[12px] text-destructive">{error}</p>}

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setEditando(null); setCondiciones([]); setError(null); }}
                  className="text-[12px] text-muted-foreground hover:text-foreground"
                >
                  {segmentos.length > 0 ? 'Volver a la lista' : 'Cancelar'}
                </button>
                <div className="flex items-center gap-2">
                  {editando && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { onAplicar(editando); setAbierto(false); }}
                    >
                      Aplicar
                    </Button>
                  )}
                  <Button type="button" onClick={guardar} disabled={guardando}>
                    {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear segmento'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!editando && condiciones.length === 0 && segmentos.length === 0 && (
            <p className="text-[13px] text-muted-foreground">Aún no has creado ningún segmento.</p>
          )}

          {!editando && condiciones.length === 0 && (
            <button
              type="button"
              onClick={empezarNuevo}
              className="mt-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium border border-dashed border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
            >
              <Plus size={14} /> Nuevo segmento
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
