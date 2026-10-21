'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Las piezas que comparten las pantallas del alta nueva en el panel (pasos 3, 4
// y 5): la línea de pasos, la cabecera del paso, la barra de abajo
// («Atrás» · «Siguiente») y el WhatsApp con una persona. Copiadas de la maqueta aprobada (03-maqueta-alta-nueva.html) con los
// tokens de la marca: nada de color escrito a mano.
// ─────────────────────────────────────────────────────────────────────────────

import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/brand-icons';
import { SOPORTE_WHATSAPP } from '@/components/layout/whatsapp-fab';
import { BOTON_VIVO, DEGRADADO_LOGO } from '@/components/dashboard/vivo';
import { BOTON_BORDE } from '@/components/dashboard/vivo-seccion';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { LINEA_DE_PASOS } from '@/lib/alta/bienvenida-nueva';
import { cn } from '@/lib/utils';

export const CLASE_CAMPO =
  'h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-[15px]';
export const CLASE_ETIQUETA = 'text-[14px] font-semibold text-foreground';
export const CLASE_AYUDA = 'mt-1 text-[13px] leading-[18px] text-muted-foreground';
export const CLASE_ERROR = 'mt-1 text-[13px] font-medium leading-[18px] text-destructive';

/**
 * La línea de los siete pasos, la misma arriba de cada pantalla: lo hecho en
 * sólido, el de ahora marcado y lo que queda en punteado. Los opcionales lo
 * dicen. En el móvil quedan los números (los nombres no caben en siete columnas).
 */
