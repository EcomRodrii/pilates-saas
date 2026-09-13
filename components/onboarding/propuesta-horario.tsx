'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Este es tu horario» — la semana que Tentare propone al terminar el asistente.
//
// ⚠️ EL PASO QUE FALTABA, medido. Sobre las 10 altas reales de producción: 10
// de 10 acaban con salas, 9 de 10 con tipos de clase, y solo 4 de 10 llegan a
// programar UNA sola clase. La caída cae exactamente donde el asistente deja de
// crear cosas — y sin clases programadas la página pública no tiene nada que
// enseñar, así que la primera reserva es imposible por construcción (2 de 10).
//
// ⚠️ PROPONE, NO IMPONE. La regla del onboarding es «solo se crea lo que la
// propietaria ha dicho». Aquí lo VE antes de que exista: puede quitar clases
// una a una o descartar la semana entera. Solo se escribe si confirma, y
// entonces sí lo ha dicho. Esa es toda la diferencia con generarlo a su
// espalda.
//
// No hay endpoint nuevo: escribe por `POST /api/clases/import`, el importador
// de horario que ya existe, que expande filas por día de la semana, empareja
// sala e instructora por nombre y registra el lote en `migracion_batches` —
// así que esto se puede DESHACER desde la Migración Mágica como cualquier otra
// importación.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, Check, Loader2, Undo2, X } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import {
  proponerHorario, resumirPropuesta, DIAS_SEMANA, SEMANAS_A_CREAR,
  type ClasePropuesta, type EntradaPropuesta,
} from '@/lib/onboarding/horario-propuesto';

export type ResultadoPropuesta = { creadas: number } | 'descartada';

