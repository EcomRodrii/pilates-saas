'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as KeyboardEventReact, type ReactNode } from 'react';
import { ArrowUp, Check, Copy, MessagesSquare, RotateCcw, Square, SquarePen } from 'lucide-react';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { TentiAsistente, TentiAsistenteQuieto } from '@/components/tenti/tenti-asistente';
import { MS_HECHO } from '@/lib/tenti/asistente';
import { enVuelo, sugerenciasPara, type EstadoAsistente, type TurnoUI } from '@/lib/asistente/estado-ui';
import { cn } from '@/lib/utils';
import { areaConTeclado } from '@/lib/asistente/teclado';
import {
  abrirConversacion, cargarConversaciones, cargarSaldo, montarVista, nuevaConversacion, parar, preguntar, prepararEstudio,
  useAlmacenAsistente, volverAReposo, type ConversacionListada, type SaldoAsistente,
} from './use-asistente';
import { ReferenciasCtx } from './referencias-ui';
import { TextoConReferencias, textoPlano } from './texto-con-referencias';
import { Bloque } from './bloques';

// «Pregúntale a Tentare» como un chat (fundador, 6-oct-2026: «como ChatGPT,
// Gemini, Claude…»): la columna de conversaciones a la izquierda (un cajón en
// el móvil) y el chat en el centro, a ancho de lectura. La pregunta en burbuja
// a la derecha; la respuesta a la izquierda, con Tenti de avatar mientras
// responde, el texto en streaming con su cursor y, DENTRO del mensaje, las
// tarjetas con los datos (métricas, clases, alumnas, recibos).
//
// Es el chunk de la ruta /asistente: nada de esto viaja con el resto del panel.
// Al salir de la vista se desmonta todo (Tenti, el «hecho» breve) y se corta la
// respuesta en vuelo; la conversación vive en el módulo (use-asistente.ts).

const AVISOS: Record<string, string> = {
  CIFRA_SIN_RESPALDO: 'He quitado una cifra que no salía de tus datos.',
  LIMITE_HERRAMIENTAS: 'He mirado lo máximo que miro por pregunta: si te falta algo, pregúntamelo aparte.',
  DEMASIADO_AMPLIA: 'La pregunta era muy amplia: te respondo con lo que he mirado. Si concretas, afino.',
  RECHAZADA: 'Eso no lo puedo responder.',
};

function textoSaldo(disponibles: number | null, saldo: SaldoAsistente | null): string | null {
  if (disponibles === null) return null;
  if (disponibles <= 0) return saldo?.enPrueba ? 'No te quedan consultas de prueba' : 'No te quedan consultas este mes';
  const n = `${disponibles} ${disponibles === 1 ? 'consulta' : 'consultas'}`;
  return saldo?.enPrueba ? `Te ${disponibles === 1 ? 'queda' : 'quedan'} ${n} de prueba` : `Te ${disponibles === 1 ? 'queda' : 'quedan'} ${n} este mes`;
}

