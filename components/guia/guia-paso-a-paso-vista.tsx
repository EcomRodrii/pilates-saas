// ─────────────────────────────────────────────────────────────────────────────
// Lo que se VE de la guía paso a paso (la lógica y los datos, en guia-paso-a-paso.tsx).
// Pura presentación: recibe la ruta ya calculada, así se puede pintar sin el panel.
//
// Un paso por pantalla (el fundador odia «mucha información de golpe»):
//   · qué es, en una frase; por qué importa, en otra; cómo se hace, en dos o tres líneas;
//   · UN botón que lo hace ahí mismo y, si se puede, «Saltar este paso».
// En móvil se siente otra app: el paso a pantalla entera, letra de 16 px, botones de 54 px
// y la acción fija abajo, al alcance del pulgar. En escritorio, la lista de los diez pasos
// a la izquierda y el paso a la derecha.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import type { ElementType } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CreditCard, DoorOpen, LayoutGrid, Lock, Palette, Share2, SlidersHorizontal, Tag, Ticket, UserPlus, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BOTON_DESTACADO, Baldosa, DEGRADADO_LOGO, type Tono } from '@/components/dashboard/vivo';
import {
  hrefPaso, type IconoPaso, type PasoConEstado, type RutaPuestaEnMarcha,
} from '@/lib/guia/ruta-puesta-en-marcha';

export const ICONOS_PASO: Record<IconoPaso, ElementType> = {
  estudio: Building2, sala: DoorOpen, equipo: Users, clase: LayoutGrid, reglas: SlidersHorizontal, tarifa: Tag,
  cobro: CreditCard, calendario: CalendarDays, alumnas: UserPlus, marca: Palette, reserva: Ticket,
};

export const TONO_PASO: Record<IconoPaso, Tono> = {
  estudio: 'indigo', sala: 'azul', equipo: 'magenta', clase: 'indigo', reglas: 'azul', tarifa: 'verde',
  cobro: 'indigo', calendario: 'azul', alumnas: 'azul', marca: 'magenta', reserva: 'magenta',
};

const ETIQUETA_ESTADO = { hecho: 'hecho', ahora: 'lo siguiente', pendiente: 'pendiente', saltado: 'saltado', bloqueado: 'antes hay que hacer otro paso' } as const;

/** Los diez tramos de la barra: cada uno lleva a su paso. */
export function BarraTramos({ ruta, actual }: { ruta: RutaPuestaEnMarcha; actual: string }) {
  return (
    <nav aria-label="Los pasos" className="flex gap-1">
      {ruta.pasos.map(p => (
        <Link
          key={p.id}
          href={hrefPaso(p.id)}
          scroll={false}
          aria-label={`Paso ${p.numero}: ${p.titulo} (${ETIQUETA_ESTADO[p.estado]})`}
          aria-current={p.id === actual ? 'step' : undefined}
          className="group flex h-6 flex-1 items-center"
        >
          <span
            className={cn(
              'h-1.5 w-full rounded-full transition-all',
              p.estado === 'hecho' ? 'bg-[color:var(--success)]' : p.estado === 'saltado' ? 'bg-muted-foreground/40' : 'bg-muted',
              p.id === actual && 'h-2.5 ring-2 ring-foreground/25',
            )}
            style={p.id === actual && p.estado !== 'hecho' ? { backgroundImage: DEGRADADO_LOGO } : undefined}
          />
        </Link>
      ))}
    </nav>
  );
}

