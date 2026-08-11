'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { InfoTip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { PlanTarifa, TipoClase } from '@/lib/types';
import {
  planVacio, planAFormulario, formularioAPlan, motivoNoGuardable,
  NOMBRE_TIPO_PLAN, EXPLICACION_TIPO_PLAN,
  type FormularioPlan,
} from '@/lib/planes/formulario';
import {
  Field,
  Toggle,
  ConfirmDialog,
  TipoPlanBadge,
  inputCls,
  labelCls,
  btnPrimary,
  btnSecondary,
  cardCls,
} from '@/app/(dashboard)/configuracion/page';

// El formulario y su derivación viven en lib/planes/formulario.ts, compartidos
// con app/(dashboard)/productos/page.tsx. Eran dos copias de la misma entidad y
// se separaron: a la otra le faltaba la caducidad, y un bono vendido allí no
// caducaba nunca. Los campos se pintan donde toque; lo que se GUARDA se decide
// en un solo sitio, y está cubierto por tests.
type PlanForm = FormularioPlan;
const emptyPlanForm = planVacio;
const planToForm = planAFormulario;

// Para qué clases sirve una tarifa. Sin marcar nada cubre todas — es la
// semántica de `plan_tipos_clase` (migr 0111) y la que han tenido siempre.
function CoberturaPlan({ plan, tiposClase }: { plan: PlanTarifa; tiposClase: TipoClase[] }) {
  const ids = plan.tiposClaseIds ?? [];
  if (ids.length === 0) {
    return <span className="text-[12px]">Todas las clases</span>;
  }
  // Se nombran si caben; si no, el recuento con el detalle al pasar por encima.
  // Enseñar solo «3 tipos» obligaría a abrir la tarifa, que es el problema que
  // esto viene a resolver.
  const nombres = ids
    .map(id => tiposClase.find(t => t.id === id)?.nombre)
    .filter((n): n is string => Boolean(n));
  if (nombres.length === 0) return <span className="text-[12px]">Todas las clases</span>;
  const resumen = nombres.length <= 2 ? nombres.join(' y ') : `${nombres.length} tipos de clase`;
  return (
    <span
      className="text-[12px] text-foreground underline decoration-dotted underline-offset-2"
      title={nombres.join(' · ')}
    >
      {resumen}
    </span>
  );
}

