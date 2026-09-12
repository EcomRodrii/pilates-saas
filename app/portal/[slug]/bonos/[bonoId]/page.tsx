'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getPagos } from '@/lib/student/datos';
import { euros, fechaCorta, unir } from '@/lib/student/formato';
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
    // `getReservas`/`getClases` estaban aquí solo para alimentar la lista de
    // «sesiones usadas» que se ha ido: se van con ella.
    const [bonos, pagos] = await Promise.all([getBonos(estudio.slug), getPagos(estudio.slug)]);
    const b = bonos.find((x) => x.id === bonoId);
    if (!b) return null;
    return {
      b,
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

  const { b, pago } = data;

  return (
    <StudentShell>
      {/* «Tu bono» y no el nombre del bono: la tarjeta de debajo YA lo dice,
          así que el nombre salía dos veces a dos filas de distancia. Sus dos
          pantallas hermanas ya resuelven esto igual —«Recibo» en
          `/pagos/[id]`, «Tu reserva» en `/mis-reservas/[id]`—, y en las dos la
          tarjeta es la que nombra la cosa. Esta era la única que lo repetía. */}
      <PageHeader titulo="Tu bono" back />

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '12px', marginTop: 14 }}>
        <CreditCard bono={b} />

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--t-small)' }}>
          <Fila k="Comprado" v={unir(fechaCorta(b.compradoEn), euros(b.precio))} />
          <Fila k="Usadas / total" v={`${b.creditosUsados} / ${b.creditosTotales}`} />
          <Fila k="Caducidad" v={b.expiraEn ? fechaCorta(b.expiraEn) : 'Sin caducidad'} />
          {/* ⚠️ `tap`: este enlace mide 19 px de alto y el mínimo táctil de
              WCAG 2.5.8 son 24. La clase crece la zona sensible a 44 px con un
              `::after` SIN tocar la caja pintada — la solución que el sistema
              ya tiene. Se quedó sin ella porque es un `<Link>` suelto dentro
              de una tarjeta de filas, no un control con su propio estilo. */}
          {pago && (
            <Link className="tap" href={href(`/pagos/${pago.id}`)} style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)' }}>
              Ver el recibo →
            </Link>
          )}
        </div>

        {/* ⚠️ Aquí había una sección «Sesiones usadas» que listaba las clases
            pagadas con este bono filtrando `reservas` por `r.bonoId`. Ese campo
            NO LO ESCRIBE NADIE: el único sitio del repo que pone un `bonoId` es
            `proyectarPagos`, y lo pone en un `Pago`, no en una `Reserva`. Así
            que el filtro no casaba nunca y la sección salía SIEMPRE con
            «Todavía no has usado ninguna sesión de este bono» — justo debajo de
            una fila que decía «Usadas / total: 3 / 8». La misma pantalla, dos
            respuestas opuestas sobre el bono que la alumna ha pagado.
            Y no es que faltara conectarlo: `proyectarReservas` ya documenta que
            `reservas` no guarda con qué se pagó (consumir el bono es un paso
            aparte y no deja columna). O sea que el dato no existe. Se quita la
            promesa en vez de fingirla. */}
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
