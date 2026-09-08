'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { useRol } from '@/lib/permisos';
import { puedeVer } from '@/lib/permisos-reglas';
import { authHeader } from '@/lib/api-client';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { TentareOrb } from '@/components/marca/tentare-orb';
import { Toast, useToast } from '@/components/ui/toast';
import { RellenarHuecoPanel } from './rellenar-hueco-panel';
import { NoPuedoAsistirDialog } from '@/components/calendario/no-puedo-asistir-dialog';
import { PINTA } from '@/lib/calendario-estado';
import { detectarConflictos, hayConflicto } from '@/lib/calendar-logic';
import {
  construirAgendaDelDia, resumirDia, type ClaseDelDia, type SesionAgenda,
} from '@/lib/hoy-agenda';
import {
  capitalizarPrimera, cn, fechaLargaEstudio, finDelDiaEstudio, horaEstudio,
  hoyEnEstudio, inicioDelDiaEstudio, masDias,
} from '@/lib/utils';
import type { Instructor, Reserva, Sala, Sesion } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// «Hoy en el estudio» — la primera pantalla del panel.
//
// Responde en cinco segundos a una sola pregunta: qué pasa hoy y dónde tengo un
// problema o un hueco que puedo aprovechar. Por eso es una línea del día en
// orden cronológico y no una rejilla: el Calendario contesta «cómo está
// organizada mi agenda», que es otra pregunta y ya tiene su pantalla.
//
// ── De dónde salen los datos ────────────────────────────────────────────────
// De `GET /api/calendario?desde&hasta`, el endpoint que ya usa el Calendario:
// viene acotado al rango, moldeado por rol (una instructora solo ve sus clases,
// y sin importes) y —esto es lo que no se podía obtener de ningún otro sitio—
// con `sustitucionAbierta` ya resuelto. Una clase sin instructora NO se puede
// deducir de la sesión: `sesiones.instructor_id` sigue apuntando a la titular
// aunque haya avisado de que no puede venir; la señal vive en `sustituciones`.
//
// ⚠️ Y por eso NO se mezcla con `useStudio().sesiones`, que trae el histórico
// entero sin enriquecer. Todo número que se pinta aquí sale de este fetch, del
// mismo modo que en el Calendario — es literalmente la trampa que ese fichero
// documenta a lo largo de diez líneas (dos fuentes para el mismo 8/8, una se
// queda vieja). Del contexto se usan solo nombres y colores (tipos de clase) y,
// dentro del panel de rellenar hueco, el histórico de asistencia: cosas que
// este endpoint no da y que no son cifras del día.
// ─────────────────────────────────────────────────────────────────────────────

interface SesionApi extends Sesion {
  sustitucionAbierta?: boolean;
  motivoBaja?: string | null;
}

interface DatosDia {
  sesiones: SesionApi[];
  reservas: Reserva[];
  salas: Sala[];
  instructores: Instructor[];
}

const VACIO: DatosDia = { sesiones: [], reservas: [], salas: [], instructores: [] };

/** El día que se está mirando, en palabras. */
function tituloDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return 'Hoy';
  if (fecha === masDias(hoy, 1)) return 'Mañana';
  if (fecha === masDias(hoy, -1)) return 'Ayer';
  return '';
}