export function TabPlanes({ showToast }: { showToast: (m: string) => void }) {
  const { planesTarifa, tiposClase, suscripciones, addPlan, updatePlan, deletePlan } = useStudio();

  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyPlanForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const openNuevo = useCallback(() => {
    setForm(emptyPlanForm());
    setEditId(null);
    setModal('nuevo');
  }, []);

  const openEditar = useCallback((p: PlanTarifa) => {
    setForm(planToForm(p));
    setEditId(p.id);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const guardar = useCallback(async () => {
    // La derivación (qué caduca, qué se descarta, qué es null) vive en
    // lib/planes/formulario.ts y la comparte con la pantalla de Productos.
    const datos = formularioAPlan(form);
    const res = modal === 'nuevo' ? await addPlan(datos) : editId ? await updatePlan(editId, datos) : { ok: true as const };
    if (!res.ok) { showToast(res.error); return; }
    showToast(modal === 'nuevo' ? 'Plan creado correctamente' : 'Plan actualizado');
    setModal(null);
  }, [modal, editId, form, addPlan, updatePlan, showToast]);

  const toggleActivo = useCallback(
    async (id: string, current: boolean) => {
      const res = await updatePlan(id, { activo: !current });
      showToast(res.ok ? (!current ? 'Plan activado' : 'Plan desactivado') : res.error);
    },
    [updatePlan, showToast]
  );

  const susContratadasDelPlan = useCallback(
    (planId: string) => suscripciones.filter(s => s.planId === planId && s.estado === 'ACTIVA').length,
    [suscripciones]
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDel) return;
    const res = await deletePlan(confirmDel);
    showToast(res.ok ? (res.archivado ? 'Plan archivado — sigue cobrándose a quien ya lo tenía' : 'Plan eliminado') : res.error);
  }, [confirmDel, deletePlan, showToast]);

  const sesionesRequeridas = form.tipo === 'BONO' || form.tipo === 'PUNTUAL';
  // Mismo criterio que Productos, y diciendo QUÉ falta en vez de solo apagar
  // el botón. Antes aquí no se comprobaba que el precio no fuera negativo.
  const falta = motivoNoGuardable(form);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{planesTarifa.length === 1 ? '1 plan configurado' : `${planesTarifa.length} planes configurados`}</p>
        <button className={btnPrimary} onClick={openNuevo}>
          <Plus size={13} />
          Nuevo plan
        </button>
      </div>

      <div className={cn(cardCls, 'p-0 overflow-hidden')}>
        {planesTarifa.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No hay planes creados. Haz clic en &quot;Nuevo plan&quot; para empezar.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full text-[13px] hidden sm:table">
              <thead>
                <tr className="border-b border-border">
                  {['Nombre', 'Tipo', 'Precio', 'Sesiones', 'Sirve para', 'Estado', 'Acciones'].map(h => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planesTarifa.map(plan => (
                  <tr
                    key={plan.id}
                    className={cn(
                      'border-b border-background last:border-0 hover:bg-muted transition-colors',
                      !plan.activo && 'opacity-50'
                    )}
                  >
                    <td className="px-5 py-3 font-medium text-foreground">{plan.nombre}</td>
                    <td className="px-5 py-3">
                      <TipoPlanBadge tipo={plan.tipo} />
                    </td>
                    <td className="px-5 py-3 font-semibold text-foreground">{plan.precio} €</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {plan.sesiones !== null ? plan.sesiones : '—'}
                    </td>
                    {/* Lo único que separa un bono caro de una fuga de ingresos
                        era invisible justo donde se audita: había que abrir cada
                        tarifa para saber si estaba acotada. */}
                    <td className="px-5 py-3 text-muted-foreground">
                      <CoberturaPlan plan={plan} tiposClase={tiposClase} />
                    </td>
                    <td className="px-5 py-3">
                      <Toggle
                        on={plan.activo}
                        onChange={() => toggleActivo(plan.id, plan.activo)}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditar(plan)}
                          className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Editar plan"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setConfirmDel(plan.id)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Eliminar plan"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-background">
              {planesTarifa.map(plan => (
                <div key={plan.id} className={cn('p-4 space-y-2', !plan.activo && 'opacity-50')}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground text-[14px]">{plan.nombre}</p>
                      <div className="mt-1"><TipoPlanBadge tipo={plan.tipo} /></div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditar(plan)} className="p-1.5 rounded-lg hover:bg-background text-muted-foreground" aria-label="Editar plan">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setConfirmDel(plan.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground" aria-label="Eliminar plan">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{plan.precio} €</span>
                      {plan.sesiones !== null && ` · ${plan.sesiones} sesiones`}
                      {' · '}
                      <CoberturaPlan plan={plan} tiposClase={tiposClase} />
                    </p>
                    <Toggle on={plan.activo} onChange={() => toggleActivo(plan.id, plan.activo)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal nuevo/editar */}
      <Dialog open={modal !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              {modal === 'nuevo' ? 'Nuevo plan' : 'Editar plan'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Field
              label="Nombre del plan"
              description="Es el nombre que verá la clienta al reservar y el que saldrá en su factura."
            >
              <input
                className={inputCls}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Mensual ilimitado"
              />
            </Field>
            <Field
              label="Descripción (opcional)"
              description="Una línea explicando qué incluye. Aparece bajo el nombre en la página de reservas."
            >
              <textarea
                className={cn(inputCls, 'resize-none h-16')}
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Breve descripción del plan..."
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Tipo"
                description={`${NOMBRE_TIPO_PLAN.MENSUAL}: ${EXPLICACION_TIPO_PLAN.MENSUAL} ${NOMBRE_TIPO_PLAN.BONO}: ${EXPLICACION_TIPO_PLAN.BONO} ${NOMBRE_TIPO_PLAN.PUNTUAL}: ${EXPLICACION_TIPO_PLAN.PUNTUAL}`}
                hint={
                  <InfoTip label="Cómo elegir el tipo de plan">
                    Si la clienta viene todas las semanas, una cuota mensual: se cobra
                    sola y no tienes que perseguir el pago. Si viene a temporadas, un bono
                    de 10 sesiones se ajusta mejor y no se siente atada. La clase suelta es
                    para talleres o una prueba.
                  </InfoTip>
                }
              >
                <select
                  className={inputCls}
                  value={form.tipo}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      tipo: e.target.value as PlanTarifa['tipo'],
                      sesiones: e.target.value === 'MENSUAL' ? '' : f.sesiones,
                    }))
                  }
                >
                  <option value="MENSUAL">{NOMBRE_TIPO_PLAN.MENSUAL}</option>
                  <option value="BONO">{NOMBRE_TIPO_PLAN.BONO}</option>
                  <option value="PUNTUAL">{NOMBRE_TIPO_PLAN.PUNTUAL}</option>
                </select>
              </Field>
              <Field
                label="Precio (€)"
                description="IVA incluido. Es lo que se le cobra a la clienta cada vez que se renueva."
              >
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.precio}
                  onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                  placeholder="0.00"
                />
              </Field>
            </div>
            {sesionesRequeridas && (
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Número de sesiones"
                  description="Cuántas clases incluye el bono. Se descuenta una por cada reserva; al llegar a cero, la clienta ya no puede reservar hasta renovar."
                >
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    value={form.sesiones}
                    onChange={e => setForm(f => ({ ...f, sesiones: e.target.value }))}
                    placeholder="Ej: 10"
                  />
                </Field>
                <Field
                  label="Validez (días)"
                  description="A los cuántos días de la compra caduca el bono. Déjalo vacío si no caduca."
                >
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    value={form.validezDias}
                    onChange={e => setForm(f => ({ ...f, validezDias: e.target.value }))}
                    placeholder="Ej: 60"
                  />
                </Field>
              </div>
            )}
            <Field
              label="Límite semanal (opcional)"
              description="Máximo de clases que puede reservar por semana con este plan. Déjalo vacío para no poner tope."
            >
              <input
                className={inputCls}
                type="number"
                min={1}
                value={form.limiteSemanal}
                onChange={e => setForm(f => ({ ...f, limiteSemanal: e.target.value }))}
                placeholder="Sin límite"
              />
            </Field>
            <Field
              label="¿Para qué clases sirve? (opcional)"
              description="Sin marcar nada, el plan sirve para todas las clases. Marca solo las que cubra si, por ejemplo, tu bono de reformer no debe valer para mat."
            >
              {tiposClase.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Aún no has creado tipos de clase. Créalos en la pestaña «Clases» y podrás acotar el plan.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tiposClase.map(t => {
                    const marcado = form.tiposClaseIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={marcado}
                        onClick={() =>
                          setForm(f => ({
                            ...f,
                            tiposClaseIds: marcado
                              ? f.tiposClaseIds.filter(x => x !== t.id)
                              : [...f.tiposClaseIds, t.id],
                          }))
                        }
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-sm transition-colors',
                          marcado
                            ? 'border-transparent bg-[var(--color-primary)] text-white'
                            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]'
                        )}
                      >
                        {t.nombre}
                      </button>
                    );
                  })}
                </div>
              )}
              {form.tiposClaseIds.length > 0 && (
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Quien tenga este plan no podrá usarlo en el resto de clases.{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setForm(f => ({ ...f, tiposClaseIds: [] }))}
                  >
                    Que sirva para todas
                  </button>
                </p>
              )}
            </Field>
            <div className="py-1">
              <div className="flex items-center justify-between">
                <span className={cn(labelCls, 'mb-0')}>Plan activo</span>
                <Toggle on={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground mt-1 text-balance">
                Si lo desactivas, deja de ofrecerse a clientas nuevas. Las que ya lo tienen
                siguen igual y se les sigue cobrando.
              </p>
            </div>
          </div>
          {falta && <p className="text-[12px] text-muted-foreground mt-4 -mb-1" role="status">{falta}</p>}
          <div className="flex gap-2 mt-4">
            <button className={cn(btnSecondary, 'flex-1 justify-center')} onClick={closeModal}>
              Cancelar
            </button>
            <button
              className={cn(btnPrimary, 'flex-1 justify-center')}
              onClick={guardar}
              disabled={!!falta}
            >
              {modal === 'nuevo' ? 'Crear plan' : 'Guardar cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        title="¿Eliminar plan?"
        description={confirmDel && susContratadasDelPlan(confirmDel) > 0
          ? `Lo tienen contratado ${susContratadasDelPlan(confirmDel)} clienta${susContratadasDelPlan(confirmDel) !== 1 ? 's' : ''}. Seguirán con su plan y se les seguirá cobrando; lo que desaparece es la tarifa del catálogo, para que no puedas venderla más.`
          : 'Esta acción no se puede deshacer. No lo tiene contratado nadie.'}
        onConfirm={handleDelete}
      />
    </div>
  );
}
