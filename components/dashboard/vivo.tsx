'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El color de la home nueva (panel nuevo, 14-oct-2026).
//
// El fundador, viendo la primera versión: «mira la home de Bonsai: llamativa,
// muy intuitiva, colores». La de Bonsai se lee por color: cada cifra con su
// tono, iconos saturados, barras que se ponen rojas cuando algo va mal, la
// gráfica rellena y los botones de un azul que se ve desde lejos.
//
// Aquí, lo mismo con los colores de Tentare y sin inventar ninguno:
//   · el azul y el magenta del logo (`--t-blue-500`, `--t-magenta-500`);
//   · el verde y el índigo de la paleta categórica (`--cat-2`, `--cat-5`), que
//     ya tienen su versión para oscuro;
//   · el degradado del logo (700 → 700, texto blanco por encima de 5,5:1) para
//     la acción principal de cada tarjeta.
// El icono va del color de la tarjeta (`--card`) sobre el tono sólido: blanco en
// claro y oscuro en oscuro, donde los tonos se aclaran.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ElementType, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Ocupacion } from '@/lib/inicio/cifras';

export type Tono = 'azul' | 'magenta' | 'verde' | 'indigo';

export const TONOS: Record<Tono, string> = {
  azul: 'var(--t-blue-500)',
  magenta: 'var(--t-magenta-500)',
  verde: 'var(--cat-2)',
  indigo: 'var(--cat-5)',
};

/**
 * La acción principal de una pantalla: lisa, en el color del botón principal de
 * siempre (`bg-primary`, tinta en claro y su versión en oscuro), como pide
 * brand/component-guidelines.md. Una por vista.
 * El degradado del logo ya no es el botón de todo (fundador, 14-oct: «no lo
 * quiero siempre de ese color, solo los más destacados»): ese es `BOTON_DESTACADO`.
 */
export const BOTON_VIVO =
  'zona-tactil inline-flex items-center justify-center gap-1.5 rounded-full bg-primary font-semibold text-primary-foreground shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * El degradado del logo, SOLO para lo más destacado: el siguiente paso de «Pon en
 * marcha tu estudio», «Tu estudio está listo» y publicar la app. Nunca en la
 * cabecera de una sección ni en una lista.
 */
export const BOTON_DESTACADO =
  'zona-tactil inline-flex items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--t-blue-700),var(--t-magenta-700))] font-semibold text-white shadow-[0_6px_16px_-8px_var(--t-magenta-700)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** El degradado del logo, para barras y progresos. */
export const DEGRADADO_LOGO = 'linear-gradient(90deg, var(--t-blue-500), var(--t-magenta-500))';

/** Una baldosa de color con su icono, como los iconos de color de Bonsai. */
export function Baldosa({ tono, Icono, tamano = 'md' }: { tono: Tono; Icono: ElementType; tamano?: 'sm' | 'md' }) {
  const c = TONOS[tono];
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center', tamano === 'sm' ? 'size-8 rounded-[10px]' : 'size-10 rounded-xl')}
      style={{ backgroundColor: c, color: 'var(--card)', boxShadow: `0 8px 18px -10px ${c}` }}
    >
      <Icono size={tamano === 'sm' ? 15 : 18} strokeWidth={2.2} />
    </span>
  );
}

/**
 * Fondo de una tarjeta teñida de su tono: blanca y, solo hacia la esquina, un
 * toque de su color, como las tarjetas de cifras de Bonsai. Suave a propósito
 * (fundador, 14-oct: «los degradados de las cards son muy fuertes, solo debe
 * ser fuerte la de módulos»): `fuerza` se queda en un 40 % de lo que se pide, y
 * el borde casi neutro. La única fuerte es la cabecera de Módulos, que no pasa por aquí.
 */
export function fondoTenido(tono: Tono, fuerza = 16): CSSProperties {
  const c = TONOS[tono];
  return {
    backgroundImage: `linear-gradient(135deg, var(--card) 45%, color-mix(in srgb, ${c} ${Math.round(fuerza * 0.4)}%, var(--card)) 100%)`,
    borderColor: `color-mix(in srgb, ${c} 10%, var(--border))`,
  };
}

