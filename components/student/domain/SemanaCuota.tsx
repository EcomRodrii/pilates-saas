'use client';

import { useCallback } from 'react';
import { useAsync } from '@/lib/student/useAsync';
import { getDetalleBonos } from '@/lib/student/mis-bonos';
import { textoSemana } from '@/lib/student/semana-cuota';
import { Skeleton } from '@/components/student/ui/States';

// «Esta semana» de una cuota con tope (P4-E, 5-oct-2026): cuántas le cuentan de las que incluye, con la MISMA cuenta que
// el servidor usa para dejarla reservar (`calcular_excede_limite_semanal`), leída de `POST /api/public/mis-bonos`.
//
// ⚠️ Mientras carga, con error o sin conexión, nunca un «0 de 2»: un cero inventado le diría que puede reservar dos.
export function SemanaCuota({ slug, suscripcionId, nombresTipo }: {
  slug: string;
  suscripcionId: string;
  nombresTipo: Record<string, string>;
}) {
  const cargar = useCallback(() => getDetalleBonos(slug, { semanaDe: [suscripcionId] }), [slug, suscripcionId]);
  const { data, estado, reintentar } = useAsync(cargar, () => false, `alumna:${slug}:bono-semana:${suscripcionId}`);
  const semana = data?.semanas.find((s) => s.suscripcionId === suscripcionId) ?? null;
  const texto = semana ? textoSemana(semana) : null;

  return (
    <div data-testid="semana-cuota" className="stack" style={{ ['--gap' as string]: '3px', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--muted)' }}>
      <p className="t-label" style={{ margin: 0 }}>Esta semana</p>
      {estado === 'loading' && <Skeleton h={16} w="40%" />}
      {estado === 'error' && (
        <div className="row row--between">
          <p className="t-small">No hemos podido contar tu semana.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={reintentar}>Reintentar</button>
        </div>
      )}
      {estado === 'offline' && !data && <p className="t-small">Sin conexión.</p>}
      {semana && (texto || semana.porTipo.length > 0) && (
        <>
          {texto && <p className="t-card-title t-num" data-testid="semana-cifra" style={{ margin: 0 }}>{texto.cifra}</p>}
          {texto?.recuperacion && <p className="t-meta" style={{ margin: 0 }}>{texto.recuperacion}</p>}
          {semana.porTipo.filter((t) => nombresTipo[t.tipoClaseId]).map((t) => (
            <p key={t.tipoClaseId} className="t-meta t-num" style={{ margin: 0 }}>{nombresTipo[t.tipoClaseId]}: {t.cuentan} de {t.limite}</p>
          ))}
          <p className="t-meta" style={{ margin: 0 }}>Cuentan las que has hecho y las que tienes reservadas.</p>
        </>
      )}
    </div>
  );
}
