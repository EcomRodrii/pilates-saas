'use client';

import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock3, RefreshCw, TrendingDown, UserX, Wrench } from 'lucide-react';
import { cn, horaEstudio } from '@/lib/utils';
import { hexARgb, luminanciaRelativa } from '@/lib/wcag-contrast';
import type { MarcaClase, TipoAviso } from '@/lib/calendario/marca-clase';
import type { EstadoSesion } from '@/lib/calendario-estado';
import { useArrastreClase } from './use-arrastre-clase';

// La clase en la rejilla: hora, nombre, cuántas van y UNA marca (lo que pide
// atención, o quién la da). La misma pieza en la Semana por franjas (tarjeta en
// su casilla) y en el Día (bloque del alto de su duración).

/** Cuánto tiñe el color del tipo de clase la tarjeta.
 *
 * `--calendario-tinte-clase` (globals.css) está medido para los pasteles; un
 * color OSCURO a esa proporción convierte la tarjeta en un gris medio donde el
 * texto apagado no se lee (visto en producción con un tipo #1C1C28). Con un
 * color oscuro basta un 8 %: la barra de la izquierda ya lleva el color. Una
 * clase que ya pasó o se canceló se tiñe menos: es historia, no trabajo. */
export function fondoDeClase(color: string, apagada = false): string {
  const rgb = hexARgb(color);
  const oscuro = !!rgb && luminanciaRelativa(rgb) < 0.2;
  const pct = apagada ? (oscuro ? '4%' : '18%') : (oscuro ? '8%' : 'var(--calendario-tinte-clase)');
  return `color-mix(in srgb, ${color} ${pct}, var(--card))`;
}

// Las tintas del texto sobre la tarjeta teñida, acercadas a `--foreground` lo
// justo para pasar AA con cualquier color de tipo (medidas en globals.css, una
// proporción por modo). El gris apagado tal cual se quedaba en 2,3:1 en oscuro.
const TINTA = {
  peligro: 'var(--calendario-tinta-peligro)',
  aviso: 'var(--calendario-tinta-aviso)',
  exito: 'var(--calendario-tinta-exito)',
  info: 'var(--calendario-tinta-info)',
} as const;
const SECUNDARIA = 'var(--calendario-tinta-secundaria)';
// Lo que solo se pinta en la tarjeta estrecha si hay sitio (el ↻, el icono del
// aviso). Mide la propia tarjeta (`@container/tarjeta`), no la pantalla: la
// misma tarjeta es estrecha en un iPad en vertical y con la ficha al lado.
// Clases enteras y literales: Tailwind solo genera las que lee tal cual.
const ICONO_SI_CABE = 'hidden @min-[80px]/tarjeta:block';
const SERIE_SI_CABE = 'hidden @min-[80px]/tarjeta:inline-flex';

const AVISO: Record<TipoAviso, { tinta?: keyof typeof TINTA; icono?: typeof UserX; punto?: boolean; negrita?: boolean }> = {
  'sin-cubrir': { tinta: 'peligro', icono: UserX, negrita: true },
  buscando: { tinta: 'peligro', icono: RefreshCw, negrita: true },
  incidencia: { tinta: 'aviso', icono: Wrench },
  conflicto: { tinta: 'peligro', icono: AlertTriangle, negrita: true },
  'pasar-lista': { tinta: 'aviso', icono: CheckCircle2, negrita: true },
  'en-curso': { tinta: 'exito', punto: true, negrita: true },
  'lista-pasada': { icono: CheckCircle2 },
  siguiente: { icono: Clock3 },
  cancelada: {},
};

export function esSinCubrir(marca: MarcaClase): boolean {
  return marca.aviso?.tipo === 'sin-cubrir' || marca.aviso?.tipo === 'buscando' || marca.aviso?.tipo === 'conflicto';
}

