'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol, puedeGestionarCamposPersonalizados } from '@/lib/permisos';
import type { CampoPersonalizado } from '@/lib/types';
import { inputCls, btnPrimary, btnSecondary, Field, Toggle } from '@/components/configuracion/estilos';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCajonAjuste } from '@/components/configuracion/shell/cajon-ajuste';
import { useNavegacionConfig } from '@/components/configuracion/shell/contexto';

// ─── Datos extra de la ficha ──────────────────────────────────────────────────
//
// El cajón de su fila en Alta de alumnas: una lista corta de preguntas, cada una
// con su propio alta y edición. Un dato a medio escribir cuenta como cambio sin
// guardar: cerrar el cajón o irse de la sección pregunta.
//
// ⚠️ Sin ejemplos de salud, y con aviso. Lo que se rellena aquí va a
// `socios.campos_extra`, que lee TODO el personal, sin el consentimiento de
// salud ni el acceso restringido de la ficha clínica. El copy anterior ponía
// una lesión como ejemplo y en producción había un campo así (auditoría RGPD
// 2026-09-13). Solo la propietaria define campos (migr 20260913214150).

const TIPOS_CAMPO: { id: CampoPersonalizado['tipo']; label: string }[] = [
  { id: 'texto',     label: 'Texto' },
  { id: 'numero',    label: 'Número' },
  { id: 'fecha',     label: 'Fecha' },
  { id: 'booleano',  label: 'Sí / No' },
  { id: 'seleccion', label: 'Lista de opciones' },
];

type CampoForm = { etiqueta: string; tipo: CampoPersonalizado['tipo']; opciones: string; requerido: boolean };
const emptyCampoForm = (): CampoForm => ({ etiqueta: '', tipo: 'texto', opciones: '', requerido: false });

