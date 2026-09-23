'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Clock } from 'lucide-react';
import { alFallarImagen, imagenDeClase, IMAGENES_CLASE } from '@/lib/imagenes-por-defecto';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { puedeVer } from '@/lib/permisos-reglas';
import { authHeader } from '@/lib/api-client';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { BarraPlazas } from './barra-plazas';
import { EVENTO_AGENDA } from '@/lib/agenda-panel';
import { claseEnCurso, construirAgendaDelDia, type ClaseDelDia, type SesionAgenda } from '@/lib/hoy-agenda';
import {
  cn, finDelDiaEstudio, horaEstudio, hoyEnEstudio, inicioDelDiaEstudio, masDias, tituloDia, TZ_ESTUDIO,
} from '@/lib/utils';
import type { Instructor, Reserva, Sala, Sesion } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// «Próximas clases» — qué se está dando AHORA y qué viene después.
//
// No es la agenda otra vez. «Hoy en el estudio» contesta «cómo está organizado
// el día» y se puede mover de día con sus flechas; esto contesta «qué pasa en
// este momento y qué es lo siguiente», y por eso no se mueve nunca del ahora y
// cruza de día solo: a las nueve de la noche, cuando el día ya está dado, lo
// siguiente es mañana — de ahí que cada tarjeta lleve su fecha.
//
// ── De dónde salen los datos ────────────────────────────────────────────────
// Del MISMO `GET /api/calendario` que la agenda (moldeado por rol y con
// `sustitucionAbierta` ya resuelto), solo que en otro rango: de hoy a siete
// días. Y se resume con el MISMO `construirAgendaDelDia`, así que el 6/6 de
// aquí no puede decir otra cosa que el de arriba. Lo único que hay que cuidar
// es que las dos vuelvan a pedir cuando algo cambia, y de eso se encarga
// `EVENTO_AGENDA` (ver `lib/agenda-panel.ts`).
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos días mira hacia delante. Siete cubre el fin de semana cerrado: un
 *  estudio que libra sábado y domingo tiene que ver el lunes desde el viernes. */
const DIAS_VISTA = 7;

/**
 * Cuántas tarjetas de «lo siguiente».
 *
 * DOS, y es lo único que impide que esta sección sea la agenda otra vez: la
 * lista de arriba ya tiene TODAS las clases del día, con sus acciones («Buscar
 * sustituta», «Rellenar hueco»). Con cuatro tarjetas, las cuatro eran fila por
 * fila las mismas cuatro de justo encima, y encima peor contadas —una decía
 * «Sin instructora» en rojo sin ofrecer salida mientras la de arriba sí—. Dos
 * es lo que promete el título: lo siguiente, no la tarde entera.
 */
const MAX_PROXIMAS = 2;

interface SesionApi extends Sesion {
  sustitucionAbierta?: boolean;
  motivoBaja?: string | null;
}

interface DatosRango {
  sesiones: SesionApi[];
  reservas: Reserva[];
  salas: Sala[];
  instructores: Instructor[];
}

const VACIO: DatosRango = { sesiones: [], reservas: [], salas: [], instructores: [] };

