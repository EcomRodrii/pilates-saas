import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        Una alumna te escribe diciendo que no consigue entrar a su portal de reservas.
      </QueEstaPasando>

      <CausasComunes items={[
        'Está intentando entrar con un email distinto al que usó para reservar por primera vez.',
        'Nunca ha puesto contraseña — necesita pedir el enlace de acceso, no adivinar una que no existe.',
        'El enlace de acceso ha caído en spam.',
        'Está entrando en el portal de otro estudio (una URL parecida, pero de otra propietaria de Tentare).',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>
          Confirma con ella el email exacto que usó al reservar — es la clave que la identifica, no su nombre.
        </p>
        <p style={{ margin: '0 0 12px' }}>
          Dile que use el control{' '}
          <strong>&ldquo;No tengo contraseña o la he olvidado — mándame un enlace&rdquo;</strong> en la pantalla de
          acceso, en vez de intentar adivinar una contraseña que quizá nunca llegó a crear. Ver{' '}
          <Link href="/ayuda/portal/acceso-de-una-clienta" style={{ color: 'inherit', textDecoration: 'underline' }}>cómo entra una clienta por primera vez</Link>.
        </p>
        <p style={{ margin: 0 }}>
          Si el enlace no le llega en unos minutos, pídele que revise spam, y comprueba tú en la ficha de la clienta
          que el email guardado es exactamente el mismo que está usando ella.
        </p>
      </ComoSolucionarlo>

      <AyudaResultado>
        Tú no puedes crearle una contraseña ni entrar en su lugar — el acceso siempre lo termina de poner ella, por
        seguridad. Si el enlace nunca llega, revisa{' '}
        <Link href="/ayuda/problemas/no-llega-un-email" style={{ color: 'inherit', textDecoration: 'underline' }}>no llega un email</Link>.
      </AyudaResultado>
    </>
  );
}
