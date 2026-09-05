'use client';

import { useState, useId, useEffect } from 'react';
import { useStudio } from '@/lib/studio-context';
import { esRutaCongelada } from '@/lib/frozen-features';
import { useRol, puedeMoverDinero } from '@/lib/permisos';
import { Plus, Pencil, Trash2, Tag, Users, Repeat, Zap, ShoppingBag, X, Search, Package, Check } from 'lucide-react';
import type { PlanTarifa, ProductoPOS, TipoPlan } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  planVacio, planAFormulario, formularioAPlan, erroresPlan, precioANumero,
  resumenCondicionesPlan, NOMBRE_TIPO_PLAN, EXPLICACION_TIPO_PLAN,
  type FormularioPlan, type CampoPlan,
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

// ── Formulario de tarifa ──────────────────────────────────────────────────────

// El formulario y su derivación viven en lib/planes/formulario.ts, compartidos
// con components/configuracion/tab-planes.tsx. Eran dos copias, se separaron, y
// esa separación costó dos bugs de dinero: un bono vendido aquí no generaba
// recibo y no caducaba nunca. Los campos se pintan donde toque; lo que se
// GUARDA se decide en un solo sitio y está cubierto por tests.
//
// Rediseño (2026-09-05). Lo que había era una columna estrecha con los diez
// campos de la tabla puestos en fila, todos a la vez, tuvieran sentido o no
// para el tipo elegido: crear una cuota mensual pedía «número de sesiones» y
// «caduca a los (días)», que en un mensual no significan nada. Ahora:
//
//  · El TIPO se elige primero, en tarjetas que explican qué es cada uno, y el
//    resto del formulario se adapta — no se enseña ningún campo que no aplique.
//  · Los campos van agrupados por lo que decide la propietaria (qué es · qué
//    cuesta · qué condiciones · para qué clases), no por el orden de la tabla.
//  · Un RESUMEN en vivo enseña cómo va a quedar mientras se escribe, con las
//    condiciones ya redactadas (`resumenCondicionesPlan`) para que nadie tenga
//    que repetirlas a mano en la descripción.
//  · Los errores salen pegados a su campo, no como una frase suelta encima de
//    los botones que obligaba a adivinar de cuál hablaba.

const ICONO_TIPO: Record<TipoPlan, React.ElementType> = { MENSUAL: Repeat, BONO: Zap, PUNTUAL: Tag };

/** Un bloque del formulario, con su título. */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Etiqueta + control + ayuda + error, con el cableado de accesibilidad hecho.
 *
 * El error va en `aria-describedby` junto a la ayuda y enciende `aria-invalid`:
 * antes el único aviso era un párrafo suelto encima de los botones, que un
 * lector de pantalla nunca relacionaba con ninguna caja.
 */
function Campo({ id, etiqueta, ayuda, error, obligatorio, children }: {
  id: string; etiqueta: string; ayuda?: string; error?: string; obligatorio?: boolean;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => React.ReactNode;
}) {
  const idAyuda = ayuda ? `${id}-ayuda` : null;
  const idError = error ? `${id}-error` : null;
  const describedBy = [idError, idAyuda].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1.5">
        {etiqueta}
        {obligatorio && <span className="text-muted-foreground font-normal"> *</span>}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {error && (
        <p id={idError!} role="alert" className="text-[12px] mt-1.5 font-medium" style={{ color: 'var(--destructive)' }}>
          {error}
        </p>
      )}
      {ayuda && <p id={idAyuda!} className="text-[12px] text-muted-foreground mt-1.5">{ayuda}</p>}
    </div>
  );
}

const CAJA = 'w-full border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand)_25%,transparent)]';
function cajaCls(error?: string) {
  return cn(CAJA, error ? 'border-[var(--destructive)]' : 'border-border');
}

