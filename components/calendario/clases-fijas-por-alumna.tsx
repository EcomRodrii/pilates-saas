'use client';

// Calendario › Horario › «Por alumna» (panel nuevo): las clases fijas de cada
// alumna, como «Turnos» de Bonsai (b-87, «Por cliente»). El Horario por clase
// responde «¿quién viene fija a esta clase?»; esto, «¿qué tiene fijo Carmen?» y
// «¿a quién se le ha quedado una sin cuota o sin clase?».
//
// Mejor que Bonsai: lo que pide hacer algo (sin cuota, la clase se movió, una
// vuelta de pausa por decidir) sale marcado y se filtra con «Con aviso», y
// «Gestionar» abre la MISMA sección de clases fijas de la ficha (pausar,
// cambiar de clase, quitar): ninguna escritura nueva, las mismas reglas.
// Lo que cuenta cada fila sale de lib/plazas-fijas-por-alumna.ts.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Pause, Search, Settings2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { IconoAviso } from '@/lib/iconos';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { FichaPlazaFija } from '@/components/socios/ficha-plaza-fija';
import { Baldosa, PantallaVacia } from '@/components/dashboard/vivo';
import type { MostrarToast } from '@/components/ui/toast';
import {
  clasesFijasPorAlumna, filtrarClasesFijas, type EstadoClaseFija, type FiltroEstadoClaseFija,
} from '@/lib/plazas-fijas-por-alumna';

// Lunes primero; los valores son los de extract(dow) (0 = domingo).
const DIAS: { v: number; corto: string; largo: string }[] = [
  { v: 1, corto: 'Lun', largo: 'Lunes' }, { v: 2, corto: 'Mar', largo: 'Martes' }, { v: 3, corto: 'Mié', largo: 'Miércoles' },
  { v: 4, corto: 'Jue', largo: 'Jueves' }, { v: 5, corto: 'Vie', largo: 'Viernes' }, { v: 6, corto: 'Sáb', largo: 'Sábado' },
  { v: 0, corto: 'Dom', largo: 'Domingo' },
];
const diaCorto = (v: number) => DIAS.find(d => d.v === v)?.corto ?? '—';

const FILTROS: { valor: FiltroEstadoClaseFija; label: string }[] = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'activas', label: 'Activas' },
  { valor: 'en_pausa', label: 'En pausa' },
  { valor: 'con_aviso', label: 'Con aviso' },
];

const fechaCorta = (ymd: string | null | undefined) => (ymd ? ymd.slice(0, 10).split('-').reverse().join('/') : '—');

const CHAPA: Record<EstadoClaseFija, { texto: string; clase: string }> = {
  activa: { texto: 'Activa', clase: 'text-[color:var(--success)] bg-[color:color-mix(in_srgb,var(--success)_12%,var(--card))]' },
  pausa_programada: { texto: 'Pausa programada', clase: 'text-foreground bg-muted' },
  en_pausa: { texto: 'En pausa', clase: 'text-foreground bg-muted' },
  vuelta_por_decidir: { texto: 'Vuelta por decidir', clase: 'text-[color:var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_14%,var(--card))]' },
};

