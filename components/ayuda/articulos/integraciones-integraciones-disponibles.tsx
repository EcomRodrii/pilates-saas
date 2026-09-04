import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 28-ago-2026 tras verificar en vivo Configuración > Integraciones
// con la cuenta de demostración: la versión anterior de este artículo decía
// que solo existían Stripe y el widget, y afirmaba explícitamente que NO
// había integración con Zapier, Google ni Meta — falso. Las 11 tarjetas reales
// están todas conectables desde ahí, cada una con conexión OAuth "sin pegar
// ninguna clave" salvo Mailchimp, que sí pide una API key pegada a mano.
export default function Contenido() {
  return (
    <>
      <p>Desde Configuración &gt; Integraciones puedes conectar Tentare con las herramientas que ya usas — cada una con un botón, sin tocar código.</p>

      <AyudaCaptura
        src="/help/pagos/configuracion-integraciones-full.png"
        alt="Listado de integraciones en Configuración: Stripe, Resend, Google Calendar, WhatsApp Business, Exportar a Excel, Gmail, Zoom, Kisi, Klaviyo, Zapier y Mailchimp"
        caption="Configuración &gt; Integraciones — las once integraciones reales, todas desconectadas por defecto."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '24px 0' }}>
        {[
          ['Stripe', 'Cobra suscripciones y bonos con tarjeta o SEPA. El dinero va directo a tu propia cuenta de Stripe.'],
          ['Resend', 'Tu nombre y tu dirección de respuesta en los emails a tus alumnas: bienvenida, recibos, recordatorios.'],
          ['Google Calendar', 'Copia las clases de las próximas 4 semanas a tu calendario de Google cada vez que pulses «Sincronizar ahora». No se actualiza solo.'],
          ['WhatsApp Business', 'Envía recordatorios de clase por WhatsApp desde tu propio número de WhatsApp Business.'],
          ['Exportar a Excel', 'Descarga tus clientas, su historial de reservas y asistencia, y los recibos en archivos compatibles con Excel.'],
          ['Gmail', 'Trae los contactos de tu Gmail como clientas nuevas. Los correos a tus alumnas los sigue enviando Tentare, no tu Gmail.'],
          ['Zoom', 'Crea automáticamente una reunión de Zoom única para cada sesión de los tipos de clase que marques como "online".'],
          ['Kisi', 'Acceso físico seguro a tu estudio, gestionando el estado de tus clientes en tiempo real.'],
          ['Klaviyo', 'Envía a tu cuenta de Klaviyo las clientas que han consentido marketing por email.'],
          ['Zapier', 'Conecta Tentare con miles de apps: crea reservas, sincroniza clientas o avisa por Slack cuando pasa algo en tu estudio.'],
          ['Mailchimp', 'Envía a tu audiencia de Mailchimp las clientas que han consentido marketing por email — pegando tu clave API.'],
        ].map(([nombre, texto]) => (
          <div key={nombre} style={{ border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 18px' }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{nombre}</p>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5A5A52', margin: 0 }}>{texto}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo se conectan</h2>
      <p>
        La mayoría usa OAuth (Google, Gmail, Klaviyo, Stripe, Zoom…): das permiso en la ventana del propio servicio,
        sin pegar ninguna clave a mano. Mailchimp es la excepción — ahí pegas tu clave API directamente. Zapier
        funciona al revés: la conexión se autoriza desde Zapier, no desde Tentare.
      </p>

      <AyudaResultado>
        Ninguna integración es obligatoria — Tentare funciona completo sin conectar ninguna. Relacionado:{' '}
        <Link href="/ayuda/pagos/conectar-stripe" style={{ color: 'inherit', textDecoration: 'underline' }}>conectar Stripe</Link>.
      </AyudaResultado>
    </>
  );
}
