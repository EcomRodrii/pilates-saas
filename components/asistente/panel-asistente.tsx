'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, RotateCcw, SquarePen, X } from 'lucide-react';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { TentiAsistente } from '@/components/tenti/tenti-asistente';
import { sonarTenti } from '@/lib/tenti/preferencia-sonido';
import { MS_HECHO } from '@/lib/tenti/asistente';
import { enVuelo, sugerenciasPara, type TurnoUI } from '@/lib/asistente/estado-ui';
import { cn } from '@/lib/utils';
import {
  cargarSaldo, cortarAlCerrar, nuevaConversacion, preguntar, prepararEstudio, reabrirUltima, useAlmacenAsistente, volverAReposo,
  type SaldoAsistente,
} from './use-asistente';
import { ReferenciasCtx } from './referencias-ui';
import { TextoConReferencias } from './texto-con-referencias';
import { Bloque } from './bloques';

// El panel de «Pregúntale a Tentare» (spec §5.2). Llega con next/dynamic la
// primera vez que se abre (lib/asistente-context.tsx). No es un chat de
// burbujas: cada turno es la pregunta como línea de contexto, la respuesta como
// texto y, debajo, las tarjetas con los datos.
//
// Cerrado, el DashboardDrawer desmonta su contenido: ni Tenti, ni el
// temporizador del «hecho», ni ningún lector quedan vivos. Cerrar corta la
// pregunta en vuelo (cortarAlCerrar) y el servidor deja de pagar a Anthropic.
// La conversación vive en el módulo (use-asistente.ts) y está al volver.

const ESCRITORIO = '(min-width: 1024px)';
function suscribirAncho(avisar: () => void) {
  const mq = window.matchMedia(ESCRITORIO);
  mq.addEventListener('change', avisar);
  return () => mq.removeEventListener('change', avisar);
}
const useEscritorio = () => useSyncExternalStore(suscribirAncho, () => window.matchMedia(ESCRITORIO).matches, () => true);

export function PanelAsistente({ abierto, onCerrar, studioId, veDinero, preguntaInicial }: {
  abierto: boolean;
  onCerrar: () => void;
  studioId: string;
  veDinero: boolean;
  preguntaInicial: { texto: string; n: number } | null;
}) {
  const escritorio = useEscritorio();
  // Cerrar corta lo que esté en vuelo (y el servidor deja de pagar a Anthropic).
  useEffect(() => { if (!abierto) cortarAlCerrar(); }, [abierto]);

  return (
    <DashboardDrawer
      open={abierto}
      onClose={onCerrar}
      label="Tentare"
      desdeAbajo={!escritorio}
      backdropClassName={escritorio ? 'fixed inset-0 z-50 flex justify-end bg-foreground/20' : 'fixed inset-0 z-50 flex items-end bg-foreground/25'}
      sheetClassName={escritorio
        ? 'relative flex h-full w-[560px] max-w-full flex-col bg-card shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)]'
        : 'relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.3)]'}
    >
      <Cuerpo onCerrar={onCerrar} studioId={studioId} veDinero={veDinero} preguntaInicial={preguntaInicial} movil={!escritorio} />
    </DashboardDrawer>
  );
}

function textoSaldo(disponibles: number | null, saldo: SaldoAsistente | null): string {
  if (disponibles === null) return 'Con los datos de tu estudio, al momento';
  if (disponibles <= 0) return saldo?.enPrueba ? 'No te quedan consultas de prueba' : 'No te quedan consultas este mes';
  const n = `${disponibles} ${disponibles === 1 ? 'consulta' : 'consultas'}`;
  return saldo?.enPrueba ? `Te quedan ${n} de prueba` : `Te ${disponibles === 1 ? 'queda' : 'quedan'} ${n} este mes`;
}

const AVISOS: Record<string, string> = {
  CIFRA_SIN_RESPALDO: 'He quitado una cifra que no salía de tus datos.',
  LIMITE_HERRAMIENTAS: 'He mirado lo máximo que miro por pregunta: si te falta algo, pregúntamelo aparte.',
  DEMASIADO_AMPLIA: 'La pregunta era muy amplia: te respondo con lo que he mirado. Si concretas, afino.',
  RECHAZADA: 'Eso no lo puedo responder.',
};