/** La segunda línea: el aviso, o quién la da con lo que más importa a la derecha. */
export function LineaMarca({ marca, instructora, compacta, conQuien, className }: {
  marca: MarcaClase;
  instructora: string;
  compacta?: boolean;
  /** En el Día cabe el aviso Y quién la da («Pasar lista · Marta Ruiz»). */
  conQuien?: boolean;
  className?: string;
}) {
  const base = cn('flex min-w-0 items-center gap-1 text-[12px] leading-tight', className);
  const a = marca.aviso;
  if (a) {
    const p = AVISO[a.tipo];
    const color = p.tinta ? TINTA[p.tinta] : undefined;
    const quien = conQuien && a.tipo !== 'en-curso' && a.tipo !== 'siguiente' && a.tipo !== 'cancelada';
    return (
      <p className={base} title={a.detalle ?? a.texto}>
        {p.punto && <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--success)' }} aria-hidden />}
        {/* En la tarjeta estrecha el icono va solo si cabe (container query de la
            tarjeta): con la ficha al lado, a 85 px, cortaba «Pasar lista» en «Pasar li…». */}
        {p.icono && <p.icono size={12} className={cn('shrink-0', compacta && ICONO_SI_CABE)} style={{ color: color ?? SECUNDARIA }} aria-hidden />}
        <span className={cn('truncate', p.negrita && 'font-semibold')} style={{ color: color ?? SECUNDARIA }}>
          {compacta ? a.corto : a.texto}
        </span>
        {quien && <span className="truncate" style={{ color: SECUNDARIA }}>· {instructora}</span>}
      </p>
    );
  }
  const e = marca.extra;
  return (
    <p className={base}>
      <span className="min-w-0 truncate" style={{ color: SECUNDARIA }}>{instructora}</span>
      {e && !compacta && (
        <span
          className={cn('ml-auto inline-flex shrink-0 items-center gap-0.5', e.tipo !== 'fijas' && 'font-semibold')}
          style={{ color: e.tipo === 'floja' ? TINTA.aviso : e.tipo === 'espera' ? TINTA.info : e.tipo === 'llena' ? 'var(--foreground)' : SECUNDARIA }}
        >
          {e.tipo === 'floja' && <TrendingDown size={12} aria-hidden />}
          {e.texto}
        </span>
      )}
    </p>
  );
}

/** Solo el aviso (o lo que va a la derecha), sin quién la da: la lista del móvil ya lo dice en su línea. */
export function AvisoDeMarca({ marca, className }: { marca: MarcaClase; className?: string }) {
  const a = marca.aviso;
  const e = marca.extra;
  if (!a && (!e || e.tipo === 'fijas')) return null;
  if (!a && e) {
    return (
      <p className={cn('flex items-center gap-1 text-[14px] font-semibold', className)}
        style={{ color: e.tipo === 'floja' ? TINTA.aviso : e.tipo === 'espera' ? TINTA.info : 'var(--foreground)' }}>
        {e.tipo === 'floja' && <TrendingDown size={14} aria-hidden />}
        {e.tipo === 'floja' ? 'Va floja' : e.tipo === 'llena' ? 'Llena' : e.texto}
      </p>
    );
  }
  const p = AVISO[a!.tipo];
  const color = p.tinta ? TINTA[p.tinta] : 'var(--muted-foreground)';
  return (
    <p className={cn('flex min-w-0 items-center gap-1.5 text-[14px]', p.negrita && 'font-semibold', className)} style={{ color }} title={a!.detalle ?? a!.texto}>
      {p.punto && <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--success)' }} aria-hidden />}
      {p.icono && <p.icono size={14} className="shrink-0" aria-hidden />}
      <span className="truncate">{a!.texto}</span>
    </p>
  );
}

/** ↻: es de una serie. Va detrás del nombre y nunca le quita sitio a la cifra
 *  ni al aviso: en la tarjeta estrecha, solo si cabe. */
function MarcaSerie({ soloSiCabe }: { soloSiCabe?: boolean }) {
  return (
    <span
      role="img"
      aria-label="Se repite cada semana"
      title="Se repite cada semana"
      className={cn('shrink-0 self-center', soloSiCabe ? SERIE_SI_CABE : 'inline-flex')}
      style={{ color: SECUNDARIA }}
    >
      <RefreshCw size={11} strokeWidth={2.5} aria-hidden />
    </span>
  );
}

export interface DatosTarjeta {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean;
  tipoNombre: string;
  tipoColor: string;
  instructora: string;
  confirmadas: number;
  aforo: number;
  enEspera: number;
  estado: EstadoSesion;
  marca: MarcaClase;
  /** Es de una serie: lleva ↻, para distinguirla de una suelta sin abrirla. */
  serie: boolean;
}

/** Texto para lectores de pantalla y para el `title`: la tarjeta entera en una frase. */
export function descripcionTarjeta(d: DatosTarjeta): string {
  const partes = [`${horaEstudio(d.inicio)} – ${horaEstudio(d.fin)}`, d.tipoNombre, d.instructora];
  if (!d.cancelada) partes.push(`${d.confirmadas} de ${d.aforo}`);
  if (d.marca.aviso) partes.push(d.marca.aviso.detalle ?? d.marca.aviso.texto);
  else if (d.marca.extra) partes.push(d.marca.extra.texto);
  if (d.serie) partes.push('se repite cada semana');
  return partes.join(' · ');
}

