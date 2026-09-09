'use client';

import type { Historial } from '@/lib/valoracion-inicial';
import { queHaCambiado } from '@/lib/valoracion-inicial';
import {
  OBJETIVO_CHIP, EXPERIENCIA_TEXTO, NIVEL_TEXTO, CUERPO_TEXTO, ZONA_TEXTO, FRECUENCIA_TEXTO,
} from '@/lib/student/valoracion-copy';

/**
 * La valoración de la alumna, para quien le va a dar la clase.
 *
 * ⚠️ El encargo pide que se entienda «en 10-15 segundos». Eso decide la forma:
 * no es el mismo cuestionario en modo lectura, es un RESUMEN. Objetivos como
 * chips, nivel y experiencia en una línea, y lo que hay que tener en cuenta
 * destacado. Lo que la alumna escribió a mano va al final, entrecomillado —
 * porque es su voz, no un campo.
 *
 * Se parte en dos componentes, y no es una decisión estética: `FichaValoracion`
 * no lleva nada clínico y puede vivir en Resumen, a la vista de RECEPCIÓN;
 * `FichaValoracionSalud` sí, y solo puede pintarse dentro de la pestaña de
 * Salud, que ya está gateada por `puedeVerFichaClinica`. Meterlos en un solo
 * componente obligaría a elegir un único gate para los dos —y cualquiera de las
 * dos elecciones está mal.
 */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--muted)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)]">
      {children}
    </span>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</p>
      <div className="mt-1 text-sm font-semibold">{children}</div>
    </div>
  );
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** La mitad NO clínica. Recepción incluida. */
export function FichaValoracion({ historial }: { historial: Historial }) {
  const { inicial, actual, vueltas } = historial;
  // Sin ninguna completada no se pinta un bloque vacío: se dice que está
  // pendiente, que es información distinta de «no hay nada».
  if (!actual || !inicial) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Todavía no ha rellenado su valoración inicial.
      </div>
    );
  }

  const v = actual.valoracion;
  const cambios = queHaCambiado(historial);

  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Valoración inicial">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold">Valoración inicial</h3>
        <p className="text-xs text-muted-foreground">
          {vueltas > 1 ? `Actualizada el ${fecha(actual.creadoEn)}` : `Completada el ${fecha(actual.creadoEn)}`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Dato titulo="Objetivos">
          <div className="flex flex-wrap gap-1.5">
            {v.objetivos.length === 0 ? <span className="text-muted-foreground">—</span> : v.objetivos.map((o) => (
              // El principal, marcado: cuando hay cinco chips, saber cuál manda
              // es la mitad del valor de la pregunta.
              <span key={o} className={o === v.objetivoPrincipal ? 'inline-flex items-center rounded-full bg-[var(--brand,#343825)] px-2.5 py-1 text-xs font-semibold text-white' : ''}>
                {o === v.objetivoPrincipal ? OBJETIVO_CHIP[o] : <Chip>{OBJETIVO_CHIP[o]}</Chip>}
              </span>
            ))}
          </div>
        </Dato>
        <Dato titulo="Nivel">{v.nivel ? NIVEL_TEXTO[v.nivel] : '—'}</Dato>
        <Dato titulo="Experiencia">{v.experiencia ? EXPERIENCIA_TEXTO[v.experiencia] : '—'}</Dato>
        {(v.actividadHabitual || v.frecuencia) && (
          <Dato titulo="Actividad">
            {[v.actividadHabitual, v.frecuencia ? FRECUENCIA_TEXTO[v.frecuencia] : ''].filter(Boolean).join(' · ')}
          </Dato>
        )}
      </div>

      {v.expectativas && (
        <div className="mt-4 border-t pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Lo que espera</p>
          {/* Entrecomillado y en cursiva: es literalmente lo que escribió ella.
              Presentarlo como un campo más lo convierte en dato; presentarlo
              como cita lo mantiene como lo que es. */}
          <p className="mt-1 text-sm italic text-muted-foreground">«{v.expectativas}»</p>
        </div>
      )}

      {cambios.length > 0 && inicial && (
        <div className="mt-4 border-t pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Ha cambiado desde que empezó
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            El {fecha(inicial.creadoEn)} decía:{' '}
            {cambios.filter((c) => c.campo === 'nivel' || c.campo === 'experiencia')
              .map((c) => `${c.campo} ${c.antes}`).join(', ') || '—'}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * La mitad clínica. SOLO dentro de la pestaña de Salud.
 *
 * ⚠️ Enseña la inicial Y la actual cuando difieren, y ese es el motivo entero
 * de guardar las dos: si en enero dijo «lumbar» y en abril «ya no me molesta»,
 * quien le va a dar la clase necesita las dos frases, no solo la última. Una
 * molestia que se fue no es lo mismo que una molestia que nunca existió.
 */
export function FichaValoracionSalud({ historial }: { historial: Historial }) {
  const { inicial, actual } = historial;
  if (!actual || !inicial) return null;

  const hoy = actual.valoracion;
  const antes = inicial.valoracion;
  const mismaFila = inicial.id === actual.id;
  const cambioSalud = !mismaFila
    && (antes.tieneMolestias !== hoy.tieneMolestias
      || [...antes.zonas].sort().join() !== [...hoy.zonas].sort().join());

  const pinta = (v: typeof hoy) => {
    const cuerpo = v.estadoCuerpo
      ? <p className="mt-2 text-sm text-muted-foreground">{CUERPO_TEXTO[v.estadoCuerpo]}</p>
      : null;
    if (v.tieneMolestias === null) {
      return <>{cuerpo}<span className="text-muted-foreground">No lo ha indicado</span></>;
    }
    if (!v.tieneMolestias) return <>{cuerpo}<span className="text-muted-foreground">Nada que destacar</span></>;
    return (
      <>
        {cuerpo}
        <div className="flex flex-wrap gap-1.5">
          {v.zonas.map((z) => (
            <span key={z} className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {ZONA_TEXTO[z]}
            </span>
          ))}
        </div>
        {v.detalle && <p className="mt-2 text-sm italic text-muted-foreground">«{v.detalle}»</p>}
      </>
    );
  };

  return (
    <section className="rounded-xl border bg-card p-4" aria-label="A tener en cuenta">
      <h3 className="mb-3 text-sm font-bold">A tener en cuenta</h3>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {cambioSalud ? 'Ahora' : 'Lo que nos contó'}
        </p>
        <div className="mt-1.5">{pinta(hoy)}</div>
      </div>

      {cambioSalud && (
        <div className="mt-4 border-t pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Cuando empezó · {fecha(inicial.creadoEn)}
          </p>
          <div className="mt-1.5 opacity-70">{pinta(antes)}</div>
        </div>
      )}

      {/* Lo que este bloque NO es. Va escrito en pantalla y no solo en el
          código: sin esta línea, una lista de zonas del cuerpo con fecha se lee
          como un historial médico, y no lo es — lo escribió la alumna sobre sí
          misma, sin que nadie la explorara. */}
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        Lo declaró la propia alumna. No es un diagnóstico ni sustituye a uno.
      </p>
    </section>
  );
}
