'use client';

// Las tres pantallas de la visita que ocupan el centro: la bienvenida, el cierre de
// cada capítulo y el final. Un modal a propósito: son tres momentos en toda la
// visita, y en ellos no hay nada que hacer en la pantalla de detrás.
//
// `data-visita` las marca como NUESTRAS: el detector de diálogos abiertos las
// ignora (si no, la tarjeta se pondría en modo banner por culpa de sí misma).

import { useEffect, useRef } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { MINUTOS_TOTALES, type CapituloVisita, type PasoVisita } from '@/lib/tour/capitulos';

function Marco({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div data-visita role="dialog" aria-modal="true" aria-label={etiqueta}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 animate-in fade-in-0 duration-200">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-xl animate-in zoom-in-95 duration-200 sm:p-8">
        {children}
      </div>
    </div>
  );
}

function BotonPrincipal({ children, onClick, foco = true }: { children: React.ReactNode; onClick: () => void; foco?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (foco) ref.current?.focus(); }, [foco]);
  return (
    <button ref={ref} type="button" onClick={onClick}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-brand-foreground transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {children}
    </button>
  );
}

function BotonSecundario({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-card px-5 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {children}
    </button>
  );
}

export function PantallaInicioVisita({ capitulos, obligatoria, onEmpezar, onSalir }: {
  /** Los capítulos que se le enseñan a esta persona (según su rol). */
  capitulos: readonly CapituloVisita[];
  obligatoria: boolean;
  onEmpezar: () => void;
  onSalir: () => void;
}) {
  const minutos = capitulos.reduce((n, c) => n + c.minutos, 0) || MINUTOS_TOTALES;
  return (
    <Marco etiqueta="Visita guiada de Tentare">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Visita guiada</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground text-balance">Vamos a recorrer Tentare juntas</h2>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground text-pretty">
        {capitulos.length} capítulos, unos {minutos} minutos en total. Cada uno dura entre {Math.min(...capitulos.map(c => c.minutos))} y {Math.max(...capitulos.map(c => c.minutos))} minutos
        y puedes parar al acabar cualquiera y seguir otro día: te esperamos donde lo dejaste. Lo que ya tienes hecho te lo marcamos con un ✓.
      </p>
      <ol className="mt-4 space-y-1.5 text-[13.5px] text-foreground">
        {capitulos.map((c, i) => (
          <li key={c.id} className="flex items-baseline gap-2.5">
            <span className="w-5 shrink-0 text-right text-[12px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1">{c.titulo}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{c.minutos} min</span>
          </li>
        ))}
      </ol>
      <div className="mt-6 space-y-2">
        <BotonPrincipal onClick={onEmpezar}>Empezar <ArrowRight size={16} aria-hidden /></BotonPrincipal>
        {!obligatoria && <BotonSecundario onClick={onSalir}>Ahora no</BotonSecundario>}
      </div>
    </Marco>
  );
}

export function PantallaAperturaCapitulo({ capitulo, numero, total, pasos, onEmpezar }: {
  capitulo: CapituloVisita;
  numero: number;
  total: number;
  /** Los pasos que de verdad se le van a enseñar (según su rol y su menú). */
  pasos: readonly PasoVisita[];
  onEmpezar: () => void;
}) {
  return (
    <Marco etiqueta={`Capítulo ${numero}: ${capitulo.titulo}`}>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Capítulo {numero} de {total} · ≈ {capitulo.minutos} min</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground text-balance">{capitulo.titulo}</h2>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground text-pretty">{capitulo.paraQue}</p>
      <p className="mt-5 text-[13px] font-semibold text-foreground">Lo que vas a ver:</p>
      <ol className="mt-2 space-y-1.5">
        {pasos.map((p, i) => (
          <li key={p.id} className="flex items-start gap-2.5 text-[14px] leading-snug text-foreground">
            <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground" aria-hidden>{i + 1}</span>
            <span className="min-w-0 flex-1">{p.titulo}</span>
            {p.tipo === 'hacer' && <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand-medio">lo haces tú</span>}
          </li>
        ))}
      </ol>
      <div className="mt-6"><BotonPrincipal onClick={onEmpezar}>Empezar el capítulo <ArrowRight size={16} aria-hidden /></BotonPrincipal></div>
    </Marco>
  );
}

export function PantallaCapituloVisita({ capitulo, numero, total, siguiente, onSiguiente, onOtroDia }: {
  capitulo: CapituloVisita;
  numero: number;
  total: number;
  /** El capítulo que viene, o null si este era el último. */
  siguiente: CapituloVisita | null;
  onSiguiente: () => void;
  onOtroDia: () => void;
}) {
  return (
    <Marco etiqueta={`Capítulo ${numero} completado`}>
      <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success" aria-hidden><Check size={24} /></span>
      <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Capítulo {numero} de {total} completado</p>
      <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground text-balance">{capitulo.titulo}</h2>
      <p className="mt-4 text-[13px] font-semibold text-foreground">Ahora sabes:</p>
      <ul className="mt-2 space-y-1.5">
        {capitulo.aprendido.map(a => (
          <li key={a} className="flex items-start gap-2 text-[14px] leading-snug text-muted-foreground">
            <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden /> <span className="min-w-0">{a}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 space-y-2">
        {siguiente ? (
          <>
            <BotonPrincipal onClick={onSiguiente}>
              <span className="min-w-0 truncate">Siguiente: {siguiente.titulo}</span>
              <span className="shrink-0 text-[13px] font-medium opacity-80">≈ {siguiente.minutos} min</span>
            </BotonPrincipal>
            <BotonSecundario onClick={onOtroDia}>Seguir otro día</BotonSecundario>
          </>
        ) : (
          <BotonPrincipal onClick={onSiguiente}>Terminar <ArrowRight size={16} aria-hidden /></BotonPrincipal>
        )}
      </div>
      {siguiente && (
        <p className="mt-3 text-center text-[12px] text-muted-foreground">Si cierras ahora, la próxima vez que entres empezamos en el capítulo {numero + 1}.</p>
      )}
    </Marco>
  );
}

export function PantallaFinVisita({ aplazados, onTerminar, onIr }: {
  aplazados: readonly PasoVisita[];
  onTerminar: () => void;
  /** Termina la visita y lleva a ese paso aplazado. */
  onIr: (paso: PasoVisita) => void;
}) {
  return (
    <Marco etiqueta="Visita terminada">
      <div className="flex justify-center">
        <span className="grid size-16 place-items-center rounded-full bg-success/15 text-success" aria-hidden><Check size={32} /></span>
      </div>
      <h2 className="mt-4 text-center text-2xl font-extrabold tracking-tight text-foreground text-balance">Has recorrido Tentare entera</h2>
      <p className="mt-3 text-center text-[14.5px] leading-relaxed text-muted-foreground text-pretty">
        Ya sabes dónde está todo. Y si quieres repasar algo, está explicado por escrito en «Primeros pasos».
      </p>
      {aplazados.length > 0 && (
        <div className="mt-4 rounded-2xl bg-muted/60 p-4">
          <p className="text-[13px] font-semibold text-foreground">Lo que has dejado para después</p>
          <ul className="mt-2 space-y-1.5">
            {aplazados.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => onIr(p)} className="text-left text-[13.5px] font-medium text-brand-medio underline underline-offset-2 hover:text-foreground">
                  {p.titulo}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6"><BotonPrincipal onClick={onTerminar}>Ir a mi Resumen <ArrowRight size={16} aria-hidden /></BotonPrincipal></div>
    </Marco>
  );
}
