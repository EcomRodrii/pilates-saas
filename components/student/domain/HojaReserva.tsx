'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalHref } from '@/components/student/contexto';
import type { Bono, BookingState, Clase, Disponibilidad, Instructora } from '@/lib/student/tipos';
import type { HojaReservaControl, ModoHoja } from '@/lib/student/use-hoja-reserva';
import { esCuota, notaSinBono, type ComoVieneSinBono } from '@/lib/student/como-se-paga';
import { euros, precioClaseTexto } from '@/lib/student/formato';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { BookingSummary } from '@/components/student/domain/BookingSummary';
import { BookingStatus } from '@/components/student/domain/BookingStatus';
import { ElegirHueco, type SpotMin } from '@/components/student/domain/ElegirHueco';

/**
 * La hoja de reserva: la de la ficha de la clase, y la que abre «Reservar» desde la fila del horario. Una sola, para
 * que las dos digan lo mismo y vayan por el mismo POST.
 *
 * `contexto` decide solo a dónde llevan los botones del final: desde la ficha, «Volver a la clase» cierra y «Ver mis
 * reservas» navega; desde la fila, «Seguir en el horario» cierra y «Ver mis reservas» navega.
 */
export function HojaReserva({
  hoja, clase, desaparecida = false, instructora, disp, bono, bonoNoCubre, politicaHoras, huecos = null, yaEmpezo, contexto,
  sinBono = null, onVerOpciones,
}: {
  hoja: HojaReservaControl;
  /** La clase que se pinta: la de los datos vivos o, si ha desaparecido, la última conocida. */
  clase: Clase;
  /** La clase ya no está en los datos (cancelada, movida): se pinta la última conocida y no se deja confirmar. */
  desaparecida?: boolean;
  instructora?: Instructora;
  disp: Disponibilidad;
  bono: Bono | null;
  bonoNoCubre: boolean;
  /** La ventana de cancelación YA resuelta (tipo ?? estudio). */
  politicaHoras: number;
  /** Los sitios de la sala, si los tiene (solo la ficha deja elegir sitio). */
  huecos?: { spots: SpotMin[]; ocupados: Set<string> } | null;
  /** La clase ha empezado con la hoja abierta: ya no se puede reservar (el servidor la rechazaría). */
  yaEmpezo: boolean;
  contexto: 'ficha' | 'fila';
  /**
   * Sin nada que cubra la clase, cuál de los cuatro casos es (`comoVieneSinBono`, P01). `null` = no se sabe (payload
   * sin el ajuste de «exigir plan»): la hoja hace lo de siempre y decide el servidor.
   */
  sinBono?: ComoVieneSinBono | null;
  /**
   * «Ver cómo venir»: a las opciones de pago de ESTA clase. Lleva el sitio elegido (si la sala tiene mapa): desde la
   * ficha abre la hoja de pagar y reservar (P06), que comprueba la plaza CON ese sitio antes de cobrar.
   */
  onVerOpciones?: (spotId: string | null) => void;
}) {
  const router = useRouter();
  const href = usePortalHref();
  // El sitio elegido. `null` = que lo asigne el estudio.
  const [hueco, setHueco] = useState<string | null>(null);
  const { bk, desenlace, modoEnviado } = hoja;

  // Mientras envía, el modo con el que se envió: el aforo en vivo puede traer SU propia reserva y llenar la clase.
  const modo: ModoHoja = bk === 'submitting' && modoEnviado ? modoEnviado : disp === 'completa' ? 'espera' : 'reservar';
  const enEspera = modo === 'espera';
  const abierta = bk !== 'idle';
  const esFinal = abierta && bk !== 'reviewing' && bk !== 'submitting';
  // Solo cuenta si NADA cubre la clase: con bono o cuota, la hoja de siempre.
  const caso = bono ? null : sinBono;
  const nota = caso ? notaSinBono(caso, bonoNoCubre) : null;
  // Con el plan exigido, ni reservar ni apuntarse a la espera sin algo que la cubra: el servidor lo rechazaría
  // (`evaluar_reserva` corta en «sin-plan» antes de mirar el aforo). No se ofrece un botón que va a decir que no.
  const exigePlanSinBono = caso?.caso === 'PAGA_AQUI' || caso?.caso === 'PIDE_BONO_EN_ESTUDIO';

  const finalizar = () => {
    if (bk === 'session-expired') { router.push(href('/acceso/login')); return; }
    // Desde la ficha, «Ver mis reservas» lleva a Mis clases; desde la fila, «Seguir en el horario» solo cierra.
    if ((bk === 'confirmed' || bk === 'waitlisted') && contexto === 'ficha') { router.push(href('/mis-reservas')); return; }
    hoja.cerrar();
  };

  return (
    <Sheet open={abierta} onClose={hoja.cerrar} label="Reservar clase">
      {(bk === 'reviewing' || bk === 'submitting') && (
        <>
          <h3 className="t-h2">{enEspera ? 'Clase llena — lista de espera' : 'Confirma tu plaza'}</h3>
          <div style={{ marginTop: 12 }}>
            <BookingSummary
              clase={clase}
              instructora={instructora}
              bono={enEspera ? null : bono}
              bonoNoCubre={bonoNoCubre}
              enEspera={enEspera}
              politicaHoras={politicaHoras}
              nota={nota}
            />
          </div>
          {/* Elegir sitio: solo si la sala tiene huecos definidos, y solo cuando hay plaza — en lista de espera no hay
              sitio que elegir todavía. */}
          {huecos && !enEspera && (
            <ElegirHueco spots={huecos.spots} ocupados={huecos.ocupados} elegido={hueco} onElegir={setHueco} />
          )}
          {enEspera && !exigePlanSinBono && (
            // Era «Sin coste — solo reservas si se libera y tú confirmas»: la plaza se da SOLA al liberarse
            // (`trasPromocionDeEspera`) y consume como cualquier reserva; ella no confirma nada.
            <p className="t-meta" style={{ marginTop: 8, textAlign: 'center' }}>
              Sin coste al apuntarte. Si se libera una plaza, te avisamos; al entrar cuenta como una reserva normal.
            </p>
          )}
          {enEspera && exigePlanSinBono && (
            <p role="status" className="note note--warn" data-testid="espera-necesita-bono" style={{ marginTop: 10 }}>
              Esta clase está llena, y para apuntarte a su lista de espera necesitas un bono o una cuota que la cubra.
            </p>
          )}
          {desaparecida ? (
            <p role="status" className="note note--warn" style={{ marginTop: 14 }}>
              Esta clase ya no está en el horario: puede que se haya cancelado o movido de hora.
            </p>
          ) : yaEmpezo && bk !== 'submitting' ? (
            <Button full disabled style={{ marginTop: 14, height: 50, fontSize: 'var(--t-body)' }}>La clase ya ha empezado</Button>
          ) : caso?.caso === 'PAGA_AQUI' && !enEspera && onVerOpciones ? (
            // No se reserva aquí: sin nada que la cubra y con el plan exigido, primero se paga (la tienda con esta clase).
            <Button full onClick={() => onVerOpciones(hueco)} data-testid="ver-como-venir" style={{ marginTop: 14, height: 50, fontSize: 'var(--t-body)' }}>
              {`Ver cómo venir · desde ${euros(caso.desde)}`}
            </Button>
          ) : exigePlanSinBono ? (
            // El muro dicho con todas las letras, y sin un botón que mande al servidor algo que va a rechazar.
            <Button full variant="secondary" onClick={hoja.cerrar} style={{ marginTop: 14, height: 50, fontSize: 'var(--t-body)' }}>Cerrar</Button>
          ) : (
            <Button
              full
              loading={bk === 'submitting'}
              onClick={() => void hoja.confirmar(clase.id, enEspera ? null : hueco, modo)}
              style={{ marginTop: 14, height: 50, fontSize: 'var(--t-body)' }}
            >
              {enEspera
                ? 'Unirme a la lista de espera'
                : caso?.caso === 'PAGA_EN_ESTUDIO'
                  ? 'Reservar · pagas en el estudio'
                  : caso?.caso === 'RESERVA_SIN_PAGAR'
                    ? `Confirmar ${clase.hora}`
                    : `Confirmar ${clase.hora}${bono ? (esCuota(bono) ? ' con tu cuota' : ' con bono') : ` · ${precioClaseTexto(clase)}`}`}
            </Button>
          )}
          {bk === 'submitting' && (
            <p className="t-meta" style={{ marginTop: 8, textAlign: 'center' }}>
              Confirmando con el estudio… no cierres la app.
            </p>
          )}
        </>
      )}

      {/* Sin respuesta del servidor (no había red al tocar) no hay desenlace: el copy de la máquina. */}
      {esFinal && (
        <BookingStatus
          state={bk as Exclude<BookingState, 'idle' | 'reviewing' | 'submitting'>}
          titulo={desenlace?.titulo}
          mensaje={desenlace?.mensaje}
          acciones={desenlace?.acciones}
          contexto={contexto}
          onRetry={hoja.volverARevisar}
          // Solo si la clase admite lista de espera: tras «aforo-lleno» no la tiene (`desenlaceDeLaHoja`).
          onWaitlist={desenlace?.ofreceEspera ? hoja.volverARevisar : undefined}
          // A la tienda CON esta clase (P01): las opciones que la cubren, y la vuelta aquí tras comprar.
          onComprar={() => router.push(`${href('/comprar')}?para=${encodeURIComponent(clase.id)}`)}
          onClose={finalizar}
          onVerReservas={() => router.push(href('/mis-reservas'))}
        />
      )}
    </Sheet>
  );
}
