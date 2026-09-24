'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El calendario de un estudio que todavía no tiene ninguna clase.
//
// ⚠️ ANTES NO HABÍA NADA AQUÍ. Ni un texto. La pantalla más importante del
// panel recibía a un estudio recién creado con una rejilla horaria en blanco y
// una marca de agua gris que ponía «Sin clases». Ese vacío es el mecanismo
// físico del muro que se ve en los datos: sobre las 10 altas reales, 10 de 10
// acaban con salas y solo 4 de 10 llegan a programar una clase. No es apatía —
// llegaban al sitio donde se programan y no había nada que les dijera cómo.
//
// El patrón está copiado del mejor estado vacío que ya tiene el producto, el de
// Automatizaciones: en vez de «no tienes nada», enseña lo que Tentare puede
// dejarle hecho y un botón para aceptarlo.
//
// Se pinta con CERO sesiones en todo el estudio, no «cero esta semana»: una
// semana vacía en un estudio en marcha es normal (vacaciones) y ahí este bloque
// sería ruido.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarPlus, Loader2, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';
import { authHeader } from '@/lib/api-client';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { capturarEvento } from '@/lib/posthog-cliente';
import { DIAS_SEMANA } from '@/lib/onboarding/horario-propuesto';
import {
  OPCIONES_AFORO, OPCIONES_DURACION, OPCIONES_IMPARTE, OPCIONES_SALAS, TIPOS_CLASE_SUGERIDOS,
  interpretarRespuestasWizard, planificarConfiguracion, type PlanConfiguracion,
} from '@/lib/onboarding/plan-configuracion';
import { PropuestaHorario, type ResultadoPropuesta } from '@/components/onboarding/propuesta-horario';
import {
  hayQuePreguntarQuien, nombreDeInstructora, quienContestado, type QuienDaLasClases,
} from '@/lib/onboarding/quien-da-las-clases';
import { ListoParaReservar } from '@/components/onboarding/listo-para-reservar';

/**
 * Días preseleccionados: de lunes a viernes, que es lo que abre la inmensa
 * mayoría de los estudios.
 *
 * ⚠️ Esto NO se pregunta en el asistente a propósito. Llegó a estar ahí como
 * pregunta número catorce y se quitó al ver la pantalla montada: el asistente
 * ya es demasiado largo, y aquí la pregunta se hace EN EL SITIO donde sirve
 * para algo y con el calendario delante. Preguntarlo antes era pedir un dato
 * para guardarlo; preguntarlo aquí es pedirlo para usarlo ahora mismo.
 */
const DIAS_LABORABLES = [1, 2, 3, 4, 5];

