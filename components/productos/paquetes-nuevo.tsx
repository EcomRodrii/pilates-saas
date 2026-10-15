'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Paquetes en el panel nuevo (interruptor `panelNuevo`, 14-oct-2026), con las
// piezas de la home nueva (`components/dashboard/vivo.tsx`):
//   · cuatro cifras de color arriba, que llevan a su tipo de tarifa;
//   · cada tarifa en su tarjeta teñida del color de su tipo, con el precio en
//     grande y a la vista lo que se pregunta antes de venderla: cuántas
//     sesiones, cuándo caduca o se renueva y cuántas clientas la tienen;
//   · los vacíos que enseñan (Bonsai b-20) y la elección del tipo con ejemplos
//     (Bonsai b-51).
//
// Solo pinta. Lo que se guarda, quién puede tocarlo (`puedeMoverDinero`) y los
// avisos siguen en la página (`app/(dashboard)/productos/page.tsx`); las cifras
// salen de `lib/planes/cifras-paquetes.ts`, puro y probado.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ElementType } from 'react';
import {
  CalendarClock, Check, Euro, LayoutGrid, Layers, List, Package, Pencil, Plus, Repeat, ShoppingBag, Tag, Trash2, Users, Zap,
} from 'lucide-react';
import { MenuAcciones } from '@/components/ui/menu-acciones';
import type { PlanTarifa, Suscripcion, TipoPlan } from '@/lib/types';
import { cn, formatFechaLarga, hoyEnEstudio } from '@/lib/utils';
import { nombrePeriodo } from '@/lib/bono-logic';
import { EXPLICACION_TIPO_PLAN, NOMBRE_TIPO_PLAN } from '@/lib/planes/formulario';
import { cifrasPaquetes, datosDeTarjeta, precioCorto } from '@/lib/planes/cifras-paquetes';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { formatoEuros } from '@/components/dashboard/ingresos-nuevo';
import {
  Baldosa, Comparacion, PantallaVacia, TONOS, TarjetaCifra, fondoTenido, type Tono,
} from '@/components/dashboard/vivo';

/** El color de cada tipo de tarifa: el mismo en su pestaña, su tarjeta y su elección. */
export const TONO_TIPO: Record<TipoPlan, Tono> = { MENSUAL: 'azul', BONO: 'magenta', PUNTUAL: 'verde' };
const ICONO_TIPO: Record<TipoPlan, ElementType> = { MENSUAL: Repeat, BONO: Zap, PUNTUAL: Tag };
const TIPOS: TipoPlan[] = ['MENSUAL', 'BONO', 'PUNTUAL'];

// ─── Cifras ───────────────────────────────────────────────────────────────────

