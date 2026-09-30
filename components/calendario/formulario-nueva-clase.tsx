'use client';

// «Nueva clase» del calendario, con su propio estado.
//
// Vivía dentro de la página del calendario (4.300 líneas): cada tecla en el
// formulario volvía a pintar la rejilla entera. Aquí el estado es local y la
// página solo se entera al crear.
//
// Lo que hace distinto del formulario de antes (rediseño aprobado, fase 1):
//  · La hora de fin sale de la duración del tipo HASTA que se toca a mano; cambiar
//    la de inicio ya no pisa la que se escribió.
//  · Avisa, sin impedir, si cae fuera del horario del estudio ese día, en un día
//    cerrado o en un cierre del centro.
//  · El texto de las plazas dice lo que pasa de verdad al llenarse (con o sin
//    lista de espera), resuelto como al reservar.
//  · «Se repite» con días de la semana y «hasta el…», los solapes mirados en TODAS
//    las fechas: crea las que no chocan y dice cuáles se salta.
//  · «Cómo se reserva esta clase»: las reglas del tipo elegido.
//
// Lo que NO cambia: se crea con los mismos `addSesion`/`addSesionesSerie` del
// contexto (escriben primero y pintan solo lo que la base de datos aceptó), y una
// clase que se repite es UNA serie —el mismo modelo que «Nueva clase fija», que ya
// crea series de varios días—, así que «esta y las siguientes» sigue igual.

import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, ChevronDown, Info, Repeat, X } from 'lucide-react';
import { Interruptor } from '@/components/ui/interruptor';
import { Badge } from '@/components/ui/badge';
import { AvisoAforoSala, DIA_PILLS, DiaPill, FormField, inputCls, selectCls } from '@/components/calendario/campos-clase';
import { aforoPorDefectoDeSesion } from '@/lib/aforo-logic';
import { ausenciaEnFecha, sufijoAusencia } from '@/lib/ausencias';
import { faltaParaCrearClase } from '@/lib/calendario/falta-para-crear-clase';
import {
  MAX_DIAS_REPETICION, avisoHorario, cierreDeFecha, fechaCorta, fechasDeRepeticion, finConDuracion, fraseAlLlenarse,
  instantesDe, minutosEntre, motivoSalto, planDeFechas, planesQueLaIncluyen, textoDuracion, tituloSaltos,
} from '@/lib/calendario/nueva-clase';
import { diaSemanaLocal, esHoraHHMM } from '@/lib/citas/slots';
import { TARJETAS_REGLAS, queCambiaElTipo, reglasGuardadas } from '@/lib/configuracion/reglas-reserva';
import { instante, lineaDeTiempoReserva, reglasEfectivasDeTipo } from '@/lib/configuracion/linea-de-tiempo-reserva';
import { puedeAbrirEnConfiguracion } from '@/lib/configuracion/destino';
import { queImparten } from '@/lib/equipo';
import { cn, horaEstudio, masDias } from '@/lib/utils';
import type { AusenciaInstructora } from '@/lib/api-client';
import type { CierreGuardado } from '@/lib/cierres/quitar-cierre';
import type { SlotSesion } from '@/lib/calendar-logic';
import type { Instructor, PlanTarifa, Sala, Sesion, Studio, TipoClase } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';

export interface InicialNuevaClase {
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  aforoMaximo: number;
  notas: string;
}

export type SlotConTipo = SlotSesion & { id: string; tipoClaseId?: string | null };

export type SesionNueva = Omit<Sesion, 'id' | 'studioId'>;

/** Dónde se cambian las reglas de un tipo de clase. */
const HREF_TIPOS_DE_CLASE = '/configuracion?tab=clases&abrir=tipos-de-clase';
/** Cuántas fechas saltadas se enumeran antes de resumir. */
const SALTADAS_VISIBLES = 5;
/** Una clase que se repite arranca con cuatro semanas, como el «Repetir» de antes. */
const DIAS_POR_DEFECTO = 27;

// 'YYYY-MM-DD' a mediodía: `ausenciaEnFecha` lo lee con la zona del navegador, y
// a medianoche UTC un navegador al oeste de Madrid lo dejaba en el día anterior.
const mediodia = (fecha: string) => `${fecha}T12:00:00`;

