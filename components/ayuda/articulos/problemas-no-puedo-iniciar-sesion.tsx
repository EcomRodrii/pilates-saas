import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Este artículo es para el acceso del EQUIPO (panel), no de una clienta al
// portal — ese caso, con su propio control, va en
// problemas/una-clienta-no-puede-entrar.
export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        No consigues entrar a tu panel de Tentare: contraseña que no funciona, el enlace de acceso no llega, o la
        pantalla se queda cargando sin avanzar.
      </QueEstaPasando>

      <CausasComunes items={[
        'Contraseña incorrecta o olvidada.',
        'El email con el enlace de acceso ha caído en spam o tarda unos minutos.',
        'Un bloqueador de anuncios o extensión del navegador interfiere con la verificación de seguridad de la pantalla de acceso.',
        'Estás entrando con una cuenta que no es la tuya (por ejemplo, la de empresa en vez de la de tu estudio, o al revés).',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>Usa la opción de recuperar contraseña desde la propia pantalla de acceso — el enlace tarda normalmente menos de un minuto en llegar.</p>
        <p style={{ margin: '0 0 12px' }}>Si la pantalla se queda cargando sin reaccionar durante más de 30 segundos, prueba en una pestaña nueva (o modo incógnito): un bloqueador agresivo puede impedir que la verificación de seguridad termine.</p>
        <p style={{ margin: 0 }}>Comprueba que el email con el que intentas entrar es el correcto — si gestionas más de un estudio o tienes también cuenta de equipo, es fácil confundirlas.</p>
      </ComoSolucionarlo>

      <AyudaResultado>
        Si el enlace de recuperación nunca llega, revisa{' '}
        <Link href="/ayuda/problemas/no-llega-un-email" style={{ color: 'inherit', textDecoration: 'underline' }}>no llega un email</Link>.
      </AyudaResultado>
    </>
  );
}
