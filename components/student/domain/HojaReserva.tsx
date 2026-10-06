'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalHref } from '@/components/student/contexto';
import type { Bono, BookingState, Clase, Disponibilidad, Instructora } from '@/lib/student/tipos';
import type { HojaReservaControl, ModoHoja } from '@/lib/student/use-hoja-reserva';
import { esCuota } from '@/lib/student/como-se-paga';
import { precioClaseTexto } from '@/lib/student/formato';
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
            />
          </div>
          {/* Elegir sitio: solo si la sala tiene huecos definidos, y solo cuando hay plaza — en lista de espera no hay
              sitio que elegir todavía. */}
          {huecos && !enEspera && (
            <ElegirHueco spots={huecos.spots} ocupados={huecos.ocupados} elegido={hueco} onElegir={setHueco} />
          )}
          {enEspera && (
            // Era «Sin coste — solo reservas si se libera y tú confirmas»: la plaza se da SOLA al liberarse
            // (`trasPromocionDeEspera`) y consume como cualquier reserva; ella no confirma nada.
            <p className="t-meta" style={{ marginTop: 8, textAlign: 'center' }}>
              Sin coste al apuntarte. Si se libera una plaza, te avisamos; al entrar cuenta como una reserva normal.
            </p>
          )}
          {desaparecida ? (
            <p role="status" className="note note--warn" style={{ marginTop: 14 }}>
              Esta clase ya no está en el horario: puede que se haya cancelado o movido de hora.
            </p>
          ) : yaEmpezo && bk !== 'submitting' ? (
            <Button full disabled style={{ marginTop: 14, height: 50, fontSize: 'var(--t-body)' }}>La clase ya ha empezado</Button>
          ) : (
            <Button
              full
              loading={bk === 'submitting'}
              onClick={() => void hoja.confirmar(clase.id, enEspera ? null : hueco, modo)}
              style={{ marginTop: 14, height: 50, fontSize: 'var(--t-body)' }}
            >
              {enEspera
                ? 'Unirme a la lista de espera'
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
          onComprar={() => router.push(href('/comprar'))}
          onClose={finalizar}
          onVerReservas={() => router.push(href('/mis-reservas'))}
        />
      )}
    </Sheet>
  );
}