/**
 * Interruptor de verdad: un <button role="switch">, alcanzable con tabulador.
 *
 * ⚠️ Se etiqueta con `aria-labelledby`, NUNCA con un <label htmlFor>: un
 * <label> solo puede etiquetar controles nativos, así que apuntando a un
 * <button> no lo anuncia ningún lector de pantalla y además el clic en el
 * texto no lo acciona. El texto va en un <span> con id y se le cuelga aquí,
 * y quien lo pinte le pone su propio onClick si quiere que el texto accione.
 */
function Interruptor({ activo, onChange, labelledBy, describedBy }: {
  activo: boolean; onChange: (v: boolean) => void; labelledBy: string; describedBy?: string;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={activo}
      aria-labelledby={labelledBy} aria-describedby={describedBy}
      onClick={() => onChange(!activo)}
      className="w-10 h-6 shrink-0 rounded-full transition-colors flex items-center px-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--card)]"
      style={{ backgroundColor: activo ? 'var(--brand)' : 'var(--muted-foreground)' }}>
      <span className="w-5 h-5 bg-card rounded-full shadow transition-transform"
        style={{ transform: activo ? 'translateX(16px)' : 'translateX(0)' }} />
    </button>
  );
}

/**
 * Cómo va a quedar, mientras se escribe.
 *
 * Es la misma información que la clienta verá en la tienda, así que enseña los
 * huecos: sin nombre pone «Sin nombre» en vez de no pintar nada, porque un
 * resumen que se calla no avisa de que falta algo.
 */
