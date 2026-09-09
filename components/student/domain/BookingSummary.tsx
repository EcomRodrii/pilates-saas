import type { Bono, Clase, Instructora } from '@/lib/student/tipos';
import { etiquetaDia } from '@/lib/student/formato';
import { comoSePaga, type TonoPago } from '@/lib/student/como-se-paga';

/**
 * Cada tono con su cara. El fondo y la tinta salen de `.note--*`, que es el
 * componente de aviso que ya usan el recibo, la hoja de compra y la tienda — no
 * se repintan a mano aquí.
 */
const CARA: Record<TonoPago, { icono: string; clase: string }> = {
  ok: { icono: '\u2713', clase: 'note--ok' },
  coste: { icono: '!', clase: 'note--warn' },
  bloqueo: { icono: '\u00d7', clase: 'note--danger' },
};

/** Resumen antes de confirmar: clase + instructora + cómo se paga + política. */
export function BookingSummary({ clase, instructora, bono, bonoNoCubre = false, politicaHoras }: {
  clase: Clase;
  instructora?: Instructora;
  bono: Bono | null;
  /** Tiene bono con saldo pero ninguno cubre este tipo de clase. */
  bonoNoCubre?: boolean;
  /**
   * ⚠️ La ventana YA RESUELTA (`avisoCancelacion(...).horasVentana`), no
   * `estudio.politicaCancelacionHoras`. Esta pantalla se dejó fuera del arreglo
   * de #1802 y seguía prometiendo el plazo del ESTUDIO justo antes de
   * confirmar: en un estudio con 12 h y un tipo de clase con 2, le decía
   * «cancelación gratuita hasta 12 h antes» de una clase que a las 11 h ya no
   * devuelve nada. Y aquí no es un aviso: es una promesa hecha en el momento de
   * comprometerse.
   */
  politicaHoras: number;
}) {
  const { texto, tono } = comoSePaga(clase, bono, bonoNoCubre);
  const cara = CARA[tono];
  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px' }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 999, background: instructora?.fotoUrl ? 'url(' + instructora.fotoUrl + ') center/cover' : 'var(--accent-soft)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 800 }}>{clase.nombre}</p>
          <p className="t-meta" style={{ marginTop: 1 }}>{etiquetaDia(clase.fecha)} · {clase.hora} · {clase.duracionMin} min · {instructora?.nombre}</p>
        </div>
      </div>
      <div className={'note note--simbolo ' + cara.clase} data-tono={tono} style={{ marginTop: 9 }}>
        <span aria-hidden className="note-simbolo"><span>{cara.icono}</span></span>
        <span>{texto}</span>
      </div>
      <p className="t-meta" style={{ margin: '9px 0 0', textAlign: 'center', color: 'var(--subtle-foreground)' }}>Cancelación gratuita hasta {politicaHoras} h antes — recuperas la sesión.</p>
    </div>
  );
}
