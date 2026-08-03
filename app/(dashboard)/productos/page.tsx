'use client';

import { useState, useId, useEffect } from 'react';
import { useStudio } from '@/lib/studio-context';
import { esRutaCongelada } from '@/lib/frozen-features';
import { useRol, puedeMoverDinero } from '@/lib/permisos';
import { Package, Plus, Pencil, Trash2, Tag, Users, Repeat, Zap, ShoppingBag, X, Check, Search } from 'lucide-react';
import type { PlanTarifa, ProductoPOS } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  planVacio, planAFormulario, formularioAPlan, motivoNoGuardable, caducaPorDias,
  type FormularioPlan,
} from '@/lib/planes/formulario';

type Tab = 'planes' | 'pos';

// Membresías (antes "Productos"): los 3 tipos de plan ya existentes
// (MENSUAL/BONO/PUNTUAL) se navegan como 3 pestañas por nombre de negocio en
// vez de una rejilla única sin filtrar — mismo dato, mejor organizado.
// "Bajo demanda" = PUNTUAL: se paga sesión a sesión, sin compromiso fijo, que
// es justo lo que ya significa ese tipo aquí.
type TipoPlanTab = 'MENSUAL' | 'BONO' | 'PUNTUAL';
const TIPO_TABS: { v: TipoPlanTab; label: string; singular: string; icon: React.ElementType }[] = [
  { v: 'MENSUAL', label: 'Suscripciones', singular: 'suscripción', icon: Repeat },
  { v: 'BONO', label: 'Paquetes', singular: 'paquete', icon: Zap },
  { v: 'PUNTUAL', label: 'Bajo demanda', singular: 'plan bajo demanda', icon: Tag },
];