export function PropuestaHorario({
  entrada,
  onTerminar,
  compacta = false,
}: {
  entrada: EntradaPropuesta;
  onTerminar: (r: ResultadoPropuesta) => void;
  /** Dentro del calendario va embebida, no a pantalla completa. */
  compacta?: boolean;
}) {
  const inicial = useMemo(() => proponerHorario(entrada), [entrada]);
  const [clases, setClases] = useState<ClasePropuesta[]>(inicial);
  // ⚠️ Quitar un chip era irreversible: una clase quitada por error solo se
  // recuperaba descartando la propuesta entera. Se guarda lo quitado, con su
  // posición, para poder deshacerlo.
  const [quitadas, setQuitadas] = useState<{ clase: ClasePropuesta; pos: number }[]>([]);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resumen = resumirPropuesta(clases);
  // Con varias salas se dice en qué sala va cada clase: es la decisión que más
  // se nota (aforo) y la que antes salía mal sin que se viera.
  const variasSalas = new Set(inicial.map((c) => c.sala)).size > 1;

  const quitar = useCallback((i: number) => {
    setClases((c) => {
      setQuitadas((q) => [...q, { clase: c[i], pos: i }]);
      return c.filter((_, n) => n !== i);
    });
  }, []);

  const deshacer = useCallback(() => {
    setQuitadas((q) => {
      const ultima = q[q.length - 1];
      if (!ultima) return q;
      setClases((c) => [...c.slice(0, ultima.pos), ultima.clase, ...c.slice(ultima.pos)]);
      return q.slice(0, -1);
    });
  }, []);

  const crear = useCallback(async () => {
    if (clases.length === 0 || creando) return;
    setError(null);
    // El estado de carga se enciende ANTES del await: crear cuatro semanas de
    // clases tarda, y un botón inerte se vuelve a pulsar.
    setCreando(true);
    try {
      const res = await fetch('/api/clases/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          rows: clases.map((c) => ({
            clase: c.clase,
            fecha: null,
            diaSemana: c.diaSemana,
            horaInicio: c.horaInicio,
            horaFin: c.horaFin,
            duracion: null,
            instructor: c.instructor,
            sala: c.sala,
            aforo: c.aforo,
          })),
          semanas: SEMANAS_A_CREAR,
          // Distingue este camino del de importar un Excel: son dos
          // conversiones distintas y mezclarlas oculta cuál funciona.
          origen: 'onboarding',
        }),
      });
      if (!res.ok) {
        // ⚠️ Se comprueba la respuesta, no se da por buena. Un horario que
        // dice «listo» y no ha creado nada deja a la propietaria con un
        // calendario vacío creyendo que lo tiene hecho — que es justo el
        // agujero que este paso viene a tapar.
        const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
        setError(cuerpo?.error ?? 'No hemos podido crear tu horario. Puedes crearlo desde el calendario cuando quieras.');
        return;
      }
      const cuerpo = await res.json().catch(() => null) as { creadas?: number } | null;
      onTerminar({ creadas: cuerpo?.creadas ?? clases.length * SEMANAS_A_CREAR });
    } catch (e) {
      capturarExcepcion(e instanceof Error ? e : new Error(String(e)), { tags: { area: 'onboarding-horario' } });
      setError('No hemos podido crear tu horario. Puedes crearlo desde el calendario cuando quieras.');
    } finally {
      setCreando(false);
    }
  }, [clases, creando, onTerminar]);

  if (inicial.length === 0) {
    // Sin datos suficientes no se enseña una propuesta vacía: se sale sin
    // ruido y el calendario ya ofrece los otros caminos.
    return null;
  }

  const instructora = inicial[0]?.instructor ?? null;

  return (
    <div className={compacta ? '' : 'mx-auto w-full max-w-[560px] px-5 py-8'}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <CalendarDays size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold leading-tight tracking-tight text-foreground">
            Este sería tu horario
          </h2>
          <p className="mt-1 text-[13.5px] leading-snug text-muted-foreground">
            {clases.length === 0
              ? 'Has quitado todas las clases. Puedes crear tu horario desde el calendario cuando quieras.'
              : <>Lo hemos montado con lo que nos has contado. Quita lo que no encaje —
                  {' '}<strong className="text-foreground">tú lo confirmas</strong>, no se crea nada hasta entonces.</>}
          </p>
          {clases.length > 0 && (variasSalas || instructora) && (
            <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
              {variasSalas && 'Las de máquina van a la sala pequeña y las de suelo a la grande, cada una con su aforo. '}
              {instructora && <>Las das tú (<strong className="text-foreground">{instructora}</strong>); las repartes luego si hace falta.</>}
            </p>
          )}
        </div>
      </div>

      {clases.length > 0 && (
        <>
          <div className="mt-5 space-y-3">
            {DIAS_SEMANA.filter((d) => clases.some((c) => c.diaSemana === d.dow)).map((dia) => (
              <div key={dia.dow}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {dia.etiqueta}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {clases.map((c, i) => (c.diaSemana === dia.dow ? (
                    <span
                      key={`${c.diaSemana}-${c.horaInicio}-${c.clase}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-[12.5px]"
                    >
                      <span className="tabular-nums font-semibold text-foreground">{c.horaInicio}</span>
                      <span className="text-muted-foreground">
                        {c.clase}
                        {variasSalas && c.sala ? <span className="text-muted-foreground/70"> · {c.sala}</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitar(i)}
                        aria-label={`Quitar ${c.clase} del ${dia.etiqueta.toLowerCase()} a las ${c.horaInicio}`}
                        className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X size={12} strokeWidth={2.5} aria-hidden />
                      </button>
                    </span>
                  ) : null))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[12.5px] text-muted-foreground">
            {resumen.porSemana} clases por semana · se crean las {SEMANAS_A_CREAR} próximas semanas
            {' '}({resumen.clases} en total). Podrás cambiarlas o borrarlas desde el calendario.
          </p>
        </>
      )}

      {quitadas.length > 0 && (
        <button
          type="button"
          onClick={deshacer}
          disabled={creando}
          className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-medio hover:underline disabled:opacity-50"
        >
          <Undo2 size={13} aria-hidden />
          Deshacer: volver a poner {quitadas[quitadas.length - 1].clase.clase} a las {quitadas[quitadas.length - 1].clase.horaInicio}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] leading-snug text-destructive">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={crear}
          disabled={creando || clases.length === 0}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-[14.5px] font-bold text-brand-foreground transition-all hover:brightness-95 disabled:opacity-50"
        >
          {creando ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} strokeWidth={3} aria-hidden />}
          {creando ? 'Creando tu horario…' : 'Crear este horario'}
        </button>
        <button
          type="button"
          onClick={() => onTerminar('descartada')}
          disabled={creando}
          className="text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Lo monto yo
        </button>
      </div>
    </div>
  );
}