export function PrimerHorario({
  horaApertura,
  horaCierre,
  tiposClase,
  salas,
  onCreado,
  puedeCrear,
  slug,
  nombreEstudio,
  instructora = null,
  sinEquipo = false,
  onCrearInstructora,
}: {
  horaApertura: string;
  horaCierre: string;
  tiposClase: { nombre: string; duracionMinutos: number }[];
  salas: { nombre: string; capacidad: number }[];
  /** Quién da las clases si el equipo es una sola persona; null = no se sabe. */
  instructora?: string | null;
  /** No hay NINGUNA instructora en el equipo: hay que preguntar quién da las clases. */
  sinEquipo?: boolean;
  /** Da de alta a otra persona como instructora (solo su nombre). */
  onCrearInstructora?: (nombre: string) => Promise<{ ok: boolean; error?: string }>;
  onCreado: (creadas: number) => void;
  /** Una instructora ve el calendario vacío igual, pero no puede sembrarlo. */
  puedeCrear: boolean;
  slug: string | null;
  nombreEstudio: string;
}) {
  const [dias, setDias] = useState<number[]>(DIAS_LABORABLES);
  const [proponiendo, setProponiendo] = useState(false);
  // Cuántas clases acaba de crear. `null` = todavía no ha creado ninguna.
  const [reciénCreadas, setReciénCreadas] = useState<number | null>(null);

  // Lo que se le pregunta AQUÍ cuando el estudio llega vacío. Sin tipos de clase
  // esta pantalla era un callejón: solo un enlace a Configuración, y «Ahora no»
  // del asistente lo dejaba justo así. Sin respuesta no se inventa nada (regla 2
  // de plan-configuracion.ts): ni aforo, ni duración, ni tipos por defecto.
  const [clasesSel, setClasesSel] = useState<string[]>([]);
  const [duracionSel, setDuracionSel] = useState<string | null>(null);
  const [salasSel, setSalasSel] = useState<string | null>(null);
  const [aforoSel, setAforoSel] = useState<string | null>(null);
  // ¿Quién da las clases? Solo se pregunta con el equipo vacío (ver
  // lib/onboarding/quien-da-las-clases.ts). `instructoraElegida` es el nombre con
  // el que quedó su ficha; `recargar` avisa de que el contexto del panel no la
  // conoce (la creó el servidor) y hay que recargar al seguir.
  const [quien, setQuien] = useState<QuienDaLasClases | null>(null);
  const [nombreOtra, setNombreOtra] = useState('');
  const [instructoraElegida, setInstructoraElegida] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(false);
  const [montando, setMontando] = useState(false);
  const [errorMontaje, setErrorMontaje] = useState<string | null>(null);
  // Lo que acabamos de crear. El contexto del panel no lo tiene hasta recargar,
  // así que la propuesta se monta con esto y no con las props.
  const [montado, setMontado] = useState<PlanConfiguracion | null>(null);

  const tiposEf = montado && tiposClase.length === 0
    ? montado.tiposClase.map((t) => ({ nombre: t.nombre, duracionMinutos: t.duracionMinutos }))
    : tiposClase;
  const salasEf = montado && salas.length === 0
    ? montado.salas.map((s) => ({ nombre: s.nombre, capacidad: s.capacidad }))
    : salas;

  const faltanTipos = tiposEf.length === 0;
  const faltanSalas = salasEf.length === 0;
  const faltaQuien = hayQuePreguntarQuien({ puedeCrear, sinEquipo, instructoraYaElegida: instructoraElegida ?? instructora });
  const preguntasCompletas =
    (!faltanTipos || (clasesSel.length > 0 && duracionSel != null))
    && (!faltanSalas || (salasSel != null && aforoSel != null))
    && (!faltaQuien || quienContestado(quien, nombreOtra));

  const entrada = useMemo(() => ({
    dias,
    horaApertura,
    horaCierre,
    duracionMinutos: tiposEf[0]?.duracionMinutos ?? 50,
    tiposClase: tiposEf.map((t) => t.nombre),
    // Cada sala con SU aforo: antes iba solo el de la primera y todo acababa
    // en ella (evaluación del 13-sep).
    salas: salasEf.map((s) => ({ nombre: s.nombre, capacidad: s.capacidad })),
    instructora: instructora ?? instructoraElegida,
  }), [dias, horaApertura, horaCierre, tiposEf, salasEf, instructora, instructoraElegida]);

  // Sin tipos de clase o sin salas hay que preguntarlo primero (abajo), pero ya
  // no es un callejón: la propuesta se ofrece igual, tras esas preguntas.
  const puedeProponer = puedeCrear;

  // Embudo del primer horario (el paso que 5 de 7 estudios no llegan a dar):
  // se vio, y llegó a la propuesta. Lo siguiente —programarlo— ya lo mide el
  // servidor con `horario_creado`. `faltan_preguntas`: llegó sin catálogo y hubo
  // que preguntárselo aquí (saltó el asistente o no contestó esas preguntas).
  const visto = useRef(false);
  useEffect(() => {
    if (visto.current || !puedeCrear) return;
    visto.current = true;
    capturarEvento('primer_horario_visto', { faltan_preguntas: faltanTipos || faltanSalas });
  }, [puedeCrear, faltanTipos, faltanSalas]);
  const propuestaVista = useRef(false);
  useEffect(() => {
    if (!proponiendo || propuestaVista.current) return;
    propuestaVista.current = true;
    capturarEvento('primer_horario_propuesta');
  }, [proponiendo]);

  // Crea SOLO lo que ella acaba de elegir (idempotente por nombre, misma ruta y
  // mismo plan que el asistente) y sigue a la propuesta. Ninguna CLASE se
  // programa hasta que confirme la propuesta.
  async function prepararYProponer() {
    if (montando) return;
    const daLasClasesElla = faltaQuien && quien === 'yo';
    if (!faltanTipos && !faltanSalas && !daLasClasesElla && !(faltaQuien && quien === 'otra')) {
      if (faltaQuien) capturarEvento('primer_horario_sin_instructora', { quien: quien ?? 'nadie' });
      setProponiendo(true);
      return;
    }
    setErrorMontaje(null);
    // El estado de carga se enciende antes del await.
    setMontando(true);
    try {
      // «Otra persona»: se da de alta con su nombre ANTES de proponer, para que
      // las clases nazcan a su nombre y no sin instructora.
      if (faltaQuien && quien === 'otra') {
        const nombre = nombreDeInstructora(nombreOtra);
        if (!nombre || !onCrearInstructora) return;
        const r = await onCrearInstructora(nombre);
        if (!r.ok) {
          setErrorMontaje(r.error ?? 'No hemos podido añadir a esa persona. Puedes añadirla en Equipo y volver aquí.');
          return;
        }
        setInstructoraElegida(nombre);
      }
      if (faltanTipos || faltanSalas || daLasClasesElla) {
        const respuestas = interpretarRespuestasWizard({
          ...(faltanSalas ? { salas: salasSel ?? undefined, aforos: aforoSel ? [aforoSel] : [] } : {}),
          ...(faltanTipos ? { clases: clasesSel, duracion: duracionSel ?? undefined } : {}),
          // «Las doy yo»: su ficha de instructora, que crea el servidor con el
          // nombre de la sesión (mismo camino que la pregunta del asistente).
          ...(daLasClasesElla ? { imparte: OPCIONES_IMPARTE[0] } : {}),
        });
        const plan = planificarConfiguracion(respuestas);
        const res = await fetch('/api/onboarding/configurar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ ...respuestas, origen: 'calendario' }),
        });
        const cuerpo = await res.json().catch(() => null) as
          { ok?: boolean; nada?: boolean; error?: string; instructoraNombre?: string | null } | null;
        // Se comprueba la respuesta: seguir a una propuesta con un catálogo que no
        // existe acabaría en «no se ha podido crear» sin saber por qué.
        if (!res.ok || !cuerpo?.ok || cuerpo.nada) {
          setErrorMontaje(cuerpo?.error ?? 'No hemos podido preparar tus clases. Puedes crearlas en Configuración.');
          return;
        }
        if (daLasClasesElla) {
          if (!cuerpo.instructoraNombre) {
            setErrorMontaje('No hemos podido crear tu ficha de instructora. Puedes añadirte en Equipo y volver aquí.');
            return;
          }
          setInstructoraElegida(cuerpo.instructoraNombre);
          setRecargar(true);
        }
        if (faltanTipos || faltanSalas) setMontado(plan);
      }
      if (faltaQuien) capturarEvento('primer_horario_sin_instructora', { quien: quien ?? 'nadie' });
      setProponiendo(true);
    } catch (e) {
      capturarExcepcion(e instanceof Error ? e : new Error(String(e)), { tags: { area: 'onboarding-calendario' } });
      setErrorMontaje('No hemos podido preparar tus clases. Comprueba tu conexión e inténtalo de nuevo.');
    } finally {
      setMontando(false);
    }
  }

  // ⚠️ El momento de valor va AQUÍ y no en un toast. Antes, confirmar el
  // horario enseñaba «Horario creado: 80 clases» y devolvía a la rejilla —
  // técnicamente correcto y completamente mudo sobre lo que acababa de
  // conseguir. El caso que lo justifica está en producción: un estudio con 208
  // clases programadas, 0 alumnas y 0 reservas. Montó el horario entero y
  // nunca supo que su página ya estaba abierta.
  if (reciénCreadas != null && slug) {
    // Se pinta a pantalla completa por su cuenta (position: fixed), así que no
    // se envuelve en ningún contenedor del calendario.
    return (
      <ListoParaReservar
        slug={slug}
        nombreEstudio={nombreEstudio}
        clasesCreadas={reciénCreadas}
        onSeguir={() => {
          // Si el catálogo se ha creado aquí, el panel aún no lo conoce (tipos de
          // clase y salas salen del contexto, que solo se carga al entrar): sin
          // recargar, el formulario de «nueva clase» saldría sin tipos.
          if (montado || recargar) { window.location.assign('/calendario'); return; }
          const n = reciénCreadas; setReciénCreadas(null); onCreado(n);
        }}
      />
    );
  }

  if (proponiendo) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto p-6">
        <div className="w-full max-w-[560px] rounded-2xl border border-border bg-card p-6">
          <PropuestaHorario
            entrada={entrada}
            compacta
            onTerminar={(r: ResultadoPropuesta) => {
              setProponiendo(false);
              // Sin slug no hay página que enseñar: se cae al camino de antes
              // (recargar el calendario) en vez de una pantalla a medias.
              if (r === 'descartada') return;
              if (slug) setReciénCreadas(r.creadas);
              else onCreado(r.creadas);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-[560px] py-6 text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <CalendarPlus size={22} aria-hidden />
        </span>
        <h2 className="text-[20px] font-bold tracking-tight text-foreground">
          Tu horario todavía está vacío
        </h2>
        <p className="mx-auto mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-muted-foreground">
          {puedeCrear
            ? 'Es lo último que te falta: en cuanto haya clases aquí, tus alumnas podrán reservarlas desde tu página.'
            : 'Cuando el estudio programe sus clases, las verás aquí.'}
        </p>

        {puedeProponer && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-left">
            <p className="text-[13.5px] font-bold text-foreground">Te lo montamos nosotros</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
              {faltanTipos || faltanSalas
                ? 'Contesta lo justo y te preparamos un horario. Guardamos lo que elijas aquí, pero no se programa ninguna clase hasta que confirmes la propuesta.'
                : 'Dinos qué días abres y te preparamos un horario con tus clases. Lo ves antes de crear nada.'}
            </p>

            {faltanTipos && (
              <>
                <Pregunta titulo="¿Qué clases das?">
                  {TIPOS_CLASE_SUGERIDOS.map((t) => (
                    <Opcion key={t} activa={clasesSel.includes(t)} alPulsar={() => setClasesSel((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))}>{t}</Opcion>
                  ))}
                </Pregunta>
                <Pregunta titulo="¿Cuánto dura una clase?">
                  {OPCIONES_DURACION.map((o) => (
                    <Opcion key={o} activa={duracionSel === o} alPulsar={() => setDuracionSel(o)}>{o}</Opcion>
                  ))}
                </Pregunta>
              </>
            )}
            {faltanSalas && (
              <>
                <Pregunta titulo="¿Cuántas salas tienes?">
                  {OPCIONES_SALAS.map((o) => (
                    <Opcion key={o} activa={salasSel === o} alPulsar={() => setSalasSel(o)}>{o}</Opcion>
                  ))}
                </Pregunta>
                <Pregunta titulo="¿Cuántas plazas tiene cada sala?" ayuda="El aforo limita las reservas. Si tus salas son distintas, lo ajustas en Configuración.">
                  {OPCIONES_AFORO.map((o) => (
                    <Opcion key={o} activa={aforoSel === o} alPulsar={() => setAforoSel(o)}>{o}</Opcion>
                  ))}
                </Pregunta>
              </>
            )}

            {faltaQuien && (
              <>
                <Pregunta
                  titulo="¿Quién da las clases?"
                  ayuda={quien === 'luego'
                    ? 'Se crearán sin instructora: tendrás que asignarlas una a una desde el calendario.'
                    : 'Así cada clase sale ya con su instructora. Puedes cambiarlo clase a clase cuando quieras.'}
                >
                  <Opcion activa={quien === 'yo'} alPulsar={() => setQuien('yo')}>Las doy yo</Opcion>
                  <Opcion activa={quien === 'otra'} alPulsar={() => setQuien('otra')}>Otra persona</Opcion>
                  <Opcion activa={quien === 'luego'} alPulsar={() => setQuien('luego')}>Lo decido luego</Opcion>
                </Pregunta>
                {quien === 'otra' && (
                  <div className="mt-2">
                    <label htmlFor="primer-horario-instructora" className="sr-only">Nombre de la instructora</label>
                    <input
                      id="primer-horario-instructora"
                      type="text"
                      value={nombreOtra}
                      onChange={(e) => setNombreOtra(e.target.value)}
                      maxLength={80}
                      placeholder="Su nombre. Ej. Marta López"
                      autoComplete="off"
                      className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                    />
                  </div>
                )}
              </>
            )}

            <p className="mt-4 text-[12.5px] font-semibold text-foreground">¿Qué días abres?</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Días que abres">
              {DIAS_SEMANA.map((d) => {
                const activo = dias.includes(d.dow);
                return (
                  <button
                    key={d.dow}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setDias((v) => (activo ? v.filter((x) => x !== d.dow) : [...v, d.dow]))}
                    className={`size-9 rounded-full border text-[12.5px] font-bold transition-colors ${
                      activo
                        ? 'border-brand bg-brand text-brand-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="sr-only">{d.etiqueta}</span>
                    <span aria-hidden>{d.corto}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={dias.length === 0 || !preguntasCompletas || montando}
              onClick={() => void prepararYProponer()}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-[13.5px] font-bold text-brand-foreground transition-all hover:brightness-95 disabled:opacity-50"
            >
              {montando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
              Ver el horario propuesto
            </button>
            {errorMontaje && (
              <p role="alert" className="mt-2 text-[12.5px] leading-snug text-destructive">{errorMontaje}</p>
            )}
          </div>
        )}

        {puedeCrear && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]">
            {tiposClase.length === 0 && (
              <Link href="/configuracion?tab=clases&abrir=tipos-de-clase" className="font-semibold text-brand-medio hover:underline">
                Prefiero crear mis tipos de clase a mano
              </Link>
            )}
            <Link href="/calendario/importar" className="inline-flex items-center gap-1.5 font-semibold text-brand-medio hover:underline">
              <Upload size={14} aria-hidden />
              Ya tengo mi horario en un Excel
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Pregunta({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-[12.5px] font-semibold text-foreground">{titulo}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
      {ayuda && <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

function Opcion({ activa, alPulsar, children }: { activa: boolean; alPulsar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={alPulsar}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
        activa
          ? 'border-brand bg-brand text-brand-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}
