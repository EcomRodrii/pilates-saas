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
import type { ElementType } from 'react';
import { AlertTriangle, CalendarDays, Info, MapPin, Pin, Plus, RefreshCw, Repeat, UserRound, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { diasHastaFin, fechaDMY, nombreSerie } from '@/lib/series-renovacion';
import type { HorarioFijo, TarjetaHorario } from '@/lib/horario-fijo';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { useStudio } from '@/lib/studio-context';
import { PantallaVacia, TONOS } from '@/components/dashboard/vivo';
import { BOTON_BORDE } from '@/components/dashboard/vivo-seccion';

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
  /**
   * Si las alumnas pueden pedir su plaza fija desde la app (ajuste del estudio,
   * apagado de serie). `undefined` = no se sabe todavía: no se dice nada.
   */
  alumnasPidenPlaza?: boolean;
  /** El estudio aprueba solo las plazas fijas que cumplen sus reglas (`plazaFijaAprobacion = 'AUTOMATICA'`): cambia lo que se dice de quién decide. */
  plazasSeApruebanSolas?: boolean;
  /** A dónde lleva «Dejar que la pidan ellas»; `null` si quien mira no puede abrir ese ajuste. */
  hrefAjustePeticiones?: string | null;
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
          <p className="text-sm font-semibold text-foreground flex items-baseline gap-1.5">
            <span className="tabular-nums">{t.hora}</span>
            <span className="min-w-0 line-clamp-2 break-words" title={p.nombreTipo(t.tipoClaseId) ?? 'Clase'}>{p.nombreTipo(t.tipoClaseId) ?? 'Clase'}</span>
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
          {activas.length}/{t.aforo} con clase fija{enPausa > 0 ? ` · ${enPausa} en pausa` : ''}
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
            <button type="button" onClick={() => p.onAnadirPlaza(t)} aria-label={`Añadir clase fija en ${nombre}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
              <Plus size={12} />Clase fija
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function VistaHorario(p: VistaHorarioProps) {
  const panelNuevo = usePanelNuevo();
  if (panelNuevo && p.horario) return <VistaHorarioNueva {...p} horario={p.horario} />;
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
          {' · '}{nFijas === 1 ? '1 clase fija' : `${nFijas} clases fijas`}
          {nPronto > 0 && (
            <span className="font-medium text-warning">
              {' · '}{nPronto === 1 ? '1 termina en menos de un mes' : `${nPronto} terminan en menos de un mes`}
            </span>
          )}
        </p>
      )}
      {tarjetas.length > 0 && p.alumnasPidenPlaza !== undefined && (
        <p className="mb-3 text-xs text-muted-foreground text-pretty" data-testid="aviso-peticiones-plaza-fija">
          {p.alumnasPidenPlaza ? (
            p.plazasSeApruebanSolas
              ? <>Tus alumnas pueden pedir su clase fija desde la app; se da sola si cumple tus reglas, y la que no las cumple la decides en Resumen.</>
              : <>Tus alumnas pueden pedir su clase fija desde la app; lo decides en Resumen.</>
          ) : (
            <>
              Tus alumnas no pueden pedir su clase fija desde la app: se la das tú, aquí o en su ficha.
              {p.hrefAjustePeticiones && (
                <>{' '}<Link href={p.hrefAjustePeticiones} className="font-medium underline underline-offset-2 hover:text-primary">Dejar que la pidan ellas</Link></>
              )}
            </>
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
            {huerfanas.length === 1 ? 'Una clase fija apunta a un horario que ya no existe' : `${huerfanas.length} clases fijas apuntan a un horario que ya no existe`}
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

// ─────────────────────────────────────────────────────────────────────────────
// Con el panel nuevo (15-oct-2026): el Horario «Por clase» al nivel del resto del
// panel. En septiembre el fundador lo vio «horrible» (puntos de aforo invisibles,
// tarjetas grises iguales). Ahora:
//   · arriba, las tres cifras en chapas de color (clases que se repiten, clases
//     fijas y las que terminan en menos de un mes, esta en ámbar);
//   · cada día con su cabecera (el día y cuántas clases tiene);
//   · cada clase con el color de su tipo en el borde, como los bloques del
//     Calendario; la hora grande; los puntos de aforo con contorno (llenos los
//     que tienen clase fija, rayados los que están en pausa, huecos los libres);
//   · «termina en N días» en una chapa ámbar que se ve desde lejos, y «se renueva
//     sola» en verde.
// Los textos, los nombres accesibles y los botones son los de siempre: mismas
// acciones, mismo diálogo. Sin el panel nuevo, `VistaHorario` de arriba, igual.
// ─────────────────────────────────────────────────────────────────────────────

const CHAPA = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold';

function Chapa({ Icono, texto, color }: { Icono: ElementType; texto: string; color: string }) {
  return (
    <span className={CHAPA} style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, var(--card))` }}>
      <Icono size={13} aria-hidden />{texto}
    </span>
  );
}