/**
 * La cabecera de una tarjeta: baldosa de color, título y, a la derecha, lo que sea.
 * Si lo de la derecha no cabe sin dejar al título en menos de 9rem (un botón en
 * el móvil), baja de línea: antes el título quedaba en una columna de una
 * palabra por línea («Quién / me debe»).
 */
export function CabeceraTarjeta({ tono, Icono, titulo, id, derecha, sub }: {
  tono: Tono; Icono: ElementType; titulo: ReactNode; id?: string; derecha?: ReactNode; sub?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2.5">
      <Baldosa tono={tono} Icono={Icono} tamano="sm" />
      <div className="min-w-[9rem] flex-1">
        <h2 id={id} className="text-[16px] font-semibold leading-tight text-foreground">{titulo}</h2>
        {sub && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</p>}
      </div>
      {derecha}
    </div>
  );
}

/**
 * El color de una barra de ocupación, como Bonsai: roja cuando va floja, ámbar
 * a medias y verde cuando se llena. Se lee de un vistazo sin mirar la cifra.
 */
export function colorDeOcupacion(pct: number): string {
  if (pct < 35) return 'var(--destructive)';
  if (pct < 70) return 'var(--warning)';
  return 'var(--success)';
}

// ─── Las piezas de la home, para todas las secciones ─────────────────────────
// Salieron de la home nueva (`resumen-nuevo.tsx`) para que cada sección rehecha
// tenga las mismas cifras, gráficas, píldoras y vacíos: «quiero que se vea así
// en cada sección» (fundador, 14-oct-2026).

/**
 * `onNavigate`: para una cifra que lleva a otra pestaña de la MISMA pantalla
 * (Cobros, Paquetes). El enlace sigue siendo un enlace (se abre en otra pestaña
 * con ⌘-clic y lleva su `?tab=`), pero el clic normal cambia la pestaña en el
 * sitio, sin navegar: la pantalla solo lee la URL al entrar.
 */
type AlNavegar = (e: { preventDefault: () => void }) => void;

export function MarcoCifra({ href, tono, children, etiqueta, onNavigate }: { href: string | null; tono: Tono; children: ReactNode; etiqueta: string; onNavigate?: AlNavegar }) {
  const clase = 'group flex min-h-[132px] flex-col rounded-t-card border p-4 shadow-t-card sm:p-5';
  return href ? (
    <Link href={href} onNavigate={onNavigate} aria-label={etiqueta} className={cn(clase, 'transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-t-floating')} style={fondoTenido(tono, 14)}>
      {children}
    </Link>
  ) : (
    <div className={clase} style={fondoTenido(tono, 14)}>{children}</div>
  );
}


/** Etiqueta pequeña a la izquierda e icono de color a la derecha, como en Bonsai. */
export function Cabecilla({ etiqueta, tono, Icono }: { etiqueta: string; tono: Tono; Icono: React.ElementType }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-[11.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-foreground/60">{etiqueta}</p>
      <Icono size={19} strokeWidth={2.2} style={{ color: TONOS[tono] }} aria-hidden className="shrink-0" />
    </div>
  );
}


/** El número grande con su explicación AL LADO, en dos líneas («1/12» / «1 sesión»). */
export function NumeroConLado({ valor, arriba, abajo }: { valor: ReactNode; arriba?: ReactNode; abajo: ReactNode }) {
  return (
    // Si no cabe al lado (móvil), la explicación baja debajo del número.
    <div className="mt-auto flex flex-wrap items-end gap-x-2.5 gap-y-1 pt-3">
      <p className="whitespace-nowrap text-[34px] font-bold leading-[0.9] tracking-tight text-foreground tabular-nums sm:text-[40px]">{valor}</p>
      <div className="min-w-0 pb-0.5 leading-tight">
        {arriba && <p className="truncate text-[13px] font-semibold text-foreground tabular-nums">{arriba}</p>}
        <p className="text-[12px] text-muted-foreground">{abajo}</p>
      </div>
    </div>
  );
}


