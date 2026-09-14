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
        <li>Recordatorio de cada clase: 24 h antes por email y en su app (y por WhatsApp si lo conectas), y 1 h antes en su app.</li>
        <li>Aviso de que un bono está a punto de caducar o se ha quedado sin clases.</li>
        <li>Aviso a la propietaria cuando una sustitución se queda sin candidatas.</li>
        <li>«Clase cubierta» cuando una sustituta acepta la clase.</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué puedes activar o apagar</h2>
      <p>
        Estos avisos no se encienden ni se apagan: son parte del producto. La excepción es el correo del
        recordatorio, que puedes apagar en Configuración &gt; Emails; apagarlo no apaga el aviso en su app ni el
        WhatsApp. Lo que eliges tú es qué avisos te llegan
        a ti y por dónde, desde las preferencias de notificaciones, y el WhatsApp de tu estudio se conecta en
        Configuración &gt; Integraciones.
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
