'use client';

import Link from 'next/link';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';
import { coloresMonograma, inicialDe } from '@/lib/monograma-estudio';
import { usePortalHref } from '@/components/student/contexto';
import type { Bono, Clase, Disponibilidad, Instructora } from '@/lib/student/tipos';
import type { EstadoTemporal } from '@/lib/student/fila-horario';
import { textoPagoFila } from '@/lib/student/como-se-paga';
import { Foto } from '@/components/student/ui/Foto';
import { EstadoDeClase } from '@/components/student/domain/EstadoDeClase';

/**
 * La fila de una clase en el HORARIO (P11 + P12, 5-oct-2026). Inicio y Calendario siguen con `ClassCard`.
 *
 * · Un cuadro de 56 px con la foto PROPIA del tipo de clase o de su sala (`fotoPropiaUrl`: nunca una de por defecto ni
 *   la del estudio, que repetida en cada fila se lee como un error). Con foto y logo, la foto con el logo pequeño en
 *   una esquina (no se pierde el logo de hoy). Sin foto, el logo o el color del tipo con su inicial, como antes.
 * · «07:00 · 60 min», el nombre en hasta dos líneas, y la cara de la instructora con la sala.
 * · A la derecha, lo de siempre (`EstadoDeClase`) y, solo cuando la hoja diría «No pagas nada hoy» y todo lo demás está
 *   en verde (`accionDeFila`), «Reservar»: abre la MISMA hoja que la ficha y va por el mismo POST.
 *
 * ⚠️ La tarjeta entera lleva a la ficha con un enlace ESTIRADO (`::after`) sobre la columna central, así que su nombre
 * accesible sigue diciendo la hora, la clase y la instructora. El botón queda por ENCIMA del enlace (z-index): tocarlo no
 * abre la ficha. Un botón dentro de un `<a>` no es válido, y por eso la fila ya no es un `<a>`.
 */
export function FilaHorario({ clase, instructora, estado, temporal, bono, ofreceReservar, onReservar, delay = 0 }: {
  clase: Clase; instructora?: Instructora; estado: Disponibilidad; temporal: EstadoTemporal;
  /** Lo que pagaría esta clase (`bonoParaClase`). */
  bono: Bono | null;
  ofreceReservar: boolean;
  onReservar: () => void;
  delay?: number;
}) {
  const href = usePortalHref();
  const suya = estado === 'reservada';
  return (
    <div
      className="card card--tap a-up fila-horario"
      data-testid="fila-horario"
      data-clase={clase.id}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', animationDelay: delay + 'ms',
        borderColor: suya ? 'var(--accent)' : undefined, borderWidth: suya ? 1.5 : 1,
      }}
    >
      <CuadroClase clase={clase} />
      <Link
        href={href('/reservar/' + clase.id)}
        transitionTypes={TRANSICION_ADELANTE}
        className="fila-horario__enlace"
        style={{ flex: 1, minWidth: 0, color: 'inherit' }}
      >
        <span className="t-meta t-num" style={{ display: 'block', fontWeight: 700 }}>{clase.hora} · {clase.duracionMin} min</span>
        {/* Sin `display` en línea: el recorte a dos líneas es `display: -webkit-box` (student.css), y uno en línea lo pisaría. */}
        <span className="fila-horario__nombre" style={{ fontSize: 'var(--t-body)', fontWeight: 800, marginTop: 1 }}>{clase.nombre}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span aria-hidden style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0, background: instructora?.fotoUrl ? 'url(' + instructora.fotoUrl + ') center/cover' : 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', fontSize: 'var(--t-micro)', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{!instructora?.fotoUrl && instructora?.iniciales}</span>
          <span className="t-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{instructora?.nombre ?? '—'}{clase.sala ? ` · ${clase.sala}` : ''}</span>
        </span>
      </Link>
      <div className="fila-horario__derecha" style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <EstadoDeClase clase={clase} estado={estado} temporal={temporal} />
        {ofreceReservar && (
          <button
            type="button"
            className="pill fila-horario__reservar"
            aria-label={`Reservar ${clase.nombre} a las ${clase.hora}`}
            onClick={onReservar}
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', borderColor: 'transparent', fontWeight: 800 }}
          >
            Reservar
          </button>
        )}
        {/* Cómo se pagaría, de la misma clasificación que la hoja: «Cuota», «1 sesión», el precio o «Solo con bono». En
            curso, terminada o sin abrir no se dice: ya no se reserva. */}
        {temporal === 'plazas' && (
          <p className="t-micro" style={{ margin: 0, fontWeight: 800, color: 'var(--muted-foreground)' }}>{textoPagoFila(clase, bono)}</p>
        )}
      </div>
    </div>
  );
}

/** El cuadro de 56 px: foto propia (con el logo en una esquina), logo, o el color del tipo con su inicial. */
function CuadroClase({ clase }: { clase: Clase }) {
  const chip = coloresMonograma(clase.color);
  const caja = { width: 56, height: 56, borderRadius: 12, flexShrink: 0, position: 'relative' as const, overflow: 'hidden' };
  const fondoChip = (
    <span aria-hidden data-testid="color-clase" style={{ ...caja, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: chip.fondo, color: chip.texto, fontSize: 'var(--t-body)', fontWeight: 800 }}>
      {inicialDe(clase.tipo)}
    </span>
  );
  if (clase.fotoPropiaUrl) {
    return (
      <span aria-hidden style={caja}>
        {/* Debajo, el color: si la foto no carga, `Foto` la oculta y queda el chip, no un hueco. */}
        <span style={{ position: 'absolute', inset: 0, background: chip.fondo }} />
        <span data-testid="foto-clase" style={{ position: 'absolute', inset: 0 }}>
          <Foto src={clase.fotoPropiaUrl} ancho={56} alto={56} sizes="56px" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </span>
        {clase.logoUrl && (
          <span data-testid="logo-clase" style={{ position: 'absolute', right: 4, bottom: 4, width: 20, height: 20, borderRadius: 6, background: 'url(' + clase.logoUrl + ') center/cover', border: '1px solid var(--card)' }} />
        )}
      </span>
    );
  }
  if (clase.logoUrl) {
    return <span aria-hidden data-testid="logo-clase" style={{ ...caja, background: 'url(' + clase.logoUrl + ') center/cover', border: '1px solid var(--muted)' }} />;
  }
  return <span aria-hidden style={caja}>{fondoChip}</span>;
}
