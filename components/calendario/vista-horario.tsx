'use client';

// Vista «Horario» del calendario: el horario fijo del estudio, con las clases
// que se repiten como protagonistas. Una columna por día (lunes primero) y una
// tarjeta por clase recurrente: hasta cuándo va, si se renueva sola, quién viene
// fija y lo que se puede hacer con ella (renovar, dar una plaza fija, ver la
// próxima clase). Debajo, las plazas fijas que se han quedado sin clase.
//
// Solo pinta: los datos (`/api/calendario/horario`) y las acciones las pone el
// calendario, que ya tiene los diálogos de renovar y de plaza fija.

import Link from 'next/link';
import { AlertTriangle, CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { diasHastaFin, fechaDMY, nombreSerie } from '@/lib/series-renovacion';
import type { HorarioFijo, TarjetaHorario } from '@/lib/horario-fijo';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const PUNTOS_MAX = 12;
const NOMBRES_VISIBLES = 4;

export interface VistaHorarioProps {
  horario: HorarioFijo | null;
  error: string | null;
  onReintentar: () => void;
  hoy: string;
  nombreTipo: (id: string) => string | undefined;
  nombreSala: (id: string) => string | undefined;
  nombreInstructora: (id: string | null) => string | null;
  nombreClienta: (socioId: string) => string;
  puedeRenovar: boolean;
  puedeAsignarPlaza: boolean;
  onRenovar: (t: TarjetaHorario) => void;
  onAnadirPlaza: (t: TarjetaHorario) => void;
  onVerClase: (t: TarjetaHorario) => void;
  onCrearRecurrente?: () => void;
}

function textoFin(t: TarjetaHorario, hoy: string): { texto: string; aviso: boolean } {
  const hasta = `Hasta el ${fechaDMY(t.ultimaFecha)}`;
  if (t.renovacionAutomatica) return { texto: `${hasta} · se renueva sola`, aviso: false };
  if (t.noRenovar) return { texto: `${hasta} · no se renueva`, aviso: false };
  const dias = diasHastaFin(hoy, t.ultimaFecha);
  if (dias <= 0) return { texto: `${hasta} · termina hoy`, aviso: true };
  if (dias <= 30) return { texto: `${hasta} · termina en ${dias} ${dias === 1 ? 'día' : 'días'}`, aviso: true };
  return { texto: hasta, aviso: false };
}

function Tarjeta({ t, p }: { t: TarjetaHorario; p: VistaHorarioProps }) {
  const nombre = nombreSerie(t, p.nombreTipo, p.nombreSala);
  const activas = t.plazasFijas.filter(x => !x.enPausa);
  const enPausa = t.plazasFijas.length - activas.length;
  const fin = textoFin(t, p.hoy);
  const instructora = p.nombreInstructora(t.instructorId);
  const nombres = t.plazasFijas.map(x => p.nombreClienta(x.socioId));

  return (
    <li data-testid="tarjeta-horario" aria-label={nombre}
      className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
      {/* Ver la próxima clase va arriba, como icono: con tres botones abajo, en
          una tarjeta estrecha el tercero caía solo a otra fila (visto en
          producción). Toda tarjeta de esta vista se repite: el ↻ sobraba. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <span className="tabular-nums">{t.hora}</span>
            <span className="truncate">{p.nombreTipo(t.tipoClaseId) ?? 'Clase'}</span>
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {p.nombreSala(t.salaId) ?? 'Sala'} · {instructora ?? 'Sin instructora'} · aforo {t.aforo}
          </p>
        </div>
        <button type="button" onClick={() => p.onVerClase(t)} aria-label={`Ver la próxima clase de ${nombre}`} title="Ver la próxima clase"
          className="shrink-0 -mr-1.5 -mt-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <CalendarDays size={15} />
        </button>
      </div>

      <div>
        {/* Los huecos libres en `muted-foreground/25`: en `bg-muted` (#F5F5F1
            sobre blanco) no se veían, y la fila parecía vacía. */}
        <div className="flex items-center gap-1" aria-hidden>
          {Array.from({ length: Math.min(t.aforo, PUNTOS_MAX) }, (_, i) => (
            <span key={i} className={cn('size-2 rounded-full', i < activas.length ? 'bg-primary' : 'bg-muted-foreground/25')} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-foreground">
          {activas.length}/{t.aforo} plazas fijas{enPausa > 0 ? ` · ${enPausa} en pausa` : ''}
        </p>
        {nombres.length > 0 && (
          <p className="text-xs text-muted-foreground truncate">
            {nombres.slice(0, NOMBRES_VISIBLES).join(', ')}{nombres.length > NOMBRES_VISIBLES ? ` y ${nombres.length - NOMBRES_VISIBLES} más` : ''}
          </p>
        )}
      </div>

      <p className={cn('text-xs', fin.aviso ? 'font-medium text-warning' : 'text-muted-foreground')}>
        {fin.aviso && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" aria-hidden />}
        {fin.texto}
      </p>

      {(p.puedeRenovar || p.puedeAsignarPlaza) && (
        <div className="flex flex-wrap gap-1.5">
          {p.puedeRenovar && (
            <button type="button" onClick={() => p.onRenovar(t)} aria-label={`Renovar ${nombre}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
              <RefreshCw size={12} />Renovar
            </button>
          )}
          {p.puedeAsignarPlaza && (
            <button type="button" onClick={() => p.onAnadirPlaza(t)} aria-label={`Añadir plaza fija en ${nombre}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
              <Plus size={12} />Plaza fija
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function VistaHorario(p: VistaHorarioProps) {
  if (!p.horario) {
    return p.error ? (
      <div role="alert" className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm font-semibold text-foreground">No se ha podido cargar el horario</p>
        <p className="mt-1 text-xs text-muted-foreground">{p.error}</p>
        <button type="button" onClick={p.onReintentar}
          className="mt-3 px-4 py-2 rounded-lg text-xs font-bold text-primary-foreground bg-primary hover:brightness-95">
          Reintentar
        </button>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground p-6" role="status">Cargando el horario…</p>
    );
  }

  const { dias, huerfanas } = p.horario;
  const tarjetas = dias.flatMap(d => d.tarjetas);
  const nFijas = tarjetas.reduce((n, t) => n + t.plazasFijas.length, 0);
  const nPronto = tarjetas.filter(t => !t.renovacionAutomatica && !t.noRenovar && diasHastaFin(p.hoy, t.ultimaFecha) <= 30).length;

  return (
    <div className="h-full overflow-y-auto" data-testid="vista-horario">
      {tarjetas.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground" data-testid="resumen-horario">
          {tarjetas.length === 1 ? '1 clase que se repite' : `${tarjetas.length} clases que se repiten`}
          {' · '}{nFijas === 1 ? '1 plaza fija' : `${nFijas} plazas fijas`}
          {nPronto > 0 && (
            <span className="font-medium text-warning">
              {' · '}{nPronto === 1 ? '1 termina en menos de un mes' : `${nPronto} terminan en menos de un mes`}
            </span>
          )}
        </p>
      )}
      {dias.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">Todavía no hay clases que se repitan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Una clase recurrente aparece aquí con su horario, hasta cuándo va y quién viene fija.
          </p>
          {p.onCrearRecurrente && (
            <button type="button" onClick={p.onCrearRecurrente}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-primary-foreground bg-primary hover:brightness-95">
              <RefreshCw size={13} />Crear clase recurrente
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
          {dias.map(d => (
            <section key={d.diaSemana} aria-label={DIAS[d.diaSemana]}>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{DIAS[d.diaSemana]}</h3>
              <ul className="flex flex-col gap-2">
                {d.tarjetas.map(t => <Tarjeta key={`${t.serieId}-${t.diaSemana}`} t={t} p={p} />)}
              </ul>
            </section>
          ))}
        </div>
      )}

      {huerfanas.length > 0 && (
        <div className="mt-5 rounded-xl border border-warning/40 bg-warning/5 p-3" data-testid="plazas-sin-clase">
          <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
            <AlertTriangle size={13} aria-hidden />
            {huerfanas.length === 1 ? 'Una plaza fija se ha quedado sin clase' : `${huerfanas.length} plazas fijas se han quedado sin clase`}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {huerfanas.map(pf => (
              <li key={pf.id} className="text-xs text-foreground">
                {DIAS[pf.diaSemana]} {pf.horaInicio.slice(0, 5)} · {p.nombreSala(pf.salaId) ?? 'Sala'} ·{' '}
                <Link href={`/clientas/${pf.socioId}`} className="underline underline-offset-2 hover:text-primary">
                  {p.nombreClienta(pf.socioId)}
                </Link>
                <span className="text-muted-foreground"> — cámbiala a la clase nueva desde su ficha</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
