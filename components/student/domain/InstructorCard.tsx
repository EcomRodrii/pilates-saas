import type { Instructora } from '@/lib/student/tipos';
import { notaTexto } from '@/lib/student/instructora';
import { esUrlImagenValida } from '@/lib/imagen-url';
import { Icono } from '@/components/student/ui/Icono';

/** El círculo con su foto, o sus iniciales si no la ha subido. */
function Cara({ i, lado }: { i: Instructora; lado: number }) {
  // ⚠️ La URL la teclea el staff y acaba DENTRO de un `url(...)` de CSS. Se
  // valida con el mismo `esUrlImagenValida` que ya usa «Descubre» —donde el
  // dato viene por la misma puerta— y se escapa lo único que puede salirse de
  // la declaración: la comilla y la barra invertida. Nada de `encodeURI`, que
  // volvería a codificar el `%` de una URL ya escapada (`%20` → `%2520`) y
  // convertiría la foto en un 404. Sin foto válida, iniciales.
  const foto = i.fotoUrl && esUrlImagenValida(i.fotoUrl)
    ? i.fotoUrl.replace(/["\\]/g, '\\$&')
    : null;
  return (
    <span
      aria-hidden
      style={{
        width: lado, height: lado, flexShrink: 0, borderRadius: 999,
        background: foto ? `url("${foto}") center/cover` : 'var(--accent-soft)',
        color: 'var(--accent-soft-foreground)',
        fontSize: lado >= 44 ? 'var(--t-small)' : 'var(--t-meta)', fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {!foto && i.iniciales}
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
export function InstructorCard({ i, onClick, ancha = false, proxima }: {
  i: Instructora;
  onClick?: () => void;
  ancha?: boolean;
  /**
   * Cuándo se la puede encontrar: «Mañana 10:00». Ya compuesto por quien
   * pinta la lista, porque saber qué día es hoy no es cosa de esta tarjeta.
   * `null`/ausente = no tiene ninguna clase en el horario publicado, y
   * entonces no se escribe nada — mismo criterio que la línea de la nota.
   */
  proxima?: string | null;
}) {
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
          {/* ⚠️ CUÁNDO, y solo eso. «Conoce al equipo» daba nombre, cara y
              especialidades, y no decía en qué momento de la semana existe
              cada una — que es lo que hace falta para elegir con quién
              reservar. No se repite el nombre de la clase: ya está arriba como
              especialidad en la mayoría de los casos, y el detalle completo lo
              da la hoja al tocar. */}
          {proxima && (
            <span className="t-meta trunc" data-testid="instructora-proxima" style={{ color: 'var(--accent)', fontWeight: 700 }}>
              Próxima · {proxima}
            </span>
          )}
        </span>
        <Icono nombre="chevron-derecha" tamano={18} stroke="var(--subtle-foreground)" style={{ flexShrink: 0 }} />
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
