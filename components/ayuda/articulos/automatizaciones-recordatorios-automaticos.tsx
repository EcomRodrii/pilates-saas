import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado: lib/notificaciones/recordatorio-clase.ts (canales y franjas del
// recordatorio), lib/notifications/catalog.ts (catálogo de avisos) y
// lib/engines/automation-engine.ts (disparadores implementados). El módulo de
// "Marketing" (campañas/segmentos manuales) está apagado por feature flag —
// no se documenta como si estuviera disponible.
export default function Contenido() {
  return (
    <>
      <p>
        Tentare avisa solo, de serie y sin que tengas que activar ninguna regla ni redactar nada: en la app de la
        alumna y, para el recordatorio de clase, también por email (y por WhatsApp si lo tienes conectado).
        Algunos ejemplos de lo que se envía solo:
      </p>

      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li>Confirmación en su app al reservar una clase.</li>
        <li>
          Recordatorio de cada clase, dos veces. El primero, por email y en su app (y por WhatsApp si lo conectas y
          Meta te aprueba la plantilla); de serie llega 24 h antes y puedes elegir 12 o 48 h. El segundo, solo en su
          app; de serie 1 h antes, o 30 min o 2 h si lo prefieres. Si reserva cuando el primero ya ha pasado, el email
          (y el WhatsApp) le llega en los minutos siguientes a reservar, siempre que no esté ya encima el segundo.
        </li>
        <li>Aviso de que un bono está a punto de caducar o se ha quedado sin clases.</li>
        <li>Aviso a la propietaria cuando una sustitución se queda sin candidatas.</li>
        <li>«Clase cubierta» cuando una sustituta acepta la clase.</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué puedes activar o apagar</h2>
      <p>
        Estos avisos no se encienden ni se apagan: son parte del producto. La excepción es el correo del
        recordatorio, que puedes apagar en Configuración &gt; Cómo me comunico; apagarlo no apaga el aviso en su app ni el
        WhatsApp. En Configuración &gt; Cómo me comunico &gt; Avisos en el móvil eliges cuánto antes llega el
        recordatorio y puedes reescribir con tus palabras lo que dice cada aviso que reciben tus alumnas (con «Enviarme una prueba» te llega a tu móvil antes de guardarlo). Cada alumna,
        a su vez, puede apagar desde su app los avisos que no quiera en el móvil, uno a uno. Lo que eliges tú es qué
        avisos te llegan a ti y por dónde, en Configuración &gt; Mis avisos, y el WhatsApp de tu estudio se conecta en
        Configuración &gt; Cómo me comunico.
      </p>

      <AyudaResultado>
        Esto es lo que Tentare hace de serie: cada aviso responde a algo que ha pasado de verdad. Para escribir tú
        a un grupo está Mensajería &gt; Enviar mensaje, y para reglas propias, Automatizaciones.
        Relacionado:{' '}
        <Link href="/ayuda/problemas/no-llega-un-email" style={{ color: 'inherit', textDecoration: 'underline' }}>no llega un email</Link> y{' '}
        <Link href="/ayuda/problemas/no-llega-un-whatsapp" style={{ color: 'inherit', textDecoration: 'underline' }}>no llega un WhatsApp</Link>.
      </AyudaResultado>
    </>
  );
}
