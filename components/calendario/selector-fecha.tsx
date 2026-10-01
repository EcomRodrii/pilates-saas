'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, masDias } from '@/lib/utils';
import { anfitrionPortal } from '@/lib/panel-portal';

// La fecha de la cabecera, que se toca para elegir otro día (decisión 1 del
// rediseño): el mes dejó de ser una vista —solo decía «N clases» y una barra— y
// pasó a ser esto. Los días con clase llevan su punto; lo que se está viendo
// (el día o la semana) va marcado.
//
// Fechas como 'YYYY-MM-DD' de calendario, sin horas: el día de una fecha no
// depende de la zona horaria de nadie.

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function partes(dia: string): { a: number; m: number; d: number } {
  const [a, m, d] = dia.split('-').map(Number);
  return { a, m, d };
}

/** Lunes de la semana que contiene el día 1 del mes, y las 6 semanas desde ahí. */
function rejillaDelMes(a: number, m: number): string[] {
  const primero = `${a}-${String(m).padStart(2, '0')}-01`;
  const dow = new Date(a, m - 1, 1, 12).getDay(); // 0 = domingo
  const inicio = masDias(primero, -((dow + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => masDias(inicio, i));
}

export function SelectorFecha({ etiqueta, abrirEn, desde, hasta, hoy, diasConClase, onElegir, onSemanaQueViene, className }: {
  etiqueta: string;
  /** Día cuyo mes se enseña al abrir. */
  abrirEn: string;
  /** Lo que se está viendo, marcado (el mismo día en Día; siete en Semana). */
  desde: string;
  hasta: string;
  hoy: string;
  diasConClase: ReadonlySet<string>;
  onElegir: (dia: string) => void;
  onSemanaQueViene?: () => void;
  className?: string;
}) {
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mes, setMes] = useState(() => partes(abrirEn));
  // El día que tiene el foco con el teclado (rejilla con flechas, como un
  // calendario de verdad): al abrir, el que se está viendo.
  const [foco, setFoco] = useState<string | null>(null);

  function abrir() {
    const r = botonRef.current?.getBoundingClientRect();
    if (!r) return;
    setMes(partes(abrirEn));
    setFoco(abrirEn);
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 348)) });
  }

  // El panel va al final del documento (un portal): sin llevarle el foco, con el
  // teclado no había forma de llegar a los días.
  useEffect(() => {
    if (!pos || !foco) return;
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus();
  }, [pos, foco]);

  function teclaEnDia(e: React.KeyboardEvent, dia: string) {
    const salto: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let destino: string | null = null;
    if (e.key in salto) destino = masDias(dia, salto[e.key]);
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const p = partes(dia);
      const total = p.a * 12 + (p.m - 1) + (e.key === 'PageUp' ? -1 : 1);
      const a = Math.floor(total / 12), m = (total % 12) + 1;
      const ultimo = new Date(a, m, 0).getDate();
      destino = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(p.d, ultimo)).padStart(2, '0')}`;
    }
    if (!destino) return;
    e.preventDefault();
    const p = partes(destino);
    if (p.a !== mes.a || p.m !== mes.m) setMes(p);
    setFoco(destino);
  }

  useEffect(() => {
    if (!pos) return;
    function fuera(e: MouseEvent) {
      const t = e.target as Node;
      if (!botonRef.current?.contains(t) && !panelRef.current?.contains(t)) { setPos(null); setFoco(null); }
    }
    // Esc cierra esto y nada más (ni un cajón de debajo ni la vista ampliada): en captura, sin propagarse.
    function tecla(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); setPos(null); setFoco(null); botonRef.current?.focus(); } }
    function cerrar() { setPos(null); setFoco(null); }
    document.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [pos]);

  function moverMes(delta: number) {
    setMes(prev => {
      const total = prev.a * 12 + (prev.m - 1) + delta;
      return { a: Math.floor(total / 12), m: (total % 12) + 1, d: 1 };
    });
  }

  // Al elegir, el foco vuelve al botón de la fecha: el día pulsado desaparece y,
  // sin esto, el foco caía al principio de la página.
  function elegir(dia: string) {
    setPos(null);
    setFoco(null);
    onElegir(dia);
    botonRef.current?.focus();
  }

  const dias = rejillaDelMes(mes.a, mes.m);
  const prefijoMes = `${mes.a}-${String(mes.m).padStart(2, '0')}-`;
  // Un solo día entra con Tab (el del foco, o el 1 del mes que se enseña); los
  // demás, con las flechas. Así Tab salta de la rejilla a «Hoy».
  const tabulable = foco && dias.includes(foco) ? foco : `${prefijoMes}01`;

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={() => (pos ? setPos(null) : abrir())}
        aria-expanded={!!pos}
        aria-haspopup="dialog"
        title="Elegir otro día"
        className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted md:min-h-9', className)}
        data-testid="selector-fecha"
      >
        {etiqueta}
        <ChevronDown size={15} className="text-muted-foreground" aria-hidden />
      </button>
      {pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Elegir día"
          // Si el foco se va fuera (Tab más allá del último botón), se cierra:
          // un desplegable abierto que ya no tiene el foco se queda huérfano.
          onBlur={e => {
            const a = e.relatedTarget as Node | null;
            if (a && !panelRef.current?.contains(a) && !botonRef.current?.contains(a)) { setPos(null); setFoco(null); }
          }}
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-50 w-[340px] max-w-[calc(100vw-16px)] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg menu-pop-in"
        >
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold text-foreground" aria-live="polite">{MESES[mes.m - 1]} {mes.a}</p>
            <span className="flex">
              <button type="button" onClick={() => moverMes(-1)} aria-label="Mes anterior" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => moverMes(1)} aria-label="Mes siguiente" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <ChevronRight size={18} />
              </button>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-7 text-center text-[11.5px] font-medium text-muted-foreground" aria-hidden>
            {INICIALES.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-y-1 text-center">
            {dias.map(dia => {
              const fuera = !dia.startsWith(prefijoMes);
              const visto = dia >= desde && dia <= hasta;
              const esHoy = dia === hoy;
              const conClase = diasConClase.has(dia);
              return (
                <button
                  key={dia}
                  type="button"
                  data-dia={dia}
                  tabIndex={dia === tabulable ? 0 : -1}
                  onClick={() => elegir(dia)}
                  onKeyDown={e => teclaEnDia(e, dia)}
                  aria-label={`${Number(dia.slice(8))} de ${MESES[Number(dia.slice(5, 7)) - 1].toLowerCase()}${conClase ? ', con clases' : ''}${esHoy ? ', hoy' : ''}`}
                  aria-current={esHoy ? 'date' : undefined}
                  className={cn(
                    'mx-auto flex size-9 flex-col items-center justify-center rounded-lg text-[13.5px] tabular-nums transition-colors',
                    fuera ? 'text-muted-foreground/60' : 'text-foreground',
                    visto && !esHoy && 'bg-brand/10',
                    esHoy ? 'bg-brand font-semibold text-brand-foreground' : 'hover:bg-muted',
                  )}
                >
                  {Number(dia.slice(8))}
                  <span className={cn('mt-0.5 size-1 rounded-full', conClase ? (esHoy ? 'bg-brand-foreground' : 'bg-foreground/40') : 'bg-transparent')} aria-hidden />
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2 border-t border-border pt-3 text-[12.5px] font-medium">
            <button type="button" onClick={() => elegir(hoy)} className="rounded-lg border border-border px-2.5 py-1.5 text-foreground hover:bg-muted">Hoy</button>
            {onSemanaQueViene && (
              <button type="button" onClick={() => { setPos(null); setFoco(null); onSemanaQueViene(); botonRef.current?.focus(); }} className="rounded-lg border border-border px-2.5 py-1.5 text-foreground hover:bg-muted">
                Semana que viene
              </button>
            )}
          </div>
        </div>,
        anfitrionPortal(),
      )}
    </>
  );
}