export function FormularioNuevaClase({
  inicial, tiposClase, salas, instructores, ausencias, existentes, studio, planes, cierres, rol, esInstructora,
  onCrear, onCerrar,
}: {
  inicial: InicialNuevaClase;
  tiposClase: TipoClase[];
  salas: Sala[];
  /** Todo el equipo: aquí se escoge quién imparte, como en el formulario de antes. */
  instructores: Instructor[];
  ausencias: AusenciaInstructora[];
  /** Todas las clases del estudio, para ver solapes en cualquier fecha. */
  existentes: SlotConTipo[];
  studio: Studio | null;
  planes: PlanTarifa[];
  cierres: CierreGuardado[];
  rol: string;
  /** Una instructora crea SU clase: sin elegir instructora, con las plazas fijadas y sin repetir. */
  esInstructora: boolean;
  onCrear: (sesiones: SesionNueva[], saltadas: string[]) => Promise<ResultadoEscritura>;
  onCerrar: () => void;
}) {
  const uid = useId();
  const ids = { duracion: `${uid}-duracion`, plazas: `${uid}-plazas`, alLlenarse: `${uid}-al-llenarse`, hasta: `${uid}-hasta` };
  const duracionDe = (id: string) => tiposClase.find(t => t.id === id)?.duracionMinutos ?? null;

  const [form, setForm] = useState(() => ({
    ...inicial,
    aforoTocado: false,
    // Si llega con otra duración (duplicar una clase de 50 min de un tipo de
    // 55), esa hora de fin ya es una decisión: no se recalcula.
    finTocado: finConDuracion(inicial.horaInicio, duracionDe(inicial.tipoClaseId)) !== inicial.horaFin,
  }));
  const [repetir, setRepetir] = useState(false);
  const [dias, setDias] = useState<number[]>(() => [diaSemanaLocal(inicial.fecha)]);
  const [hasta, setHasta] = useState(() => masDias(inicial.fecha, DIAS_POR_DEFECTO));
  const [hastaTocado, setHastaTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Corta el doble toque antes de que React repinte el botón apagado.
  const guardandoRef = useRef(false);

  const tipo = tiposClase.find(t => t.id === form.tipoClaseId) ?? null;
  const sala = salas.find(s => s.id === form.salaId) ?? null;

  const activas = useMemo(() => queImparten(instructores), [instructores]);
  const actual = instructores.find(i => i.id === form.instructorId);
  const opcionesInstructora = actual && !actual.activo ? [actual, ...activas] : activas;

  // ── Campos que se arrastran entre sí ──────────────────────────────────────
  function cambiarTipo(tipoClaseId: string) {
    const tc = tiposClase.find(x => x.id === tipoClaseId);
    setForm(f => ({
      ...f,
      tipoClaseId,
      horaFin: f.finTocado ? f.horaFin : (finConDuracion(f.horaInicio, tc?.duracionMinutos) ?? f.horaFin),
      aforoMaximo: f.aforoTocado
        ? f.aforoMaximo
        : aforoPorDefectoDeSesion(tc?.aforoPorDefecto, salas.find(x => x.id === f.salaId)?.capacidad, f.aforoMaximo),
    }));
  }

  function cambiarSala(salaId: string) {
    const cap = salas.find(x => x.id === salaId)?.capacidad;
    setForm(f => ({
      ...f,
      salaId,
      aforoMaximo: f.aforoTocado
        ? f.aforoMaximo
        : aforoPorDefectoDeSesion(tiposClase.find(x => x.id === f.tipoClaseId)?.aforoPorDefecto, cap, f.aforoMaximo),
    }));
  }

  function cambiarInicio(horaInicio: string) {
    setForm(f => ({
      ...f,
      horaInicio,
      // La de fin escrita a mano se respeta: solo se recalcula la automática.
      horaFin: f.finTocado ? f.horaFin : (finConDuracion(horaInicio, duracionDe(f.tipoClaseId)) ?? f.horaFin),
    }));
  }

  function volverAFinAutomatico() {
    setForm(f => ({ ...f, finTocado: false, horaFin: finConDuracion(f.horaInicio, duracionDe(f.tipoClaseId)) ?? f.horaFin }));
  }

  function cambiarFecha(fecha: string) {
    const antes = form.fecha;
    setForm(f => ({ ...f, fecha }));
    if (!fecha) return;
    // Si solo estaba marcado el día de la fecha de antes, se mueve con ella.
    if (antes && dias.length === 1 && dias[0] === diaSemanaLocal(antes)) setDias([diaSemanaLocal(fecha)]);
    if (!hastaTocado) setHasta(masDias(fecha, DIAS_POR_DEFECTO));
  }

  function alternarDia(dia: number) {
    setDias(d => (d.includes(dia) ? d.filter(x => x !== dia) : [...d, dia]));
  }

  // ── Derivados ─────────────────────────────────────────────────────────────
  const { fecha, horaInicio, horaFin, salaId, instructorId, tipoClaseId, aforoMaximo } = form;
  const horaVacia = !horaInicio || !horaFin;
  const duracion = minutosEntre(horaInicio, horaFin);
  const horaInvalida = !horaVacia && duracion == null;
  const duracionTipo = tipo?.duracionMinutos ?? null;

  const puedeRepetir = !esInstructora;
  const repite = puedeRepetir && repetir;
  const hastaMaximo = fecha ? masDias(fecha, MAX_DIAS_REPETICION) : '';
  const problemaRepeticion = !repite ? null
    : dias.length === 0 ? 'Elige al menos un día.'
    : !hasta || hasta < fecha ? 'La fecha final tiene que ser la de la primera clase o posterior.'
    : hasta > hastaMaximo ? 'Como mucho, hasta un año después de la primera clase.'
    : null;

  const clavesDias = [...dias].sort().join(',');
  const fechas = useMemo(
    () => (!fecha ? [] : repite ? fechasDeRepeticion(fecha, hasta, clavesDias.split(',').filter(Boolean).map(Number)) : [fecha]),
    [fecha, repite, hasta, clavesDias],
  );

  const plan = useMemo(
    () => planDeFechas({ fechas, horaInicio, horaFin, salaId, instructorId, existentes, cierres, saltarCierres: repite }),
    [fechas, horaInicio, horaFin, salaId, instructorId, existentes, cierres, repite],
  );

  const faltaConfigurar = faltaParaCrearClase({
    tipoClaseId, salaId, instructorId,
    hayTipos: tiposClase.length > 0, haySalas: salas.length > 0, hayInstructoras: instructores.length > 0,
    exigeInstructora: true,
  });

  // Una sola clase que choca BLOQUEA (la base de datos la rechazaría igual:
  // sesiones_sala_sin_solape, sesiones_instructor_sin_solape). Con repetición, se
  // salta esa fecha y se crean las demás.
  const choqueUnico = !repite && !horaVacia && !horaInvalida ? plan.saltadas[0] ?? null : null;
  const aCrear = plan.crear.length;

  const nombreSala = (id: string) => salas.find(s => s.id === id)?.nombre ?? 'La sala';
  const nombreInstructora = (id: string) => instructores.find(i => i.id === id)?.nombre ?? 'La instructora';
  const nombreClase = (s: SlotConTipo) => (s.tipoClaseId ? tiposClase.find(t => t.id === s.tipoClaseId)?.nombre : null);
  const nombres = { sala: nombreSala, instructora: nombreInstructora, clase: nombreClase };

  // Horario del estudio: un aviso por cada día de la semana en que cae fuera.
  const horario = { semana: studio?.horarioSemana, apertura: studio?.horaApertura, cierre: studio?.horaCierre };
  const diasConClase = [...new Set((repite ? plan.crear.map(x => x.fecha) : fecha ? [fecha] : []).map(diaSemanaLocal))];
  const avisosHorario = horaVacia || horaInvalida ? [] : diasConClase
    .map(d => avisoHorario(d, horaInicio, horaFin, horario))
    .filter((x): x is string => !!x);
  const cierreUnico = !repite && fecha ? cierreDeFecha(fecha, cierres) : null;

  const ausenteEn = instructorId
    ? (repite ? plan.crear.map(x => x.fecha) : fecha ? [fecha] : [])
        .map(f => ({ f, a: ausenciaEnFecha(ausencias, instructorId, mediodia(f)) }))
        .filter(x => x.a)
    : [];

  // «Cómo se reserva esta clase»: las reglas del tipo resueltas como al reservar
  // (`reglasEfectivasDeTipo`, con los planes: sin nada a la venta no se exige
  // plan) y contadas sobre la primera clase que se va a crear, con la misma línea
  // de tiempo que «Así lo vive tu alumna» en Configuración.
  const reglasEstudio = reglasGuardadas(studio);
  const reglasDeLaClase = reglasEfectivasDeTipo(reglasEstudio, tipo, planes);
  const inicioPrimera = plan.crear[0]?.inicio
    ?? (fecha && esHoraHHMM(horaInicio) ? instantesDe(fecha, horaInicio, horaInicio).inicio : null);
  const pasosReserva = inicioPrimera ? lineaDeTiempoReserva(reglasDeLaClase, new Date(inicioPrimera)) : [];
  const incluyen = reglasDeLaClase.reservaExigirPlan ? planesQueLaIncluyen(planes, tipo?.id) : [];
  const propias = !!tipo && TARJETAS_REGLAS.some(id => queCambiaElTipo(id, tipo, reglasEstudio) != null);
  const alLlenarse = fraseAlLlenarse(studio, tipo);
  const hrefTipos = puedeAbrirEnConfiguracion(rol, HREF_TIPOS_DE_CLASE) ? HREF_TIPOS_DE_CLASE : null;

  const origenPlazas = form.aforoTocado ? 'a mano'
    : tipo?.aforoPorDefecto != null ? 'las del tipo de clase'
    : 'las de la sala';

  // Un campo de número vacío da 0: una clase sin plazas no se puede reservar.
  const plazasInvalidas = !(aforoMaximo >= 1);

  const bloqueado = !!faltaConfigurar || horaVacia || horaInvalida || !!choqueUnico || plazasInvalidas
    || (repite && (!!problemaRepeticion || aCrear === 0)) || guardando;

  async function crear() {
    if (bloqueado || guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    setError(null);
    const sesiones: SesionNueva[] = plan.crear.map(x => ({
      tipoClaseId, salaId, instructorId,
      inicio: x.inicio, fin: x.fin,
      aforoMaximo,
      cancelada: false,
      notas: form.notas || null,
      precioPuntual: null,
    }));
    const res = await onCrear(sesiones, plan.saltadas.map(s => fechaCorta(s.fecha)));
    guardandoRef.current = false;
    setGuardando(false);
    if (!res.ok) setError(res.error);
  }

  const textoBoton = guardando ? 'Guardando…'
    : !repite ? 'Crear clase'
    : aCrear > 0 ? `Crear ${aCrear} ${aCrear === 1 ? 'clase' : 'clases'}`
    : 'Crear clases';

  const avisoCaja = 'rounded-xl px-3.5 py-2.5 text-xs flex gap-2';

  return (
    <>
      <div className="px-6 py-5 flex items-center justify-between border-b border-border shrink-0">
        <h2 className="text-lg font-extrabold text-foreground tracking-tight">Nueva clase</h2>
        <button onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-border transition-colors">
          <X size={16} className="text-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <FormField label="Tipo de clase">
          <select className={selectCls} value={tipoClaseId} onChange={e => cambiarTipo(e.target.value)}>
            {!tipoClaseId && (
              <option value="">{tiposClase.length ? 'Elige un tipo de clase' : 'Todavía no tienes tipos de clase'}</option>
            )}
            {tiposClase.map(t => (
              <option key={t.id} value={t.id}>
                {[t.nombre, t.duracionMinutos ? `${t.duracionMinutos} min` : null, t.aforoPorDefecto != null ? `${t.aforoPorDefecto} plazas` : null]
                  .filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </FormField>

        <div className={cn('grid gap-4', !esInstructora && 'grid-cols-1 sm:grid-cols-2')}>
          <FormField label="Sala">
            <select className={selectCls} value={salaId} onChange={e => cambiarSala(e.target.value)}>
              {!salaId && <option value="">{salas.length ? 'Elige una sala' : 'Todavía no tienes salas'}</option>}
              {salas.map(s => <option key={s.id} value={s.id}>{s.nombre} · {s.capacidad}</option>)}
            </select>
          </FormField>
          {/* Una instructora crea SU clase: no se le ofrece elegir (la RLS
              rechazaría el INSERT de una clase de otra). */}
          {!esInstructora && (
            <FormField label="Instructora">
              <select className={selectCls} value={instructorId} onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}>
                {!instructorId && (
                  <option value="">{opcionesInstructora.length ? 'Elige una instructora' : 'Todavía no tienes instructoras'}</option>
                )}
                {opcionesInstructora.map(i => {
                  const au = fecha ? ausenciaEnFecha(ausencias, i.id, mediodia(fecha)) : null;
                  return <option key={i.id} value={i.id}>{i.nombre}{i.activo ? '' : ' · ya no está en el equipo'}{sufijoAusencia(au)}</option>;
                })}
              </select>
            </FormField>
          )}
        </div>

        <FormField label="Fecha">
          <input type="date" className={inputCls} value={fecha} onChange={e => cambiarFecha(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Empieza">
            <input type="time" className={inputCls} value={horaInicio} onChange={e => cambiarInicio(e.target.value)} />
          </FormField>
          {/* La duración junto a la etiqueta y no dentro del campo (a 390 px la
              hora no cabía al lado), y fuera del flujo: con cualquier otra
              maqueta el campo quedaba a otra altura que «Empieza». */}
          <div className="relative">
            <FormField label="Termina">
              <input
                type="time"
                className={inputCls}
                value={horaFin}
                aria-describedby={duracion != null ? ids.duracion : undefined}
                onChange={e => setForm(f => ({ ...f, horaFin: e.target.value, finTocado: true }))}
              />
            </FormField>
            {duracion != null && (
              <span id={ids.duracion} data-testid="duracion-clase" className="absolute right-0 top-0 text-xs text-muted-foreground">
                ({textoDuracion(duracion)})
              </span>
            )}
          </div>
        </div>
        {form.finTocado && duracionTipo && duracion !== duracionTipo && !horaVacia && (
          <button type="button" onClick={volverAFinAutomatico} className="-mt-2 text-xs font-semibold text-foreground underline underline-offset-2">
            Volver a la duración del tipo ({textoDuracion(duracionTipo)})
          </button>
        )}

        {(avisosHorario.length > 0 || cierreUnico) && (
          <div data-testid="aviso-horario" className="flex items-start gap-2 rounded-xl bg-warning/15 px-3.5 py-2.5 text-xs text-foreground">
            <CalendarClock size={14} className="mt-0.5 shrink-0" aria-hidden />
            <p className="text-pretty">
              {cierreUnico && <>Ese día el centro está cerrado{cierreUnico.motivo ? ` (${cierreUnico.motivo})` : ''}: nadie podrá reservarla. </>}
              {avisosHorario.join(' ')}
              {' '}{repite ? 'Puedes crearlas igual.' : 'Puedes crearla igual.'}
            </p>
          </div>
        )}

        {ausenteEn.length > 0 && (
          <div className={cn(avisoCaja, 'bg-warning/10 border border-warning/30 text-foreground')}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" aria-hidden />
            <p>
              <span className="font-bold">{nombreInstructora(instructorId)}</span>
              {ausenteEn.length === 1
                ? `${sufijoAusencia(ausenteEn[0].a).replace(' · ', ' está ') || ' está ausente'}${repite ? ` el ${fechaCorta(ausenteEn[0].f)}` : ' ese día'}.`
                : ` está ausente en ${ausenteEn.length} de estas fechas (${ausenteEn.slice(0, 3).map(x => fechaCorta(x.f)).join(', ')}${ausenteEn.length > 3 ? '…' : ''}).`}
              {' '}Comprueba que sea una sustitución deliberada.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor={ids.plazas} className="text-xs font-bold text-foreground uppercase tracking-wider">Plazas</label>
          <div className="flex items-center gap-3">
            <input
              id={ids.plazas}
              type="number" min={1} max={300}
              className={cn(inputCls, 'w-24', esInstructora && 'opacity-60')}
              value={aforoMaximo}
              disabled={esInstructora}
              readOnly={esInstructora}
              aria-describedby={ids.alLlenarse}
              aria-invalid={plazasInvalidas || undefined}
              onChange={e => setForm(f => ({ ...f, aforoMaximo: Number(e.target.value), aforoTocado: true }))}
            />
            <span className="text-xs text-muted-foreground text-pretty">
              {origenPlazas}{sala ? ` · la sala tiene ${sala.capacidad}` : ''}
            </span>
          </div>
          {plazasInvalidas && <p role="alert" className="text-xs text-destructive">Pon al menos 1 plaza.</p>}
          <p id={ids.alLlenarse} data-testid="al-llenarse" className="text-xs leading-relaxed text-muted-foreground text-pretty">
            {alLlenarse}
          </p>
          <AvisoAforoSala salas={salas} salaId={salaId} aforo={aforoMaximo} />
        </div>

        {puedeRepetir && (
          <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Repeat size={15} aria-hidden />Se repite
              </span>
              <Interruptor on={repetir} onChange={setRepetir} ariaLabel="Se repite" />
            </div>

            {repite && (
              <>
                <div role="group" aria-label="Días de la semana" className="grid max-w-sm grid-cols-7 gap-1.5 pointer-fine:flex pointer-fine:items-center pointer-fine:gap-2">
                  {DIA_PILLS.map(({ label, nombre, day }) => (
                    <DiaPill key={day} label={label} nombre={nombre} active={dias.includes(day)} onClick={() => alternarDia(day)} />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                  <label htmlFor={ids.hasta}>Hasta el</label>
                  <input
                    id={ids.hasta}
                    type="date"
                    className={cn(inputCls, 'w-auto')}
                    value={hasta}
                    min={fecha || undefined}
                    max={hastaMaximo || undefined}
                    aria-invalid={!!problemaRepeticion}
                    onChange={e => { setHasta(e.target.value); setHastaTocado(true); }}
                  />
                  {!problemaRepeticion && (
                    <span data-testid="clases-repeticion" className="text-muted-foreground">
                      · {fechas.length} {fechas.length === 1 ? 'clase' : 'clases'}
                    </span>
                  )}
                </div>
                {problemaRepeticion && <p role="alert" className="text-xs text-destructive">{problemaRepeticion}</p>}

                {!problemaRepeticion && plan.saltadas.length > 0 && (
                  <div data-testid="fechas-saltadas" className="rounded-xl border border-warning/40 bg-card px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                      <AlertTriangle size={14} className="text-warning" aria-hidden />{tituloSaltos(plan.saltadas)}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {plan.saltadas.slice(0, SALTADAS_VISIBLES).map(s => <li key={s.fecha}>{motivoSalto(s, nombres)}</li>)}
                      {plan.saltadas.length > SALTADAS_VISIBLES && <li>y {plan.saltadas.length - SALTADAS_VISIBLES} más</li>}
                    </ul>
                    <p className={cn('mt-1.5 text-xs', aCrear === 0 ? 'text-destructive' : 'text-foreground')}>
                      {aCrear === 0
                        ? 'No queda ninguna fecha libre: cambia la hora, la sala o la instructora.'
                        : `Se ${aCrear === 1 ? 'creará la otra' : `crearán las otras ${aCrear}`} y te diremos cuáles se han saltado.`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tipo && (
          <details className="group rounded-xl border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2"><Info size={15} aria-hidden />Cómo se reserva esta clase</span>
              <span className="flex items-center gap-2">
                {propias && (
                  <Badge variant="outline" className="h-auto whitespace-normal text-left">Reglas propias de {tipo.nombre}</Badge>
                )}
                <ChevronDown size={15} aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="space-y-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {inicioPrimera && <p>Así lo vive tu alumna en la clase del {instante(new Date(inicioPrimera))}:</p>}
              <ol className="space-y-1.5">
                {pasosReserva.map(p => (
                  <li key={p.id} className="text-pretty">
                    <span className="block font-semibold text-foreground">
                      {p.que} <span className="font-normal text-muted-foreground">· {p.cuando}</span>
                    </span>
                    <span className="block">{p.detalle}</span>
                  </li>
                ))}
              </ol>
              {reglasDeLaClase.reservaExigirPlan && (
                <p className="text-pretty">
                  {incluyen.length > 0
                    ? `Bonos y planes que la incluyen: ${incluyen.slice(0, 3).join(', ')}${incluyen.length > 3 ? ` y ${incluyen.length - 3} más` : ''}.`
                    : 'Ninguno de los bonos y planes que vendes la incluye.'}
                </p>
              )}
              {hrefTipos && (
                <Link href={hrefTipos} className="inline-block pt-1 font-semibold text-foreground underline underline-offset-2">Cambiar en el tipo de clase</Link>
              )}
            </div>
          </details>
        )}

        <FormField label="Notas (opcional)">
          <textarea
            className={inputCls + ' resize-none h-20'}
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            placeholder="Indicaciones especiales, material necesario..."
          />
        </FormField>
      </div>

      {faltaConfigurar && (
        <div className="px-6 pb-1 shrink-0">
          <div className={cn(avisoCaja, 'bg-warning/10 border border-warning/30 text-amber-900')}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
            <div>
              <p>Para crear la clase falta {faltaConfigurar.faltan.join(', ')}.</p>
              {faltaConfigurar.porCrear.map(x => (
                <p key={x.href} className="mt-1" data-testid="falta-crear">
                  {x.texto}{' '}
                  <Link href={x.href} className="underline font-semibold">{x.enlace}</Link>{' '}
                  y vuelve aquí.
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
      {!faltaConfigurar && (horaVacia || horaInvalida) && (
        <div className="px-6 pb-1 shrink-0">
          <div className={cn(avisoCaja, 'bg-destructive/10 border border-destructive/30 text-destructive')}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-destructive" />
            <p>{horaVacia ? 'Elige la hora de inicio y la de fin.' : 'La hora de fin debe ser posterior a la hora de inicio.'}</p>
          </div>
        </div>
      )}
      {/* Conflicto de sala/instructora de UNA clase (I-1): bloquea, porque la base
          de datos la rechazaría igual. */}
      {choqueUnico && (
        <div className="px-6 pb-1 shrink-0">
          <div className={cn(avisoCaja, 'bg-destructive/10 border border-destructive/30 text-destructive')}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-destructive" />
            <div className="space-y-0.5">
              {choqueUnico.sala.length > 0 && (
                <p><span className="font-bold">{nombreSala(salaId)}</span> ya está ocupada: {choqueUnico.sala.map(c => `${horaEstudio(c.inicio)}–${horaEstudio(c.fin)}`).join(', ')}</p>
              )}
              {choqueUnico.instructor.length > 0 && (
                <p><span className="font-bold">{nombreInstructora(instructorId)}</span> ya tiene clase: {choqueUnico.instructor.map(c => `${horaEstudio(c.inicio)}–${horaEstudio(c.fin)}`).join(', ')}</p>
              )}
              <p>Cambia la hora, la sala o la instructora para poder guardar.</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 py-5 border-t border-border shrink-0">
        {error && (
          <p role="alert" className="mb-3 text-[13px] text-destructive">
            No se ha creado{repite && aCrear > 1 ? ' ninguna' : ''}. {error}
          </p>
        )}
        <div className="flex gap-3">
          <button onClick={onCerrar} disabled={guardando} className="flex-1 py-3 rounded-2xl text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={() => void crear()}
            disabled={bloqueado}
            className="flex-[2] py-3 rounded-2xl text-sm font-extrabold text-brand-foreground transition-opacity hover:opacity-90 bg-brand disabled:opacity-50 disabled:pointer-events-none"
          >
            {textoBoton}
          </button>
        </div>
      </div>
    </>
  );
}
