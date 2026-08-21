'use client';

// Cuestionario de salud configurable (Fase 1, ficha Lorari-vs-Tentare) — la
// propietaria define las preguntas; PROPIETARIO/INSTRUCTOR las rellenan en la
// ficha de la clienta (components/socios/ficha-salud.tsx). Sin canal público
// ni de portal nuevo — ver la migración 20260812200000 para el porqué.
//
// Mismo esqueleto que TabCamposPersonalizados, pero la gestión (crear/editar/
// borrar preguntas) es SOLO PROPIETARIO — dato de salud, no un campo banal.
// `/configuracion` ya redirige a INSTRUCTOR antes de llegar aquí (lista
// blanca `PERMITIDO_INSTRUCTOR` en lib/permisos-reglas.ts, aplicada en
// dashboard-shell.tsx) — este gate en cliente es defensa en profundidad, no
// el único candado: cubre, por ejemplo, si algún día se abre `/configuracion`
// a MANAGER (hoy también bloqueado) sin acordarse de excluir esta pestaña.
// La RLS de la migración sigue siendo la cerradura real en cualquier caso.

import { useState } from 'react';
import { Check, Plus, Pencil, Trash2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { cn } from '@/lib/utils';
import type { PlantillaCuestionarioSalud } from '@/lib/types';
import { inputCls, btnPrimary, btnSecondary, cardCls, Field, Toggle } from '@/app/(dashboard)/configuracion/page';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const TIPOS_RESPUESTA: { id: PlantillaCuestionarioSalud['tipoRespuesta']; label: string }[] = [
  { id: 'texto',              label: 'Texto libre' },
  { id: 'booleano',           label: 'Sí / No' },
  { id: 'seleccion_unica',    label: 'Lista (una opción)' },
  { id: 'seleccion_multiple', label: 'Lista (varias opciones)' },
];

type PreguntaForm = { pregunta: string; tipoRespuesta: PlantillaCuestionarioSalud['tipoRespuesta']; opciones: string };
const emptyForm = (): PreguntaForm => ({ pregunta: '', tipoRespuesta: 'texto', opciones: '' });

export function TabCuestionarioSalud({ showToast }: { showToast: (m: string) => void }) {
  const { plantillasCuestionarioSalud, addPlantillaCuestionarioSalud, updatePlantillaCuestionarioSalud, deletePlantillaCuestionarioSalud } = useStudio();
  const rol = useRol();
  const puedeGestionar = rol === 'PROPIETARIO';
  const [form, setForm] = useState<PreguntaForm>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const ordenadas = [...plantillasCuestionarioSalud].sort((a, b) => a.orden - b.orden);
  const esSeleccion = form.tipoRespuesta === 'seleccion_unica' || form.tipoRespuesta === 'seleccion_multiple';

  function parseOpciones(s: string): string[] {
    return s.split(',').map(o => o.trim()).filter(Boolean);
  }

  async function guardar() {
    const pregunta = form.pregunta.trim();
    if (!pregunta) { showToast('Escribe la pregunta'); return; }
    const opciones = esSeleccion ? parseOpciones(form.opciones) : [];
    if (esSeleccion && opciones.length === 0) { showToast('Añade al menos una opción'); return; }
    const res = editId
      ? await updatePlantillaCuestionarioSalud(editId, { pregunta, tipoRespuesta: form.tipoRespuesta, opciones })
      : await addPlantillaCuestionarioSalud({
          pregunta, tipoRespuesta: form.tipoRespuesta, opciones,
          orden: ordenadas.length ? Math.max(...ordenadas.map(p => p.orden)) + 1 : 0, activo: true,
        });
    if (!res.ok) { showToast(res.error); return; }
    showToast(editId ? 'Pregunta actualizada' : 'Pregunta añadida');
    setForm(emptyForm());
    setEditId(null);
  }

  function editar(p: PlantillaCuestionarioSalud) {
    setEditId(p.id);
    setForm({ pregunta: p.pregunta, tipoRespuesta: p.tipoRespuesta, opciones: p.opciones.join(', ') });
  }

  async function mover(id: string, dir: -1 | 1) {
    const i = ordenadas.findIndex(p => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= ordenadas.length) return;
    const a = ordenadas[i], b = ordenadas[j];
    const [r1, r2] = await Promise.all([
      updatePlantillaCuestionarioSalud(a.id, { orden: b.orden }),
      updatePlantillaCuestionarioSalud(b.id, { orden: a.orden }),
    ]);
    if (!r1.ok) showToast(r1.error); else if (!r2.ok) showToast(r2.error);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {puedeGestionar && (
        <div className={cn(cardCls, 'p-6')}>
          <h3 className="text-[14px] font-semibold text-foreground mb-1">{editId ? 'Editar pregunta' : 'Nueva pregunta'}</h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            Preguntas de salud propias del estudio. Solo las rellenan la propietaria o las instructoras, en la
            pestaña «Salud» de la ficha de cada clienta — nunca la propia clienta desde fuera.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Pregunta" description="Lo que se preguntará. Ej: «¿Ha tenido alguna cirugía en el último año?».">
                <input className={inputCls} placeholder="Ej. ¿Tiene alguna lesión o dolencia actual?"
                  value={form.pregunta} onChange={e => setForm(f => ({ ...f, pregunta: e.target.value }))} />
              </Field>
            </div>
            <Field label="Tipo de respuesta" description="Cómo se rellena: texto libre, sí/no, o una lista de opciones.">
              <select className={cn(inputCls, 'cursor-pointer')} value={form.tipoRespuesta}
                onChange={e => setForm(f => ({ ...f, tipoRespuesta: e.target.value as PlantillaCuestionarioSalud['tipoRespuesta'] }))}>
                {TIPOS_RESPUESTA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            {esSeleccion && (
              <Field label="Opciones (separadas por comas)" description="Ej: Leve, Moderado, Intenso.">
                <input className={inputCls} placeholder="Leve, Moderado, Intenso"
                  value={form.opciones} onChange={e => setForm(f => ({ ...f, opciones: e.target.value }))} />
              </Field>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={guardar} className={btnPrimary}>
              {editId ? <><Check size={14} /> Guardar cambios</> : <><Plus size={14} /> Añadir pregunta</>}
            </button>
            {editId && (
              <button onClick={() => { setEditId(null); setForm(emptyForm()); }} className={btnSecondary}>Cancelar</button>
            )}
          </div>
        </div>
      )}

      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-4">Preguntas ({ordenadas.length})</h3>
        {!puedeGestionar && ordenadas.length > 0 && (
          <p className="text-[12px] text-muted-foreground mb-3">Solo la propietaria puede añadir, editar o quitar preguntas.</p>
        )}
        {ordenadas.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {puedeGestionar ? 'Aún no has creado ninguna pregunta.' : 'El estudio todavía no ha configurado el cuestionario de salud.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {ordenadas.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                {puedeGestionar && (
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => mover(p.id, -1)} disabled={i === 0}
                      className="text-[11px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30">▲</button>
                    <button onClick={() => mover(p.id, 1)} disabled={i === ordenadas.length - 1}
                      className="text-[11px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30">▼</button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{p.pregunta}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {TIPOS_RESPUESTA.find(t => t.id === p.tipoRespuesta)?.label}
                    {(p.tipoRespuesta === 'seleccion_unica' || p.tipoRespuesta === 'seleccion_multiple') && p.opciones.length > 0 && ` · ${p.opciones.join(', ')}`}
                  </p>
                </div>
                {puedeGestionar && (
                  <>
                    <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title="Activa">
                      <Toggle on={p.activo} onChange={async v => { const res = await updatePlantillaCuestionarioSalud(p.id, { activo: v }); if (!res.ok) showToast(res.error); }} />
                    </label>
                    <button onClick={() => editar(p)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDel(p.id)} className="p-1.5 rounded-lg hover:bg-muted text-destructive shrink-0" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmDel !== null}
        onOpenChange={o => { if (!o) setConfirmDel(null); }}
        titulo="Eliminar pregunta"
        descripcion="Se quita del cuestionario. Las respuestas ya guardadas en las clientas no se muestran, pero no se borran."
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={async () => {
          if (confirmDel) {
            const res = await deletePlantillaCuestionarioSalud(confirmDel);
            showToast(res.ok ? 'Pregunta eliminada' : res.error);
          }
          setConfirmDel(null);
        }}
      />
    </div>
  );
}