function PuntosAforo({ aforo, fijas, enPausa }: { aforo: number; fijas: number; enPausa: number }) {
  const n = Math.min(aforo, PUNTOS_MAX);
  return (
    <div className="flex flex-wrap items-center gap-1" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const llena = i < fijas;
        const pausa = !llena && i < fijas + enPausa;
        return (
          <span
            key={i}
            className="size-2.5 rounded-full border-[1.5px]"
            style={llena
              ? { backgroundColor: 'var(--foreground)', borderColor: 'var(--foreground)' }
              : pausa
                ? { borderColor: 'var(--warning)', backgroundImage: 'repeating-linear-gradient(45deg, var(--warning) 0 1.5px, transparent 1.5px 3px)' }
                : { borderColor: 'color-mix(in srgb, var(--muted-foreground) 55%, transparent)' }}
          />
        );
      })}
      {aforo > PUNTOS_MAX && <span className="ml-0.5 text-[11px] text-muted-foreground">+{aforo - PUNTOS_MAX}</span>}
    </div>
  );
}

function TarjetaNueva({ t, p, color }: { t: TarjetaHorario; p: VistaHorarioProps; color: string }) {
  const nombre = nombreSerie(t, p.nombreTipo, p.nombreSala);
  const activas = t.plazasFijas.filter(x => !x.enPausa);
  const enPausa = t.plazasFijas.length - activas.length;
  const fin = textoFin(t, p.hoy);
  const instructora = p.nombreInstructora(t.instructorId);
  const nombres = t.plazasFijas.map(x => p.nombreClienta(x.socioId));
  const tipo = p.nombreTipo(t.tipoClaseId) ?? 'Clase';

  return (
    <li data-testid="tarjeta-horario" aria-label={nombre}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-t-card"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-[17px] font-bold tabular-nums leading-none text-foreground">{t.hora}</span>
            <span className="min-w-0 line-clamp-2 break-words text-[14px] font-semibold text-foreground" title={tipo}>{tipo}</span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden />{p.nombreSala(t.salaId) ?? 'Sala'}</span>
            <span className="inline-flex items-center gap-1"><UserRound size={12} aria-hidden />{instructora ?? 'Sin instructora'}</span>
            <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden />aforo {t.aforo}</span>
          </p>
        </div>
        <button type="button" onClick={() => p.onVerClase(t)} aria-label={`Ver la próxima clase de ${nombre}`} title="Ver la próxima clase"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <CalendarDays size={16} />
        </button>
      </div>

      <div className="rounded-xl bg-muted/50 px-3 py-2.5">
        <PuntosAforo aforo={t.aforo} fijas={activas.length} enPausa={enPausa} />
        <p className="mt-2 text-[12.5px] font-semibold text-foreground">
          {activas.length}/{t.aforo} con clase fija{enPausa > 0 ? ` · ${enPausa} en pausa` : ''}
        </p>
        {nombres.length > 0 && (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {nombres.slice(0, NOMBRES_VISIBLES).join(', ')}{nombres.length > NOMBRES_VISIBLES ? ` y ${nombres.length - NOMBRES_VISIBLES} más` : ''}
          </p>
        )}
      </div>

      <div>
        {fin.aviso
          ? <Chapa Icono={AlertTriangle} texto={fin.texto} color="var(--warning)" />
          : t.renovacionAutomatica
            ? <Chapa Icono={RefreshCw} texto={fin.texto} color="var(--success)" />
            : <p className="text-[12px] text-muted-foreground">{fin.texto}</p>}
      </div>

      {(p.puedeRenovar || p.puedeAsignarPlaza) && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {p.puedeRenovar && (
            <button type="button" onClick={() => p.onRenovar(t)} aria-label={`Renovar ${nombre}`} className={cn(BOTON_BORDE, 'h-8 px-3 text-[12.5px]')}>
              <RefreshCw size={13} aria-hidden />Renovar
            </button>
          )}
          {p.puedeAsignarPlaza && (
            <button type="button" onClick={() => p.onAnadirPlaza(t)} aria-label={`Añadir clase fija en ${nombre}`} className={cn(BOTON_BORDE, 'h-8 px-3 text-[12.5px]')}>
              <Plus size={13} aria-hidden />Clase fija
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function VistaHorarioNueva(p: VistaHorarioProps & { horario: HorarioFijo }) {
  const { tiposClase } = useStudio();
  const colorDe = (id: string) => tiposClase.find(t => t.id === id)?.color || TONOS.azul;
  const { dias, huerfanas } = p.horario;
  const tarjetas = dias.flatMap(d => d.tarjetas);
  const nFijas = tarjetas.reduce((n, t) => n + t.plazasFijas.length, 0);
  const nPronto = tarjetas.filter(t => !t.renovacionAutomatica && !t.noRenovar && diasHastaFin(p.hoy, t.ultimaFecha) <= 30).length;

  return (
    <div className="h-full space-y-4 overflow-y-auto" data-testid="vista-horario">
      {tarjetas.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="resumen-horario">
          <Chapa Icono={Repeat} texto={tarjetas.length === 1 ? '1 clase que se repite' : `${tarjetas.length} clases que se repiten`} color={TONOS.azul} />
          <Chapa Icono={Pin} texto={nFijas === 1 ? '1 clase fija' : `${nFijas} clases fijas`} color={TONOS.magenta} />
          {nPronto > 0 && (
            <Chapa Icono={AlertTriangle} texto={nPronto === 1 ? '1 termina en menos de un mes' : `${nPronto} terminan en menos de un mes`} color="var(--warning)" />
          )}
        </div>
      )}
      {tarjetas.length > 0 && p.alumnasPidenPlaza !== undefined && (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[12.5px] text-muted-foreground text-pretty" data-testid="aviso-peticiones-plaza-fija">
          <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--t-text-link)' }} aria-hidden />
          <span>
            {p.alumnasPidenPlaza ? (
              p.plazasSeApruebanSolas
                ? <>Tus alumnas pueden pedir su clase fija desde la app; se da sola si cumple tus reglas, y la que no las cumple la decides en Resumen.</>
                : <>Tus alumnas pueden pedir su clase fija desde la app; lo decides en Resumen.</>
            ) : (
              <>
                Tus alumnas no pueden pedir su clase fija desde la app: se la das tú, aquí o en su ficha.
                {p.hrefAjustePeticiones && (
                  <>{' '}<Link href={p.hrefAjustePeticiones} className="font-semibold underline underline-offset-2" style={{ color: 'var(--t-text-link)' }}>Dejar que la pidan ellas</Link></>
                )}
              </>
            )}
          </span>
        </p>
      )}

      {dias.length === 0 ? (
        <PantallaVacia
          tono="azul"
          Icono={Repeat}
          titulo="Tu semana, siempre igual"
          texto="Una clase recurrente sale aquí con su horario, hasta cuándo va y quién viene fija."
          ejemplos={[
            { accion: 'Una clase cada semana', cuando: 'el mismo día, a la misma hora y en la misma sala' },
            { accion: 'Sus alumnas fijas', cuando: 'con su sitio guardado cada semana' },
            { accion: 'Hasta cuándo va', cuando: 'y si se renueva sola al acabar' },
          ]}
          accion={p.onCrearRecurrente ? { label: 'Crear clase recurrente', onClick: p.onCrearRecurrente, Icono: RefreshCw } : undefined}
        />
      ) : (
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {dias.map(d => (
            <section key={d.diaSemana} aria-label={DIAS[d.diaSemana]}>
              <div className="mb-2.5 flex items-baseline justify-between gap-2 border-b border-border pb-2">
                <h3 className="text-[15px] font-bold text-foreground">{DIAS[d.diaSemana]}</h3>
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {d.tarjetas.length === 1 ? '1 clase' : `${d.tarjetas.length} clases`}
                </span>
              </div>
              <ul className="flex flex-col gap-3">
                {d.tarjetas.map(t => <TarjetaNueva key={`${t.serieId}-${t.diaSemana}`} t={t} p={p} color={colorDe(t.tipoClaseId)} />)}
              </ul>
            </section>
          ))}
        </div>
      )}

      {huerfanas.length > 0 && (
        <div className="rounded-2xl border p-4" data-testid="plazas-sin-clase"
          style={{ borderColor: 'color-mix(in srgb, var(--warning) 35%, var(--border))', backgroundColor: 'color-mix(in srgb, var(--warning) 7%, var(--card))' }}>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--warning)' }}>
            <AlertTriangle size={14} aria-hidden />
            {huerfanas.length === 1 ? 'Una clase fija apunta a un horario que ya no existe' : `${huerfanas.length} clases fijas apuntan a un horario que ya no existe`}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {huerfanas.map(pf => (
              <li key={pf.id} className="text-[12.5px] text-foreground">
                {DIAS[pf.diaSemana]} {pf.horaInicio.slice(0, 5)} · {p.nombreSala(pf.salaId) ?? 'Sala'} ·{' '}
                <Link href={`/clientas/${pf.socioId}`} className="font-semibold underline underline-offset-2">
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
