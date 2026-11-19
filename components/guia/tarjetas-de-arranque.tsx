'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio» como TARJETAS, al estilo del arranque del admin de
// Shopify (`ONBOARDING_NUEVO`, 19-nov-2026, maqueta aprobada por el fundador:
// docs/diseno/shopify-onboarding-flujo.md). Mismas tareas, mismos datos y mismo
// «hecho» que la lista de siempre (`primerosPasosAltaNueva`): aquí solo cambia
// cómo se PINTA. Las acciones (omitir, compartir, enlaces) son las de siempre.
//
// Las imágenes de las tarjetas con hueco las pone el fundador en
// `public/ilustraciones/arranque/<id>.webp` (ver el README de esa carpeta). Sin
// fichero, el hueco se queda como una caja gris con bisel: nada se rompe.
//
// Movimiento (solo transform y opacity; sin «reducir movimiento», quieto):
//   · las tarjetas entran escalonadas, 0,5 s `cubic-bezier(.25,.1,.25,1)`;
//   · al pasar el cursor la tarjeta se eleva y la imagen se acerca, 0,8 s
//     `cubic-bezier(.2,.8,0,1)` (las curvas medidas en Shopify);
//   · la marca de «hecho» se dibuja al aparecer; la tarea de ahora respira un
//     anillo una sola vez, para que el ojo sepa por dónde seguir.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OpcionalAlta, PrimerosPasosAltaNueva, TareaAltaConEstado } from '@/lib/guia/primeros-pasos';

const CARPETA_IMAGENES = '/ilustraciones/arranque';

/** Lo que dice cada opcional en su tarjeta (el registro solo trae título y nota). */
const PARA_OPCIONAL: Record<string, string> = {
  marca: 'Tu logo y tu color en la app de tus clientes.',
  stripe: 'Cobra online con tarjeta. Si cobras en el estudio, no hace falta.',
  fiscales: 'Los datos que salen en tus facturas.',
  equipo: 'Invita a tus instructoras y a recepción.',
  sedes: 'Abre las demás sedes de tu estudio.',
};

const ESTILOS = `
@keyframes ta-entra { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes ta-marca { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
@keyframes ta-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
@keyframes ta-anillo { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--t-magenta-500) 35%, transparent); } 100% { box-shadow: 0 0 0 10px transparent; } }
.ta-tarjeta { animation: ta-entra .5s cubic-bezier(.25,.1,.25,1) both; animation-delay: calc(var(--i, 0) * 70ms);
  transition: transform .35s cubic-bezier(.32,.72,0,1), box-shadow .35s cubic-bezier(.32,.72,0,1), border-color .15s; }
.ta-tarjeta:hover { transform: translateY(-3px); box-shadow: 0 1px 2px #0000000a, 0 10px 28px -6px #00000014; }
.ta-ahora { animation: ta-entra .5s cubic-bezier(.25,.1,.25,1) both, ta-anillo 1.4s cubic-bezier(.19,1,.22,1) .6s 1 both;
  animation-delay: calc(var(--i, 0) * 70ms), calc(var(--i, 0) * 70ms + 600ms); }
.ta-img img { transition: transform .8s cubic-bezier(.2,.8,0,1), opacity .5s cubic-bezier(.25,.1,.25,1); }
.ta-tarjeta:hover .ta-img img { transform: scale(1.045); }
.ta-hecho { animation: ta-pop .45s cubic-bezier(.19,1,.22,1) both; }
.ta-hecho path { stroke-dasharray: 24; animation: ta-marca .4s cubic-bezier(.25,.1,.25,1) .12s both; }
.ta-barra { transition: width .6s cubic-bezier(.32,.72,0,1); }
@media (prefers-reduced-motion: reduce) {
  .ta-tarjeta, .ta-ahora, .ta-hecho, .ta-hecho path { animation: none; }
  .ta-tarjeta, .ta-img img, .ta-barra { transition: none; }
  .ta-tarjeta:hover { transform: none; }
}
`;