export function VistaChat({ studioId, veDinero, nombre, preguntaInicial }: {
  studioId: string;
  veDinero: boolean;
  /** Para el saludo: «¿En qué te ayudo hoy, Cloe?». */
  nombre: string | null;
  /** La que trajo una puerta (⌘K, la barra): se envía al montar. */
  preguntaInicial: string | null;
}) {
  const { estado, saldo, conversaciones } = useAlmacenAsistente();
  const [listaMovil, setListaMovil] = useState(false);

  // Al entrar: el estudio, el saldo y la lista (tres peticiones, ninguna repetida
  // mientras no se salga). La pregunta de la puerta, una vez.
  const inicial = useRef(preguntaInicial);
  useEffect(() => {
    prepararEstudio(studioId);
    void cargarSaldo();
    void cargarConversaciones();
    const p = inicial.current;
    inicial.current = null;
    if (p) {
      nuevaConversacion();
      void preguntar(p);
    }
  }, [studioId]);
  useEffect(() => montarVista(), []);

  // «Hecho» breve (1,5 s y a reposo) al terminar una pregunta. Sin sonido:
  // Tenti no suena (fundador, 6-oct-2026).
  useEffect(() => {
    if (estado.momento !== 'terminado') return;
    const t = setTimeout(volverAReposo, MS_HECHO);
    return () => clearTimeout(t);
  }, [estado.momento]);

  const teclado = useAreaConTeclado();

  const vacio = estado.turnos.length === 0;
  const elegir = (id: string) => { setListaMovil(false); void abrirConversacion(id); };
  const nueva = () => { setListaMovil(false); nuevaConversacion(); };

  return (
    <ReferenciasCtx.Provider value={estado.referencias}>
      <div
        data-testid="chat-asistente"
        data-teclado={teclado ? '' : undefined}
        className={cn(
          'fixed inset-x-0 flex bg-background lg:top-[calc(var(--panel-top,0.5rem)+4rem)] lg:bottom-0 lg:left-[var(--sidebar-w,0px)]',
          // Con el teclado abierto (móvil), justo sobre lo visible y por encima de las barras del panel.
          // En el móvil tapa la barra de arriba del panel: una sola cabecera, la del chat
          // (como ChatGPT o Claude), y la barra de abajo sigue para salir.
          teclado ? 'z-40' : 'top-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] z-[35] lg:z-20',
        )}
        style={teclado ? { top: teclado.top, height: teclado.height } : undefined}
      >
        <aside className="hidden w-[272px] shrink-0 flex-col border-r border-border lg:flex" aria-label="Tus conversaciones">
          <ListaConversaciones conversaciones={conversaciones} activa={estado.conversacionId} onElegir={elegir} onNueva={nueva} />
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 px-1.5 lg:hidden">
            <button type="button" onClick={() => setListaMovil(true)} aria-label="Tus conversaciones" className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <MessagesSquare size={19} aria-hidden="true" />
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-[14px] font-semibold text-foreground">Tentare</p>
            <button type="button" onClick={nueva} aria-label="Nueva conversación" className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <SquarePen size={18} aria-hidden="true" />
            </button>
          </header>

          {vacio
            ? <Bienvenida nombre={nombre} veDinero={veDinero} estado={estado} saldo={saldo} />
            : <Conversacion estado={estado} saldo={saldo} />}
        </main>

        <DashboardDrawer
          open={listaMovil}
          onClose={() => setListaMovil(false)}
          label="Tus conversaciones"
          desdeAbajo
          backdropClassName="fixed inset-0 z-50 flex items-end bg-foreground/25 lg:hidden"
          sheetClassName="relative flex h-[80dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-card"
        >
          <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-9 shrink-0 rounded-full bg-border" />
          <ListaConversaciones conversaciones={conversaciones} activa={estado.conversacionId} onElegir={elegir} onNueva={nueva} />
        </DashboardDrawer>
      </div>
    </ReferenciasCtx.Provider>
  );
}

/**
 * Móvil: dónde va el chat con el teclado abierto (lib/asistente/teclado.ts), y
 * la página de debajo quieta mientras se está en el chat. Sin esto, el teclado
 * de iOS corría la página y el chat se quedaba a medias, y un deslizamiento
 * fuera de la lista movía el documento entero que hay detrás.
 */
function useAreaConTeclado() {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const movil = window.matchMedia('(max-width: 1023px)');
    const html = document.documentElement;
    const antes = { overflow: html.style.overflow, overscroll: html.style.overscrollBehavior };
    const medir = () => {
      if (!vv || !movil.matches) { setArea(null); return; }
      const nueva = areaConTeclado({ alto: window.innerHeight, altoVisible: vv.height, desplazamiento: vv.offsetTop });
      setArea(a => (a?.top === nueva?.top && a?.height === nueva?.height ? a : nueva));
    };
    const fijarPagina = () => {
      html.style.overflow = movil.matches ? 'hidden' : antes.overflow;
      html.style.overscrollBehavior = movil.matches ? 'none' : antes.overscroll;
    };
    fijarPagina();
    medir();
    vv?.addEventListener('resize', medir);
    vv?.addEventListener('scroll', medir);
    movil.addEventListener('change', medir);
    movil.addEventListener('change', fijarPagina);
    return () => {
      vv?.removeEventListener('resize', medir);
      vv?.removeEventListener('scroll', medir);
      movil.removeEventListener('change', medir);
      movil.removeEventListener('change', fijarPagina);
      html.style.overflow = antes.overflow;
      html.style.overscrollBehavior = antes.overscroll;
    };
  }, []);
  return area;
}

