import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        Un aviso por WhatsApp (a una instructora sobre una sustitución, a una alumna sobre su clase) no ha llegado.
      </QueEstaPasando>

      <CausasComunes items={[
        'El número guardado tiene un error, o le falta el prefijo de país.',
        'La persona ha bloqueado o silenciado el número desde el que escribe Tentare.',
        'Tu estudio no tiene WhatsApp activado como canal — algunos avisos van solo por email si no lo está.',
        'Un fallo puntual del envío por el lado del proveedor.',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>Comprueba el número en la ficha de la persona, con el prefijo de país incluido.</p>
        <p style={{ margin: 0 }}>Si nunca le llega ningún WhatsApp desde Tentare, confirma en Configuración que el canal de WhatsApp está activo para tu estudio — si no lo está, esos avisos se envían solo por email.</p>
      </ComoSolucionarlo>

      <AyudaResultado>
        El email es siempre el canal de respaldo: aunque el WhatsApp falle, el aviso importante también sale por
        email. Relacionado:{' '}
        <Link href="/ayuda/problemas/no-llega-un-email" style={{ color: 'inherit', textDecoration: 'underline' }}>no llega un email</Link>.
      </AyudaResultado>
    </>
  );
}
