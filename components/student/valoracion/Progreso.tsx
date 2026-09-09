'use client';

/**
 * Dónde va y cuánto queda.
 *
 * Se enseña el número además de la barra («Paso 3 de 9») porque una barra sola
 * responde «¿voy por la mitad?» pero no «¿cuánto me queda?», que es la pregunta
 * que decide si alguien sigue o lo deja. Y el total es el REAL —el de los pasos
 * que va a ver ella, no el del catálogo entero—, así que quien no da su
 * consentimiento de salud ve «de 8» y no «de 11» con tres que nunca aparecen.
 */
export function Progreso({ indice, total }: { indice: number; total: number }) {
  const pct = Math.round(((indice + 1) / Math.max(1, total)) * 100);
  return (
    <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
      <div className="row row--between">
        <p className="t-label">Paso {indice + 1} de {total}</p>
        <p className="t-meta t-num">{pct}%</p>
      </div>
      <div
        className="bar"
        role="progressbar"
        aria-valuenow={indice + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Progreso de tu valoración"
        style={{ ['--pct' as string]: `${pct}%` }}
      >
        <i />
      </div>
    </div>
  );
}