export function TabCamposPersonalizados({ showToast }: { showToast: (m: string) => void }) {
  const { camposPersonalizados, addCampoPersonalizado, updateCampoPersonalizado, deleteCampoPersonalizado } = useStudio();
  const puedeEditar = puedeGestionarCamposPersonalizados(useRol());
  const uid = useId();
  const [form, setForm] = useState<CampoForm>(emptyCampoForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const guardando = useRef(false);

  // Un dato a medio escribir: cerrar el cajón (o irse) pregunta.
  const cajon = useCajonAjuste();
  const nav = useNavegacionConfig();
  const aMedias = editId !== null || form.etiqueta.trim() !== '' || form.opciones.trim() !== '';
  // Salir sin guardar deja el alta a medias como estaba: el cajón cerrado sigue montado.
  const descartarAMedias = useCallback(() => { setEditId(null); setForm(emptyCampoForm()); }, []);
  useEffect(() => {
    if (!aMedias || !cajon) return;
    return cajon.marcarCambios(descartarAMedias);
  }, [aMedias, cajon, descartarAMedias]);
  useEffect(() => {
    if (!aMedias || !nav) return;
    return nav.marcarSinGuardar('altas');
  }, [aMedias, nav]);

  const ordenados = [...camposPersonalizados].sort((a, b) => a.orden - b.orden);

  function parseOpciones(s: string): string[] {
    return s.split(',').map(o => o.trim()).filter(Boolean);
  }

  async function guardar() {
    const etiqueta = form.etiqueta.trim();
    if (!etiqueta) { showToast('Ponle un nombre al dato'); return; }
    const opciones = form.tipo === 'seleccion' ? parseOpciones(form.opciones) : [];
    if (form.tipo === 'seleccion' && opciones.length === 0) { showToast('Añade al menos una opción'); return; }
    // Un ref contra el doble toque: el segundo llega antes del repintado.
    if (guardando.current) return;
    guardando.current = true;
    try {
      const res = editId
        ? await updateCampoPersonalizado(editId, { etiqueta, tipo: form.tipo, opciones, requerido: form.requerido })
        : await addCampoPersonalizado({ etiqueta, tipo: form.tipo, opciones, requerido: form.requerido, orden: ordenados.length ? Math.max(...ordenados.map(c => c.orden)) + 1 : 0, activo: true });
      if (!res.ok) { showToast(res.error); return; }
      showToast(editId ? 'Dato actualizado' : 'Dato añadido');
      setForm(emptyCampoForm());
      setEditId(null);
    } finally {
      guardando.current = false;
    }
  }

  function editar(c: CampoPersonalizado) {
    setEditId(c.id);
    setForm({ etiqueta: c.etiqueta, tipo: c.tipo, opciones: c.opciones.join(', '), requerido: c.requerido });
  }

  async function mover(id: string, dir: -1 | 1) {
    const i = ordenados.findIndex(c => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= ordenados.length) return;
    const a = ordenados[i], b = ordenados[j];
    const [r1, r2] = await Promise.all([
      updateCampoPersonalizado(a.id, { orden: b.orden }),
      updateCampoPersonalizado(b.id, { orden: a.orden }),
    ]);
    if (!r1.ok) showToast(r1.error); else if (!r2.ok) showToast(r2.error);
  }

  return (
    <div className="space-y-6 pb-6">
      <div role="note" className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <div className="text-sm text-foreground">
          <p className="font-semibold">No uses estos campos para datos de salud</p>
          <p className="text-pretty text-muted-foreground">
            Los ve todo tu equipo. Lesiones o embarazo van en la pestaña Salud de cada alumna.
          </p>
        </div>
      </div>

      {puedeEditar ? (
        <section aria-labelledby={`${uid}-nuevo`} className="space-y-4">
          <h3 id={`${uid}-nuevo`} className="text-sm font-semibold text-foreground">{editId ? 'Editar dato' : 'Nuevo dato'}</h3>
          <div className="grid grid-cols-1 gap-4 @md/config:grid-cols-2">
            <Field label="Qué preguntas" description="Sale en el alta y en su ficha. Ej.: «Horario preferido».">
              <input className={inputCls} placeholder="Ej. Cómo nos conoció"
                value={form.etiqueta} onChange={e => setForm(f => ({ ...f, etiqueta: e.target.value }))} />
            </Field>
            <Field label="Tipo" description="Cómo se responde: texto, número, fecha o una lista.">
              <select className={`${inputCls} cursor-pointer`} value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as CampoPersonalizado['tipo'] }))}>
                {TIPOS_CAMPO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            {form.tipo === 'seleccion' && (
              <div className="@md/config:col-span-2">
                <Field label="Opciones (separadas por comas)" description="Ej.: Mañana, Tarde, Indiferente.">
                  <input className={inputCls} placeholder="Instagram, Google, Recomendación, Otro"
                    value={form.opciones} onChange={e => setForm(f => ({ ...f, opciones: e.target.value }))} />
                </Field>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-foreground">Obligatorio al dar de alta</span>
            <Toggle on={form.requerido} onChange={v => setForm(f => ({ ...f, requerido: v }))} ariaLabel="Obligatorio al dar de alta" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={guardar} className={btnPrimary}>
              {editId ? <><Check size={14} aria-hidden /> Guardar este dato</> : <><Plus size={14} aria-hidden /> Añadir dato</>}
            </button>
            {editId && (
              <button type="button" onClick={() => { setEditId(null); setForm(emptyCampoForm()); }} className={btnSecondary}>Cancelar</button>
            )}
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Solo la dirección del estudio puede crear o cambiar estos datos.</p>
      )}

      <section aria-labelledby={`${uid}-lista`} className="space-y-2">
        <h3 id={`${uid}-lista`} className="text-sm font-semibold text-foreground">Los que pides ({ordenados.length})</h3>
        {ordenados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no pides ningún dato extra.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {ordenados.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 px-2 py-2">
                {puedeEditar && (
                  <div className="flex flex-col">
                    <button type="button" onClick={() => mover(c.id, -1)} disabled={i === 0} aria-label={`Subir ${c.etiqueta}`}
                      className="text-[11px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => mover(c.id, 1)} disabled={i === ordenados.length - 1} aria-label={`Bajar ${c.etiqueta}`}
                      className="text-[11px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30">▼</button>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.etiqueta}
                    {c.requerido && <span className="ml-1.5 text-destructive" aria-label="obligatorio">*</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {TIPOS_CAMPO.find(t => t.id === c.tipo)?.label}
                    {c.tipo === 'seleccion' && c.opciones.length > 0 && ` · ${c.opciones.join(', ')}`}
                  </p>
                </div>
                {puedeEditar && (
                  <>
                    <Toggle on={c.activo} ariaLabel={`Se pide: ${c.etiqueta}`} onChange={async v => { const res = await updateCampoPersonalizado(c.id, { activo: v }); if (!res.ok) showToast(res.error); }} />
                    <button type="button" onClick={() => editar(c)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Editar ${c.etiqueta}`}>
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button type="button" onClick={() => setConfirmDel(c.id)} className="rounded-lg p-1.5 text-destructive hover:bg-muted" aria-label={`Eliminar ${c.etiqueta}`}>
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
        titulo="¿Eliminar este dato?"
        descripcion="Deja de pedirse en las altas y en las fichas. Lo que ya respondieron tus alumnas no se ve, pero no se borra."
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={async () => {
          if (confirmDel) {
            const res = await deleteCampoPersonalizado(confirmDel);
            showToast(res.ok ? 'Dato eliminado' : res.error);
          }
          setConfirmDel(null);
        }}
      />
    </div>
  );
}