function ListaLateral({ ruta, actual }: { ruta: RutaPuestaEnMarcha; actual: string }) {
  return (
    <ol className="grid gap-0.5" data-testid="guia-lista">
      {ruta.pasos.map(p => {
        const Icono = ICONOS_PASO[p.icono];
        return (
          <li key={p.id}>
            <Link
              href={hrefPaso(p.id)}
              scroll={false}
              aria-current={p.id === actual ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] transition-colors hover:bg-muted',
                p.id === actual && 'bg-card font-semibold shadow-t-card ring-1 ring-border',
              )}
            >
              <span
                aria-hidden
                className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-t-mono', p.estado === 'hecho' ? 'text-[color:var(--card)]' : 'text-muted-foreground')}
                style={p.estado === 'hecho' ? { backgroundColor: 'var(--success)' } : { boxShadow: 'inset 0 0 0 1.5px var(--border)' }}
              >
                {p.estado === 'hecho' ? <Check size={12} strokeWidth={3} /> : <Icono size={13} />}
              </span>
              <span className={cn('min-w-0 flex-1 truncate', p.estado === 'hecho' && 'text-muted-foreground')}>
                {p.titulo}
                <span className="sr-only"> ({ETIQUETA_ESTADO[p.estado]})</span>
              </span>
              {p.estado === 'saltado' && <span className="font-t-mono text-[11px] text-muted-foreground">saltado</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function GuiaPasoAPasoVista({ ruta, paso, onSaltar, onCompartir, ayudaHref }: {
  ruta: RutaPuestaEnMarcha;
  paso: PasoConEstado;
  onSaltar: (id: string) => void;
  onCompartir: () => void;
  /** «¿Te atascas?»: el WhatsApp de una persona del equipo. */
  ayudaHref?: string | null;
}) {
  const Icono = ICONOS_PASO[paso.icono];
  const hecho = paso.estado === 'hecho';
  const i = ruta.pasos.findIndex(p => p.id === paso.id);
  const anterior = ruta.pasos[i - 1] ?? null;
  const siguiente = ruta.pasos[i + 1] ?? null;
  // «Siguiente» tras hacerlo: el primero que queda por hacer, no solo el de al lado.
  const queToca = ruta.ahora && ruta.ahora.id !== paso.id ? ruta.ahora : siguiente;
  const botonDelPaso = paso.boton;

  const accionPrincipal = (() => {
    const clase = cn(BOTON_DESTACADO, 'h-[54px] w-full px-6 text-[16px] lg:h-11 lg:w-auto lg:text-[14px]');
    if (paso.estado === 'bloqueado' && paso.faltaAntes[0]) {
      const antes = paso.faltaAntes[0];
      return <Link href={hrefPaso(antes.id)} scroll={false} className={clase}>Primero: {antes.titulo}<ArrowRight size={17} aria-hidden /></Link>;
    }
    if (hecho) {
      return queToca
        ? <Link href={hrefPaso(queToca.id)} scroll={false} className={clase}>Siguiente: {queToca.titulo}<ArrowRight size={17} aria-hidden /></Link>
        : null;
    }
    if (paso.id === 'lanzamiento' && !ruta.listoParaAbrir && ruta.faltaParaAbrir[0]) {
      return <Link href={hrefPaso(ruta.faltaParaAbrir[0].id)} scroll={false} className={clase}>Primero: {ruta.faltaParaAbrir[0].titulo}<ArrowRight size={17} aria-hidden /></Link>;
    }
    if (!botonDelPaso) {
      return <button type="button" onClick={onCompartir} className={clase}><Share2 size={17} aria-hidden />Ver mi enlace y mi QR</button>;
    }
    if ('abre' in botonDelPaso) return <button type="button" onClick={onCompartir} className={clase}>{botonDelPaso.label}<ArrowRight size={17} aria-hidden /></button>;
    return <Link href={botonDelPaso.href} className={clase}>{botonDelPaso.label}<ArrowRight size={17} aria-hidden /></Link>;
  })();

  const secundarias = (
    <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 lg:justify-start">
      {!hecho && paso.otro && (
        <Link href={paso.otro.href} className="zona-tactil inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-[color:var(--t-text-link)] hover:bg-muted lg:text-[13.5px]">
          {paso.otro.label}
        </Link>
      )}
      {!hecho && paso.estado !== 'bloqueado' && paso.saltable && (
        <button type="button" onClick={() => onSaltar(paso.id)} className="zona-tactil inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground lg:text-[13.5px]">
          {paso.revision ? 'Ya lo he revisado' : 'Saltar este paso'}
        </button>
      )}
      {!hecho && !paso.saltable && siguiente && (
        <Link href={hrefPaso(siguiente.id)} scroll={false} className="zona-tactil inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground lg:text-[13.5px]">
          Ver el siguiente
        </Link>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl pb-36 lg:pb-8" data-testid="guia-paso-a-paso" data-paso={paso.id}>
      <header>
        <p className="font-t-mono text-[12px] uppercase tracking-[0.06em] text-muted-foreground">Pon en marcha tu estudio</p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <b className="text-[15px] font-semibold text-foreground" data-testid="guia-etiqueta">{ruta.etiqueta}</b>
          <span className="font-t-mono text-[12px] text-muted-foreground">{ruta.hechos} hechos</span>
        </div>
        <div className="mt-1"><BarraTramos ruta={ruta} actual={paso.id} /></div>
      </header>

      <div className="mt-5 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:block"><ListaLateral ruta={ruta} actual={paso.id} /></aside>

        <article
          aria-labelledby="guia-titulo"
          className="rounded-t-card border bg-card p-5 shadow-t-card sm:p-7"
          style={{ borderColor: 'color-mix(in srgb, var(--t-blue-500) 12%, var(--border))' }}
        >
          <div className="flex items-center gap-3">
            <Baldosa tono={TONO_PASO[paso.icono]} Icono={Icono} />
            <p className="font-t-mono text-[12px] uppercase tracking-[0.06em] text-muted-foreground">
              Paso {paso.numero} de {ruta.pasos.length}{paso.minutos ? ` · ≈ ${paso.minutos} min` : ''}
            </p>
          </div>
          <h1 id="guia-titulo" className="mt-4 text-[26px] font-semibold leading-[32px] tracking-[-0.02em] text-foreground text-balance sm:text-[28px]">
            {paso.titulo}
          </h1>

          {hecho && (
            <p className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[15px] font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))', color: 'var(--foreground)' }} data-testid="guia-hecho">
              <span aria-hidden className="flex size-5 items-center justify-center rounded-full text-[color:var(--card)]" style={{ backgroundColor: 'var(--success)' }}><Check size={12} strokeWidth={3} /></span>
              {paso.hecho}.
            </p>
          )}

          <p className="mt-4 text-[17px] leading-[26px] text-foreground text-pretty lg:text-[16px] lg:leading-[24px]">{paso.que}</p>

          <section className="mt-5 rounded-2xl bg-muted/60 px-4 py-3.5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Por qué importa</h2>
            <p className="mt-1 text-[16px] leading-[24px] text-foreground text-pretty lg:text-[15px]">{paso.porque}</p>
          </section>

          {paso.estado === 'bloqueado' && (
            <p className="mt-5 flex items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-[15px] text-foreground" data-testid="guia-bloqueado">
              <Lock size={16} aria-hidden className="mt-1 shrink-0 text-muted-foreground" />
              <span>Antes necesitas: {paso.faltaAntes.map(p => p.titulo.toLowerCase()).join(', ')}.</span>
            </p>
          )}

          {paso.id === 'lanzamiento' && (
            <section className="mt-5 rounded-2xl border border-border px-4 py-3.5" data-testid="guia-lanzamiento">
              <h2 className="text-[15px] font-semibold text-foreground">
                {ruta.listoParaAbrir ? 'Tu estudio está listo para recibir reservas.' : 'Esto te falta para abrir'}
              </h2>
              {!ruta.listoParaAbrir && (
                <ul className="mt-2 grid gap-1.5 text-[15px] text-foreground">
                  {ruta.faltaParaAbrir.map(p => <li key={p.id}>· {p.titulo}</li>)}
                </ul>
              )}
              <p className="mt-2 text-[14px] leading-[21px] text-muted-foreground">Los paquetes, Stripe y las clientas no bloquean: se piden solo si los vas a usar.</p>
            </section>
          )}

          <section className="mt-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Cómo se hace</h2>
            <ol className="mt-2 grid gap-2.5">
              {paso.como.map((linea, n) => (
                <li key={linea} className="flex items-start gap-3 text-[16px] leading-[24px] text-foreground lg:text-[15px]">
                  <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-t-mono text-[12px] text-muted-foreground">{n + 1}</span>
                  <span className="min-w-0 text-pretty">{linea}</span>
                </li>
              ))}
            </ol>
          </section>

          {!hecho && paso.saltable && paso.siSaltas && (
            <p className="mt-5 text-[14.5px] leading-[22px] text-muted-foreground text-pretty" data-testid="guia-si-saltas">
              <b className="font-semibold text-foreground">Si lo saltas: </b>{paso.siSaltas}
            </p>
          )}

          {/* Escritorio: la acción va en la tarjeta. En el móvil va fija abajo, al alcance del pulgar. */}
          <div className="mt-7 hidden flex-wrap items-center gap-x-3 gap-y-2 lg:flex">
            {accionPrincipal}
            {secundarias}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-[14px]">
            {anterior ? (
              <Link href={hrefPaso(anterior.id)} scroll={false} className="zona-tactil inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft size={15} aria-hidden />Anterior
              </Link>
            ) : <span />}
            {ayudaHref && (
              <a href={ayudaHref} target="_blank" rel="noreferrer" className="zona-tactil inline-flex min-h-11 items-center rounded-full px-3 font-medium text-[color:var(--t-text-link)] hover:bg-muted">
                ¿Te atascas? Escríbenos
              </a>
            )}
          </div>
        </article>
      </div>

      {/* La acción del móvil: fija abajo, ancha, ≥ 54 px. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur lg:hidden" data-testid="guia-barra-movil">
        <div className="mx-auto grid max-w-lg gap-1">
          {accionPrincipal}
          {secundarias}
        </div>
      </div>
    </div>
  );
}
