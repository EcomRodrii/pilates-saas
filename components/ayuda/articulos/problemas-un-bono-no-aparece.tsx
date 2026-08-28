import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        Una alumna dice que ha pagado un bono o plan y no lo ve en su portal, o tú no lo ves en su ficha.
      </QueEstaPasando>

      <CausasComunes items={[
        'El pago no llegó a completarse del todo — se quedó a medias en el checkout.',
        'Compró desde una cuenta con un email distinto al que tiene guardado contigo.',
        'El bono existe pero está congelado, y en ese estado no se muestra como "disponible para reservar".',
        'Se asignó a otro estudio, si gestiona su cuenta en más de uno.',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>
          Comprueba primero en Cobros si el pago llegó a completarse — si no, sigue{' '}
          <Link href="/ayuda/problemas/el-pago-falla-en-el-checkout" style={{ color: 'inherit', textDecoration: 'underline' }}>el pago falla en el checkout</Link>.
        </p>
        <p style={{ margin: '0 0 12px' }}>Si el cobro sí se completó, revisa en su ficha si el bono aparece congelado en vez de activo.</p>
        <p style={{ margin: 0 }}>Confirma que estás mirando la ficha de la clienta correcta — un nombre parecido entre dos clientas es un despiste habitual.</p>
      </ComoSolucionarlo>

      <AyudaResultado>
        Un cobro completado siempre genera su bono o activa su plan en el mismo momento — si el dinero entró y el
        bono no está, es que está en un sitio distinto de donde se ha mirado, no que se haya perdido.
      </AyudaResultado>
    </>
  );
}