function ResumenPlan({ form, tiposClase }: { form: FormularioPlan; tiposClase: { id: string; nombre: string }[] }) {
  const precio = precioANumero(form.precio);
  const nombres = tiposClase.filter(tc => form.tiposClaseIds.includes(tc.id)).map(tc => tc.nombre);
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Así lo verá tu clienta</p>
      <div className="rounded-xl bg-card border border-border p-4 shadow-sm">
        <p className="font-bold text-foreground leading-tight break-words">
          {form.nombre.trim() || <span className="text-muted-foreground font-normal">Sin nombre todavía</span>}
        </p>
        <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">
          {Number.isFinite(precio) && form.precio.trim() ? fmt(precio) : '—'} €
          {form.tipo === 'MENSUAL' && <span className="text-sm font-medium text-muted-foreground"> / mes</span>}
        </p>
        {form.descripcion.trim() && (
          <p className="mt-2 text-[13px] text-muted-foreground break-words">{form.descripcion.trim()}</p>
        )}
        <ul className="mt-3 space-y-1">
          {resumenCondicionesPlan(form).map(linea => (
            <li key={linea} className="flex items-start gap-1.5 text-[13px] text-foreground">
              <Check size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
              <span>{linea}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Sirve para</p>
          <p className="text-[13px] text-foreground">
            {nombres.length === 0 ? 'Todas tus clases' : nombres.join(' · ')}
          </p>
        </div>
      </div>
      {!form.activo && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Ahora mismo está oculto: nadie puede comprarlo hasta que lo pongas a la venta.
        </p>
      )}
    </div>
  );
}

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
  const [inicial] = useState<FormularioPlan>(() => {
    const base = initial ? planAFormulario(initial) : { ...planVacio(), tipo: tipoInicial ?? 'MENSUAL' };
    // Una clase suelta es UNA sesión y aquí ya no se pregunta, así que el campo
    // no está en pantalla. Las creadas con el formulario antiguo —que sí lo
    // enseñaba— pueden tener `sesiones` a null: sin esto, al abrirlas para
    // editar el guardado se bloquearía por un campo obligatorio invisible.
    return base.tipo === 'PUNTUAL' && !base.sesiones.trim() ? { ...base, sesiones: '1' } : base;
  });
  const [form, setForm] = useState<FormularioPlan>(inicial);
  // Una lista vacía significa «todas las clases» en la base de datos, así que
  // no se puede distinguir «aún no he elegido» de «vale para todas» mirando
  // solo el array: hace falta guardar la intención aparte.
  const [modoClases, setModoClases] = useState<'todas' | 'algunas'>(
    inicial.tiposClaseIds.length > 0 ? 'algunas' : 'todas',
  );
  // Los errores no saltan mientras se escribe por primera vez: un formulario
  // recién abierto en rojo por campos que aún no has tocado es ruido, no ayuda.
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [intentado, setIntentado] = useState(false);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);

  const set = (k: keyof FormularioPlan, v: string | boolean | string[]) => setForm(f => ({ ...f, [k]: v }));
  const tocar = (k: string) => setTocados(t => ({ ...t, [k]: true }));

  const errores = erroresPlan(form);
  const visible = (k: CampoPlan) => (intentado || tocados[k] ? errores[k] : undefined);
  const guardable = Object.keys(errores).length === 0;
  // ¿El campo que falla está de verdad en pantalla? `sesiones` y `validezDias`
  // solo se pintan para algunos tipos.
  const enPantalla: Record<CampoPlan, boolean> = {
    nombre: true, precio: true, limiteSemanal: form.limiteSemanal.trim() !== '',
    sesiones: form.tipo === 'BONO', validezDias: form.tipo !== 'MENSUAL',
  };
  const camposConErrorVisibles = (Object.keys(errores) as CampoPlan[]).some(c => enPantalla[c]);
  const sucio = JSON.stringify(form) !== JSON.stringify(inicial);

  // Cambiar de tipo no puede dejar puestos los datos del tipo anterior: si se
  // pasa de bono a mensual y luego se vuelve, las sesiones de antes seguirían
  // ahí sin que nadie las haya visto. Una clase suelta es UNA sesión por
  // definición, así que se pone sola y no se pregunta.
  function cambiarTipo(tipo: TipoPlan) {
    setForm(f => ({
      ...f,
      tipo,
      sesiones: tipo === 'PUNTUAL' ? '1' : tipo === 'MENSUAL' ? '' : f.sesiones,
      validezDias: tipo === 'MENSUAL' ? '' : f.validezDias,
    }));
  }

  function intentarCerrar() {
    if (sucio) setConfirmandoCierre(true);
    else onClose();
  }

  function guardar() {
    setIntentado(true);
    if (!guardable) return;
    onSave(modoClases === 'todas' ? { ...form, tiposClaseIds: [] } : form);
  }

  const esBono = form.tipo === 'BONO';
  const tituloAccion = initial
    ? 'Guardar cambios'
    : `Crear ${NOMBRE_TIPO_PLAN[form.tipo].toLowerCase()}`;

  return (
    <>
    <DashboardSheet
      open onClose={intentarCerrar}
      label={initial ? 'Editar tarifa' : 'Nueva tarifa'}
      closeOnBackdropClick={false}
      // ⚠️ `portal`: sin esto el modal se centra contra la PÁGINA, no contra la
      // ventana, y se corta por arriba. El contenedor del panel lleva la
      // animación `.panel-page-in`, que deja un `transform` puesto —y un
      // elemento con transform crea un "containing block" nuevo, así que el
      // `fixed inset-0` del backdrop deja de referirse al viewport. Con el
      // formulario antiguo (max-w-md, corto) apenas se notaba; este es más
      // alto y se salía de pantalla. Ver components/ui/dashboard-sheet.tsx.
      portal
      sheetClassName="bg-card rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]">
      <>
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-foreground truncate">{initial ? 'Editar tarifa' : 'Nueva tarifa'}</h2>
            <p className="text-[12px] text-muted-foreground">
              {initial ? initial.nombre : 'Elige qué tipo es y rellena solo lo que haga falta.'}
            </p>
          </div>
          <button onClick={intentarCerrar} aria-label="Cerrar"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8">
            <div className="space-y-6 min-w-0">

              <Seccion titulo="¿Qué tipo de tarifa es?">
                <div role="radiogroup" aria-label="Tipo de tarifa" className="grid gap-2 sm:grid-cols-3">
                  {(['MENSUAL', 'BONO', 'PUNTUAL'] as TipoPlan[]).map(t => {
                    const Icono = ICONO_TIPO[t];
                    const puesto = form.tipo === t;
                    return (
                      <button
                        key={t} type="button" role="radio" aria-checked={puesto}
                        onClick={() => cambiarTipo(t)}
                        className={cn(
                          'text-left rounded-xl border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
                          puesto ? 'border-brand' : 'border-border hover:border-muted-foreground/40',
                        )}
                        style={puesto ? { backgroundColor: 'color-mix(in srgb, var(--brand) 8%, var(--card))' } : undefined}>
                        <Icono size={16} style={{ color: puesto ? 'var(--brand)' : 'var(--muted-foreground)' }} />
                        <p className="mt-1.5 text-sm font-semibold text-foreground">{NOMBRE_TIPO_PLAN[t]}</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">{EXPLICACION_TIPO_PLAN[t]}</p>
                      </button>
                    );
                  })}
                </div>
              </Seccion>

              <Seccion titulo="Nombre y descripción">
                <Campo id={`${uid}-nombre`} etiqueta="Nombre" obligatorio error={visible('nombre')}>
                  {p => (
                    <input {...p} value={form.nombre} onChange={e => set('nombre', e.target.value)}
                      onBlur={() => tocar('nombre')} className={cajaCls(visible('nombre'))}
                      placeholder={esBono ? 'Ej. Bono 4 clases' : 'Ej. Mensual ilimitado'} />
                  )}
                </Campo>
                <Campo
                  id={`${uid}-desc`} etiqueta="Descripción"
                  ayuda="El argumento de venta, no las condiciones: esas las redacta Tentare sola ahí al lado.">
                  {p => (
                    <textarea {...p} value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                      rows={2} className={cn(CAJA, 'border-border resize-none')}
                      placeholder="Ej. Perfecto para empezar con Reformer." />
                  )}
                </Campo>
              </Seccion>

              <Seccion titulo="Precio">
                <Campo
                  id={`${uid}-precio`}
                  etiqueta={form.tipo === 'MENSUAL' ? 'Precio al mes' : 'Precio'}
                  obligatorio error={visible('precio')}
                  ayuda={form.tipo === 'MENSUAL'
                    ? 'Se le cobra cada mes hasta que se dé de baja.'
                    : 'Se le cobra una sola vez, al comprarlo.'}>
                  {p => (
                    <div className="relative max-w-[240px]">
                      <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                      {/* `type="text"` con `inputMode="decimal"`, no `type="number"`:
                          en español el separador es la coma, y un input numérico
                          la rechaza dejando el campo vacío sin decir por qué.
                          `precioANumero` entiende las dos. */}
                      <input {...p} value={form.precio} onChange={e => set('precio', e.target.value)}
                        onBlur={() => tocar('precio')} type="text" inputMode="decimal"
                        className={cn(cajaCls(visible('precio')), 'pl-7 pr-14 tabular-nums')}
                        placeholder="0,00" />
                      {form.tipo === 'MENSUAL' && (
                        <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">/ mes</span>
                      )}
                    </div>
                  )}
                </Campo>
              </Seccion>

              <Seccion titulo="Condiciones">
                {/* Solo lo que aplica al tipo elegido. Un mensual no tiene
                    sesiones ni caduca por días; una clase suelta es una
                    sesión por definición y no se pregunta. */}
                {form.tipo !== 'MENSUAL' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {esBono && (
                      <Campo id={`${uid}-sesiones`} etiqueta="Sesiones que incluye" obligatorio error={visible('sesiones')}>
                        {p => (
                          <div className="flex items-center gap-2">
                            <input {...p} value={form.sesiones} onChange={e => set('sesiones', e.target.value)}
                              onBlur={() => tocar('sesiones')} type="number" min="1" inputMode="numeric"
                              className={cn(cajaCls(visible('sesiones')), 'tabular-nums')} placeholder="4" />
                            <span className="text-sm text-muted-foreground shrink-0">sesiones</span>
                          </div>
                        )}
                      </Campo>
                    )}
                    <Campo
                      id={`${uid}-validez`} etiqueta="Caducidad" error={visible('validezDias')}
                      ayuda="Empieza a contar cuando lo compra. Vacío = no caduca.">
                      {p => (
                        <div className="flex items-center gap-2">
                          <input {...p} value={form.validezDias} onChange={e => set('validezDias', e.target.value)}
                            onBlur={() => tocar('validezDias')} type="number" min="1" inputMode="numeric"
                            className={cn(cajaCls(visible('validezDias')), 'tabular-nums')} placeholder="Sin caducidad" />
                          <span className="text-sm text-muted-foreground shrink-0">días</span>
                        </div>
                      )}
                    </Campo>
                  </div>
                )}

                {/* El límite semanal era un input suelto con «Sin límite» de
                    marcador: parecía un campo a rellenar y no se entendía que
                    vacío ya era la respuesta. Ahora se activa a propósito. */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <Interruptor
                      activo={form.limiteSemanal.trim() !== ''}
                      onChange={v => set('limiteSemanal', v ? '2' : '')}
                      labelledBy={`${uid}-limite-tx`} />
                    <span
                      id={`${uid}-limite-tx`}
                      onClick={() => set('limiteSemanal', form.limiteSemanal.trim() ? '' : '2')}
                      className="text-sm font-medium text-foreground cursor-pointer select-none">
                      Limitar cuántas clases puede reservar por semana
                    </span>
                  </div>
                  {form.limiteSemanal.trim() !== '' && (
                    <div className="mt-3 pl-[52px]">
                      <Campo id={`${uid}-limite`} etiqueta="Máximo por semana" error={visible('limiteSemanal')}>
                        {p => (
                          <div className="flex items-center gap-2 max-w-[240px]">
                            <input {...p} value={form.limiteSemanal} onChange={e => set('limiteSemanal', e.target.value)}
                              onBlur={() => tocar('limiteSemanal')} type="number" min="1" inputMode="numeric"
                              className={cn(cajaCls(visible('limiteSemanal')), 'tabular-nums')} />
                            <span className="text-sm text-muted-foreground shrink-0">por semana</span>
                          </div>
                        )}
                      </Campo>
                    </div>
                  )}
                </div>
              </Seccion>

              {tiposClase.length > 0 && (
                <Seccion titulo="Clases incluidas">
                  {/* Antes eran unas pastillas sin estado claro y una frase
                      debajo («Sin marcar nada, sirve para todas tus clases»)
                      que era la regla de negocio entera escondida en letra
                      pequeña. Ahora la decisión se toma arriba y explícita. */}
                  <div role="radiogroup" aria-label="Clases incluidas" className="grid gap-2 sm:grid-cols-2">
                    {([['todas', 'Todas las clases', 'Sirve para cualquier clase de tu horario.'],
                       ['algunas', 'Solo algunas clases', 'Tú eliges en cuáles se puede usar.']] as const).map(([v, t, d]) => (
                      <button
                        key={v} type="button" role="radio" aria-checked={modoClases === v}
                        onClick={() => { setModoClases(v); if (v === 'todas') set('tiposClaseIds', []); }}
                        className={cn(
                          'text-left rounded-xl border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
                          modoClases === v ? 'border-brand' : 'border-border hover:border-muted-foreground/40',
                        )}
                        style={modoClases === v ? { backgroundColor: 'color-mix(in srgb, var(--brand) 8%, var(--card))' } : undefined}>
                        <p className="text-sm font-semibold text-foreground">{t}</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">{d}</p>
                      </button>
                    ))}
                  </div>

                  {modoClases === 'algunas' && (
                    <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                      {tiposClase.map(tc => {
                        const puesto = form.tiposClaseIds.includes(tc.id);
                        return (
                          <label key={tc.id}
                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                            <input
                              type="checkbox" checked={puesto}
                              onChange={() => set('tiposClaseIds', puesto
                                ? form.tiposClaseIds.filter(x => x !== tc.id)
                                : [...form.tiposClaseIds, tc.id])}
                              className="w-4 h-4 rounded accent-[var(--brand)] shrink-0" />
                            <span className="text-sm text-foreground">{tc.nombre}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {modoClases === 'algunas' && form.tiposClaseIds.length === 0 && (
                    <p role="status" className="text-[12px] text-muted-foreground">
                      No has marcado ninguna todavía, así que de momento sirve para todas.
                    </p>
                  )}
                </Seccion>
              )}

              <Seccion titulo="Disponibilidad">
                <div className="flex items-start gap-2.5">
                  <Interruptor activo={form.activo} onChange={v => set('activo', v)}
                    labelledBy={`${uid}-activo-tx`} describedBy={`${uid}-activo-ayuda`} />
                  <div>
                    <span
                      id={`${uid}-activo-tx`}
                      onClick={() => set('activo', !form.activo)}
                      className="text-sm font-medium text-foreground cursor-pointer select-none">
                      Disponible para vender
                    </span>
                    <p id={`${uid}-activo-ayuda`} className="text-[12px] text-muted-foreground mt-0.5">
                      {form.activo
                        ? 'Tus clientas pueden comprarlo desde la web y desde el mostrador.'
                        : 'Nadie nuevo puede comprarlo. Quien ya lo tenga lo conserva y lo sigue usando con normalidad.'}
                    </p>
                  </div>
                </div>
              </Seccion>
            </div>

            {/* En escritorio va pegado a la derecha mientras se rellena; en
                móvil cae debajo, que es el orden natural de leerlo: primero
                escribes, luego repasas. */}
            <aside className="lg:sticky lg:top-0 lg:self-start">
              <ResumenPlan form={form} tiposClase={tiposClase} />
            </aside>
          </div>
        </div>

        {/* Red de seguridad: un botón que no hace nada y no dice por qué es de
            las cosas que más desesperan. Los errores salen pegados a su campo,
            pero si el campo que falla no estuviera en pantalla —un tipo que lo
            esconde— el motivo se dice aquí igualmente. */}
        {intentado && !guardable && !camposConErrorVisibles && (
          <p role="alert" className="px-5 sm:px-6 pb-1 text-[12px] font-medium" style={{ color: 'var(--destructive)' }}>
            {Object.values(errores)[0]}
          </p>
        )}
        <div className="px-5 sm:px-6 py-4 border-t border-border shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button onClick={intentarCerrar}
            className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted">
            Cancelar
          </button>
          <button onClick={guardar}
            className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-foreground)' }}>
            {tituloAccion}
          </button>
        </div>
      </>
    </DashboardSheet>

    {/* Cerrar con cambios sin guardar tiraba el trabajo sin preguntar. */}
    <ConfirmDialog
      open={confirmandoCierre} onOpenChange={setConfirmandoCierre}
      titulo="¿Descartar los cambios?"
      descripcion="Lo que has escrito se perderá."
      textoConfirmar="Descartar" textoCancelar="Seguir editando" destructivo
      onConfirm={onClose} />
    </>
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
            <EmptyState
              icono={Package}
              titulo={`Aún no tienes ${TIPO_TABS.find(t => t.v === tipoTab)?.label.toLowerCase()}`}
              descripcion="Crea uno nuevo o cambia de pestaña para ver otro tipo."
              cta={{ label: `Añadir ${TIPO_TABS.find(t => t.v === tipoTab)?.singular ?? 'plan'}`, onClick: () => setPlanModal('new') }}
            />
          ) : planesFiltrados.length === 0 ? (
            <EmptyState compacto titulo={`Sin resultados para "${busqueda}".`} />
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
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setBorrando(plan)} aria-label="Eliminar plan"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={14} />
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
                              <ShoppingBag size={14} style={{ color: c.text }} />
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
                            <Pencil size={14} />
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
