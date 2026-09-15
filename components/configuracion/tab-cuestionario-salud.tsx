'use client';

// Cuestionario de salud configurable (Fase 1, ficha Lorari-vs-Tentare) — la
// propietaria define las preguntas; PROPIETARIO/INSTRUCTOR las rellenan en la
// ficha de la clienta (components/socios/ficha-salud.tsx). Sin canal público
// ni de portal nuevo — ver la migración 20260812200000 para el porqué.
//
// Es el cajón de su fila en Alta de alumnas, con el mismo esqueleto que los
// datos extra (tab-campos-personalizados.tsx). La valoración inicial —la que
// rellena la propia alumna— ya no vive aquí: es un interruptor en la sección.
//
// La gestión (crear/editar/borrar preguntas) es SOLO PROPIETARIO — dato de
// salud, no un campo banal. `/configuracion` ya redirige a INSTRUCTOR antes de
// llegar aquí (lista blanca `PERMITIDO_INSTRUCTOR` en lib/permisos-reglas.ts,
// aplicada en dashboard-shell.tsx) — este gate en cliente es defensa en
// profundidad, no el único candado. La RLS de la migración sigue siendo la
// cerradura real en cualquier caso.

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Plus, Pencil, Trash2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import type { PlantillaCuestionarioSalud } from '@/lib/types';
import { inputCls, btnPrimary, btnSecondary, Field, Toggle } from '@/components/configuracion/estilos';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCajonAjuste } from '@/components/configuracion/shell/cajon-ajuste';
import { useNavegacionConfig } from '@/components/configuracion/shell/contexto';

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
  const uid = useId();
  const [form, setForm] = useState<PreguntaForm>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const guardando = useRef(false);

  // Una pregunta a medio escribir: cerrar el cajón (o irse) pregunta.
  const cajon = useCajonAjuste();
  const nav = useNavegacionConfig();
  const aMedias = editId !== null || form.pregunta.trim() !== '' || form.opciones.trim() !== '';
  useEffect(() => {
    if (!aMedias || !cajon) return;
    return cajon.marcarCambios();
  }, [aMedias, cajon]);
  useEffect(() => {
    if (!aMedias || !nav) return;
    return nav.marcarSinGuardar('altas');
  }, [aMedias, nav]);

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
    // Un ref contra el doble toque: el segundo llega antes del repintado.
    if (guardando.current) return;
    guardando.current = true;
    try {
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
    } finally {
      guardando.current = false;
    }
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
    <div className="space-y-6 pb-6">
      {puedeGestionar && (
        <section aria-labelledby={`${uid}-nueva`} className="space-y-4">
          <h3 id={`${uid}-nueva`} className="text-sm font-semibold text-foreground">{editId ? 'Editar pregunta' : 'Nueva pregunta'}</h3>
          <div className="grid grid-cols-1 gap-4 @md/config:grid-cols-2">
            <div className="@md/config:col-span-2">
              <Field label="Pregunta" description="Ej.: «¿Ha tenido alguna cirugía en el último año?».">
                <input className={inputCls} placeholder="Ej. ¿Tiene alguna lesión o dolencia actual?"
                  value={form.pregunta} onChange={e => setForm(f => ({ ...f, pregunta: e.target.value }))} />
              </Field>
            </div>
            <Field label="Tipo de respuesta" description="Texto libre, sí o no, o una lista de opciones.">
              <select className={`${inputCls} cursor-pointer`} value={form.tipoRespuesta}
                onChange={e => setForm(f => ({ ...f, tipoRespuesta: e.target.value as PlantillaCuestionarioSalud['tipoRespuesta'] }))}>
                {TIPOS_RESPUESTA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            {esSeleccion && (
              <Field label="Opciones (separadas por comas)" description="Ej.: Leve, Moderado, Intenso.">
                <input className={inputCls} placeholder="Leve, Moderado, Intenso"
                  value={form.opciones} onChange={e => setForm(f => ({ ...f, opciones: e.target.value }))} />
              </Field>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={guardar} className={btnPrimary}>
              {editId ? <><Check size={14} aria-hidden /> Guardar esta pregunta</> : <><Plus size={14} aria-hidden /> Añadir pregunta</>}
            </button>
            {editId && (
              <button type="button" onClick={() => { setEditId(null); setForm(emptyForm()); }} className={btnSecondary}>Cancelar</button>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby={`${uid}-lista`} className="space-y-2">
        <h3 id={`${uid}-lista`} className="text-sm font-semibold text-foreground">Preguntas ({ordenadas.length})</h3>
        {!puedeGestionar && ordenadas.length > 0 && (
          <p className="text-sm text-muted-foreground">Solo la propietaria puede añadir, editar o quitar preguntas.</p>
        )}
        {ordenadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {puedeGestionar ? 'Aún no has creado ninguna pregunta.' : 'El estudio todavía no ha configurado el cuestionario de salud.'}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {ordenadas.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 px-2 py-2">
                {puedeGestionar && (
                  <div className="flex flex-col">
                    <button type="button" onClick={() => mover(p.id, -1)} disabled={i === 0} aria-label={`Subir ${p.pregunta}`}
                      className="text-[11px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => mover(p.id, 1)} disabled={i === ordenadas.length - 1} aria-label={`Bajar ${p.pregunta}`}
                      className="text-[11px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30">▼</button>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.pregunta}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {TIPOS_RESPUESTA.find(t => t.id === p.tipoRespuesta)?.label}
                    {(p.tipoRespuesta === 'seleccion_unica' || p.tipoRespuesta === 'seleccion_multiple') && p.opciones.length > 0 && ` · ${p.opciones.join(', ')}`}
                  </p>
                </div>
                {puedeGestionar && (
                  <>
                    <Toggle on={p.activo} ariaLabel={`Activa: ${p.pregunta}`} onChange={async v => { const res = await updatePlantillaCuestionarioSalud(p.id, { activo: v }); if (!res.ok) showToast(res.error); }} />
                    <button type="button" onClick={() => editar(p)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Editar ${p.pregunta}`}>
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button type="button" onClick={() => setConfirmDel(p.id)} className="rounded-lg p-1.5 text-destructive hover:bg-muted" aria-label={`Eliminar ${p.pregunta}`}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmDel !== null}
        onOpenChange={o => { if (!o) setConfirmDel(null); }}
        titulo="¿Eliminar esta pregunta?"
        descripcion="Se quita del cuestionario. Las respuestas ya guardadas no se ven, pero no se borran."
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