export function HoyEnElEstudio() {
  const { tiposClase } = useStudio();
  const { user } = useAuth();
  const rol = useRol();
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();

  // Guarda de hidratación: el servidor no sabe qué día es en el estudio, así
  // que se pinta el esqueleto y el día real llega tras montar. Mismo patrón que
  // el resto de la home.
  const [hoy, setHoy] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    const d = hoyEnEstudio();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: el día del estudio solo se conoce en cliente. El segundo render es el objetivo.
    setHoy(d);
    setFecha(d);
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Un solo estado con el día al que pertenece lo cargado. Así «cargando» es
  // una comparación (`cargado.fecha !== fecha`) y no un `setState` más dentro
  // del efecto: cambiar de día no puede dejar el indicador desincronizado con
  // los datos, ni pintar un instante la agenda de ayer bajo la fecha de hoy.
  const [cargado, setCargado] = useState<{ fecha: string; datos: DatosDia; fallo: boolean } | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!fecha) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/calendario?desde=${encodeURIComponent(inicioDelDiaEstudio(fecha))}&hasta=${encodeURIComponent(finDelDiaEstudio(fecha))}`,
          { headers: await authHeader() },
        );
        if (!res.ok) throw new Error(String(res.status));
        const json: unknown = await res.json();
        if (!vivo) return;
        // ⚠️ Nada de dar por hecha la forma de la respuesta. Esta sección es lo
        // primero que se ve del negocio: un `{}` (proxy, mock, respuesta a
        // medias) no puede tumbar la pantalla entera.
        const d = (json ?? {}) as Partial<DatosDia>;
        setCargado({
          fecha,
          fallo: false,
          datos: {
            sesiones: Array.isArray(d.sesiones) ? d.sesiones : [],
            reservas: Array.isArray(d.reservas) ? d.reservas : [],
            salas: Array.isArray(d.salas) ? d.salas : [],
            instructores: Array.isArray(d.instructores) ? d.instructores : [],
          },
        });
      } catch {
        if (!vivo) return;
        setCargado({ fecha, datos: VACIO, fallo: true });
      }
    })();
    return () => { vivo = false; };
  }, [fecha, recarga]);

  const alDia = cargado !== null && cargado.fecha === fecha;
  const datos = alDia ? cargado.datos : VACIO;
  const cargando = !alDia;
  const fallo = alDia && cargado.fallo;

  const refrescar = useCallback(() => setRecarga(n => n + 1), []);

  const tipoById = useMemo(() => new Map(tiposClase.map(t => [t.id, t])), [tiposClase]);
  const salaById = useMemo(() => new Map(datos.salas.map(s => [s.id, s])), [datos.salas]);
  const instructorById = useMemo(() => new Map(datos.instructores.map(i => [i.id, i])), [datos.instructores]);
  const sesionById = useMemo(() => new Map(datos.sesiones.map(s => [s.id, s])), [datos.sesiones]);

  // Choques de sala/instructora DENTRO del día. Dos clases que se solapan
  // caen el mismo día por definición, así que no hace falta traerse el
  // calendario entero para detectarlos.
  const conflictos = useMemo(() => {
    const set = new Set<string>();
    for (const s of datos.sesiones) {
      if (hayConflicto(detectarConflictos(s, datos.sesiones, s.id))) set.add(s.id);
    }
    return set;
  }, [datos.sesiones]);

  const clases = useMemo(() => {
    if (!ahora) return [];
    return construirAgendaDelDia({
      sesiones: datos.sesiones as SesionAgenda[],
      reservas: datos.reservas,
      ahora,
      conflictos,
    });
  }, [datos.sesiones, datos.reservas, ahora, conflictos]);

  const resumen = useMemo(() => resumirDia(clases), [clases]);

  // ── Rellenar hueco ─────────────────────────────────────────────────────────
  const [huecoAbierto, setHuecoAbierto] = useState<string | null>(null);
  const claseHueco = huecoAbierto ? clases.find(c => c.sesionId === huecoAbierto) ?? null : null;
  const sesionHueco = huecoAbierto ? sesionById.get(huecoAbierto) ?? null : null;
  const reservasHueco = useMemo(
    () => (huecoAbierto ? datos.reservas.filter(r => r.sesionId === huecoAbierto) : []),
    [huecoAbierto, datos.reservas],
  );

  const puedeCalendario = puedeVer(rol, '/calendario');

  // El atajo de la instructora: avisar de que no puede dar SU clase sin pasar
  // por el calendario. Venía de la tarjeta «Clases de hoy» que esta sección
  // sustituye, y se conserva tal cual — mismo diálogo, mismo motor de
  // sustituciones detrás (`crearBaja`), aquí solo cambia desde dónde se abre.
  const miInstructorId = rol === 'INSTRUCTOR'
    ? datos.instructores.find(i => i.authUserId === user?.id)?.id ?? null
    : null;
  const [bajaDe, setBajaDe] = useState<string | null>(null);
  const sesionBaja = bajaDe ? sesionById.get(bajaDe) ?? null : null;
  const esHoy = fecha !== null && fecha === hoy;

  // ── Cabecera ───────────────────────────────────────────────────────────────
  const etiqueta = fecha && hoy ? tituloDia(fecha, hoy) : '';
  const fechaLarga = fecha ? capitalizarPrimera(fechaLargaEstudio(`${fecha}T12:00:00`)) : '';

  if (!fecha || !ahora) return <EsqueletoAgenda />;

  return (
    <section aria-label="Hoy en el estudio">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFecha(masDias(fecha, -1))}
            aria-label="Día anterior"
            className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft size={14} />
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {etiqueta && <span className="text-foreground">{etiqueta}</span>}
            {etiqueta && ' · '}
            {fechaLarga}
          </p>
          <button
            type="button"
            onClick={() => setFecha(masDias(fecha, 1))}
            aria-label="Día siguiente"
            className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight size={14} />
          </button>
          {!esHoy && hoy && (
            <button
              type="button"
              onClick={() => setFecha(hoy)}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-brand-medio transition-colors hover:bg-muted"
            >
              Volver a hoy
            </button>
          )}
        </div>

        {/* Resumen deliberadamente secundario: contexto de la agenda, no un
            panel de indicadores. La agenda es la protagonista. */}
        {!cargando && resumen.clases > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {resumen.clases} clase{resumen.clases === 1 ? '' : 's'}
            {' · '}{resumen.alumnas} alumna{resumen.alumnas === 1 ? '' : 's'}
            {resumen.huecos > 0 && <> · {resumen.huecos} hueco{resumen.huecos === 1 ? '' : 's'}</>}
            {resumen.pendientes > 0 && <> · {resumen.pendientes} pendiente{resumen.pendientes === 1 ? '' : 's'}</>}
          </p>
        )}
      </div>

      <h2 className="sr-only">Tu día en el estudio</h2>

      {/* Lo que ha visto Tentare. Solo aparece cuando de verdad hay algo que
          contar — si el día está limpio, no se interrumpe a nadie. */}
      {!cargando && (resumen.huecos > 0 || resumen.problemas > 0) && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5">
          <TentareOrb tam={22} />
          <p className="text-[12.5px] text-foreground">{fraseDeTentare(resumen, clases)}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-muted px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-muted-foreground" />
            <h3 className="text-[13px] font-semibold text-foreground">Hoy en el estudio</h3>
          </div>
          {puedeCalendario && (
            <Link
              href="/calendario"
              className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver calendario
            </Link>
          )}
        </div>

        {cargando ? (
          <FilasEsqueleto />
        ) : fallo ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[13px] text-foreground">No hemos podido cargar la agenda de hoy.</p>
            <button
              type="button"
              onClick={refrescar}
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-medio hover:underline"
            >
              <RefreshCw size={12} /> Reintentar
            </button>
          </div>
        ) : clases.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[15px] font-semibold text-foreground">
              {esHoy ? 'Hoy no tienes clases' : 'Ese día no hay clases'}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Tu agenda está tranquila.</p>
            {puedeCalendario && (
              <Link
                href="/calendario"
                className="mt-3 inline-block text-[12px] font-semibold text-brand-medio hover:underline"
              >
                Ver calendario
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-muted">
            {clases.map((c, i) => (
              <FilaClase
                key={c.sesionId}
                clase={c}
                anterior={clases[i - 1] ?? null}
                ahora={ahora}
                mostrarAhora={esHoy}
                tipoNombre={tipoById.get(c.tipoClaseId)?.nombre ?? 'Clase'}
                tipoColor={tipoById.get(c.tipoClaseId)?.color ?? 'var(--border)'}
                salaNombre={salaById.get(c.salaId)?.nombre ?? null}
                instructor={instructorById.get(c.instructorId) ?? null}
                puedeCalendario={puedeCalendario}
                onRellenar={() => setHuecoAbierto(c.sesionId)}
                onNoPuedoAsistir={
                  miInstructorId && c.instructorId === miInstructorId && !c.finalizada && c.estado !== 'CANCELADA'
                    ? () => setBajaDe(c.sesionId)
                    : null
                }
              />
            ))}
          </ul>
        )}

        {!cargando && !fallo && clases.length > 0 && resumen.problemas === 0 && resumen.pendientes === 0 && (
          <p className="border-t border-muted px-5 py-3 text-[12px] text-muted-foreground">
            Todo preparado{esHoy ? ' para hoy' : ''} · {resumen.clases} clase{resumen.clases === 1 ? '' : 's'} · {resumen.alumnas} alumna{resumen.alumnas === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <RellenarHuecoPanel
        abierto={huecoAbierto !== null}
        onCerrar={() => setHuecoAbierto(null)}
        clase={claseHueco}
        sesion={sesionHueco}
        nombreClase={sesionHueco ? tipoById.get(sesionHueco.tipoClaseId)?.nombre ?? 'Clase' : 'Clase'}
        reservasSesion={reservasHueco}
        onAviso={showToast}
        onCambio={refrescar}
      />

      <NoPuedoAsistirDialog
        open={bajaDe !== null}
        onOpenChange={(v) => { if (!v) setBajaDe(null); }}
        sesion={sesionBaja ? {
          id: sesionBaja.id,
          inicio: sesionBaja.inicio,
          tipoClase: { nombre: tipoById.get(sesionBaja.tipoClaseId)?.nombre ?? 'Clase' },
        } : null}
      />

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </section>
  );
}

// ─── Una clase ────────────────────────────────────────────────────────────────

function FilaClase({
  clase, anterior, ahora, mostrarAhora, tipoNombre, tipoColor, salaNombre, instructor,
  puedeCalendario, onRellenar, onNoPuedoAsistir,
}: {
  clase: ClaseDelDia;
  anterior: ClaseDelDia | null;
  ahora: Date;
  mostrarAhora: boolean;
  tipoNombre: string;
  tipoColor: string;
  salaNombre: string | null;
  instructor: Instructor | null;
  puedeCalendario: boolean;
  onRellenar: () => void;
  /** null salvo que la clase sea de quien está mirando (instructora). */
  onNoPuedoAsistir: (() => void) | null;
}) {
  const pinta = PINTA[clase.estado];
  const problema = clase.senal === 'PROBLEMA';
  const pasada = clase.finalizada || clase.estado === 'CANCELADA';

  // La marca de «ahora» va justo delante de la primera clase que aún no ha
  // empezado. Solo tiene sentido mirando el día de hoy.
  const marcaAhora = mostrarAhora
    && new Date(clase.inicio).getTime() > ahora.getTime()
    && (!anterior || new Date(anterior.inicio).getTime() <= ahora.getTime());

  return (
    <>
      {marcaAhora && (
        <li aria-hidden className="flex items-center gap-2 px-4 py-1.5 sm:px-5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-success">
            Ahora · {horaEstudio(ahora.toISOString())}
          </span>
          <span className="h-px flex-1 bg-success/35" />
        </li>
      )}
      <li
        className={cn(
          'grid grid-cols-[62px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5',
          'sm:grid-cols-[70px_minmax(0,1.4fr)_128px_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5',
          pasada && 'opacity-65',
        )}
        style={problema ? { backgroundColor: 'color-mix(in srgb, var(--destructive) 5%, var(--card))' } : undefined}
      >
        {/* Hora */}
        <div className="row-span-1">
          <p className="text-[19px] font-bold leading-none tabular-nums text-foreground">
            {horaEstudio(clase.inicio)}
          </p>
          <p className="mt-1 text-[10.5px] tabular-nums text-muted-foreground">
            {clase.enCurso ? 'en curso' : `→ ${horaEstudio(clase.fin)}`}
          </p>
        </div>

        {/* Instructora + actividad */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: tipoColor }}
          />
          {instructor ? (
            <ProfileAvatar
              size="sm"
              nombre={instructor.nombre}
              color={instructor.color}
              fotoUrl={instructor.fotoUrl}
              avatarId={instructor.avatar}
            />
          ) : (
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ backgroundColor: pinta.fondo, color: pinta.tinta }}
            >
              ?
            </span>
          )}
          <div className="min-w-0">
            <p className={cn(
              'truncate text-[13px] font-semibold',
              clase.estado === 'SIN_INSTRUCTORA' ? 'text-destructive' : 'text-foreground',
            )}>
              {clase.estado === 'SIN_INSTRUCTORA' ? 'Sin instructora' : instructor?.nombre ?? 'Sin asignar'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {tipoNombre}{salaNombre ? ` · ${salaNombre}` : ''}
            </p>
          </div>
        </div>

        {/* Ocupación */}
        <div className="col-start-2 max-w-[220px] sm:col-start-3 sm:max-w-none">
          <p className="leading-none">
            <span className="text-[15px] font-bold tabular-nums text-foreground">{clase.ocupadas}</span>
            <span className="text-[11px] text-muted-foreground"> / {clase.aforo} plazas</span>
          </p>
          <BarraPlazas ocupadas={clase.ocupadas} aforo={clase.aforo} />
        </div>

        {/* Estado de las alumnas */}
        <div className="col-start-2 flex flex-col gap-0.5 sm:col-start-4">
          {clase.estado === 'CANCELADA' ? (
            <span className="text-[11.5px] text-muted-foreground">Cancelada</span>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-foreground/45" />
                {clase.finalizada && clase.asistidas > 0
                  ? `${clase.asistidas} asistieron`
                  : `${clase.confirmadas} confirmada${clase.confirmadas === 1 ? '' : 's'}`}
                {clase.pendientes > 0 && (
                  <span className="ml-1 flex items-center gap-1.5 font-medium text-warning">
                    <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                    {clase.pendientes} pendiente{clase.pendientes === 1 ? '' : 's'}
                  </span>
                )}
              </span>
              {clase.motivos
                .filter(m => m.clave !== 'pendientes' && m.clave !== 'completa')
                .slice(0, 2)
                .map(m => (
                  <span
                    key={m.clave}
                    className={cn(
                      'flex items-center gap-1.5 text-[11.5px]',
                      m.tono === 'PROBLEMA' ? 'font-medium text-destructive'
                        : m.tono === 'ATENCION' ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 rounded-full',
                        m.tono === 'PROBLEMA' ? 'bg-destructive'
                          : m.tono === 'ATENCION' ? 'border border-foreground/40' : 'bg-muted-foreground/40',
                      )}
                    />
                    {m.texto}
                  </span>
                ))}
            </>
          )}
        </div>

        {/* Acción */}
        <div className="col-start-2 flex flex-col items-start gap-1 sm:col-start-5 sm:items-end sm:justify-self-end">
          <AccionClase clase={clase} puedeCalendario={puedeCalendario} onRellenar={onRellenar} />
          {onNoPuedoAsistir && (
            <button
              type="button"
              onClick={onNoPuedoAsistir}
              className="text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-destructive hover:underline"
            >
              No puedo asistir
            </button>
          )}
        </div>
      </li>
    </>
  );
}

/** Una acción por clase, la que toca. La tabla de qué toca en cada estado es la
 *  del calendario (`accionParaEstado`), no una nueva. */
function AccionClase({
  clase, puedeCalendario, onRellenar,
}: {
  clase: ClaseDelDia;
  puedeCalendario: boolean;
  onRellenar: () => void;
}) {
  const enlaceClase = `/calendario?sesion=${encodeURIComponent(clase.sesionId)}`;

  // Rellenar el hueco es lo único que se resuelve aquí mismo; todo lo demás
  // vive ya en la ficha de la clase y se abre allí en vez de duplicarse.
  const rellenable = !clase.finalizada && clase.estado !== 'CANCELADA' && clase.huecos > 0;

  if (rellenable) {
    return (
      <button
        type="button"
        onClick={onRellenar}
        className="rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted"
      >
        Rellenar hueco{clase.huecos > 1 ? 's' : ''}
      </button>
    );
  }

  if (!puedeCalendario) return null;

  const texto = clase.accion === 'CUBRIR' ? 'Buscar sustituta'
    : clase.accion === 'PASAR_LISTA' ? 'Pasar lista'
    : clase.accion === 'RESOLVER' ? 'Ver incidencia'
    : clase.accion === 'MOVER' ? 'Resolver choque'
    : clase.accion === 'AJUSTAR_AFORO' ? 'Ajustar aforo'
    : null;

  if (texto) {
    return (
      <Link
        href={enlaceClase}
        className="inline-block rounded-full bg-brand px-3 py-1.5 text-[11.5px] font-semibold text-brand-foreground transition-[filter] hover:brightness-95"
      >
        {texto}
      </Link>
    );
  }

  if (clase.estado === 'CANCELADA') return null;

  return (
    <Link
      href={enlaceClase}
      className="inline-block text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {clase.finalizada ? 'Ver clase' : 'Todo preparado'}
    </Link>
  );
}

/** Aforo a golpe de vista. Con salas pequeñas (lo normal en pilates) una plaza
 *  por segmento se lee sin contar; a partir de 20 vuelve a ser una barra. */
function BarraPlazas({ ocupadas, aforo }: { ocupadas: number; aforo: number }) {
  const lleno = aforo > 0 && ocupadas >= aforo;
  const color = lleno ? 'var(--brand)' : 'var(--brand-medio)';

  if (aforo > 0 && aforo <= 20) {
    return (
      <span className="mt-1.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: aforo }, (_, i) => (
          <span
            key={i}
            className="h-1.5 min-w-0 flex-1 rounded-[1px]"
            style={{ backgroundColor: i < ocupadas ? color : 'var(--muted)' }}
          />
        ))}
      </span>
    );
  }

  const pct = aforo > 0 ? Math.min(100, (ocupadas / aforo) * 100) : 0;
  return (
    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </span>
  );
}

// ─── Lo que ha visto Tentare ──────────────────────────────────────────────────

function fraseDeTentare(
  resumen: { huecos: number; problemas: number },
  clases: readonly ClaseDelDia[],
): string {
  const sinInstructora = clases.filter(c => c.estado === 'SIN_INSTRUCTORA' && !c.finalizada).length;
  const conHueco = clases.filter(c => !c.finalizada && c.estado !== 'CANCELADA' && c.huecos > 0).length;
  const partes: string[] = [];
  if (conHueco > 0) {
    partes.push(`${conHueco} clase${conHueco === 1 ? '' : 's'} con hueco que puedes llenar`);
  }
  if (sinInstructora > 0) {
    partes.push(`${sinInstructora} clase${sinInstructora === 1 ? '' : 's'} sin instructora`);
  }
  const otros = resumen.problemas - sinInstructora;
  if (otros > 0) partes.push(`${otros} clase${otros === 1 ? '' : 's'} con algo que resolver`);
  if (partes.length === 0) return 'Tentare no ha encontrado nada que necesite tu atención hoy.';
  const ultimo = partes.pop()!;
  return `Tentare ha encontrado ${partes.length ? `${partes.join(', ')} y ${ultimo}` : ultimo}.`;
}

// ─── Esqueletos ───────────────────────────────────────────────────────────────

function FilasEsqueleto() {
  return (
    <ul className="divide-y divide-muted" aria-hidden>
      {[0, 1, 2].map(i => (
        <li key={i} className="flex items-center gap-4 px-4 py-4 sm:px-5">
          <span className="h-5 w-12 animate-pulse rounded bg-muted" />
          <span className="size-8 animate-pulse rounded-full bg-muted" />
          <span className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <span className="hidden h-4 w-24 animate-pulse rounded bg-muted sm:block" />
        </li>
      ))}
    </ul>
  );
}

function EsqueletoAgenda() {
  return (
    <section aria-hidden>
      <div className="mb-3 h-4 w-56 animate-pulse rounded bg-muted" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-muted px-4 py-3 sm:px-5">
          <span className="block h-4 w-36 animate-pulse rounded bg-muted" />
        </div>
        <FilasEsqueleto />
      </div>
    </section>
  );
}
