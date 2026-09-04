import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        Una alumna dice que ha reservado una clase y tú no la ves en tu Calendario.
      </QueEstaPasando>

      <CausasComunes items={[
        'La reserva quedó en lista de espera, no confirmada — la clase estaba completa cuando la hizo.',
        'La reserva pertenece a otro estudio (si tiene cuenta en más de uno con el mismo email, es fácil confundirse).',
        'El pago no llegó a completarse, así que la reserva nunca se creó del todo.',
        'Confirmó una hora o un día distinto al que cree.',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>
          Búscala por su nombre en la clase concreta que dice, incluyendo la lista de espera — ahí es donde suele
          estar cuando &ldquo;no aparece&rdquo;.
        </p>
        <p style={{ margin: '0 0 12px' }}>
          Si dice que pagó y no ve nada, revisa si el cobro se completó de verdad —{' '}
          <Link href="/ayuda/problemas/el-pago-falla-en-el-checkout" style={{ color: 'inherit', textDecoration: 'underline' }}>ver el pago falla en el checkout</Link>.
        </p>
        <p style={{ margin: 0 }}>Confirma con ella la fecha y hora exactas — un malentendido de horario es más común de lo que parece.</p>
      </ComoSolucionarlo>

      <AyudaResultado>
        Si de verdad reservó y pagó y no hay ni rastro, comprueba en su ficha su historial completo antes de asumir
        que se ha perdido algo — casi siempre está ahí, solo que no donde se esperaba.
      </AyudaResultado>
    </>
  );
}