export function LineaDePasos({ actual }: { actual: number }) {
  const n = LINEA_DE_PASOS.length;
  const progreso = Math.max(0, Math.min(1, (actual - 1) / (n - 1)));
  return (
    <ol aria-label={`Los ${n} pasos para abrir tu estudio`} className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-testid="linea-de-pasos">
      {/* La pista punteada y, encima, lo recorrido con el degradado del logo. */}
      <span aria-hidden className="absolute left-[5px] top-[5px] border-t-[1.5px] border-dashed border-muted-foreground/40" style={{ right: `calc(100% / ${n} - 5px)` }} />
      <span
        aria-hidden
        className="absolute left-[5px] top-[4px] h-[3px] rounded-full transition-[width] duration-500"
        style={{ width: `calc((100% - 100% / ${n}) * ${progreso})`, backgroundImage: DEGRADADO_LOGO }}
      />
      {LINEA_DE_PASOS.map((p, i) => {
        const n = i + 1;
        const estado = n < actual ? 'hecho' : n === actual ? 'ahora' : 'pendiente';
        return (
          <li key={p.num} className="relative grid min-w-0 gap-px pt-5" aria-current={estado === 'ahora' ? 'step' : undefined} data-estado={estado}>
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-0 z-[1] grid place-items-center rounded-full',
                estado === 'hecho' && '-left-px -top-px size-3.5 bg-foreground text-background',
                estado === 'ahora' && 'size-[11px]',
                estado === 'pendiente' && 'size-[11px] bg-background ring-[1.5px] ring-inset ring-muted-foreground/40',
              )}
              style={estado === 'ahora'
                ? { backgroundColor: 'var(--t-magenta-500)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--t-magenta-500) 20%, transparent)' }
                : undefined}
            >
              {estado === 'hecho' && <Check size={9} strokeWidth={3.2} />}
            </span>
            <span className="font-mono text-[11px] leading-[14px] tracking-wider text-muted-foreground">{p.num}</span>
            <span className={cn(
              'hidden truncate text-[12px] leading-4 sm:block',
              estado === 'ahora' ? 'font-semibold text-foreground' : estado === 'hecho' ? 'text-foreground' : 'text-muted-foreground',
            )}>
              {p.nombre}
            </span>
            {p.opcional && <span className="hidden font-mono text-[11px] leading-[14px] text-muted-foreground sm:block">opcional</span>}
            <span className="sr-only">{p.nombre}{estado === 'hecho' ? ', hecho' : estado === 'ahora' ? ', ahora' : ', pendiente'}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** «Paso 3 de 5 · …», el titular y la frase; a la derecha, «Más tarde» si el paso es opcional. */
export function CabeceraPaso({ etiqueta, titulo, sub, masTarde, tituloRef }: {
  etiqueta: string;
  titulo: string;
  sub?: React.ReactNode;
  masTarde?: { onClick: () => void; disabled?: boolean };
  tituloRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="mt-7 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" data-testid="etiqueta-paso">{etiqueta}</p>
        <h1 ref={tituloRef} tabIndex={-1} className="mt-2 text-[26px] font-semibold leading-[31px] tracking-[-0.02em] text-foreground outline-none sm:text-[31px] sm:leading-9">
          {titulo}
        </h1>
        {sub && <p className="mt-2.5 max-w-[48ch] text-[16px] leading-[25px] text-muted-foreground">{sub}</p>}
      </div>
      {masTarde && (
        <button type="button" onClick={masTarde.onClick} disabled={masTarde.disabled} className={cn(BOTON_BORDE, 'mt-6 shrink-0 disabled:opacity-60')}>
          Más tarde
        </button>
      )}
    </div>
  );
}

/**
 * La barra de abajo: «Atrás» a la izquierda y, a la derecha, «Más tarde» (si el
 * paso es opcional) y el botón principal. En el móvil se queda pegada abajo.
 * El botón principal es un `submit`: Enter en un campo sigue (la pista «Enter
 * para seguir» solo se ve en escritorio).
 */
export function NavPaso({ onAtras, trabajando, textoSiguiente = 'Siguiente', masTarde }: {
  onAtras?: () => void;
  trabajando: boolean;
  textoSiguiente?: string;
  masTarde?: { onClick: () => void };
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-8 flex items-center gap-3 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-5 sm:backdrop-blur-none">
      {onAtras && (
        <button
          type="button"
          onClick={onAtras}
          disabled={trabajando}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft size={16} aria-hidden /> Atrás
        </button>
      )}
      <div className="ml-auto flex min-w-0 items-center gap-2.5">
        {!masTarde && (
          <span className="hidden items-center gap-1.5 text-[12.5px] text-muted-foreground lg:inline-flex">
            <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">Enter</kbd> para seguir
          </span>
        )}
        {masTarde && (
          <button type="button" onClick={masTarde.onClick} disabled={trabajando} className={cn(BOTON_BORDE, 'h-11 px-4 text-[14px] disabled:opacity-60')}>
            Más tarde
          </button>
        )}
        <button type="submit" disabled={trabajando} className={cn(BOTON_VIVO, 'h-11 min-w-0 px-5 text-[15px] disabled:opacity-70')}>
          {trabajando
            ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Guardando…</>
            : <>{textoSiguiente} <ArrowRight size={16} aria-hidden /></>}
        </button>
      </div>
    </div>
  );
}

/** «¿Dudas? Escríbenos · Te responde una persona»: el WhatsApp de soporte, el mismo de Primeros pasos (decisión D5). */
export function WhatsAppPersona({ nombreEstudio }: { nombreEstudio: string }) {
  const href = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${nombreEstudio || 'mi estudio'} y estoy poniendo en marcha Tentare:`);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-border bg-card px-3 py-1.5 text-[14px] font-medium leading-[17px] text-foreground shadow-xs transition-colors hover:bg-muted sm:pl-3 sm:pr-4"
    >
      <WhatsAppIcon size={18} />
      <span>
        <span className="sm:hidden">¿Dudas?</span>
        <span className="hidden sm:inline">¿Dudas? Escríbenos</span>
        <small className="hidden text-[12px] font-normal leading-[15px] text-muted-foreground sm:block">Te responde una persona</small>
      </span>
    </a>
  );
}

/** Un mensaje de error de guardado, para lectores de pantalla también. */
export function ErrorGuardado({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <p role="alert" data-testid="error-guardar" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13.5px] leading-5 text-destructive">
      {mensaje}
    </p>
  );
}