// ── La columna de conversaciones ─────────────────────────────────────────────

function grupoDe(iso: string, ahora: Date): string {
  const d = new Date(iso);
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(ahora) - dia(d)) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return 'Últimos 7 días';
  if (dias < 30) return 'Últimos 30 días';
  return 'Antes';
}

function ListaConversaciones({ conversaciones, activa, onElegir, onNueva }: {
  conversaciones: ConversacionListada[] | null;
  activa: string | null;
  onElegir: (id: string) => void;
  onNueva: () => void;
}) {
  const [ahora] = useState(() => new Date());
  const grupos: { titulo: string; items: ConversacionListada[] }[] = [];
  for (const c of conversaciones ?? []) {
    const g = grupoDe(c.ultimaEn, ahora);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.titulo === g) ultimo.items.push(c); else grupos.push({ titulo: g, items: [c] });
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <button
          type="button" onClick={onNueva}
          className="flex h-10 w-full items-center gap-2.5 rounded-full px-3.5 text-[14px] font-medium text-foreground ring-1 ring-border transition-colors hover:bg-muted"
        >
          <SquarePen size={16} aria-hidden="true" className="text-muted-foreground" />
          Nueva conversación
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversaciones anteriores">
        {conversaciones === null && (
          <div className="space-y-2 px-2 pt-2" aria-hidden="true">
            {[0, 1, 2].map(i => <div key={i} className="h-7 animate-pulse rounded-lg bg-muted" />)}
          </div>
        )}
        {conversaciones?.length === 0 && (
          <p className="px-3 pt-2 text-[13px] text-muted-foreground text-pretty">Aquí verás tus conversaciones con Tentare.</p>
        )}
        {grupos.map(g => (
          <div key={g.titulo} className="mt-3 first:mt-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{g.titulo}</p>
            <ul>
              {g.items.map(c => (
                <li key={c.id}>
                  <button
                    type="button" onClick={() => onElegir(c.id)} aria-current={c.id === activa ? 'true' : undefined}
                    className={cn(
                      'block w-full truncate rounded-xl px-3 py-2 text-left text-[13.5px] transition-colors',
                      c.id === activa ? 'bg-muted font-medium text-foreground' : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
                    )}
                    data-conversacion={c.id}
                  >
                    {c.titulo}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

// ── Vacío: el saludo, Tenti grande, el campo en el centro y las sugerencias ─

function Bienvenida({ nombre, veDinero, estado, saldo }: { nombre: string | null; veDinero: boolean; estado: EstadoAsistente; saldo: SaldoAsistente | null }) {
  const sugerencias = sugerenciasPara(veDinero, 4);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain px-4 pt-4 pb-8">
      {/* `my-auto` y no `justify-center` en el padre: centrado mientras cabe, y si no
          cabe (un móvil bajo) empieza arriba y se desplaza; con `justify-center`
          lo que sobraba se cortaba por ARRIBA y no había forma de llegar a ello. */}
      <div className="my-auto w-full max-w-[720px]">
        <div className="flex flex-col items-center text-center">
          <TentiAsistente momento={estado.momento} tamano={96} />
          <h1 className="mt-3 font-heading text-[26px] font-semibold leading-tight tracking-tight text-foreground text-balance sm:text-[30px]">
            ¿En qué te ayudo hoy{nombre ? `, ${nombre}` : ''}?
          </h1>
          <p className="mt-2 max-w-md text-[14px] text-muted-foreground text-pretty">
            Te respondo con los datos de tu estudio, al momento.
          </p>
        </div>
        <div className="mt-7">
          <Compositor estado={estado} saldo={saldo} grande />
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Preguntas de ejemplo">
          {sugerencias.map(s => (
            <li key={s}>
              <button
                type="button" onClick={() => void preguntar(s)}
                className="flex h-full min-h-12 w-full items-center rounded-2xl bg-card px-4 py-3 text-left text-[14px] text-foreground ring-1 ring-black/[0.06] transition-colors hover:bg-muted/70 dark:ring-white/[0.08]"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── La conversación ──────────────────────────────────────────────────────────

function Conversacion({ estado, saldo }: { estado: EstadoAsistente; saldo: SaldoAsistente | null }) {
  const lista = useRef<HTMLDivElement>(null);
  const pegado = useRef(true);
  const nTurnos = estado.turnos.length;
  const ultimo = estado.turnos[nTurnos - 1];

  // Mientras ella no suba a leer, la vista sigue al final de lo que llega.
  const onScroll = () => {
    const el = lista.current;
    if (el) pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    const el = lista.current;
    if (el && pegado.current) el.scrollTop = el.scrollHeight;
  }, [ultimo?.texto, ultimo?.bloques.length, ultimo?.estado, ultimo?.fase]);
  // Una pregunta nueva siempre baja al final.
  useLayoutEffect(() => {
    pegado.current = true;
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [nTurnos, estado.conversacionId]);

  return (
    <>
      <div ref={lista} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="chat-mensajes">
        <div className="mx-auto w-full max-w-[760px] px-4 pt-6 pb-10 sm:px-6">
          {estado.turnos.map((t, i) => (
            <Turno key={t.id} t={t} ultimo={i === nTurnos - 1} momento={estado.momento} referencias={estado.referencias} />
          ))}
        </div>
      </div>
      <div className="shrink-0 bg-background px-3 pt-2 pb-2 sm:px-6 sm:pb-3">
        <div className="mx-auto w-full max-w-[760px]">
          <Compositor estado={estado} saldo={saldo} />
        </div>
      </div>
    </>
  );
}

function Turno({ t, ultimo, momento, referencias }: {
  t: TurnoUI; ultimo: boolean; momento: EstadoAsistente['momento']; referencias: EstadoAsistente['referencias'];
}) {
  const trabajando = t.fase === 'enviando' || t.fase === 'recibiendo';
  return (
    <section data-turno="" className="mt-8 first:mt-0">
      {/* Su pregunta, a la derecha, en burbuja. */}
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-muted px-4 py-2.5 text-[15px] leading-relaxed text-foreground sm:max-w-[75%]" data-testid="chat-pregunta">
          {t.pregunta}
        </p>
      </div>

      {/* La respuesta, a la izquierda: Tenti de avatar en la que está en curso. */}
      {/* En el móvil, a todo el ancho (las tarjetas no caben con una columna de
          avatar al lado): Tenti va encima, y solo en la respuesta en curso. */}
      <div className="mt-5 flex flex-col gap-1 sm:flex-row sm:gap-4">
        <div className={cn('shrink-0 sm:block sm:w-10', ultimo ? 'block h-10' : 'hidden')}>
          {ultimo ? <TentiAsistente momento={momento} tamano={40} className="-mt-1.5" /> : <TentiAsistenteQuieto className="-mt-1.5" />}
        </div>
        <div className="min-w-0 flex-1">
          {trabajando && !t.texto && (
            <p role="status" aria-live="polite" className="flex min-h-7 items-center gap-2 text-[14.5px] text-muted-foreground" data-testid="chat-estado">
              <span className="asistente-brillo">{t.estado ?? 'Pensando…'}</span>
            </p>
          )}
          {t.texto && (
            <div className="text-[15.5px] leading-[1.7] text-foreground text-pretty" aria-busy={trabajando || undefined} data-testid="chat-respuesta">
              <TextoConReferencias texto={t.texto} cursor={trabajando} />
            </div>
          )}
          {trabajando && t.texto && t.estado && (
            <p role="status" aria-live="polite" className="mt-2 text-[13.5px] text-muted-foreground"><span className="asistente-brillo">{t.estado}</span></p>
          )}
          {t.avisos.map(a => AVISOS[a] && (
            <p key={a} className="mt-2 text-[12.5px] text-muted-foreground" data-aviso={a}>{AVISOS[a]}</p>
          ))}
          {t.bloques.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              {t.bloques.map(b => <Bloque key={b.id} bloque={b.bloque} />)}
            </div>
          )}
          {t.error && (
            <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-4 py-3 ring-1 ring-black/[0.06] dark:ring-white/[0.08]" data-error={t.error.codigo}>
              <p className="text-[14px] text-foreground">{t.error.mensaje}</p>
              {t.error.reintentar && (
                <button type="button" onClick={() => void preguntar(t.pregunta)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70">
                  <RotateCcw size={14} aria-hidden="true" /> Reintentar
                </button>
              )}
              {t.error.nueva && (
                <button type="button" onClick={() => nuevaConversacion()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground">
                  <SquarePen size={14} aria-hidden="true" /> Nueva conversación
                </button>
              )}
            </div>
          )}
          {!trabajando && t.texto && <Acciones texto={textoPlano(t.texto, referencias)} />}
        </div>
      </div>
    </section>
  );
}

function Acciones({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1600);
    return () => clearTimeout(t);
  }, [copiado]);
  const copiar = async () => {
    // «Copiado» solo si el navegador dice que lo ha copiado (Safari puede no hacerlo).
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { /* no se dice que sí */ }
  };
  return (
    <div className="mt-2 flex items-center gap-1">
      <button
        type="button" onClick={() => void copiar()} aria-label={copiado ? 'Copiado' : 'Copiar respuesta'}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

// ── El campo de escribir ─────────────────────────────────────────────────────

function Compositor({ estado, saldo, grande = false }: { estado: EstadoAsistente; saldo: SaldoAsistente | null; grande?: boolean }) {
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);
  const ocupado = enVuelo(estado);

  // El foco al entrar, solo con ratón: en el móvil abriría el teclado (y taparía
  // media pantalla) sin que ella haya tocado el campo.
  useEffect(() => { if (window.matchMedia('(pointer: fine)').matches) campo.current?.focus(); }, []);
  // Crece con el texto, hasta ~8 líneas.
  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [texto]);

  const enviar = () => {
    if (!texto.trim() || ocupado) return;
    const q = texto;
    setTexto('');
    void preguntar(q);
  };
  const onKeyDown = (e: KeyboardEventReact<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); }
  };
  const saldoTexto = textoSaldo(estado.disponibles, saldo);

  return (
    <form onSubmit={e => { e.preventDefault(); enviar(); }}>
      <div className={cn(
        'flex items-end gap-2 rounded-[28px] bg-card p-2 pl-5 ring-1 ring-black/[0.08] shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] transition-shadow focus-within:ring-black/[0.14] dark:ring-white/[0.1] dark:focus-within:ring-white/[0.2]',
        grande && 'min-h-[60px]',
      )}>
        <label htmlFor="asistente-pregunta" className="sr-only">Pregunta sobre tu estudio</label>
        <textarea
          id="asistente-pregunta"
          ref={campo}
          rows={1}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={500}
          enterKeyHint="send"
          placeholder="Pregúntale a Tentare…"
          className="max-h-[220px] min-h-10 min-w-0 flex-1 resize-none self-center bg-transparent py-2 text-[16px] leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none lg:text-[15px]"
        />
        {ocupado ? (
          <BotonRedondo etiqueta="Parar la respuesta" onClick={parar} ocupado>
            <Square size={13} aria-hidden="true" className="fill-current" />
          </BotonRedondo>
        ) : (
          <BotonRedondo etiqueta="Preguntar" tipo="submit" desactivado={!texto.trim()}>
            <ArrowUp size={18} aria-hidden="true" />
          </BotonRedondo>
        )}
      </div>
      <p className="mt-1.5 text-center text-[12px] leading-snug text-muted-foreground sm:mt-2" data-testid="asistente-saldo">
        {saldoTexto && <>{saldoTexto}<span className="hidden sm:inline"> · </span></>}
        {/* En el móvil, una sola línea bajo el campo: el saldo. */}
        <span className={saldoTexto ? 'hidden sm:inline' : undefined}>Tentare consulta tus datos; todavía no hace cambios.</span>
      </p>
    </form>
  );
}

function BotonRedondo({ etiqueta, onClick, tipo = 'button', desactivado, ocupado, children }: {
  etiqueta: string; onClick?: () => void; tipo?: 'button' | 'submit'; desactivado?: boolean; ocupado?: boolean; children: ReactNode;
}) {
  return (
    <button
      type={tipo} onClick={onClick} aria-label={etiqueta} disabled={desactivado} aria-busy={ocupado || undefined}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
    >
      {children}
    </button>
  );
}
