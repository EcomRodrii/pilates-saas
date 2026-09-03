'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getClases, getPagos, getReservas } from '@/lib/student/datos';
import { euros, fechaCorta } from '@/lib/student/formato';
import { CreditCard } from '@/components/student/domain/CreditCard';
import { ErrorState, Skeleton } from '@/components/student/ui/States';

// Detalle de bono (§A.13): qué compró, cuánto le queda y en qué se ha ido.
//
// ⚠️ «Sesiones usadas» se arma cruzando sus reservas con el bono, y eso tiene
// una limitación honesta: solo se ven las de las clases que siguen en el
// catálogo. El payload público no trae el histórico completo de sesiones (va
// aparte, en `POST /api/public/historial`), así que una sesión gastada en una
// clase muy antigua puede no aparecer en la lista aunque sí esté contada en
// «usadas / total», que es el dato del servidor. Por eso el titular de la
// sección dice «Sesiones usadas» y el contador de arriba manda.
export default function DetalleBonoPage() {
  const { bonoId } = useParams<{ bonoId: string }>();
  const { estudio } = useEstudio();
  const href = usePortalHref();

  const cargar = useCallback(async () => {
    const [bonos, reservas, clases, pagos] = await Promise.all([
      getBonos(estudio.slug), getReservas(estudio.slug), getClases(estudio.slug), getPagos(estudio.slug),
    ]);
    const b = bonos.find((x) => x.id === bonoId);
    if (!b) return null;
    return {
      b,
      usos: reservas
        .filter((r) => r.bonoId === b.id)
        .map((r) => ({ r, c: clases.find((c) => c.id === r.claseId) })),
      pago: pagos.find((p) => p.bonoId === b.id),
    };
  }, [estudio.slug, bonoId]);

  const { data, estado, reintentar } = useAsync(cargar, (d) => !d);

  if (estado === 'loading') {
    return (
      <StudentShell>
        <div className="px" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton h={30} w="50%" />
          <Skeleton h={110} r={16} />
          <Skeleton h={160} r={16} />
        </div>
      </StudentShell>
    );
  }

  if (!data) {
    return (
      <StudentShell>
        <div className="px" style={{ paddingTop: 12 }}>
          <ErrorState titulo="No encontramos este bono" onRetry={reintentar} />
        </div>
      </StudentShell>
    );
  }

  const { b, usos, pago } = data;

  return (
    <StudentShell>
      <PageHeader titulo={b.nombre} back />

      <div className="px grid-lg-2" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        <CreditCard bono={b} />

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
          <Fila k="Comprado" v={`${fechaCorta(b.compradoEn)} · ${euros(b.precio)}`} />
          <Fila k="Usadas / total" v={`${b.creditosUsados} / ${b.creditosTotales}`} />
          <Fila k="Caducidad" v={b.expiraEn ? fechaCorta(b.expiraEn) : 'Sin caducidad'} />
          {pago && (
            <Link href={href(`/pagos/${pago.id}`)} style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>
              Ver el recibo →
            </Link>
          )}
        </div>

        <section>
          <p className="t-label" style={{ margin: '0 0 8px' }}>Sesiones usadas</p>
          {usos.length === 0 ? (
            <p className="t-meta">Todavía no has usado ninguna sesión de este bono.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {usos.map(({ r, c }) => (
                <div
                  key={r.id}
                  className="card"
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 13px', fontSize: 12.5 }}
                >
                  <span style={{ fontWeight: 700 }}>{c?.nombre ?? 'Clase'}</span>
                  <span className="t-meta">{c ? `${fechaCorta(c.fecha)} · ${c.hora}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </StudentShell>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--muted-foreground)' }}>{k}</span>
      <b style={{ textAlign: 'right' }}>{v}</b>
    </div>
  );
}