export function CifrasPaquetes({ planes, suscripciones, verFinanzas, onTipo }: {
  planes: readonly PlanTarifa[];
  suscripciones: readonly Suscripcion[];
  /** El ingreso recurrente es una cifra de dinero: solo quien ve las finanzas. */
  verFinanzas: boolean;
  onTipo: (t: TipoPlan) => void;
}) {
  // El día del estudio, leído una vez al entrar (no en cada render).
  const [hoy] = useState(() => hoyEnEstudio());
  const c = useMemo(() => cifrasPaquetes({ planes, suscripciones, hoy }), [planes, suscripciones, hoy]);
  // La cifra sigue siendo un enlace; el clic normal cambia el tipo aquí mismo.
  const ir = (t: TipoPlan) => (e: { preventDefault: () => void }) => { e.preventDefault(); onTipo(t); };
  const pendientes = c.sinVender + c.borradores;
  const mesPasado = c.mesAnterior.slice(0, 3);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
      <TarjetaCifra
        etiqueta="Cuotas activas"
        tono="azul"
        Icono={Repeat}
        href="/productos"
        onNavigate={ir('MENSUAL')}
        valor={String(c.cuotasActivas)}
        arriba={c.cuotasActivas > 0 ? `${c.clientasConCuota} ${c.clientasConCuota === 1 ? 'clienta' : 'clientas'}` : undefined}
        abajo={c.cuotasActivas > 0 ? 'con la cuota en vigor' : 'Nadie tiene cuota todavía'}
      />
      <TarjetaCifra
        etiqueta="Bonos vendidos"
        tono="magenta"
        Icono={Zap}
        href="/productos"
        onNavigate={ir('BONO')}
        valor={String(c.bonosMes)}
        {...(c.bonosMes === 0 && c.bonosMesAnteriorAlDia === 0
          ? { abajo: 'Ninguno este mes todavía' }
          : { arriba: 'este mes', abajo: <Comparacion diferencia={c.bonosMes - c.bonosMesAnteriorAlDia} contra={`${mesPasado}. a estas alturas`} /> })}
      />
      {verFinanzas ? (
        <TarjetaCifra
          etiqueta="Ingreso recurrente"
          tono="verde"
          Icono={Euro}
          href="/productos"
          onNavigate={ir('MENSUAL')}
          valor={<CifraPrivada inline>{formatoEuros(c.recurrenteAlMes)}</CifraPrivada>}
          arriba={c.cuotasActivas > 0 ? 'al mes' : undefined}
          abajo={c.cuotasActivas > 0 ? 'lo que suman tus cuotas en vigor' : 'Sin cuotas en vigor'}
        />
      ) : (
        <TarjetaCifra
          etiqueta="Clientas con plan"
          tono="verde"
          Icono={Users}
          href={null}
          valor={String(c.clientasConPlan)}
          abajo="con cuota, bono o clase suelta en vigor"
        />
      )}
      <TarjetaCifra
        etiqueta="A la venta"
        tono="indigo"
        Icono={Package}
        href={null}
        valor={String(c.aLaVenta)}
        arriba={c.total > c.aLaVenta ? `de ${c.total}` : undefined}
        abajo={c.total === 0
          ? 'Aún no vendes nada'
          : pendientes > 0
            ? <span style={{ color: 'var(--warning)' }}>{pendientes} sin poner a la venta</span>
            : c.total === 1 ? 'tu tarifa está a la venta' : 'todas tus tarifas'}
      />
    </div>
  );
}

// ─── Pestañas por tipo ────────────────────────────────────────────────────────