function Cuerpo({ onCerrar, studioId, veDinero, preguntaInicial, movil }: {
  onCerrar: () => void;
  studioId: string;
  veDinero: boolean;
  preguntaInicial: { texto: string; n: number } | null;
  movil: boolean;
}) {
  const { estado, saldo } = useAlmacenAsistente();
  const ocupado = enVuelo(estado);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  // Al abrir: el saldo (una petición) y, la primera vez, la última conversación.
  useEffect(() => {
    prepararEstudio(studioId);
    void cargarSaldo();
    void reabrirUltima(studioId);
    campo.current?.focus();
  }, [studioId]);

  // La pregunta que trae una puerta (⌘K), una sola vez por apertura.
  const usada = useRef(0);
  useEffect(() => {
    if (!preguntaInicial || usada.current === preguntaInicial.n) return;
    usada.current = preguntaInicial.n;
    void preguntar(studioId, preguntaInicial.texto);
  }, [preguntaInicial, studioId]);

  // «Hecho» breve: 1,5 s y vuelta a reposo; y un solo «pop» al terminar con datos
  // una pregunta que ha hecho ella (si «Sonidos de Tenti» está encendido).
  useEffect(() => {
    if (estado.momento !== 'terminado') return;
    sonarTenti('pop');
    const t = setTimeout(volverAReposo, MS_HECHO);
    return () => clearTimeout(t);
  }, [estado.momento]);

  // Cada pregunta nueva sube a lo alto de la lista: se lee de arriba abajo.
  const nTurnos = estado.turnos.length;
  useEffect(() => {
    if (!nTurnos) return;
    lista.current?.querySelector<HTMLElement>('[data-turno]:last-of-type')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [nTurnos]);

  const enviar = (q: string) => {
    if (!q.trim() || ocupado) return;
    setTexto('');
    void preguntar(studioId, q);
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); enviar(texto); };

  // Un enlace de una tarjeta lleva a otra pantalla: el panel se aparta.
  const alPulsar = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[href^="/"]');
    if (a && !e.metaKey && !e.ctrlKey) onCerrar();
  };

  return (
    <ReferenciasCtx.Provider value={estado.referencias}>
      {movil && <span aria-hidden="true" className="mx-auto mt-2 mb-0.5 block h-1 w-9 shrink-0 rounded-full bg-border" />}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 lg:px-5">
        <TentiAsistente momento={estado.momento} className="-ml-1" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-[17px] font-semibold leading-tight text-foreground">Tentare</h2>
          <p className="truncate text-[12.5px] text-muted-foreground" data-testid="asistente-saldo">{textoSaldo(estado.disponibles, saldo)}</p>
        </div>
        {estado.turnos.length > 0 && (
          <button
            type="button" onClick={() => { nuevaConversacion(studioId); campo.current?.focus(); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SquarePen size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Nueva</span>
            <span className="sr-only sm:hidden">Nueva conversación</span>
          </button>
        )}
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div ref={lista} onClick={alPulsar} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-4 py-5 lg:px-6">
        {estado.turnos.length === 0
          ? <Vacio sugerencias={sugerenciasPara(veDinero)} onElegir={enviar} />
          : estado.turnos.map((t, i) => <Turno key={t.id} t={t} primero={i === 0} onReintentar={() => enviar(t.pregunta)} onNueva={() => nuevaConversacion(studioId)} />)}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-border bg-card px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] lg:px-5">
        <div className="flex h-12 items-center gap-2 rounded-full bg-muted pr-1.5 pl-4 focus-within:ring-2 focus-within:ring-ring/40">
          <label htmlFor="asistente-pregunta" className="sr-only">Pregunta sobre tu estudio</label>
          <input
            id="asistente-pregunta"
            ref={campo}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            maxLength={500}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="Pregunta sobre tu estudio…"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground focus:outline-none lg:text-[14.5px]"
          />
          <button
            type="submit" aria-label="Preguntar" aria-busy={ocupado || undefined} disabled={!texto.trim() || ocupado}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
          >
            <ArrowUp size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
    </ReferenciasCtx.Provider>
  );
}

function Vacio({ sugerencias, onElegir }: { sugerencias: string[]; onElegir: (q: string) => void }) {
  return (
    <div className="pt-1">
      <p className="font-heading text-[22px] font-semibold leading-tight tracking-tight text-foreground text-balance">¿Qué quieres saber de tu estudio?</p>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground text-pretty">
        Te respondo con tus datos de ahora mismo. Todavía no hago cambios: te digo dónde se hacen.
      </p>
      <ul className="mt-5 overflow-hidden rounded-3xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08]" aria-label="Preguntas de ejemplo">
        {sugerencias.map((s, i) => (
          <li key={s} className={cn(i > 0 && 'border-t border-border')}>
            <button type="button" onClick={() => onElegir(s)} className="group flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] text-foreground transition-colors hover:bg-muted/60">
              {s}
              <ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Turno({ t, primero, onReintentar, onNueva }: { t: TurnoUI; primero: boolean; onReintentar: () => void; onNueva: () => void }) {
  const trabajando = t.fase === 'enviando' || t.fase === 'recibiendo';
  return (
    <section data-turno="" className={cn('scroll-mt-2', !primero && 'mt-7 border-t border-border pt-6')}>
      <p className="text-[13px] font-medium text-muted-foreground">{t.pregunta}</p>
      {trabajando && (!t.texto || t.estado) && (
        <p role="status" aria-live="polite" className="mt-2.5 flex items-center gap-2 text-[13.5px] text-muted-foreground" data-testid="asistente-estado">
          <span aria-hidden="true" className="flex gap-1">
            {[0, 1, 2].map(i => <span key={i} className="size-1 animate-pulse rounded-full bg-current" style={{ animationDelay: `${i * 160}ms` }} />)}
          </span>
          {t.estado ?? 'Pensando…'}
        </p>
      )}
      {t.texto && (
        <p className="mt-2 text-[16px] leading-relaxed text-foreground text-pretty" aria-busy={trabajando || undefined} data-testid="asistente-texto">
          <TextoConReferencias texto={t.texto} />
        </p>
      )}
      {t.avisos.map(a => AVISOS[a] && (
        <p key={a} className="mt-2 text-[12.5px] text-muted-foreground" data-aviso={a}>{AVISOS[a]}</p>
      ))}
      {t.error && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-4 py-3 ring-1 ring-black/[0.06] dark:ring-white/[0.08]" data-error={t.error.codigo}>
          <p className="text-[14px] text-foreground">{t.error.mensaje}</p>
          {t.error.reintentar && (
            <button type="button" onClick={onReintentar} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70">
              <RotateCcw size={14} aria-hidden="true" /> Reintentar
            </button>
          )}
          {t.error.nueva && (
            <button type="button" onClick={onNueva} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground">
              <SquarePen size={14} aria-hidden="true" /> Nueva conversación
            </button>
          )}
        </div>
      )}
      {t.bloques.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {t.bloques.map(b => <Bloque key={b.id} bloque={b.bloque} />)}
        </div>
      )}
    </section>
  );
}
