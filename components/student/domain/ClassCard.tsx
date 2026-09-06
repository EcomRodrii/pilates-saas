'use client';
import Link from 'next/link';
import { coloresMonograma, inicialDe } from '@/lib/monograma-estudio';
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
  const chip = coloresMonograma(clase.color);
  return (
    <Link href={href('/reservar/' + clase.id)} className="card card--tap a-up" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', animationDelay: delay + 'ms', borderColor: estado === 'reservada' ? 'var(--accent)' : undefined, borderWidth: estado === 'reservada' ? 1.5 : 1 }}>
      {/* El bloque de la izquierda: LOGO de la clase sobre la hora.
          Aquí es donde se mira, y es lo que identifica a esta clase — el banner
          de la cabecera HEREDA (tipo → sala → estudio), así que a menudo es la
          misma foto para todas.

          Estuvo un tiempo suelto a la derecha del divisor, entre la hora y el
          nombre, y ahí no pertenecía a ninguna de las dos cosas: partía la
          fila en tres y el nombre perdía su sitio.

          Solo se pinta si la propietaria ha subido uno: `lib/imagenes-por-defecto.ts`
          documenta, y con razón, que no se ponga imagen por defecto en las
          miniaturas de los listados («la misma foto ocho veces se lee como un
          error; el color del tipo de clase distingue mejor»). Un logo propio
          por clase no es ese caso; a falta de él, la fila queda como estaba. */}
      <div className="stack" style={{ ['--gap' as string]: '5px', alignItems: 'center', minWidth: 46 }}>
        {clase.logoUrl ? (
          <span
            aria-hidden
            data-testid="logo-clase"
            style={{
              width: 30, height: 30, borderRadius: 9,
              background: 'url(' + clase.logoUrl + ') center/cover',
              border: '1px solid var(--muted)',
            }}
          />
        ) : (
          /* Sin logo, el COLOR del tipo con su inicial.
             Antes aquí no iba nada, y en un horario donde unas clases tienen
             logo y otras no las filas quedaban de distinta altura y solo
             algunas con marca: la lista se veía a medio hacer.
             El color no se inventa —es obligatorio en `tipos_clase` y lo elige
             la propietaria— y es justo lo que `imagenes-por-defecto.ts` señala
             como la forma correcta de distinguir clases en un listado: «la
             misma foto ocho veces se lee como un error; el color del tipo de
             clase distingue mejor».
             El par fondo/texto sale de `coloresMonograma`, que ya resuelve el
             contraste con WCAG y valida el color: un color roto cae al oliva de
             marca en vez de dejar el chip invisible. */
          <span
            aria-hidden
            data-testid="color-clase"
            style={{
              width: 30, height: 30, borderRadius: 9,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: chip.fondo, color: chip.texto,
              fontSize: 12, fontWeight: 800, letterSpacing: '-.02em',
            }}
          >
            {inicialDe(clase.tipo)}
          </span>
        )}
        <div style={{ textAlign: 'center' }}>
          <p className="t-mono" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{clase.hora}</p>
          <p style={{ margin: '1px 0 0', fontSize: 9.5, color: 'var(--subtle-foreground)' }}>{clase.duracionMin} min</p>
        </div>
      </div>
      <div aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--muted)' }} />
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
