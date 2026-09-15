'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { useStudio } from '@/lib/studio-context';
import { CREDITOS_SUGERIDOS } from '@/lib/configuracion/creditos';
import { sugerirRecompensas } from '@/lib/recompensas-sugeridas';
import type { EfectoRecompensa, RewardCatalogItem } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { Field, inputCls, btnPrimary, btnSecondary, cardCls } from '@/components/configuracion/estilos';

const emptyCatalogForm = (): Omit<RewardCatalogItem, 'id' | 'studioId' | 'creadoEn'> => ({
  nombre: '', descripcion: '', costeCreditos: 500, icono: '🎁', activo: true, stock: null, efecto: 'MANUAL',
  // Sin límite y sin fechas: lo que hacían todas las recompensas hasta ahora.
  // Un valor por defecto aquí cambiaría el comportamiento de las que ya existen
  // sin que nadie lo haya pedido.
  limitePorSocia: null, disponibleDesde: null, disponibleHasta: null,
});


/**
 * El catálogo de recompensas, en la pantalla de su herramienta. Cómo funcionan
 * los créditos y cuántos se ganan con cada cosa se cambian en los cajones de la
 * sección Motivación (creditos.tsx, 15-sep, v2).
 */
export function TabRecompensas({ showToast }: { showToast: (m: string) => void }) {
  const {
    rewardRules,
    rewardCatalog, addRewardCatalogItem, updateRewardCatalogItem, deleteRewardCatalogItem,
    studio,
  } = useStudio();

  // El nombre que este estudio le da a su moneda. Se usa en TODA esta pestaña,
  // no solo en el campo que lo edita: si el panel sigue diciendo «créditos»
  // mientras la app de la clienta dice «puntos», parecen dos cosas distintas.
  const moneda = nombreCreditos(studio?.creditosNombre);

  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCatalogForm());
  const [confirmDel, setConfirmDel] = useState<RewardCatalogItem | null>(null);

  // Las sugerencias se calculan con la regla REAL del estudio, así que
  // cambian solas si cambia lo que paga por clase.
  const sugeridas = sugerirRecompensas(reglaDe('ASISTENCIA_CLASE')?.creditos ?? CREDITOS_SUGERIDOS.ASISTENCIA_CLASE);
  const [anadiendo, setAnadiendo] = useState<string | null>(null);

  async function anadirSugerida(sg: (typeof sugeridas)[number]) {
    setAnadiendo(sg.nombre);
    const res = await addRewardCatalogItem({
      nombre: sg.nombre, descripcion: sg.descripcion, costeCreditos: sg.costeCreditos,
      icono: sg.icono, activo: true, stock: null, efecto: sg.efecto,
      limitePorSocia: null, disponibleDesde: null, disponibleHasta: null,
    });
    setAnadiendo(null);
    showToast(res.ok ? `«${sg.nombre}» añadida al catálogo` : res.error);
  }

  function reglaDe(trigger: string) {
    return rewardRules.find(r => r.trigger === trigger) ?? null;
  }

  function openNuevo() { setForm(emptyCatalogForm()); setEditId(null); setModal('nuevo'); }
  function openEditar(item: RewardCatalogItem) {
    setForm({
      nombre: item.nombre, descripcion: item.descripcion ?? '', costeCreditos: item.costeCreditos,
      icono: item.icono, activo: item.activo, stock: item.stock, efecto: item.efecto,
      limitePorSocia: item.limitePorSocia ?? null,
      disponibleDesde: item.disponibleDesde ?? null,
      disponibleHasta: item.disponibleHasta ?? null,
    });
    setEditId(item.id);
    setModal('editar');
  }
  const ventanaInvertida = Boolean(
    form.disponibleDesde && form.disponibleHasta && form.disponibleHasta < form.disponibleDesde,
  );

  async function guardar() {
    if (!form.nombre.trim() || form.costeCreditos <= 0) return;
    // La BD tiene un CHECK que la rechazaría, pero con un mensaje de Postgres
    // que nadie entiende. Mejor no llegar.
    if (ventanaInvertida) { showToast('La fecha de fin no puede ser anterior a la de inicio.'); return; }
    const res = modal === 'nuevo' ? await addRewardCatalogItem(form) : editId ? await updateRewardCatalogItem(editId, form) : { ok: true as const };
    if (!res.ok) { showToast(res.error); return; }
    setModal(null);
    showToast(modal === 'nuevo' ? 'Recompensa creada' : 'Recompensa actualizada');
  }

  return (
    <>
      {/* Catálogo de recompensas */}
      <TarjetaAjuste
        id="recompensas"
        marco={false}
        acciones={
          <button onClick={openNuevo} className={btnPrimary}>
            <Plus size={14} aria-hidden /> Nueva recompensa
          </button>
        }
      >
      <div>

        {rewardCatalog.length === 0 ? (
          // El catálogo vacío era un callejón: «aún no hay recompensas» y ahí
          // se acababa. Medido en producción: 1320 créditos vivos entre 20
          // socias y CERO recompensas — la maquinaria entera funcionando para
          // nadie porque el primer paso estaba en blanco.
          //
          // El coste de cada sugerencia sale de la regla de ASISTENCIA de ESTE
          // estudio, no de un número fijo: el mismo premio cuesta 120 con una
          // regla de 10 y 600 con una de 50.
          <div className={cn(cardCls, 'p-6')}>
            <p className="text-[13px] text-foreground font-semibold">Aún no hay recompensas en el catálogo.</p>
            {sugeridas.length === 0 ? (
              <p className="text-[12px] text-muted-foreground mt-1">
                Enciende los {moneda} por asistir en «Créditos por acción», en Motivación, y aquí te propondremos por dónde empezar.
              </p>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground mt-1 mb-3">
                  Tus alumnas ya están acumulando {moneda}. Estas tres son un punto de partida —
                  puedes editarlas o borrarlas después.
                </p>
                <div className="grid grid-cols-1 @xl/config:grid-cols-3 gap-3">
                  {sugeridas.map(sg => (
                    <div key={sg.nombre} className={cn(cardCls, 'p-3 flex flex-col gap-1')}>
                      <span className="text-[18px]">{sg.icono}</span>
                      <p className="text-[13px] font-semibold text-foreground">{sg.nombre}</p>
                      <p className="text-xs text-muted-foreground flex-1">{sg.descripcion}</p>
                      <p className="text-[12px] font-semibold text-foreground">
                        {sg.costeCreditos} {moneda}
                        <span className="text-xs font-normal text-muted-foreground"> · ~{sg.clasesEquivalentes} clases</span>
                      </p>
                      <button
                        onClick={() => anadirSugerida(sg)}
                        disabled={anadiendo === sg.nombre}
                        className={cn(btnSecondary, 'mt-1 disabled:opacity-50')}
                      >
                        <Plus size={13} /> Añadir
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 @md/config:grid-cols-2 gap-3">
            {rewardCatalog.map(item => (
              <div key={item.id} className={cn(cardCls, 'p-4 flex items-start gap-3')}>
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-[18px] shrink-0">
                  {item.icono}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{item.nombre}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {item.costeCreditos} {moneda}{item.stock != null ? ` · ${item.stock} en stock` : ''}
                    {item.limitePorSocia != null ? ` · máx. ${item.limitePorSocia} por clienta` : ''}
                    {item.disponibleDesde || item.disponibleHasta
                      ? ` · ${item.disponibleDesde ?? '…'} a ${item.disponibleHasta ?? '…'}`
                      : ''}
                    {item.efecto === 'CLASE_GRATIS' ? ' · clase gratis automática' : ''}
                  </p>
                  {!item.activo && <span className="text-xs font-bold uppercase text-muted-foreground">Inactiva</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEditar(item)} aria-label="Editar recompensa" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setConfirmDel(item)} aria-label="Eliminar recompensa" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </TarjetaAjuste>

      {/* Modal crear/editar */}
      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === 'nuevo' ? 'Nueva recompensa' : 'Editar recompensa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <Field label="Icono"
                  description="Un emoji. Es lo que verá la alumna en el catálogo de recompensas."
                >
                  <input className={inputCls} value={form.icono} onChange={e => setForm(f => ({ ...f, icono: e.target.value }))} maxLength={4} />
                </Field>
              </div>
              <div>
                <Field label="Nombre"
                  description="Qué se lleva al canjearla. Ej: «Clase invitada» o «Botella de agua»."
                >
                  <input className={inputCls} value={form.nombre} placeholder="Ej. Clase gratis" onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
                </Field>
              </div>
            </div>
            <div>
              <Field label="Descripción"
                description="Condiciones o detalles. Aparece bajo el nombre en el catálogo."
              >
                <input className={inputCls} value={form.descripcion ?? ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field label="Coste en créditos"
                  description="Cuántos créditos le cuesta canjearla. Se le descuentan al confirmar."
                >
                  <input type="number" min={1} className={inputCls} value={form.costeCreditos} onChange={e => setForm(f => ({ ...f, costeCreditos: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                </Field>
              </div>
              <div>
                <Field label="Stock (vacío = ilimitado)"
                  description="Cuántas quedan por canjear. Al llegar a cero deja de ofrecerse."
                >
                  <input
                    type="number" min={0} className={inputCls}
                    value={form.stock ?? ''}
                    onChange={e => setForm(f => ({ ...f, stock: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                  />
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field label="Máximo por alumna (vacío = sin límite)"
                  description="Cuántas veces puede canjearla la MISMA alumna. Sin esto, quien más créditos acumula puede llevarse el stock entero."
                >
                  <input
                    type="number" min={1} className={inputCls}
                    value={form.limitePorSocia ?? ''}
                    onChange={e => setForm(f => ({ ...f, limitePorSocia: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                  />
                </Field>
              </div>
              <div>
                <Field label="Solo entre estas fechas (opcional)"
                  description="Para promociones con fecha. Fuera de la ventana no se puede canjear, sin que tengas que acordarte de apagarla."
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="date" className={inputCls} aria-label="Disponible desde"
                      value={form.disponibleDesde ?? ''}
                      onChange={e => setForm(f => ({ ...f, disponibleDesde: e.target.value || null }))}
                    />
                    <span className="text-[12px] text-muted-foreground">a</span>
                    <input
                      type="date" className={inputCls} aria-label="Disponible hasta"
                      min={form.disponibleDesde ?? undefined}
                      value={form.disponibleHasta ?? ''}
                      onChange={e => setForm(f => ({ ...f, disponibleHasta: e.target.value || null }))}
                    />
                  </div>
                </Field>
              </div>
            </div>
            <Field label="Qué pasa al canjearla"
              description="«Clase gratis» se entrega sola: la alumna recibe una recuperación y puede reservar con ella cuando quiera. El resto se lo das tú en el estudio."
            >
              <select
                className={inputCls}
                value={form.efecto}
                onChange={e => setForm(f => ({ ...f, efecto: e.target.value as EfectoRecompensa }))}
              >
                <option value="MANUAL">Se la entregas tú en el estudio</option>
                <option value="CLASE_GRATIS">Una clase gratis (automático)</option>
              </select>
            </Field>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                Activa
              </label>
              <div className="flex gap-2">
                <button onClick={() => setModal(null)} className={btnSecondary}>Cancelar</button>
                <button
                  onClick={guardar}
                  disabled={!form.nombre.trim() || form.costeCreditos <= 0 || ventanaInvertida}
                  className={btnPrimary}
                  title={!form.nombre.trim() ? 'Ponle un nombre a la recompensa'
                    : ventanaInvertida ? 'La fecha de fin es anterior a la de inicio' : undefined}
                >
                  <Check size={14} /> Guardar
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrado */}
      <Dialog open={confirmDel !== null} onOpenChange={open => !open && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar recompensa</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            ¿Eliminar <strong className="text-foreground">{confirmDel?.nombre}</strong> del catálogo? Las alumnas ya no podrán canjearla.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={() => setConfirmDel(null)} className={btnSecondary}>Cancelar</button>
            <button
              onClick={async () => {
                if (confirmDel) {
                  const res = await deleteRewardCatalogItem(confirmDel.id);
                  if (!res.ok) showToast(res.error);
                }
                setConfirmDel(null);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-[13px] font-medium hover:bg-red-600"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

