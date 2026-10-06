'use client';

import { useCallback } from 'react';
import { useAsync } from '@/lib/student/useAsync';
import { getDetalleBonos } from '@/lib/student/mis-bonos';
import { textoSemana } from '@/lib/student/semana-cuota';
import { textoQuedaSemana } from '@/lib/student/mi-plan-vista';
import { Skeleton } from '@/components/student/ui/States';

// «Esta semana» de una cuota con tope (P4-E, 5-oct-2026; maqueta de Mi plan, 6-oct-2026): cuántas le cuentan de las que
// incluye, con la MISMA cuenta que el servidor usa para dejarla reservar (`calcular_excede_limite_semanal`), leída de
// `POST /api/public/mis-bonos`. La comparten Mi plan (con su barra) e Inicio («Lo tuyo», en una línea): misma clave de
// memoria, así que abrir una después de la otra no vuelve a pedirlo.
//
// ⚠️ Mientras carga, con error o sin conexión, nunca un «0 de 2»: un cero inventado le diría que puede reservar dos.

/** Lo que cuenta el servidor de SU semana. `activo = false`: no se pide nada (una cuota sin tope). */
export function useSemanaCuota(slug: string, suscripcionId: string | null, activo = true) {
  const cargar = useCallback(
    () => (suscripcionId && activo ? getDetalleBonos(slug, { semanaDe: [suscripcionId] }) : Promise.resolve(null)),
    [slug, suscripcionId, activo],
  );
  const { data, estado, reintentar } = useAsync(cargar, () => false, `alumna:${slug}:bono-semana:${suscripcionId ?? '-'}`);
  const semana = data?.semanas.find((s) => s.suscripcionId === suscripcionId) ?? null;
  return { semana, estado, reintentar };
}

/** Barra por clases (la de la maqueta): una pieza por cada clase que incluye la semana. */
function BarraSemana({ cuentan, limite }: { cuentan: number; limite: number }) {
  const piezas = Math.min(limite, 14);
  return (
    <div aria-hidden style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: piezas }, (_, i) => (
        <span key={i} style={{ flex: 1, height: 8, borderRadius: 'var(--radius-pill)', background: i < cuentan ? 'var(--accent)' : 'var(--muted)' }} />
      ))}
    </div>
  );
}

export function SemanaCuota({ slug, suscripcionId, nombresTipo }: {
  slug: string;
  suscripcionId: string;
  nombresTipo: Record<string, string>;
}) {
  const { semana, estado, reintentar } = useSemanaCuota(slug, suscripcionId);
  const texto = semana ? textoSemana(semana) : null;
  const queda = semana ? textoQuedaSemana(semana) : null;

  return (
    <div data-testid="semana-cuota" className="stack" style={{ ['--gap' as string]: '6px' }}>
      <div className="row row--between" style={{ alignItems: 'baseline' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800 }}>Esta semana</p>
        {estado === 'loading' && !semana && <Skeleton h={22} w={56} />}
        {texto && (
          <p className="t-num" data-testid="semana-cifra" style={{ margin: 0, fontSize: 'var(--t-h2)', fontWeight: 800 }}>
            {semana && semana.limite !== null && semana.cuentan <= semana.limite
              ? <>{semana.cuentan} <span style={{ fontSize: 'var(--t-body)', color: 'var(--muted-foreground)' }}>de {semana.limite}</span></>
              : texto.cifra}
          </p>
        )}
      </div>
      {estado === 'error' && (
        <div className="row row--between">
          <p className="t-small">No hemos podido contar tu semana.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={reintentar}>Reintentar</button>
        </div>
      )}
      {estado === 'offline' && !semana && <p className="t-small">Sin conexión.</p>}
      {semana && semana.limite !== null && <BarraSemana cuentan={semana.cuentan} limite={semana.limite} />}
      {queda && <p className="t-meta" data-testid="semana-queda" style={{ margin: 0 }}>{queda}</p>}
      {texto?.recuperacion && <p className="t-meta" style={{ margin: 0 }}>{texto.recuperacion}</p>}
      {semana?.porTipo.filter((t) => nombresTipo[t.tipoClaseId]).map((t) => (
        <p key={t.tipoClaseId} className="t-meta t-num" style={{ margin: 0 }}>{nombresTipo[t.tipoClaseId]}: {t.cuentan} de {t.limite}</p>
      ))}
    </div>
  );
}