export function ClasesFijasPorAlumna({ puedeGestionar, onToast }: {
  puedeGestionar: boolean;
  onToast: MostrarToast;
}) {
  // La hora entra por estado, como en la ficha (ficha-plaza-fija.tsx): la lógica
  // pura la recibe inyectada y no hay `Date.now()` al pintar.
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reloj: sincroniza con el paso del TIEMPO, un sistema externo.
    setAhoraMs(Date.now());
  }, []);
  const { plazasFijas, sesiones, suscripciones, planesTarifa, socios, salas, tiposClase } = useStudio();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<FiltroEstadoClaseFija>('todas');
  const [dia, setDia] = useState<number | null>(null);
  const [gestionando, setGestionando] = useState<{ socioId: string; nombre: string } | null>(null);

  // Nombre y apellidos, como el Horario por clase (`nombreClientaResolver` del calendario).
  const nombrePorSocia = useMemo(() => new Map(socios.map(s => [s.id, `${s.nombre} ${s.apellidos ?? ''}`.trim()])), [socios]);
  const todas = useMemo(
    () => (ahoraMs ? clasesFijasPorAlumna({
      plazasFijas, sesiones, suscripciones, planes: planesTarifa, ahoraMs,
      nombreDe: id => nombrePorSocia.get(id) ?? 'Clienta sin nombre',
    }) : []),
    [plazasFijas, sesiones, suscripciones, planesTarifa, nombrePorSocia, ahoraMs],
  );
  const visibles = useMemo(() => filtrarClasesFijas(todas, { texto, estado, dia }), [todas, texto, estado, dia]);
  const nClases = todas.reduce((n, a) => n + a.filas.length, 0);
  const nAvisos = todas.reduce((n, a) => n + a.avisos, 0);
  const salaDe = (id: string) => salas.find(s => s.id === id)?.nombre ?? 'Sala';
  const tipoDe = (id: string | null) => (id ? tiposClase.find(t => t.id === id)?.nombre ?? null : null);

  if (ahoraMs && todas.length === 0) {
    return (
      <PantallaVacia
        tono="azul"
        Icono={CalendarClock}
        titulo="Nadie tiene clase fija todavía"
        texto="Una clase fija le reserva sola su plaza cada semana a una alumna, sin que tengas que apuntarla clase a clase."
        ejemplos={[
          { accion: 'Dásela desde su ficha', cuando: 'eligiendo la clase a la que viene cada semana' },
          { accion: 'O desde «Por clase»', cuando: 'con «+ Clase fija» en la tarjeta de la clase' },
        ]}
      />
    );
  }

  return (
    <section aria-label="Clases fijas por alumna" className="rounded-t-card border border-border bg-card p-4 shadow-t-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Baldosa tono="azul" Icono={Users} />
          <div>
            <h2 className="text-[16px] font-semibold text-foreground">Clases fijas por alumna</h2>
            <p className="text-[12.5px] text-muted-foreground">
              {todas.length} {todas.length === 1 ? 'alumna' : 'alumnas'} · {nClases} {nClases === 1 ? 'clase fija' : 'clases fijas'}
              {nAvisos > 0 && <> · <span className="font-semibold text-[color:var(--warning)]">{nAvisos} con aviso</span></>}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Buscar alumna</span>
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Buscar alumna"
            className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <div className="grid w-full grid-cols-4 rounded-full bg-muted p-1 sm:inline-flex sm:w-auto" role="group" aria-label="Estado">
          {FILTROS.map(o => (
            <button
              key={o.valor}
              type="button"
              onClick={() => setEstado(o.valor)}
              aria-pressed={estado === o.valor}
              className={cn('whitespace-nowrap rounded-full px-1 py-1 text-[12.5px] font-semibold transition-colors sm:px-3', estado === o.valor ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="text-[12.5px]">
          <span className="sr-only">Día</span>
          <select
            value={dia === null ? '' : String(dia)}
            onChange={e => setDia(e.target.value === '' ? null : Number(e.target.value))}
            className="h-9 rounded-full border border-border bg-background px-3 text-[12.5px] font-semibold"
          >
            <option value="">Todos los días</option>
            {DIAS.map(d => <option key={d.v} value={d.v}>{d.largo}</option>)}
          </select>
        </label>
      </div>

      {visibles.length === 0 ? (
        <p role="status" className="mt-6 rounded-[12px] bg-muted/50 px-4 py-6 text-center text-[13px] text-muted-foreground">
          Ninguna alumna con esos filtros.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {visibles.map(a => (
            <li key={a.socioId} aria-label={a.nombre} className="flex flex-wrap items-start gap-3 py-3.5 sm:flex-nowrap">
              <div className="flex w-full min-w-0 items-start justify-between gap-2 sm:block sm:w-[220px] sm:shrink-0">
                <div className="min-w-0">
                  <Link href={`/clientas/${a.socioId}`} className="text-[14px] font-semibold text-foreground underline-offset-2 hover:underline">
                    {a.nombre}
                  </Link>
                  <p className="text-[12px] text-muted-foreground">{a.filas.length} {a.filas.length === 1 ? 'clase fija' : 'clases fijas'}</p>
                </div>
                {puedeGestionar && <BotonGestionar nombre={a.nombre} onClick={() => setGestionando({ socioId: a.socioId, nombre: a.nombre })} className="sm:hidden" />}
              </div>
              <ul className="w-full min-w-0 space-y-1.5 sm:flex-1">
                {a.filas.map(f => {
                  const p = f.plaza;
                  const tipo = tipoDe(p.tipoClaseId);
                  const chapa = CHAPA[f.estado];
                  return (
                    <li key={p.id} className="rounded-[10px] border border-border bg-background px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-semibold text-foreground tabular-nums">{diaCorto(p.diaSemana)} {p.horaInicio.slice(0, 5)}</span>
                        <span className="text-[12.5px] text-muted-foreground">{tipo ? `${tipo} · ` : ''}{salaDe(p.salaId)}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', chapa.clase)}>
                          {f.estado === 'en_pausa' && <Pause size={10} aria-hidden className="mr-0.5 inline" />}
                          {chapa.texto}
                        </span>
                        <span className="text-[11.5px] text-muted-foreground">
                          {p.vigenciaHasta ? `hasta el ${fechaCorta(p.vigenciaHasta)}` : 'sin fecha de fin'}
                          {(f.estado === 'en_pausa' || f.estado === 'pausa_programada') && p.pausaHasta ? ` · pausa hasta el ${fechaCorta(p.pausaHasta)}` : ''}
                        </span>
                      </div>
                      {(f.sinCuota || f.sinClase || f.estado === 'vuelta_por_decidir') && (
                        <p role="status" className="mt-1 flex items-center gap-1 text-[11.5px] font-medium text-[color:var(--warning)]">
                          <IconoAviso size={12} className="shrink-0" aria-hidden />
                          {f.sinCuota
                            ? 'Sin cuota que incluya esta clase: no se le reserva nada hasta que tenga una'
                            : f.sinClase
                              ? 'Sin clase en este horario: la clase se movió, cámbiala a la nueva'
                              : 'Su pausa acabó y su sitio está libre: decide su vuelta en Resumen'}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {puedeGestionar && <BotonGestionar nombre={a.nombre} onClick={() => setGestionando({ socioId: a.socioId, nombre: a.nombre })} className="max-sm:hidden" />}
            </li>
          ))}
        </ul>
      )}

      <DashboardDrawer
        open={gestionando !== null}
        onClose={() => setGestionando(null)}
        label={gestionando ? `Clases fijas de ${gestionando.nombre}` : 'Clases fijas'}
      >
        {gestionando && (
          <div className="flex h-full flex-col">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-[17px] font-bold text-foreground">{gestionando.nombre}</h2>
              <Link href={`/clientas/${gestionando.socioId}`} className="text-[12.5px] font-semibold text-brand-medio hover:underline">Abrir su ficha</Link>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <FichaPlazaFija socioId={gestionando.socioId} onToast={onToast} />
            </div>
          </div>
        )}
      </DashboardDrawer>
    </section>
  );
}

function BotonGestionar({ nombre, onClick, className }: { nombre: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Gestionar las clases fijas de ${nombre}`}
      className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted', className)}
    >
      <Settings2 size={14} aria-hidden /> Gestionar
    </button>
  );
}

export type HorarioPor = 'clase' | 'alumna';

/** «Por clase | Por alumna» encima del Horario (Bonsai: «Por día | Por cliente»). */
export function SelectorHorarioPor({ valor, onCambio }: { valor: HorarioPor; onCambio: (v: HorarioPor) => void }) {
  return (
    <div className="mb-3 inline-flex rounded-full bg-muted p-1" role="group" aria-label="Ver el horario">
      {([['clase', 'Por clase'], ['alumna', 'Por alumna']] as const).map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onCambio(v)}
          aria-pressed={valor === v}
          className={cn('zona-tactil rounded-full px-3.5 py-1 text-[12.5px] font-semibold transition-colors', valor === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
