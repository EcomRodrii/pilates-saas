'use client';
import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import type { Clase, Disponibilidad, Instructora } from '@/lib/student/tipos';
import { AvailabilityBadge } from '@/components/student/ui/Badge';
import { precioClaseTexto } from '@/lib/student/formato';
// ⚠️ Los enlaces del paquete son absolutos ('/reservar/…') porque allí la app
// es la única del proyecto. Aquí cuelgan del slug del estudio, así que pasan
// por `usePortalHref()`: dejarlos absolutos mandaría a la alumna a la landing
// de Tentare o al panel.
/** Fila de clase del horario (kit): hora mono | divisor | logo | nombre + avatar instructora | badge + precio. */
export function ClassCard({ clase, instructora, estado, conBono, delay = 0 }: { clase: Clase; instructora?: Instructora; estado: Disponibilidad; conBono: boolean; delay?: number }) {
  const href = usePortalHref();
  return (
    <Link href={href('/reservar/' + clase.id)} className="card card--tap a-up" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', animationDelay: delay + 'ms', borderColor: estado === 'reservada' ? 'var(--accent)' : undefined, borderWidth: estado === 'reservada' ? 1.5 : 1 }}>
      <div style={{ textAlign: 'center', minWidth: 46 }}>
        <p className="t-mono" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{clase.hora}</p>
        <p style={{ margin: '1px 0 0', fontSize: 9.5, color: 'var(--subtle-foreground)' }}>{clase.duracionMin} min</p>
      </div>
      <div aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--muted)' }} />
      {/* El logo del tipo de clase. Hasta ahora la fila no enseñaba NINGUNA
          imagen de la clase — la única era el avatar de la instructora, dos
          líneas más abajo, que es otra cosa.

          Solo se pinta si la propietaria ha subido uno: `lib/imagenes-por-defecto.ts`
          documenta, y con razón, que no se ponga imagen por defecto en las
          miniaturas de los listados («la misma foto ocho veces se lee como un
          error; el color del tipo de clase distingue mejor»). Un logo propio
          por clase no es ese caso; a falta de él, la fila queda como estaba. */}
      {clase.logoUrl && (
        <span
          aria-hidden
          data-testid="logo-clase"
          style={{
            width: 34, height: 34, flexShrink: 0, borderRadius: 10,
            background: 'url(' + clase.logoUrl + ') center/cover',
            border: '1px solid var(--muted)',
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clase.nombre}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span aria-hidden style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0, background: instructora?.fotoUrl ? 'url(' + instructora.fotoUrl + ') center/cover' : 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', fontSize: 8.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{!instructora?.fotoUrl && instructora?.iniciales}</span>
          <p className="t-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{instructora?.nombre ?? '—'} · {clase.sala}</p>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <AvailabilityBadge estado={estado} plazas={clase.plazasLibres} />
        <p style={{ margin: '5px 0 0', fontSize: 11.5, fontWeight: 800, color: 'var(--muted-foreground)' }}>{conBono ? '1 sesión' : precioClaseTexto(clase)}</p>
      </div>
    </Link>
  );
}
