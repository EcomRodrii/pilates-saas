import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 28-ago-2026 tras verificar en vivo la lista de integraciones
// con la cuenta de demostración: la versión anterior de este artículo decía
// que solo existían Stripe y el widget, y afirmaba explícitamente que NO
// había integración con Zapier, Google ni Meta — falso. Las 11 tarjetas reales
// están todas conectables desde ahí, cada una con conexión OAuth "sin pegar
// ninguna clave" salvo Mailchimp, que sí pide una API key pegada a mano.
//
// 15-sep-2026: Configuración se reorganizó por preguntas y las integraciones
// están en «Conexiones». Los nombres y frases de abajo son los de la pantalla
// (lib/configuracion/secciones.ts y tab-integraciones.tsx). La captura
// enseñaba la fila de pestañas de antes y se quitó.
export default function Contenido() {
  return (
    <>
      <p>
        Desde Configuración &gt; Conexiones puedes conectar Tentare con las herramientas que ya usas — cada una con un
        botón, sin tocar código. El cobro con tarjeta (Stripe) y los canales para escribir a tus alumnas tienen
        además una fila en «Cobros y facturas» y en «Cómo me comunico» que lleva hasta aquí.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '24px 0' }}>
        {[
          ['Cobro con tarjeta (Stripe)', 'Conecta tu cuenta de Stripe para cobrar bonos y cuotas con tarjeta. El dinero entra directo en tu cuenta.'],
          ['Nombre y respuesta de tus correos', 'El nombre que ven tus alumnas como remitente y la dirección donde llegan sus respuestas.'],
          ['Google Calendar', 'Copia las clases de las próximas 4 semanas a tu calendario al pulsar «Sincronizar ahora»; no se actualiza solo.'],
          ['WhatsApp', 'Recordatorios y avisos desde tu número de WhatsApp Business.'],
          ['Exportar a Excel', 'Tus alumnas, su historial de reservas y asistencia, y los recibos, en archivos que abre Excel.'],
          ['Contactos de Gmail', 'Trae los contactos de tu Gmail como alumnas nuevas. Los correos no salen desde tu Gmail.'],
          ['Zoom', 'Crea una reunión de Zoom para cada clase de los tipos marcados como online.'],
          ['Kisi', 'Abre la puerta de tu estudio sola con cada check-in de tus alumnas.'],
          ['Klaviyo', 'Envía a tu cuenta de Klaviyo las alumnas que han consentido marketing por email.'],
          ['Zapier', 'Conecta Tentare con miles de apps: crea reservas, sincroniza alumnas o avisa por Slack cuando pasa algo en tu estudio.'],
          ['Mailchimp', 'Envía a tu audiencia de Mailchimp las alumnas que han consentido marketing por email — pegando tu clave API.'],
        ].map(([nombre, texto]) => (
          <div key={nombre} style={{ border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 18px' }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{nombre}</p>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5A5A52', margin: 0 }}>{texto}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo se conectan</h2>
      <p>
        La mayoría se conecta entrando con tu cuenta (Google Calendar, Gmail, Klaviyo, Stripe, Zoom): das permiso en
        la ventana del propio servicio, sin copiar ninguna clave. Mailchimp y Kisi piden tu clave API, y WhatsApp los
        datos de tu cuenta de Meta. Zapier funciona al revés: la conexión se autoriza desde Zapier, no desde Tentare.
      </p>

      <AyudaResultado>
        Ninguna integración es obligatoria — Tentare funciona completo sin conectar ninguna. Relacionado:{' '}
        <Link href="/ayuda/pagos/conectar-stripe" style={{ color: 'inherit', textDecoration: 'underline' }}>conectar Stripe</Link>.
      </AyudaResultado>
    </>
  );
}