export function TarjetaClase({
  d, compacta, conQuien, seleccionada, marcada, enSeleccion, atenuada, arrastrable, onSeleccionar, onMover, onMoviendo, colocada, className, children, lineas = 3,
}: {
  d: DatosTarjeta;
  /** Semana estrecha (iPad en vertical, o con la ficha abierta al lado). */
  compacta?: boolean;
  /** El aviso y quién la da en la misma línea («Pasar lista · Marta Ruiz»): en el Día cabe. */
  conQuien?: boolean;
  seleccionada?: boolean;
  /** Marcada en «Seleccionar varias». */
  marcada?: boolean;
  /** Estamos en «Seleccionar varias»: cada tarjeta enseña su casilla. */
  enSeleccion?: boolean;
  atenuada?: boolean;
  arrastrable?: boolean;
  onSeleccionar: () => void;
  onMover?: (clientX: number, arribaY: number) => void;
  onMoviendo?: (punto: { x: number; y: number } | null) => void;
  /** Posición y tamaño en la columna, cuando va colocada por su hora (vista de Día). */
  colocada?: Pick<CSSProperties, 'top' | 'height' | 'left' | 'width'>;
  className?: string;
  children?: ReactNode;
  /** Cuántas líneas caben (el Día las quita en clases muy cortas, nunca las corta). */
  lineas?: 1 | 2 | 3;
}) {
  const { arrastrando, manejadores, estilo: estiloArrastre } = useArrastreClase({
    arrastrable: !!arrastrable, onSeleccionar, onMover, onMoviendo,
  });
  const pasada = d.estado === 'FINALIZADA' || d.estado === 'SIN_PASAR_LISTA';
  // Estrecha, la primera línea es solo hora y plazas (el nombre baja a la
  // segunda): con el nombre y el ↻ al lado, la cifra se cortaba en «8/».
  const nombreArriba = !compacta || lineas === 1;
  const marca = d.marca;
  const peligro = esSinCubrir(marca);
  const enCurso = marca.aviso?.tipo === 'en-curso';
  const floja = marca.extra?.tipo === 'floja';
  const hora = horaEstudio(d.inicio);

  return (
    <div className={colocada ? 'absolute' : 'relative'} style={colocada}>
      <div
        role="button"
        tabIndex={0}
        data-sesion-id={d.id}
        data-estado={d.estado}
        aria-label={descripcionTarjeta(d)}
        aria-pressed={enSeleccion ? !!marcada : undefined}
        aria-current={seleccionada ? 'true' : undefined}
        title={descripcionTarjeta(d)}
        {...manejadores}
        style={{
          background: fondoDeClase(d.tipoColor, pasada || d.cancelada),
          // Una clase pasada o cancelada se distingue por el tinte (18 %), no
          // por transparencia: con opacidad, su texto bajaba de AA.
          opacity: atenuada ? 0.3 : 1,
          ...estiloArrastre,
        }}
        className={cn(
          '@container/tarjeta relative flex flex-col justify-start overflow-hidden rounded-lg border py-1.5 text-left outline-none',
          compacta ? 'pl-2 pr-1.5' : 'pl-2.5 pr-2',
          colocada && 'h-full',
          'transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
          peligro ? 'border-destructive/60' : 'border-transparent',
          enCurso && 'ring-2 ring-[var(--success)] ring-offset-1 ring-offset-card',
          seleccionada && !enCurso && 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-card',
          marcada && 'ring-2 ring-brand ring-offset-1 ring-offset-card',
          arrastrando && 'opacity-90',
          className,
        )}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: d.tipoColor, opacity: d.cancelada ? 0.45 : 1 }} aria-hidden />
        <div className="flex min-w-0 items-baseline gap-1.5 text-[12.5px] leading-tight">
          <span className="shrink-0 font-semibold tabular-nums text-foreground">{hora}</span>
          {nombreArriba && (
            <span className={cn('min-w-0 truncate font-semibold text-foreground', d.cancelada && 'line-through')}>{d.tipoNombre}</span>
          )}
          {d.serie && nombreArriba && <MarcaSerie soloSiCabe={compacta} />}
          {!d.cancelada && (
            <span
              className="ml-auto shrink-0 font-semibold tabular-nums"
              style={{ color: floja ? TINTA.aviso : 'var(--foreground)' }}
            >
              {d.confirmadas}/{d.aforo}
              {!compacta && d.enEspera > 0 && marca.aviso && (
                <span className="ml-1 rounded px-1 text-[11px]" style={{ background: 'color-mix(in srgb, var(--info) 14%, var(--card))', color: TINTA.info }}>
                  +{d.enEspera}
                </span>
              )}
            </span>
          )}
        </div>
        {compacta && lineas >= 2 && (
          <p className="flex min-w-0 items-baseline gap-1 text-[12.5px] font-semibold leading-tight text-foreground">
            <span className={cn('min-w-0 truncate', d.cancelada && 'line-through')}>{d.tipoNombre}</span>
            {d.serie && <MarcaSerie soloSiCabe />}
          </p>
        )}
        {lineas >= (compacta ? 3 : 2) && (
          <LineaMarca marca={marca} instructora={compacta ? d.instructora.split(' ')[0] : d.instructora} compacta={compacta} conQuien={conQuien} className="mt-0.5" />
        )}
        {children}
      </div>
      {enSeleccion && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -left-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full border-2 shadow-xs',
            marcada ? 'border-brand bg-brand text-brand-foreground' : 'border-foreground/25 bg-card',
          )}
        >
          {marcada && <Check size={11} strokeWidth={3} />}
        </span>
      )}
    </div>
  );
}