export function SelectorTipo({ valor, onCambio, cuantas, etiquetas }: {
  valor: TipoPlan;
  onCambio: (t: TipoPlan) => void;
  cuantas: Record<TipoPlan, number>;
  etiquetas: Record<TipoPlan, string>;
}) {
  return (
    <div data-tour="paquetes-tipos" role="group" aria-label="Tipo de tarifa" className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-muted p-1">
      {TIPOS.map(t => {
        const Icono = ICONO_TIPO[t];
        const activo = valor === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onCambio(t)}
            aria-pressed={activo}
            className={cn(
              'zona-tactil inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors',
              activo ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icono size={15} strokeWidth={2.2} aria-hidden style={{ color: TONOS[TONO_TIPO[t]] }} />
            {etiquetas[t]}
            <span className="tabular-nums text-muted-foreground">{cuantas[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Tarjeta de una tarifa ────────────────────────────────────────────────────

export function TarjetaPlanNueva({ plan, clientas, cobertura, mueveDinero, onEditar, onBorrar, onPonerALaVenta }: {
  plan: PlanTarifa;
  /** Personas distintas con ella en vigor (`clientasPorPlan`). */
  clientas: number;
  /** «Sirve para todas las clases» / «Solo para Reformer · Mat». */
  cobertura: string;
  mueveDinero: boolean;
  onEditar: () => void;
  onBorrar: () => void;
  onPonerALaVenta: () => void;
}) {
  const tono = TONO_TIPO[plan.tipo];
  const c = TONOS[tono];
  const d = datosDeTarjeta(plan);
  return (
    <article className="flex flex-col gap-4 rounded-t-card border p-5 shadow-t-card" style={fondoTenido(tono, 12)}>
      <div className="flex items-start gap-3">
        <Baldosa tono={tono} Icono={ICONO_TIPO[plan.tipo]} tamano="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[15px] font-semibold leading-tight text-foreground">{plan.nombre}</h3>
          <p className="mt-0.5 text-[12px] font-semibold" style={{ color: c }}>
            {NOMBRE_TIPO_PLAN[plan.tipo]}{plan.esPrueba ? ' · clase de prueba' : ''}
          </p>
        </div>
        {/* Las tarifas son dinero: la RLS de `planes_tarifa` exige `puede_mover_dinero()`.
            Quien no puede, las ve pero no las toca (mismo criterio que la tarjeta de siempre). */}
        {mueveDinero && (
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={onEditar} aria-label="Editar plan" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Pencil size={14} />
            </button>
            <button type="button" onClick={onBorrar} aria-label="Eliminar plan" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className="whitespace-nowrap text-[34px] font-bold leading-none tracking-tight text-foreground tabular-nums">
          {precioCorto(plan.precio)}
          {plan.tipo === 'MENSUAL' && <span className="ml-1 text-[14px] font-semibold tracking-normal text-muted-foreground">/ {nombrePeriodo(plan)}</span>}
        </p>
        {d.porSesion !== null && <p className="pb-0.5 text-[12.5px] text-muted-foreground tabular-nums">{precioCorto(d.porSesion)} la sesión</p>}
      </div>

      <ul className="space-y-1.5 text-[13px] text-foreground">
        <li className="flex items-center gap-2"><Layers size={14} aria-hidden className="shrink-0" style={{ color: c }} />{d.sesiones}</li>
        <li className="flex items-center gap-2"><CalendarClock size={14} aria-hidden className="shrink-0" style={{ color: c }} />{d.caducidad}</li>
        <li className="flex items-center gap-2">
          <Users size={14} aria-hidden className="shrink-0" style={{ color: c }} />
          <span><b className="font-semibold tabular-nums">{clientas}</b> {clientas === 1 ? 'clienta la tiene' : 'clientas la tienen'} ahora</span>
        </li>
      </ul>

      <div className="space-y-0.5 text-[12px] text-muted-foreground">
        <p data-testid="cobertura-plan">{cobertura}</p>
        {plan.esPrueba && <p className="font-medium text-foreground">Solo primera visita, en el widget «Clase de prueba»</p>}
        {/* Una matrícula que solo se ve abriendo la tarifa es una matrícula que se olvida de cobrar. */}
        {(plan.matricula ?? 0) > 0 && <p>+ {precioCorto(plan.matricula ?? 0)} de matrícula la primera vez</p>}
        {plan.ofertaHasta && <p className="font-semibold" style={{ color: 'var(--warning)' }}>Oferta hasta {formatFechaLarga(plan.ofertaHasta)}</p>}
      </div>

      {plan.descripcion && <p className="border-t border-border pt-3 text-[12.5px] text-muted-foreground">{plan.descripcion}</p>}

      <div className="mt-auto">
        {plan.activo ? (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ color: 'var(--success)', backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
            <Check size={12} strokeWidth={3} aria-hidden />A la venta
          </span>
        ) : (
          // Un borrador y una tarifa retirada no salen en la Caja ni en la web:
          // se dice en claro, no con un «Inactivo» pequeño y gris.
          <div data-testid="plan-sin-vender" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2">
            <span className="text-[12px] font-medium text-foreground">
              {plan.precio > 0 ? 'No está a la venta: no sale en la Caja ni en la web' : 'Borrador: ponle precio y ponla a la venta'}
            </span>
            {mueveDinero && plan.precio > 0 && (
              <button type="button" onClick={onPonerALaVenta} className="rounded-full border border-border bg-card px-3 py-1 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted">
                Ponerla a la venta
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Lista, como «Cuotas» de Bonsai (b-50) ───────────────────────────────────
//
// Una fila por tarifa: qué es, sesiones y caducidad, para qué sirve, precio,
// cuántas la tienen y si está a la venta, con sus acciones en un ⋮. Mejor que
// la de Bonsai: cuenta las clientas que la tienen y dice para qué clases sirve.
// Se elige entre lista y tarjetas; la lista es la de serie.

export type VistaPaquetes = 'lista' | 'tarjetas';
const CLAVE_VISTA = 'tentare-paquetes-vista';

/** La vista elegida, recordada en este navegador (sin almacenamiento, la lista). */
export function useVistaPaquetes(): [VistaPaquetes, (v: VistaPaquetes) => void] {
  const [vista, setVista] = useState<VistaPaquetes>(() => {
    try { return localStorage.getItem(CLAVE_VISTA) === 'tarjetas' ? 'tarjetas' : 'lista'; } catch { return 'lista'; }
  });
  return [vista, (v: VistaPaquetes) => {
    setVista(v);
    try { localStorage.setItem(CLAVE_VISTA, v); } catch { /* solo en esta pestaña */ }
  }];
}

export function SelectorVista({ valor, onCambio }: { valor: VistaPaquetes; onCambio: (v: VistaPaquetes) => void }) {
  return (
    <span role="group" aria-label="Cómo verlas" className="inline-flex rounded-full bg-muted p-1">
      {([['lista', 'Lista', List], ['tarjetas', 'Tarjetas', LayoutGrid]] as const).map(([v, texto, Icono]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => onCambio(v)}
          className={cn('zona-tactil inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors', valor === v ? 'bg-card text-foreground shadow-t-card' : 'text-muted-foreground hover:text-foreground')}
        >
          <Icono size={14} aria-hidden />{texto}
        </button>
      ))}
    </span>
  );
}

interface FilaPlan {
  plan: PlanTarifa;
  clientas: number;
  cobertura: string;
}

function EstadoVenta({ plan }: { plan: PlanTarifa }) {
  return plan.activo ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ color: 'var(--success)', backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
      <Check size={11} strokeWidth={3} aria-hidden />A la venta
    </span>
  ) : (
    <span data-testid="plan-sin-vender" className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">
      {plan.precio > 0 ? 'No a la venta' : 'Borrador'}
    </span>
  );
}

function AccionesPlan({ plan, onEditar, onBorrar, onPonerALaVenta }: { plan: PlanTarifa; onEditar: () => void; onBorrar: () => void; onPonerALaVenta: () => void }) {
  return (
    <MenuAcciones
      etiqueta={`Acciones de ${plan.nombre}`}
      titulo={plan.nombre}
      acciones={[
        { texto: 'Editar', icono: Pencil, onClick: onEditar },
        ...(!plan.activo && plan.precio > 0 ? [{ texto: 'Ponerla a la venta', icono: ShoppingBag, nota: 'Sale en la Caja y en la web', onClick: onPonerALaVenta }] : []),
        { texto: 'Eliminar', icono: Trash2, onClick: onBorrar, peligro: true, separar: true },
      ]}
    />
  );
}

export function ListaPlanesNueva({ filas, mueveDinero, onEditar, onBorrar, onPonerALaVenta }: {
  filas: FilaPlan[];
  mueveDinero: boolean;
  onEditar: (p: PlanTarifa) => void;
  onBorrar: (p: PlanTarifa) => void;
  onPonerALaVenta: (p: PlanTarifa) => void;
}) {
  return (
    <div className="overflow-hidden rounded-t-card border border-border bg-card shadow-t-card">
      {/* Escritorio: una tabla de verdad. */}
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="border-b border-border text-[12px] font-semibold text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-semibold">Nombre</th>
            <th scope="col" className="px-3 py-3 font-semibold">Sesiones</th>
            <th scope="col" className="px-3 py-3 font-semibold">Sirve para</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Precio</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">La tienen</th>
            <th scope="col" className="px-3 py-3 font-semibold">Estado</th>
            {mueveDinero && <th scope="col" className="w-12 px-3 py-3"><span className="sr-only">Acciones</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map(({ plan, clientas, cobertura }) => {
            const tono = TONO_TIPO[plan.tipo];
            const d = datosDeTarjeta(plan);
            return (
              <tr key={plan.id} data-testid="fila-plan" className="align-middle transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => mueveDinero && onEditar(plan)} disabled={!mueveDinero} className="zona-tactil flex min-w-0 items-center gap-3 text-left disabled:cursor-default">
                    <Baldosa tono={tono} Icono={ICONO_TIPO[plan.tipo]} tamano="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-foreground">{plan.nombre}</span>
                      <span className="block text-[12px] font-semibold" style={{ color: TONOS[tono] }}>
                        {NOMBRE_TIPO_PLAN[plan.tipo]}{plan.esPrueba ? ' · clase de prueba' : ''}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3 text-[13px] text-foreground">
                  <span className="block">{d.sesiones}</span>
                  <span className="block text-[12px] text-muted-foreground">{d.caducidad}</span>
                </td>
                <td className="max-w-[220px] px-3 py-3 text-[12.5px] text-muted-foreground"><span data-testid="cobertura-plan">{cobertura}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <span className="text-[15px] font-bold tabular-nums text-foreground">{precioCorto(plan.precio)}</span>
                  {plan.tipo === 'MENSUAL' && <span className="text-[12px] text-muted-foreground"> / {nombrePeriodo(plan)}</span>}
                  {d.porSesion !== null && <span className="block text-[11.5px] text-muted-foreground tabular-nums">{precioCorto(d.porSesion)} la sesión</span>}
                </td>
                <td className="px-3 py-3 text-right text-[14px] font-semibold tabular-nums text-foreground">{clientas}</td>
                <td className="px-3 py-3"><EstadoVenta plan={plan} /></td>
                {mueveDinero && (
                  <td className="px-3 py-3 text-right">
                    <AccionesPlan plan={plan} onEditar={() => onEditar(plan)} onBorrar={() => onBorrar(plan)} onPonerALaVenta={() => onPonerALaVenta(plan)} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Móvil: una fila por tarifa, lo esencial a la vista. */}
      <ul className="divide-y divide-border md:hidden">
        {filas.map(({ plan, clientas }) => {
          const tono = TONO_TIPO[plan.tipo];
          const d = datosDeTarjeta(plan);
          return (
            <li key={plan.id} data-testid="fila-plan-movil" className="flex items-center gap-3 px-4 py-3">
              <Baldosa tono={tono} Icono={ICONO_TIPO[plan.tipo]} tamano="sm" />
              <button type="button" onClick={() => mueveDinero && onEditar(plan)} disabled={!mueveDinero} className="min-w-0 flex-1 text-left disabled:cursor-default">
                <span className="block truncate text-[14px] font-semibold text-foreground">{plan.nombre}</span>
                <span className="block text-[12px] text-muted-foreground">{d.sesiones} · {clientas} {clientas === 1 ? 'la tiene' : 'la tienen'}</span>
                <span className="mt-1 block"><EstadoVenta plan={plan} /></span>
              </button>
              <span className="text-right">
                <span className="block text-[15px] font-bold tabular-nums text-foreground">{precioCorto(plan.precio)}</span>
                {plan.tipo === 'MENSUAL' && <span className="block text-[11.5px] text-muted-foreground">/ {nombrePeriodo(plan)}</span>}
              </span>
              {mueveDinero && <AccionesPlan plan={plan} onEditar={() => onEditar(plan)} onBorrar={() => onBorrar(plan)} onPonerALaVenta={() => onPonerALaVenta(plan)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** La tarjeta de añadir, al final de la rejilla. */
export function TarjetaAnadir({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-t-card border-2 border-dashed border-border bg-card/60 p-5 text-muted-foreground transition-colors hover:border-[color:var(--t-magenta-500)] hover:text-foreground"
    >
      <span aria-hidden className="flex size-10 items-center justify-center rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--t-magenta-500) 12%, var(--card))', color: 'var(--t-magenta-500)' }}>
        <Plus size={18} strokeWidth={2.4} />
      </span>
      <span className="text-[13.5px] font-semibold">{texto}</span>
    </button>
  );
}

// ─── Vacíos que enseñan ───────────────────────────────────────────────────────

const SIN_PERMISO = 'Crearlas es cosa de la propietaria o de recepción.';

const VACIO_TIPO: Record<TipoPlan, { titulo: string; texto: string; ejemplos: { accion: string; cuando: string }[]; accion: string }> = {
  MENSUAL: {
    titulo: 'Asegura tus ingresos de cada mes',
    texto: 'Una cuota se renueva sola cada mes, trimestre, semestre o año hasta que la clienta se da de baja.',
    ejemplos: [
      { accion: 'Mensual, 2 clases por semana', cuando: 'que se renueva cada mes' },
      { accion: 'Trimestral sin límite', cuando: 'que se cobra cada tres meses' },
    ],
    accion: 'Crear una cuota',
  },
  BONO: {
    titulo: 'Vende clases por adelantado',
    texto: 'Un bono es un puñado de sesiones que se gastan al reservar. Tú decides cuándo caduca y para qué clases vale.',
    ejemplos: [
      { accion: 'Bono de 10 clases de Reformer', cuando: 'que solo vale para Reformer' },
      { accion: 'Bono de 5 clases', cuando: 'que caduca a los 2 meses' },
    ],
    accion: 'Crear un bono',
  },
  PUNTUAL: {
    titulo: 'Que puedan venir un día suelto',
    texto: 'Una clase suelta es un pago único para una sola clase, sin renovación.',
    ejemplos: [
      { accion: 'Clase suelta de Reformer', cuando: 'para quien viene de vez en cuando' },
      { accion: 'Clase de prueba', cuando: 'solo para quien viene por primera vez' },
    ],
    accion: 'Crear una clase suelta',
  },
};

/**
 * El vacío de Paquetes: sin ninguna tarifa (`tipo` sin dar), o sin ninguna de un
 * tipo. Quien no puede crear tarifas lo lee igual, sin el botón.
 */
export function VacioPaquetes({ tipo, puedeCrear, onCrear }: { tipo?: TipoPlan; puedeCrear: boolean; onCrear: () => void }) {
  if (!tipo) {
    return (
      <PantallaVacia
        tono="magenta"
        Icono={Package}
        titulo="Pon a la venta tu primera cuota o bono"
        texto={`Es lo que tus clientas compran para venir a clase. En cuanto lo pongas a la venta, sale en tu página y en la Caja.${puedeCrear ? '' : ` ${SIN_PERMISO}`}`}
        ejemplos={[
          { accion: 'Una cuota mensual', cuando: 'que se renueva sola cada mes' },
          { accion: 'Un bono de 10 clases', cuando: 'que se gasta al reservar y caduca' },
          { accion: 'Una clase suelta', cuando: 'para quien viene un día' },
        ]}
        accion={puedeCrear ? { label: 'Crear mi primera tarifa', onClick: onCrear, Icono: Plus } : undefined}
      />
    );
  }
  const v = VACIO_TIPO[tipo];
  return (
    <PantallaVacia
      tono={TONO_TIPO[tipo]}
      Icono={ICONO_TIPO[tipo]}
      titulo={v.titulo}
      texto={puedeCrear ? v.texto : `${v.texto} ${SIN_PERMISO}`}
      ejemplos={v.ejemplos}
      accion={puedeCrear ? { label: v.accion, onClick: onCrear, Icono: Plus } : undefined}
    />
  );
}

// ─── Elegir el tipo, con ejemplos (Bonsai b-51) ───────────────────────────────

const EJEMPLOS_TIPO: Record<TipoPlan, string[]> = {
  MENSUAL: ['Mensual, 2 clases por semana', 'Trimestral sin límite'],
  BONO: ['Bono de 10 clases de Reformer', 'Bono de 5 que caduca en 2 meses'],
  PUNTUAL: ['Clase suelta de Reformer', 'Clase de prueba'],
};

/**
 * La pregunta «¿Qué tipo de tarifa es?» del formulario, como elección con
 * ejemplos. Es el MISMO control que el de siempre (un radiogroup que llama a
 * `cambiarTipo`): cambia cómo se ve, no lo que se guarda.
 */
export function EleccionTipoNueva({ tipo, onElegir }: { tipo: TipoPlan; onElegir: (t: TipoPlan) => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo de tarifa" className="grid gap-2.5 sm:grid-cols-3">
      {TIPOS.map(t => {
        const puesto = tipo === t;
        const tono = TONO_TIPO[t];
        const c = TONOS[tono];
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={puesto}
            onClick={() => onElegir(t)}
            className="relative flex flex-col items-start rounded-2xl border p-3.5 text-left transition-shadow hover:shadow-t-card focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            style={puesto
              ? { ...fondoTenido(tono, 16), borderColor: c, boxShadow: `0 0 0 1px ${c}` }
              : { backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
          >
            {puesto && (
              <span aria-hidden className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full" style={{ backgroundColor: c, color: 'var(--card)' }}>
                <Check size={12} strokeWidth={3} />
              </span>
            )}
            <Baldosa tono={tono} Icono={ICONO_TIPO[t]} tamano="sm" />
            <p className="mt-2.5 text-[14px] font-semibold text-foreground">{NOMBRE_TIPO_PLAN[t]}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{EXPLICACION_TIPO_PLAN[t]}</p>
            <p className="mt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">Por ejemplo</p>
            <ul className="mt-1 space-y-1">
              {EJEMPLOS_TIPO[t].map(e => (
                <li key={e} className="flex items-start gap-1.5 text-[12px] leading-snug text-foreground/85">
                  <span aria-hidden className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ backgroundColor: c }} />
                  {e}
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
