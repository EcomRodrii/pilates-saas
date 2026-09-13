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

import { useMemo, useState } from 'react';
import { CalendarPlus, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';
import { DIAS_SEMANA } from '@/lib/onboarding/horario-propuesto';
import { PropuestaHorario, type ResultadoPropuesta } from '@/components/onboarding/propuesta-horario';
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
}: {
  horaApertura: string;
  horaCierre: string;
  tiposClase: { nombre: string; duracionMinutos: number }[];
  salas: { nombre: string; capacidad: number }[];
  /** Quién da las clases si el equipo es una sola persona; null = no se sabe. */
  instructora?: string | null;
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

  const entrada = useMemo(() => ({
    dias,
    horaApertura,
    horaCierre,
    duracionMinutos: tiposClase[0]?.duracionMinutos ?? 50,
    tiposClase: tiposClase.map((t) => t.nombre),
    // Cada sala con SU aforo: antes iba solo el de la primera y todo acababa
    // en ella (evaluación del 13-sep).
    salas: salas.map((s) => ({ nombre: s.nombre, capacidad: s.capacidad })),
    instructora,
  }), [dias, horaApertura, horaCierre, tiposClase, salas, instructora]);

  // Sin tipos de clase no hay nada que proponer: lo primero es crearlos.
  const puedeProponer = puedeCrear && tiposClase.length > 0;

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
        onSeguir={() => { const n = reciénCreadas; setReciénCreadas(null); onCreado(n); }}
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
              Dinos qué días abres y te preparamos un horario con tus clases. Lo ves antes de crear nada.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Días que abres">
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
              disabled={dias.length === 0}
              onClick={() => setProponiendo(true)}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-[13.5px] font-bold text-brand-foreground transition-all hover:brightness-95 disabled:opacity-50"
            >
              <Sparkles size={15} aria-hidden />
              Ver el horario propuesto
            </button>
          </div>
        )}

        {puedeCrear && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]">
            {tiposClase.length === 0 && (
              <Link href="/configuracion?tab=clases-salas" className="font-semibold text-brand-medio hover:underline">
                Crear tus tipos de clase
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
