import type { Instructora } from '@/lib/student/tipos';
import { notaTexto } from '@/lib/student/instructora';

/** El círculo con su foto, o sus iniciales si no la ha subido. */
function Cara({ i, lado }: { i: Instructora; lado: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: lado, height: lado, flexShrink: 0, borderRadius: 999,
        background: i.fotoUrl ? 'url(' + i.fotoUrl + ') center/cover' : 'var(--accent-soft)',
        color: 'var(--accent-soft-foreground)',
        fontSize: lado >= 44 ? 'var(--t-small)' : 'var(--t-meta)', fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {!i.fotoUrl && i.iniciales}
    </span>
  );
}

/**
 * Una instructora. Dos formas, un solo componente.
 *
 * ⚠️ `ancha` no es un capricho de estilo: son dos papeles distintos. En el
 * horario esto es un CHIP —una de varias en una fila que se desplaza, para
 * filtrar—, y ahí una píldora es lo correcto. En «Instructoras» es el
 * CONTENIDO de la pantalla, y la píldora se quedaba flotando a la izquierda de
 * una línea vacía, como un filtro huérfano. Va aquí y no en la pantalla nueva
 * para que siga habiendo una sola cosa que sepa cómo se dibuja una instructora.
 */
export function InstructorCard({ i, onClick, ancha = false }: { i: Instructora; onClick?: () => void; ancha?: boolean }) {
  const nota = i.rating ? notaTexto(i.rating, undefined) : null;

  if (ancha) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="card card--tap"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, textAlign: 'left' }}
      >
        <Cara i={i} lado={44} />
        <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: '-.01em' }}>{i.nombre}</span>
          {/* Solo lo que hay: sin nota y sin especialidades no se pinta una
              segunda línea vacía para que la tarjeta «tenga dos líneas». */}
          {(nota || i.especialidades.length > 0) && (
            <span className="t-meta trunc">
              {nota && <><span style={{ color: 'var(--warning)' }}>★</span> {nota}</>}
              {nota && i.especialidades.length > 0 && ' · '}
              {i.especialidades.join(' · ')}
            </span>
          )}
        </span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--subtle-foreground)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className="card card--tap" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '6px 13px 6px 6px', borderRadius: 999, textAlign: 'left' }}>
      <Cara i={i} lado={32} />
      <span style={{ fontSize: 'var(--t-small)', fontWeight: 700 }}>{i.nombre}{nota && <span style={{ color: 'var(--muted-foreground)' }}> · <span style={{ color: 'var(--warning)' }}>★</span> {nota}</span>}</span>
    </button>
  );
}