const TIPO_LABEL: Record<string, string> = { MENSUAL: 'Mensual', BONO: 'Bono sesiones', PUNTUAL: 'Puntual' };
const TIPO_COLOR: Record<string, { bg: string; text: string }> = {
  MENSUAL: { bg: 'color-mix(in srgb, var(--brand) 10%, var(--card))', text: 'var(--brand-secondary)' },
  BONO: { bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', text: 'var(--warning)' },
  PUNTUAL: { bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', text: 'var(--success)' },
};
const CAT_LABEL: Record<string, string> = { SESION: 'Sesión', PACK: 'Pack', PRODUCTO: 'Producto', OTRO: 'Otro' };
const CAT_COLOR: Record<string, { bg: string; text: string }> = {
  SESION: { bg: 'color-mix(in srgb, var(--brand) 10%, var(--card))', text: 'var(--brand-secondary)' },
  PACK: { bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', text: 'var(--warning)' },
  PRODUCTO: { bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', text: 'var(--success)' },
  OTRO: { bg: 'var(--muted)', text: 'var(--muted-foreground)' },
};
function fmt(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Plan form modal ───────────────────────────────────────────────────────────

// El formulario y su derivación viven en lib/planes/formulario.ts, compartidos
// con components/configuracion/tab-planes.tsx. Eran dos copias, se separaron, y
// esa separación costó dos bugs de dinero: un bono vendido aquí no generaba
// recibo y no caducaba nunca. Los campos se pintan donde toque; lo que se
// GUARDA se decide en un solo sitio y está cubierto por tests.

function PlanModal({ initial, tiposClase, tipoInicial, onSave, onClose }: {
  initial?: PlanTarifa;
  tiposClase: { id: string; nombre: string }[];
  // Al crear desde una pestaña concreta (Suscripciones/Paquetes/Bajo demanda),
  // el formulario arranca con ese tipo ya puesto en vez de MENSUAL siempre —
  // si no, "Añadir" desde "Paquetes" abría un formulario que decía Mensual.
  tipoInicial?: PlanTarifa['tipo'];
  onSave: (f: FormularioPlan) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const [form, setForm] = useState<FormularioPlan>(
    initial ? planAFormulario(initial) : { ...planVacio(), tipo: tipoInicial ?? 'MENSUAL' },
  );
  const set = (k: keyof FormularioPlan, v: string | boolean | string[]) => setForm(f => ({ ...f, [k]: v }));
  // Decir POR QUÉ no se puede guardar, no solo apagar el botón: un botón gris
  // sin explicación es de las cosas que más desesperan.
  const falta = motivoNoGuardable(form);

  return (
    <DashboardSheet open onClose={onClose} label={initial ? 'Editar plan' : 'Nuevo plan'} closeOnBackdropClick={false}>
      <>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground">{initial ? 'Editar plan' : 'Nuevo plan'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor={`${uid}-1`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nombre *</label>
            <input id={`${uid}-1`} value={form.nombre} onChange={e => set('nombre', e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
              placeholder="Ej. Mensual ilimitado" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-2`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Precio (€) *</label>
              <input id={`${uid}-2`} value={form.precio} onChange={e => set('precio', e.target.value)} type="number" min="0" step="0.01"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
                placeholder="0.00" />
            </div>
            <div>
              <label htmlFor={`${uid}-3`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Tipo</label>
              <select id={`${uid}-3`} value={form.tipo} onChange={e => set('tipo', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand bg-card">
                <option value="MENSUAL">Mensual</option>
                <option value="BONO">Bono sesiones</option>
                <option value="PUNTUAL">Puntual</option>
              </select>
            </div>
          </div>
          {caducaPorDias(form.tipo) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-4`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Número de sesiones</label>
                <input id={`${uid}-4`} value={form.sesiones} onChange={e => set('sesiones', e.target.value)} type="number" min="1"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
                  placeholder="8" />
              </div>
              <div>
                <label htmlFor={`${uid}-6`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Caduca a los (días)</label>
                <input id={`${uid}-6`} value={form.validezDias} onChange={e => set('validezDias', e.target.value)} type="number" min="1"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
                  placeholder="Ej. 60" />
                <p className="text-[11px] text-muted-foreground mt-1">Días desde la compra. Déjalo vacío si el bono no caduca.</p>
              </div>
            </div>
          )}
          <div>
            <label htmlFor={`${uid}-7`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Límite semanal (opcional)</label>
            <input id={`${uid}-7`} value={form.limiteSemanal} onChange={e => set('limiteSemanal', e.target.value)} type="number" min="1"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
              placeholder="Sin límite" />
            <p className="text-[11px] text-muted-foreground mt-1">Máximo de clases por semana con este plan. Vacío = sin tope.</p>
          </div>
          <div>
            <label htmlFor={`${uid}-5`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Descripción</label>
            <input id={`${uid}-5`} value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
              placeholder="Acceso ilimitado a clases grupales" />
          </div>
          {/* Restricción por tipo de clase. Existía sólo en el formulario de
              Configuración: creado desde aquí, el plan nacía sirviendo para
              todo, y al editarlo la restricción seguía puesta pero era
              invisible e ineditable. Dos pantallas de lo mismo, una ciega. */}
          {tiposClase.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">¿Para qué clases sirve?</span>
              <div className="flex flex-wrap gap-1.5">
                {tiposClase.map(tc => {
                  const puesto = form.tiposClaseIds.includes(tc.id);
                  return (
                    <button
                      key={tc.id}
                      type="button"
                      aria-pressed={puesto}
                      onClick={() => set('tiposClaseIds', puesto
                        ? form.tiposClaseIds.filter(x => x !== tc.id)
                        : [...form.tiposClaseIds, tc.id])}
                      className="px-2.5 py-1.5 rounded-lg text-[13px] font-medium border transition-colors"
                      style={puesto
                        ? { backgroundColor: 'var(--brand)', color: 'var(--brand-foreground)', borderColor: 'var(--brand)' }
                        : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                      {tc.nombre}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {form.tiposClaseIds.length === 0
                  ? 'Sin marcar nada, sirve para todas tus clases.'
                  : 'Sólo se podrá usar en las clases marcadas.'}
              </p>
            </div>
          )}
          {/* Era un <div onClick> dentro de un <label>: el tabulador no lo
              alcanzaba, no respondía a Espacio/Enter y ningún lector de
              pantalla lo anunciaba como control. Ahora es un botón real con
              estado, y el <label> sobra porque no puede etiquetar un <button>. */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={form.activo}
              aria-label="Plan activo"
              onClick={() => set('activo', !form.activo)}
              className="w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer"
              style={{ backgroundColor: form.activo ? 'var(--brand)' : 'var(--muted-foreground)' }}>
              <span className="w-4 h-4 bg-card rounded-full shadow transition-transform"
                style={{ transform: form.activo ? 'translateX(16px)' : 'translateX(0)' }} />
            </button>
            <span className="text-sm font-medium text-foreground">Plan activo</span>
          </div>
        </div>
        <div className="px-6 pb-6">
          {falta && <p className="text-[12px] text-muted-foreground mb-2" role="status">{falta}</p>}
          <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted">Cancelar</button>
          <button onClick={() => !falta && onSave(form)} disabled={!!falta}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--brand)' }}>
            {initial ? 'Guardar cambios' : 'Crear plan'}
          </button>
          </div>
        </div>
      </>
    </DashboardSheet>
  );
}

// ── ProductoPOS form modal ────────────────────────────────────────────────────

type PosFormData = { nombre: string; precio: string; categoria: ProductoPOS['categoria']; activo: boolean };

function PosModal({ initial, onSave, onClose, onDelete }: {
  initial?: ProductoPOS;
  onSave: (d: PosFormData) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const uid = useId();
  const [form, setForm] = useState<PosFormData>({
    nombre: initial?.nombre ?? '',
    precio: initial?.precio?.toString() ?? '',
    categoria: initial?.categoria ?? 'PRODUCTO',
    activo: initial?.activo ?? true,
  });
  const set = (k: keyof PosFormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.nombre.trim() && form.precio && Number(form.precio) >= 0;

  return (
    <DashboardSheet open onClose={onClose} label={initial ? 'Editar producto' : 'Nuevo producto'} closeOnBackdropClick={false}>
      <>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground">{initial ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor={`${uid}-1`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nombre *</label>
            <input id={`${uid}-1`} value={form.nombre} onChange={e => set('nombre', e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
              placeholder="Ej. Calcetines antideslizantes" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-2`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Precio (€) *</label>
              <input id={`${uid}-2`} value={form.precio} onChange={e => set('precio', e.target.value)} type="number" min="0" step="0.01"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
                placeholder="0.00" />
            </div>
            <div>
              <label htmlFor={`${uid}-3`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Categoría</label>
              <select id={`${uid}-3`} value={form.categoria} onChange={e => set('categoria', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand bg-card">
                <option value="SESION">Sesión</option>
                <option value="PACK">Pack</option>
                <option value="PRODUCTO">Producto</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={form.activo}
              aria-label="Producto activo"
              onClick={() => set('activo', !form.activo)}
              className="w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer"
              style={{ backgroundColor: form.activo ? 'var(--brand)' : 'var(--muted-foreground)' }}>
              <span className="w-4 h-4 bg-card rounded-full shadow transition-transform"
                style={{ transform: form.activo ? 'translateX(16px)' : 'translateX(0)' }} />
            </button>
            <span className="text-sm font-medium text-foreground">Producto activo</span>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          {initial && onDelete && (
            <button onClick={onDelete}
              className="py-2.5 px-3 rounded-xl border border-[#FECACA] text-sm font-semibold text-destructive hover:bg-destructive/10"
              title="Eliminar producto">
              <Trash2 size={15} />
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted">Cancelar</button>
          <button onClick={() => valid && onSave(form)} disabled={!valid}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--brand)' }}>
            {initial ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </>
    </DashboardSheet>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Productos() {
  const { planesTarifa, addPlan, updatePlan, deletePlan, productosPOS, addProductoPOS, updateProductoPOS, deleteProductoPOS, suscripciones, tiposClase } = useStudio();
  const [tab, setTab] = useState<Tab>('planes');
  const [tipoTab, setTipoTab] = useState<TipoPlanTab>('MENSUAL');
  const [busqueda, setBusqueda] = useState('');
  const [planModal, setPlanModal] = useState<PlanTarifa | null | 'new'>(null);
  // Borrar una tarifa no se confirmaba: un clic de más y desaparecía sin
  // preguntar ni avisar. El otro formulario sí confirmaba — misma acción
  // destructiva, dos comportamientos.
  const [borrando, setBorrando] = useState<PlanTarifa | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // El aviso se borra solo a los 4 s. Antes colgaba de `onAnimationEnd` sobre un
  // elemento SIN animación: el callback no se disparaba nunca y el mensaje se
  // quedaba fijo en pantalla para siempre, contando algo que ya había pasado.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  const [posModal, setPosModal] = useState<ProductoPOS | null | 'new'>(null);

  // CONGELADO (feature-freeze PMF): oculta la pestaña "Productos POS" mientras POS
  // esté congelado. La pestaña "Planes de suscripción" es core de facturación y se
  // mantiene. El bloque de contenido POS sigue en el archivo, solo deja de ser
  // alcanzable. Reactivar = quitar '/pos' de RUTAS_CONGELADAS en lib/frozen-features.ts.
  const posCongelado = esRutaCongelada('/pos');
  // productos_pos exige puede_mover_dinero() en RLS (mismo criterio que
  // ventas_pos) — sin este gate, un MANAGER (que sí puede ver /productos, no
  // está en BLOQUEADO_MANAGER) vería la pestaña POS el día que se reactive y
  // sus altas/ediciones fallarían en silencio contra la RLS.
  const mueveDinero = puedeMoverDinero(useRol());
  const TABS = ([['planes', 'Planes de suscripción'], ['pos', 'Productos POS']] as const)
    .filter(([v]) => v !== 'pos' || (!posCongelado && mueveDinero));

  // Count active suscripciones per plan
  const susCount = (planId: string) => suscripciones.filter(s => s.planId === planId && s.estado === 'ACTIVA').length;

  async function savePlan(f: FormularioPlan) {
    // La derivación (qué caduca, qué se descarta, qué es null) vive en
    // lib/planes/formulario.ts y la comparte con el formulario de Configuración.
    const datos = formularioAPlan(f);
    const editando = planModal && planModal !== 'new';
    const res = editando ? await updatePlan(planModal.id, datos) : await addPlan(datos);
    if (!res.ok) { setAviso(res.error); return; }
    setPlanModal(null);
    setAviso(editando ? 'Tarifa actualizada' : `"${datos.nombre}" ya está a la venta`);
  }

  async function savePos(d: { nombre: string; precio: string; categoria: ProductoPOS['categoria']; activo: boolean }) {
    const fields = {
      nombre: d.nombre.trim(),
      precio: parseFloat(d.precio) || 0,
      categoria: d.categoria,
      activo: d.activo,
    };
    const res = posModal && posModal !== 'new' ? await updateProductoPOS(posModal.id, fields) : await addProductoPOS(fields);
    if (!res.ok) { setAviso(res.error); return; }
    setPosModal(null);
  }

  const PLAN_ICONS: Record<string, React.ElementType> = { MENSUAL: Repeat, BONO: Zap, PUNTUAL: Tag };

  const planesFiltrados = planesTarifa
    .filter(p => p.tipo === tipoTab)
    .filter(p => p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membresías"
        description={posCongelado ? 'Suscripciones, paquetes y clases sueltas' : 'Suscripciones, paquetes y catálogo de productos POS'}
        actions={
          <button
            onClick={() => tab === 'planes' ? setPlanModal('new') : setPosModal('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-colors"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            <Plus size={15} />
            {tab === 'planes' ? 'Crear' : 'Nuevo producto'}
          </button>
        }
      />

      {/* Tabs — la pestaña "Productos POS" queda oculta con POS congelado (solo
          se muestra la barra si hay más de una pestaña). */}
      {TABS.length > 1 && (
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
          {TABS.map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={tab === v ? { backgroundColor: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: 'var(--muted-foreground)' }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ── PLANES: Suscripciones / Paquetes / Bajo demanda ── */}
      {tab === 'planes' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {TIPO_TABS.map(t => {
              const activo = tipoTab === t.v;
              const Icon = t.icon;
              return (
                <button key={t.v} onClick={() => setTipoTab(t.v)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all border"
                  style={activo
                    ? { backgroundColor: 'color-mix(in srgb, var(--brand) 10%, var(--card))', color: 'var(--brand-secondary)', borderColor: 'var(--brand)' }
                    : { borderColor: 'transparent', color: 'var(--muted-foreground)' }}>
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder={`Buscar en ${TIPO_TABS.find(t => t.v === tipoTab)?.label.toLowerCase()}...`}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border text-sm text-foreground outline-none focus:border-brand bg-card"
            />
          </div>

          {planesTarifa.filter(p => p.tipo === tipoTab).length === 0 ? (
            <div className="bg-card rounded-2xl border-2 border-dashed border-border px-5 py-12 text-center text-muted-foreground">
              <p className="text-sm font-semibold text-foreground">Aún no tienes {TIPO_TABS.find(t => t.v === tipoTab)?.label.toLowerCase()}</p>
              <p className="text-[13px] mt-1">Crea uno nuevo o cambia de pestaña para ver otro tipo.</p>
              <button onClick={() => setPlanModal('new')}
                className="mt-4 text-sm font-semibold text-brand-medio hover:underline underline-offset-2">
                Añadir {TIPO_TABS.find(t => t.v === tipoTab)?.singular ?? 'plan'}
              </button>
            </div>
          ) : planesFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin resultados para &quot;{busqueda}&quot;.</p>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {planesFiltrados.map(plan => {
            const c = TIPO_COLOR[plan.tipo] ?? TIPO_COLOR.MENSUAL;
            const Icon = PLAN_ICONS[plan.tipo] ?? Tag;
            const count = susCount(plan.id);
            return (
              <div key={plan.id} className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: c.bg }}>
                      <Icon size={16} style={{ color: c.text }} />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-sm leading-tight">{plan.nombre}</p>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5 inline-block"
                        style={{ backgroundColor: c.bg, color: c.text }}>
                        {TIPO_LABEL[plan.tipo]}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setPlanModal(plan)} aria-label="Editar plan"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setBorrando(plan)} aria-label="Eliminar plan"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-extrabold text-foreground">{fmt(plan.precio)} €</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {plan.tipo === 'MENSUAL' ? 'al mes' : plan.sesiones ? `${plan.sesiones} ${plan.sesiones > 1 ? 'sesiones' : 'sesión'}` : 'por sesión'}
                    </p>
                    {/* La caducidad no se veía en ningún sitio: había que abrir el
                        plan para saber si el bono expira, y hasta ahora ni eso. */}
                    {plan.tipo !== 'MENSUAL' && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {plan.validezDias ? `Caduca a los ${plan.validezDias} días` : 'Sin caducidad'}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users size={12} />
                      <span className="text-sm font-semibold text-foreground">{count}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">activos</p>
                  </div>
                </div>

                {plan.descripcion && (
                  <p className="text-xs text-muted-foreground border-t border-muted pt-3">{plan.descripcion}</p>
                )}

                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: plan.activo ? 'var(--success)' : 'var(--muted-foreground)' }} />
                  <span className="text-xs font-medium" style={{ color: plan.activo ? 'var(--success)' : 'var(--muted-foreground)' }}>
                    {plan.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Add card */}
          <button onClick={() => setPlanModal('new')}
            className="bg-card rounded-2xl border-2 border-dashed border-border p-5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-brand hover:text-brand-medio transition-colors min-h-[160px]">
            <Plus size={20} />
            <span className="text-sm font-semibold">Añadir</span>
          </button>
          </div>
          )}
        </>
      )}

      {/* ── PRODUCTOS POS ── */}
      {tab === 'pos' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {productosPOS.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-semibold text-foreground">Aún no hay productos POS</p>
              <p className="text-[13px] text-muted-foreground mt-1">Añade productos (agua, toallas, packs…) para venderlos en el terminal.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="w-full text-sm hidden sm:table">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    {['Producto', 'Categoría', 'Precio', 'Estado', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  {productosPOS.map(p => {
                    const c = CAT_COLOR[p.categoria] ?? CAT_COLOR.OTRO;
                    return (
                      <tr key={p.id} className="hover:bg-muted transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.bg }}>
                              <ShoppingBag size={13} style={{ color: c.text }} />
                            </div>
                            <span className="font-semibold text-foreground">{p.nombre}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: c.bg, color: c.text }}>
                            {CAT_LABEL[p.categoria]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-foreground">{fmt(p.precio)} €</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.activo ? 'var(--success)' : 'var(--muted-foreground)' }} />
                            <span className="text-xs font-medium" style={{ color: p.activo ? 'var(--success)' : 'var(--muted-foreground)' }}>
                              {p.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <button onClick={() => setPosModal(p)} aria-label="Editar producto"
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-muted">
                {productosPOS.map(p => {
                  const c = CAT_COLOR[p.categoria] ?? CAT_COLOR.OTRO;
                  return (
                    <button key={p.id} onClick={() => setPosModal(p)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-muted transition-colors">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: c.bg }}>
                        <ShoppingBag size={14} style={{ color: c.text }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground text-[13px] truncate">{p.nombre}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: c.bg, color: c.text }}>
                            {CAT_LABEL[p.categoria]}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: p.activo ? 'var(--success)' : 'var(--muted-foreground)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.activo ? 'var(--success)' : 'var(--muted-foreground)' }} />
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-foreground text-[14px] shrink-0">{fmt(p.precio)} €</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="p-4 border-t border-border">
            <button onClick={() => setPosModal('new')}
              className="flex items-center gap-2 text-sm font-semibold text-brand-medio hover:text-[#6E9E0A] transition-colors">
              <Plus size={14} />
              Añadir producto
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {planModal && (
        <PlanModal
          initial={planModal !== 'new' ? planModal : undefined}
          tipoInicial={tipoTab}
          tiposClase={tiposClase}
          // Sin cast: el `as Parameters<...>` que había aquí silenciaba
          // cualquier desajuste futuro entre el formulario y el guardado —
          // justo el tipo de silencio que dejó a esta pantalla sin caducidad.
          onSave={savePlan}
          onClose={() => setPlanModal(null)}
        />
      )}
      <ConfirmDialog
        open={borrando !== null}
        onOpenChange={o => !o && setBorrando(null)}
        titulo="¿Eliminar esta tarifa?"
        destructivo
        descripcion={borrando
          ? (susCount(borrando.id) > 0
              // Decir cuántas la tienen contratada ANTES de borrar: el recuento
              // ya se calculaba para pintarlo en la tarjeta, pero no se usaba
              // para avisar en el único momento en que importa.
              ? `"${borrando.nombre}" la tienen contratada ${susCount(borrando.id)} clienta${susCount(borrando.id) !== 1 ? 's' : ''}. Seguirán con su plan y se les seguirá cobrando; lo que desaparece es la tarifa del catálogo, para que no puedas venderla más.`
              : `"${borrando.nombre}" dejará de estar a la venta. No la tiene contratada nadie.`)
          : ''}
        textoConfirmar="Eliminar"
        onConfirm={async () => {
          if (borrando) {
            const res = await deletePlan(borrando.id);
            setAviso(res.ok ? `"${borrando.nombre}" ya no está a la venta` : res.error);
          }
          setBorrando(null);
        }}
      />
      {aviso && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-medium shadow-lg"
          role="status">
          {aviso}
        </div>
      )}
      {posModal && (
        <PosModal
          initial={posModal !== 'new' ? posModal : undefined}
          onSave={savePos}
          onClose={() => setPosModal(null)}
          onDelete={posModal !== 'new' && posModal ? async () => {
            const res = await deleteProductoPOS(posModal.id);
            if (!res.ok) { setAviso(res.error); return; }
            setPosModal(null);
          } : undefined}
        />
      )}
    </div>
  );
}
