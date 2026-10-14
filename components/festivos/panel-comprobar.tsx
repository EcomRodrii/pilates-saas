'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Comprobar clases» del módulo Festivos: el «Comprobar sesiones» de Bonsai
// (b-90-festivos-23), pero sin su «Eliminar sesiones seleccionadas», que borra
// clases sin decir cuántas reservas tienen ni avisar a nadie.
//
// Aquí cada festivo que viene, sin decidir y con clases, dice cuántas clases y
// reservas tiene, y se elige: «Abrimos igualmente» (se apunta y no se vuelve a
// preguntar) o «Cerrar ese día», que es el cierre de siempre (POST
// /api/cierres): cancela avisando según tus correos, devuelve la sesión según
// tu ajuste y alarga bonos y recuperaciones, y antes lo confirma.
//
// Los datos son los del aviso de la bandeja con alcance «todos» (GET
// /api/festivos): una sola regla de «qué festivo espera decisión».
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck2, Check, X } from 'lucide-react';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BOTON_BORDE } from '@/components/dashboard/vivo-seccion';
import { Baldosa } from '@/components/dashboard/vivo';
import { cn } from '@/lib/utils';
import { consecuenciasDelCierre } from '@/lib/cierres/dias-de-cierre';
import { abrirFestivo, cerrarFestivo, listarFestivos, type ListaFestivos } from '@/lib/festivos/festivos-cliente';
import { fechaDelFestivo, fraseFestivo, type FestivoConClases } from '@/lib/festivos/textos';

export function PanelComprobarClases({ open, onClose, devuelveSesion, onDecidido, onError }: {
  open: boolean;
  onClose: () => void;
  devuelveSesion: boolean;
  /** Lo que el servidor confirmó, dicho en una línea (para el toast). */
  onDecidido: (texto: string) => void;
  onError: (error: string) => void;
}) {
  return (
    <DashboardDrawer
      open={open}
      onClose={onClose}
      label="Clases en tus festivos"
      sheetClassName="relative flex h-full w-full flex-col bg-card shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)] lg:w-[520px]"
    >
      {open && <Contenido onClose={onClose} devuelveSesion={devuelveSesion} onDecidido={onDecidido} onError={onError} />}
    </DashboardDrawer>
  );
}

function Contenido({ onClose, devuelveSesion, onDecidido, onError }: {
  onClose: () => void; devuelveSesion: boolean; onDecidido: (texto: string) => void; onError: (error: string) => void;
}) {
  const [lista, setLista] = useState<ListaFestivos | null>(null);
  const [error, setError] = useState(false);
  const [enviando, setEnviando] = useState<{ fecha: string; accion: 'abrir' | 'cerrar' } | null>(null);
  const [cerrando, setCerrando] = useState<FestivoConClases | null>(null);
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    void listarFestivos('todos').then(r => {
      if (!vivo) return;
      if (r) setLista(r); else setError(true);
    });
    return () => { vivo = false; };
  }, []);

  async function decidir(f: FestivoConClases, accion: 'abrir' | 'cerrar') {
    if (enVuelo.current || !lista) return;
    enVuelo.current = true;
    setEnviando({ fecha: f.fecha, accion });
    try {
      const r = accion === 'abrir' ? await abrirFestivo(f.fecha) : await cerrarFestivo(f);
      if (!r.ok) { onError(r.error); return; }
      // Fuera de la lista cuando el servidor lo ha confirmado, no antes.
      setLista(prev => (prev ? { ...prev, festivos: prev.festivos.filter(x => x.fecha !== f.fecha) } : prev));
      const cuando = fechaDelFestivo(f.fecha, lista.hoy);
      onDecidido(accion === 'abrir'
        ? `Apuntado: el ${cuando} abres.`
        : `${cuando.charAt(0).toUpperCase()}${cuando.slice(1)}: ${'texto' in r ? r.texto : 'día cerrado'}`);
    } finally {
      enVuelo.current = false;
      setEnviando(null);
    }
  }

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold leading-tight text-foreground">Clases en tus festivos</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">Los festivos que vienen y tienen clases. Nada se cancela hasta que tú lo decidas.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" data-testid="festivos-comprobar">
        {!lista && !error && (
          <div aria-hidden className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>
        )}
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">No se han podido comprobar tus clases. Inténtalo de nuevo.</p>}
        {lista && lista.festivos.length === 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-border p-4" role="status">
            <Baldosa tono="verde" Icono={Check} />
            <div>
              <p className="text-[14.5px] font-semibold text-foreground">Ningún festivo tiene clases sin decidir</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">Los que vienen no tienen clases, ya los cerraste o dijiste que abres.</p>
            </div>
          </div>
        )}
        {lista && lista.festivos.length > 0 && (
          <ul className="space-y-2.5">
            {lista.festivos.map(f => (
              <li key={f.fecha} data-testid="festivo-con-clases" className="rounded-2xl border border-border bg-card p-4 shadow-t-card">
                <p className="flex items-start gap-2 text-[13.5px] text-foreground text-pretty">
                  <CalendarCheck2 size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--t-magenta-500)' }} aria-hidden />
                  {fraseFestivo(f, lista.hoy)}
                </p>
                <Link href={`/calendario?fecha=${f.fecha}`} className="ml-6 text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
                  Ver ese día en el calendario
                </Link>
                {/* Pesan lo mismo: ninguno empuja a cerrar. */}
                <div className="mt-3 flex gap-2 [&>*]:flex-1">
                  <button type="button" className={cn(BOTON_BORDE, 'min-h-11 md:min-h-9')} disabled={enviando !== null} onClick={() => void decidir(f, 'abrir')}
                    aria-label={`Abrimos igualmente el ${fechaDelFestivo(f.fecha, lista.hoy)}`}>
                    {enviando?.fecha === f.fecha && enviando.accion === 'abrir' ? 'Guardando…' : 'Abrimos igualmente'}
                  </button>
                  <button type="button" className={cn(BOTON_BORDE, 'min-h-11 md:min-h-9')} disabled={enviando !== null} onClick={() => setCerrando(f)}
                    aria-label={`Cerrar el ${fechaDelFestivo(f.fecha, lista.hoy)}`}>
                    {enviando?.fecha === f.fecha && enviando.accion === 'cerrar' ? 'Cerrando…' : 'Cerrar ese día'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={cerrando !== null}
        onOpenChange={v => { if (!v) setCerrando(null); }}
        titulo={cerrando && lista ? `¿Cerrar el ${fechaDelFestivo(cerrando.fecha, lista.hoy)}?` : ''}
        descripcion={cerrando
          ? `${consecuenciasDelCierre({ cuando: 'Ese día', dias: 1, devuelveSesion, clases: cerrando.clases })} Quitar el cierre después no devuelve las clases.`
          : undefined}
        textoConfirmar="Sí, cerrar ese día"
        destructivo
        onConfirm={() => { const f = cerrando; setCerrando(null); if (f) void decidir(f, 'cerrar'); }}
      />
    </>
  );
}