export function TarjetaCifra({ etiqueta, tono, Icono, valor, arriba, abajo, href, onNavigate }: {
  etiqueta: string; tono: Tono; Icono: React.ElementType; valor: ReactNode; arriba?: ReactNode; abajo: ReactNode; href: string | null; onNavigate?: AlNavegar;
}) {
  return (
    <MarcoCifra href={href} tono={tono} etiqueta={etiqueta} onNavigate={onNavigate}>
      <Cabecilla etiqueta={etiqueta} tono={tono} Icono={Icono} />
      <NumeroConLado valor={valor} arriba={arriba} abajo={abajo} />
    </MarcoCifra>
  );
}


export function TarjetaOcupacion({ etiqueta, tono, Icono, ocupacion, vacio, contexto, href }: {
  etiqueta: string; tono: Tono; Icono: React.ElementType; ocupacion: Ocupacion; vacio: string; contexto?: string; href: string | null;
}) {
  const sinClases = ocupacion.pct === null;
  return (
    <MarcoCifra href={href} tono={tono} etiqueta={etiqueta}>
      <Cabecilla etiqueta={etiqueta} tono={tono} Icono={Icono} />
      {sinClases ? (
        <NumeroConLado valor="—" abajo={vacio} />
      ) : (
        <NumeroConLado
          valor={<>{ocupacion.pct}<span className="text-[0.6em]">%</span></>}
          arriba={`${ocupacion.ocupadas}/${ocupacion.plazas}`}
          abajo={contexto ?? `${ocupacion.clases} clase${ocupacion.clases === 1 ? '' : 's'}`}
        />
      )}
      {/* Roja si va floja, ámbar a medias, verde si se llena: como la de Bonsai. */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--foreground) 8%, transparent)' }} aria-hidden>
        {!sinClases && <div className="h-full rounded-full" style={{ width: `${Math.max(ocupacion.pct ?? 0, 3)}%`, backgroundColor: colorDeOcupacion(ocupacion.pct ?? 0) }} />}
      </div>
    </MarcoCifra>
  );
}