/** El hueco de la imagen: caja gris con bisel; si el fichero existe, se enseña encima. */
function HuecoImagen({ id }: { id: string }) {
  const [cargada, setCargada] = useState(false);
  const [falla, setFalla] = useState(false);
  return (
    <div
      className="ta-img relative mb-3 h-[137px] overflow-hidden rounded-xl bg-[#f5f5f5]"
      style={{ boxShadow: 'inset 0 0 0 1px #14181c17, inset 0 1px 0 #ffffffe0, inset 1px 0 0 #ffffff85, inset 0 -1px 0 #14181c14, inset -1px 0 0 #14181c0d' }}
      aria-hidden
    >
      {!falla && (
        // eslint-disable-next-line @next/next/no-img-element -- ilustración decorativa opcional: sin fichero, el hueco queda como está
        <img
          src={`${CARPETA_IMAGENES}/${id}.webp`}
          alt=""
          loading="lazy"
          onLoad={() => setCargada(true)}
          onError={() => setFalla(true)}
          className={cn('absolute inset-0 size-full object-cover', cargada ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </div>
  );
}

function Hecho() {
  return (
    <span className="ta-hecho flex size-6 shrink-0 items-center justify-center rounded-full text-[color:var(--card)]" style={{ backgroundColor: 'var(--success)' }} aria-hidden>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </span>
  );
}

const BOTON = 'zona-tactil inline-flex h-[30px] items-center gap-1 rounded-full bg-card px-3 text-[12px] font-medium text-foreground shadow-[0_0_0_1px_#00000012,0_2px_6px_#0000000a] transition-[background-color,box-shadow] duration-150 hover:bg-muted';

function TarjetaTarea({ tarea, i, onCompartir, onOmitir }: {
  tarea: TareaAltaConEstado; i: number; onCompartir: () => void; onOmitir: (id: string) => void;
}) {
  const hecha = tarea.estado === 'hecha';
  const ahora = tarea.estado === 'ahora';
  const a = tarea.accion;
  return (
    <li
      data-tarea={tarea.id}
      data-estado={tarea.estado}
      style={{ '--i': i } as React.CSSProperties}
      className={cn(
        'flex flex-col rounded-[20px] border border-border bg-card p-4 shadow-[0_1px_2px_#0000000a,0_4px_12px_#00000006]',
        ahora ? 'ta-ahora' : 'ta-tarjeta',
        hecha && 'bg-muted/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn('text-[15px] font-medium leading-5 tracking-[-0.01em] text-foreground', hecha && 'text-muted-foreground')}>
          {tarea.titulo}
          <span className="sr-only">{hecha ? ' (hecho)' : ahora ? ' (lo siguiente)' : tarea.omitida ? ' (omitido)' : ' (pendiente)'}</span>
        </h3>
        {hecha && <Hecho />}
      </div>
      <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground text-pretty">{tarea.para}</p>
      {!hecha && a && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {'abre' in a
            ? <button type="button" onClick={onCompartir} className={BOTON}>{a.label}</button>
            : <Link href={a.href} className={BOTON}>{a.label}<ArrowRight size={12} aria-hidden /></Link>}
          {ahora && tarea.otro && <Link href={tarea.otro.href} className="text-[12px] font-medium text-[color:var(--t-text-link)] hover:underline">{tarea.otro.label}</Link>}
          {ahora && <button type="button" onClick={() => onOmitir(tarea.id)} className="zona-tactil rounded-full px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Omitir</button>}
        </div>
      )}
      {ahora && tarea.minutos ? <span className="mt-2 font-t-mono text-[11.5px] text-muted-foreground">≈ {tarea.minutos} min</span> : null}
    </li>
  );
}

function TarjetaOpcional({ o, i }: { o: OpcionalAlta; i: number }) {
  return (
    <li
      data-opcional={o.id}
      style={{ '--i': i } as React.CSSProperties}
      className="ta-tarjeta flex flex-col rounded-[20px] border border-border bg-card p-3 shadow-[0_1px_2px_#0000000a,0_4px_12px_#00000006]"
    >
      <HuecoImagen id={o.id} />
      <div className="flex items-start justify-between gap-2 px-1">
        <h3 className="text-[15px] font-medium leading-5 tracking-[-0.01em] text-foreground">{o.titulo}</h3>
        {o.hecha && <Hecho />}
      </div>
      <p className="mt-1 px-1 text-[13px] leading-[18px] text-muted-foreground text-pretty">{PARA_OPCIONAL[o.id] ?? o.nota}</p>
      <div className="mt-auto flex items-center gap-2 px-1 pt-3">
        <Link href={o.href} className={BOTON}>{o.hecha ? 'Revisar' : 'Empezar'}</Link>
        <span className="font-t-mono text-[11.5px] text-muted-foreground">{o.nota}</span>
      </div>
    </li>
  );
}

export function TarjetasDeArranque({ pasos, onCompartir, onOmitir }: {
  pasos: PrimerosPasosAltaNueva; onCompartir: () => void; onOmitir: (id: string) => void;
}) {
  // «Crea tu cuenta» ya está hecha desde el primer segundo: cuenta en el «n de 5», pero no es una tarjeta.
  const tareas = pasos.tareas.filter((t) => t.id !== 'cuenta');
  const pct = Math.round((pasos.hechas / pasos.total) * 100);
  return (
    <div data-testid="tarjetas-de-arranque">
      <style>{ESTILOS}</style>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px] text-muted-foreground">
        <b className="text-[15px] font-medium text-foreground" data-testid="paso-de-cinco">{pasos.paso}</b>
        <span>{pasos.queda}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Primeros pasos" aria-valuemin={0} aria-valuemax={pasos.total} aria-valuenow={pasos.hechas}>
        <div className="ta-barra h-full rounded-full bg-foreground" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <ol className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4" data-testid="tareas-alta">
        {tareas.map((t, i) => <TarjetaTarea key={t.id} tarea={t} i={i} onCompartir={onCompartir} onOmitir={onOmitir} />)}
      </ol>
      <h3 className="mt-7 text-[15px] font-medium tracking-[-0.01em] text-foreground">Cuando quieras</h3>
      <ul className="mt-3 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4" data-testid="opcionales-alta">
        {pasos.opcionales.map((o, i) => <TarjetaOpcional key={o.id} o={o} i={i + tareas.length} />)}
      </ul>
    </div>
  );
}