export function ProximasClases() {
  const { tiposClase } = useStudio();
  const rol = useRol();

  // Guarda de hidratación: el servidor no sabe qué hora es en el estudio. Un
  // minuto de cadencia, igual que la agenda: nada de lo que se decide aquí
  // —qué clase está en curso, cuál es la siguiente— cambia más rápido. El
  // cronómetro de la tarjeta en vivo lleva su propio reloj, de segundos.
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: la hora del estudio solo se conoce en cliente. El segundo render es el objetivo.
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [datos, setDatos] = useState<DatosRango | null>(null);
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    const alCambiar = () => setRecarga(n => n + 1);
    window.addEventListener(EVENTO_AGENDA, alCambiar);
    return () => window.removeEventListener(EVENTO_AGENDA, alCambiar);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Desde el principio de HOY y no desde este instante: la clase que está
      // en curso empezó antes de ahora, y el endpoint filtra por hora de
      // inicio. Lo que sobra se descarta aquí abajo.
      const hoy = hoyEnEstudio();
      const desde = inicioDelDiaEstudio(hoy);
      const hasta = finDelDiaEstudio(masDias(hoy, DIAS_VISTA));
      try {
        const res = await fetch(
          `/api/calendario?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
          { headers: await authHeader() },
        );
        if (!res.ok) throw new Error(String(res.status));
        const json: unknown = await res.json();
        if (!vivo) return;
        // Sin dar por hecha la forma de la respuesta: esto va en la primera
        // pantalla del panel y un cuerpo a medias no puede tumbarla.
        const d = (json ?? {}) as Partial<DatosRango>;
        setDatos({
          sesiones: Array.isArray(d.sesiones) ? d.sesiones : [],
          reservas: Array.isArray(d.reservas) ? d.reservas : [],
          salas: Array.isArray(d.salas) ? d.salas : [],
          instructores: Array.isArray(d.instructores) ? d.instructores : [],
        });
      } catch {
        // En silencio: la agenda de arriba ya avisa si el calendario no
        // responde. Dos veces el mismo error es ruido, no información.
        if (vivo) setDatos(VACIO);
      }
    })();
    return () => { vivo = false; };
  }, [recarga]);

  const tipoById = useMemo(() => new Map(tiposClase.map(t => [t.id, t])), [tiposClase]);
  const salaById = useMemo(() => new Map((datos ?? VACIO).salas.map(s => [s.id, s])), [datos]);
  const instructorById = useMemo(() => new Map((datos ?? VACIO).instructores.map(i => [i.id, i])), [datos]);

  const { enVivo, proximas } = useMemo(() => {
    if (!ahora || !datos) return { enVivo: null as ClaseDelDia | null, proximas: [] as ClaseDelDia[] };
    const clases = construirAgendaDelDia({
      sesiones: datos.sesiones as SesionAgenda[],
      reservas: datos.reservas,
      ahora,
    });
    const ms = ahora.getTime();
    return {
      // `claseEnCurso` es la regla compartida con la agenda y con la app de la
      // alumna (`lib/hoy-agenda.ts`), no una comparación propia.
      enVivo: claseEnCurso(clases),
      proximas: clases
        .filter(c => c.estado !== 'CANCELADA' && new Date(c.inicio).getTime() > ms)
        .slice(0, MAX_PROXIMAS),
    };
  }, [datos, ahora]);

  const puedeCalendario = puedeVer(rol, '/calendario');
  const cargando = !ahora || datos === null;

  if (cargando) return <Esqueleto />;
  // Ni clase en curso ni nada a la vista en una semana: no se ocupa sitio para
  // decirlo. La agenda de arriba ya cuenta que el día está tranquilo.
  if (!enVivo && proximas.length === 0) return null;

  const datosDe = (c: ClaseDelDia) => ({
    nombre: tipoById.get(c.tipoClaseId)?.nombre ?? 'Clase',
    color: tipoById.get(c.tipoClaseId)?.color ?? 'var(--border)',
    fotoUrl: tipoById.get(c.tipoClaseId)?.fotoUrl ?? null,
    sala: salaById.get(c.salaId)?.nombre ?? null,
    instructor: instructorById.get(c.instructorId) ?? null,
  });

  return (
    <section aria-label="Próximas clases">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-muted px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <CalendarClock size={14} className="text-muted-foreground" />
            <h3 className="text-[13px] font-semibold text-foreground">Próximas clases</h3>
          </div>
          {puedeCalendario && (
            <Link
              href="/calendario"
              className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver todas
            </Link>
          )}
        </div>

        {enVivo && (
          <TarjetaEnVivo
            clase={enVivo}
            {...datosDe(enVivo)}
            puedeCalendario={puedeCalendario}
          />
        )}

        {proximas.length > 0 && (
          // Las columnas salen de cuántas hay: con una sola clase y dos
          // columnas quedaba media caja en blanco, que se lee como que falta
          // algo por cargar. Y una por fila en móvil: con la foto al lado, dos
          // tarjetas a 390 px dejan unos 60 px para el nombre y vuelve a
          // cortarse.
          <ul className={cn('grid gap-px bg-muted', proximas.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
            {proximas.map(c => (
              <TarjetaClase
                key={c.sesionId}
                clase={c}
                {...datosDe(c)}
                puedeCalendario={puedeCalendario}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── La que se está dando ahora ──────────────────────────────────────────────

/** El reloj del cronómetro. Solo existe mientras hay una clase en curso: este
 *  componente no se monta si no la hay, así que no queda ningún intervalo de un
 *  segundo corriendo de fondo el resto del día. Sin guarda de hidratación
 *  propia —el padre ya espera a saber la hora del estudio para pintarlo. */
function useSegundos(): number {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMs(Date.now()), 1_000);
    // El navegador frena los intervalos de una pestaña en segundo plano: quien
    // vuelve al panel tiene que ver el cronómetro al día, no el de hace un rato.
    const alVolver = () => { if (!document.hidden) setMs(Date.now()); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);
  return ms;
}

/** Segundos en reloj: «23:14», y con la hora por delante si la clase pasa de
 *  una hora («1:03:20»). */
function reloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${dos(mm)}:${dos(ss)}` : `${dos(mm)}:${dos(ss)}`;
}

function TarjetaEnVivo({
  clase, nombre, color, fotoUrl, sala, instructor, puedeCalendario,
}: {
  clase: ClaseDelDia;
  nombre: string;
  color: string;
  fotoUrl: string | null;
  sala: string | null;
  instructor: Instructor | null;
  puedeCalendario: boolean;
}) {
  const ahoraMs = useSegundos();
  const inicioMs = new Date(clase.inicio).getTime();
  const finMs = new Date(clase.fin).getTime();
  const duracion = Math.max(1, finMs - inicioMs);
  // Acotado por los dos lados: el cronómetro no puede pasarse del final
  // mientras el reloj de minutos del padre no se entera de que la clase acabó.
  const transcurrido = Math.min(duracion, Math.max(0, ahoraMs - inicioMs));
  const restanteMin = Math.max(0, Math.ceil((finMs - ahoraMs) / 60_000));
  const pct = (transcurrido / duracion) * 100;

  const cuerpo = (
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success"
          style={{ backgroundColor: 'color-mix(in srgb, var(--success) 14%, transparent)' }}>
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />
          En vivo
        </span>
        <span className="text-[11.5px] tabular-nums text-muted-foreground">
          {horaEstudio(clase.inicio)} – {horaEstudio(clase.fin)}
          {sala ? ` · ${sala}` : ''}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* Más grande que en las de abajo: esta es la clase que se está dando
              ahora mismo, y la jerarquía de la sección se lee de un vistazo. */}
          <FotoClase nombre={nombre} fotoUrl={fotoUrl} alto="size-[92px]" />
          {instructor && (
            <ProfileAvatar
              size="sm"
              nombre={instructor.nombre}
              color={instructor.color}
              fotoUrl={instructor.fotoUrl}
              avatarId={instructor.avatar}
            />
          )}
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate text-[15px] font-bold leading-tight text-foreground">{nombre}</span>
            </p>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {instructor?.nombre ?? 'Sin asignar'}
            </p>
          </div>
        </div>

        {/* El cronómetro, con SU barra pegada debajo y en su propia columna.
            Suelta y a todo lo ancho se leía como un separador entre el reloj y
            las plazas, y además competía con la barra de aforo: dos barras
            iguales, una encima de otra, contando cosas distintas.
            `aria-live` apagado a propósito: un lector de pantalla que cante
            cada segundo no deja usar la pantalla — el texto de debajo («faltan
            27 min») cuenta lo mismo sin moverse. */}
        {/* Ancho automático, no fijo: la barra mide lo que el bloque, y con un
            ancho mayor que el texto quedaba asomando por la izquierda del
            número, que va alineado a la derecha. Así los dos bordes coinciden. */}
        <div className="sm:text-right">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Lleva
          </span>
          <p
            role="timer"
            aria-live="off"
            aria-label="Tiempo transcurrido de la clase"
            className="text-[26px] font-bold leading-none tabular-nums text-foreground"
          >
            {reloj(transcurrido / 1000)}
          </p>
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full rounded-full bg-success transition-[width] duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </span>
          <p className="mt-1 text-[11px] text-muted-foreground">
            de {Math.round(duracion / 60_000)} min
            {restanteMin > 0 ? ` · faltan ${restanteMin}` : ' · termina ya'}
          </p>
        </div>
      </div>

      {/* Acotada: a lo ancho de la tarjeta, seis plazas se leen como una barra
          de carga. */}
      <div className="mt-3 max-w-[220px]">
        <p className="leading-none">
          <span className="text-[15px] font-bold tabular-nums text-foreground">{clase.ocupadas}</span>
          <span className="text-[11px] text-muted-foreground"> / {clase.aforo} plazas</span>
        </p>
        <BarraPlazas ocupadas={clase.ocupadas} aforo={clase.aforo} />
      </div>
    </>
  );

  const fondo = { backgroundColor: 'color-mix(in srgb, var(--success) 9%, var(--card))' };

  if (!puedeCalendario) {
    return <div className="border-b border-muted px-4 py-4 sm:px-5" style={fondo}>{cuerpo}</div>;
  }
  return (
    <Link
      href={`/calendario?sesion=${encodeURIComponent(clase.sesionId)}`}
      // Anillo por dentro y no `brightness`: la caja recorta con
      // `overflow-hidden`, y bajar el brillo de un fondo casi negro no se ve en
      // modo oscuro.
      className="block border-b border-muted px-4 py-4 outline-none ring-inset hover:ring-1 hover:ring-success/30 focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-5"
      style={fondo}
    >
      {cuerpo}
    </Link>
  );
}

// ─── La foto de la clase ─────────────────────────────────────────────────────

/**
 * La foto del TIPO de clase, con su fecha encima.
 *
 * `imagenDeClase` da la que subió el estudio y, si no hay, la de su familia de
 * disciplina (reformer, mat, yoga…) — así un estudio recién creado tampoco ve
 * huecos de color liso. `lib/imagenes-por-defecto.ts` avisa de que la misma
 * foto repetida ocho veces se lee como un error y por eso los LISTADOS no
 * llevan default: aquí son dos tarjetas grandes, el caso «detalle» que ese
 * mismo documento sí contempla.
 *
 * El velo oscuro no es decoración: la fecha va encima de una foto cualquiera
 * —clara, con una pared blanca al fondo— y sin él no se lee.
 */
function FotoClase({
  nombre, fotoUrl, fecha, alto = 'size-[78px]',
}: {
  nombre: string;
  fotoUrl: string | null;
  /** Día y mes encima de la foto. Sin fecha no se pinta velo: la foto se ve
   *  entera, que es lo que quiere la tarjeta de la clase en curso —está pasando
   *  AHORA, y su fecha es hoy por definición. */
  fecha?: { numero: string; mes: string };
  alto?: string;
}) {
  return (
    <span className={cn('relative shrink-0 overflow-hidden rounded-xl bg-muted', alto)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto subida por el estudio o de catálogo, no un asset conocido en build */}
      <img
        src={imagenDeClase({ fotoUrl, nombre })}
        alt=""
        className="size-full object-cover"
        onError={alFallarImagen(IMAGENES_CLASE.generica)}
      />
      {fecha && (
        <>
          {/* Solo por abajo y lo justo: la fecha va encima de una foto
              cualquiera —una pared blanca al fondo— y sin velo no se lee. Un
              velo parejo la oscurecía entera y la foto dejaba de ser foto. */}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
          <span className="absolute inset-x-0 bottom-1.5 flex flex-col items-center leading-none text-white">
            <span className="text-[20px] font-bold tabular-nums drop-shadow">{fecha.numero}</span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide opacity-95">{fecha.mes}</span>
          </span>
        </>
      )}
    </span>
  );
}

// ─── Las que vienen después ──────────────────────────────────────────────────

function TarjetaClase({
  clase, nombre, color, fotoUrl, sala, instructor, puedeCalendario,
}: {
  clase: ClaseDelDia;
  nombre: string;
  color: string;
  fotoUrl: string | null;
  sala: string | null;
  instructor: Instructor | null;
  puedeCalendario: boolean;
}) {
  const hoy = hoyEnEstudio();
  const dia = new Date(clase.inicio);
  const diaEstudio = dia.toLocaleDateString('en-CA', { timeZone: TZ_ESTUDIO });
  const esHoy = diaEstudio === hoy;
  // «Hoy»/«Mañana» cuando el día tiene nombre, y si no la fecha. La misma
  // función que usa la agenda de arriba: llamar «Mañana» a un día ahí y
  // «9 sept» aquí, a dos dedos, se lee como dos días distintos.
  const palabra = tituloDia(diaEstudio, hoy);
  const numero = dia.toLocaleDateString('es-ES', { day: 'numeric', timeZone: TZ_ESTUDIO });
  const mes = dia.toLocaleDateString('es-ES', { month: 'short', timeZone: TZ_ESTUDIO }).replace('.', '');

  const cuerpo = (
    <>
      <div className="flex items-start gap-3.5">
        <FotoClase nombre={nombre} fotoUrl={fotoUrl} fecha={{ numero, mes }} />

        <div className="min-w-0 flex-1">
          {/* El punto del tipo de clase, que es lo que de verdad las distingue:
              dos clases de la misma familia (dos de reformer) comparten la foto
              por defecto, y sin él se leerían como la misma. */}
          <p className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span title={nombre} className="truncate text-[15px] font-bold leading-tight text-foreground">
              {nombre}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold leading-none tabular-nums text-foreground">
            <Clock size={13} aria-hidden className="shrink-0 text-muted-foreground" />
            {/* El día solo cuando NO es hoy: la sección cruza de día sola y la
                hora a secas no distingue las 10:00 de mañana de las de hoy. */}
            {palabra && !esHoy ? `${palabra} · ` : ''}{horaEstudio(clase.inicio)}
          </p>
          <p className="mt-1 leading-none">
            <span className="text-[13px] font-bold tabular-nums text-foreground">{clase.ocupadas}</span>
            <span className="text-[12px] text-muted-foreground">/{clase.aforo}</span>
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {instructor?.nombre ?? 'Sin asignar'}{sala ? ` · ${sala}` : ''}
          </p>
        </div>
      </div>

      <BarraPlazas ocupadas={clase.ocupadas} aforo={clase.aforo} />
      <p className="mt-1.5 text-[10.5px] text-muted-foreground">
        {clase.estado === 'SIN_INSTRUCTORA'
          ? <span className="font-medium text-destructive">Sin instructora</span>
          : clase.huecos > 0
            ? `${clase.huecos} hueco${clase.huecos === 1 ? '' : 's'}`
            : 'Completa'}
      </p>
    </>
  );

  const clases = 'bg-card px-4 py-3.5 sm:px-5';

  return (
    <li className="min-w-0">
      {puedeCalendario ? (
        <Link
          href={`/calendario?sesion=${encodeURIComponent(clase.sesionId)}`}
          className={cn(
            'block h-full outline-none transition-colors hover:bg-muted',
            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
            clases,
          )}
        >
          {cuerpo}
        </Link>
      ) : (
        <div className={cn('h-full', clases)}>{cuerpo}</div>
      )}
    </li>
  );
}

// ─── Esqueleto ────────────────────────────────────────────────────────────────

function Esqueleto() {
  return (
    <section aria-hidden>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-muted px-4 py-3 sm:px-5">
          <span className="block h-4 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2 px-4 py-4 sm:px-5">
          <span className="block h-4 w-40 animate-pulse rounded bg-muted" />
          <span className="block h-7 w-56 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </section>
  );
}