/** El marco de una gráfica: título y para qué a la izquierda, la cifra grande y su comparación a la derecha. */
export function TarjetaGrafica({ id, titulo, sub, cifra, comparacion, controles, children, pie }: {
  id: string; titulo: string; sub: string; cifra: ReactNode; comparacion?: ReactNode; controles?: ReactNode; children: ReactNode; pie?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-t-card border border-border bg-card p-4 shadow-t-card sm:p-5">
      {/* En el móvil, la cifra debajo del título: al lado le dejaba al subtítulo dos palabras por línea. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 id={id} className="text-[16px] font-semibold text-foreground">{titulo}</h2>
          <p className="mt-0.5 max-w-[34ch] text-[12.5px] leading-snug text-muted-foreground">{sub}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-[28px] font-bold leading-none tracking-tight text-foreground tabular-nums">{cifra}</p>
          {comparacion && <p className="mt-1 text-[12px] leading-tight text-muted-foreground">{comparacion}</p>}
        </div>
      </div>
      {controles && <div className="mt-3">{controles}</div>}
      <div className="mt-3">{children}</div>
      {pie}
    </section>
  );
}


/** El periodo en píldoras, como «7 días · Este mes · 3 meses» de Bonsai. */
export function Pildoras<T extends string | number>({ opciones, valor, onCambio }: { opciones: { valor: T; label: string }[]; valor: T; onCambio: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full bg-muted p-1" role="group" aria-label="Periodo">
      {opciones.map(o => (
        <button
          key={String(o.valor)}
          type="button"
          onClick={() => onCambio(o.valor)}
          aria-pressed={valor === o.valor}
          className={cn(
            'zona-tactil rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors',
            valor === o.valor ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}


export function Comparacion({ diferencia, contra }: { diferencia: number; contra: string }) {
  const color = diferencia > 0 ? 'var(--success)' : diferencia < 0 ? 'var(--destructive)' : 'var(--muted-foreground)';
  return (
    <>
      <span className="font-semibold" style={{ color }}>{diferencia > 0 ? '+' : ''}{diferencia}</span> vs {contra}
    </>
  );
}


export function VerMas({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="zona-tactil mt-3 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'var(--t-text-link)' }}>
      {label} <ArrowRight size={14} aria-hidden />
    </Link>
  );
}



export function VacioPositivo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="flex items-start gap-3 rounded-t-card border p-4 shadow-t-card sm:p-5" style={fondoTenido('verde', 12)}>
      <Baldosa tono="verde" Icono={Check} />
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold text-foreground">{titulo}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{texto}</p>
      </div>
    </section>
  );
}

/**
 * La pantalla vacía que enseña (Bonsai b-20, «Automatiza tu centro»): una
 * baldosa grande de color, un título que es un objetivo, una frase de qué es,
 * los ejemplos (lo que hace en negrita, cuándo en normal) y UNA acción
 * principal con verbo y objeto. Opcional, un enlace secundario.
 */
export function PantallaVacia({ tono, Icono, titulo, texto, ejemplos, accion, secundaria, className }: {
  tono: Tono;
  Icono: ElementType;
  titulo: string;
  texto: ReactNode;
  ejemplos?: { accion: string; cuando: string }[];
  accion?: { label: string; href?: string; onClick?: () => void; Icono?: ElementType };
  secundaria?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  const c = TONOS[tono];
  return (
    <section className={cn('flex flex-col items-center rounded-t-card border px-6 py-10 text-center shadow-t-card sm:py-12', className)} style={fondoTenido(tono, 10)}>
      <span
        aria-hidden
        className="flex size-16 items-center justify-center rounded-[20px]"
        style={{ backgroundColor: c, color: 'var(--card)', boxShadow: `0 16px 30px -14px ${c}` }}
      >
        <Icono size={28} strokeWidth={2} />
      </span>
      <h2 className="mt-5 text-[22px] font-bold leading-tight text-foreground text-balance">{titulo}</h2>
      <p className="mt-2 max-w-md text-[14px] text-muted-foreground text-pretty">{texto}</p>
      {ejemplos && ejemplos.length > 0 && (
        <div className="mt-6 w-full max-w-md rounded-2xl border border-border bg-card p-4 text-left">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">Ejemplos</p>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {ejemplos.map(e => (
              <li key={e.accion} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
                <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: 'var(--cat-2)' }}>
                  <Check size={12} strokeWidth={3} />
                </span>
                <span><span className="font-semibold text-foreground">{e.accion}</span> <span className="text-muted-foreground">{e.cuando}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(accion || secundaria) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {accion && <BotonVivo {...accion} grande />}
          {secundaria && (
            secundaria.href ? (
              <Link href={secundaria.href} className="text-[13.5px] font-semibold" style={{ color: 'var(--t-text-link)' }}>{secundaria.label}</Link>
            ) : (
              <button type="button" onClick={secundaria.onClick} className="text-[13.5px] font-semibold" style={{ color: 'var(--t-text-link)' }}>{secundaria.label}</button>
            )
          )}
        </div>
      )}
    </section>
  );
}

/** La acción principal del panel nuevo: enlace o botón, lisa (o con el degradado si es de lo más destacado). */
export function BotonVivo({ label, href, onClick, Icono, grande = false, disabled, type = 'button', className, destacado = false }: {
  label: ReactNode; href?: string; onClick?: () => void; Icono?: ElementType; grande?: boolean; disabled?: boolean; type?: 'button' | 'submit'; className?: string;
  /** El degradado del logo: solo para lo más destacado (ver `BOTON_DESTACADO`). */
  destacado?: boolean;
}) {
  const clase = cn(destacado ? BOTON_DESTACADO : BOTON_VIVO, grande ? 'h-11 px-5 text-[14px]' : 'h-9 px-4 text-[13px]', disabled && 'pointer-events-none opacity-60', className);
  const contenido = <>{Icono ? <Icono size={grande ? 17 : 15} aria-hidden /> : null}{label}{!Icono && href ? <ArrowRight size={grande ? 16 : 14} aria-hidden /> : null}</>;
  return href ? (
    <Link href={href} className={clase}>{contenido}</Link>
  ) : (
    <button type={type} onClick={onClick} disabled={disabled} className={clase}>{contenido}</button>
  );
}
