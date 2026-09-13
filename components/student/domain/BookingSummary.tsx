import type { Bono, Clase, Instructora } from '@/lib/student/tipos';
import { etiquetaDia } from '@/lib/student/formato';
import { comoSePaga, type TonoPago } from '@/lib/student/como-se-paga';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';

/**
 * Cada tono con su cara. El fondo y la tinta salen de `.note--*`, que es el
 * componente de aviso que ya usan el recibo, la hoja de compra y la tienda — no
 * se repintan a mano aquí.
 */
const CARA: Record<TonoPago, { icono: NombreIcono; clase: string }> = {
  ok: { icono: 'hecho', clase: 'note--ok' },
  coste: { icono: 'aviso', clase: 'note--warn' },
  bloqueo: { icono: 'cerrar', clase: 'note--danger' },
};

/** Resumen antes de confirmar: clase + instructora + cómo se paga + política. */
export function BookingSummary({ clase, instructora, bono, bonoNoCubre = false, enEspera = false, politicaHoras }: {
  clase: Clase;
  instructora?: Instructora;
  bono: Bono | null;
  /** Tiene bono con saldo pero ninguno cubre este tipo de clase. */
  bonoNoCubre?: boolean;
  /**
   * Apuntarse a la LISTA DE ESPERA, no reservar.
   *
   * ⚠️ Aquí no se pinta el aviso de pago, y no es una simplificación: quien
   * llama pasa `bono={null}` a propósito porque apuntarse no consume nada
   * todavía, así que `comoSePaga` leía «no tiene bono» y soltaba «esta clase
   * solo se reserva con bono» a quien SÍ lo tiene. Daba igual mientras los
   * cuatro mensajes salían con el mismo ✓ verde y nadie los leía como una
   * negativa; en cuanto cada tono tiene su cara, ese texto es un × rojo
   * delante de una alumna con bono de sobra. La respuesta no es fingir un
   * tono: es que en una lista de espera esa pregunta todavía no toca — y la
   * hoja ya dice lo que sí toca («Sin coste — solo reservas si se libera»).
   */
  enEspera?: boolean;
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
        {/* Sin foto, sus iniciales: el disco vacío parecía una imagen que no cargó. */}
        <AvatarSocia nombre={instructora?.nombre} fotoUrl={instructora?.fotoUrl} size={36} className="no-shrink" />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 800 }}>{clase.nombre}</p>
          <p className="t-meta" style={{ marginTop: 1 }}>{etiquetaDia(clase.fecha)} · {clase.hora} · {clase.duracionMin} min · {instructora?.nombre}</p>
        </div>
      </div>
      {!enEspera && (
        <>
          <div className={'note note--simbolo ' + cara.clase} data-tono={tono} style={{ marginTop: 9 }}>
            <span aria-hidden className="note-simbolo"><span style={{ display: 'flex' }}><Icono nombre={cara.icono} tamano={14} grosor={2} /></span></span>
            <span>{texto}</span>
          </div>
          <p className="t-meta" style={{ margin: '9px 0 0', textAlign: 'center', color: 'var(--subtle-foreground)' }}>Cancelación gratuita hasta {politicaHoras} h antes — recuperas la sesión.</p>
        </>
      )}
    </div>
  );
}
