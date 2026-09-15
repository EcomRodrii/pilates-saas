import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 28-ago-2026 tras verificar en vivo la lista de integraciones
// con la cuenta de demostración: la versión anterior de este artículo decía
// que solo existían Stripe y el widget, y afirmaba explícitamente que NO
// había integración con Zapier, Google ni Meta — falso. Las tarjetas reales
// están todas conectables, cada una con conexión "sin pegar ninguna clave"
// salvo Mailchimp y Kisi, que piden una API key pegada a mano.
//
// 15-sep-2026: Configuración se reorganizó por preguntas y cada integración
// está en la sección de lo que hace: Stripe en «Cobros y facturas», el
// remitente, WhatsApp y Gmail en «Cómo me comunico», y el resto en
// «Conexiones». Llevarte tus datos no es una integración: está en «Datos y
// seguridad» («Exportar mis datos»). Los nombres y frases de abajo son los de la pantalla
// (lib/configuracion/secciones.ts y tab-integraciones.tsx).

const GRUPOS: { seccion: string; tarjetas: [string, string][] }[] = [
  {
    seccion: 'Cobros y facturas',
    tarjetas: [
      ['Cobro con tarjeta (Stripe)', 'Cobra bonos y cuotas con tarjeta en tu propia cuenta de Stripe: el dinero entra directo en ella.'],
    ],
  },
  {
    seccion: 'Cómo me comunico',
    tarjetas: [
      ['Nombre y respuesta de tus correos', 'El nombre que ven tus alumnas como remitente y la dirección donde llegan sus respuestas.'],
      ['WhatsApp', 'Recordatorios y avisos desde tu número de WhatsApp Business.'],
      ['Contactos de Gmail', 'Trae los contactos de tu Gmail como alumnas nuevas. Los correos no salen desde tu Gmail.'],
    ],
  },
  {
    seccion: 'Conexiones',
    tarjetas: [
      ['Google Calendar', 'Copia las clases de las próximas 4 semanas a tu calendario al pulsar «Sincronizar ahora»; no se actualiza solo.'],
      ['Zoom', 'Crea una reunión de Zoom para cada clase de los tipos marcados como online.'],
      ['Kisi', 'Abre la puerta de tu estudio sola con cada check-in de tus alumnas.'],
      ['Klaviyo', 'Envía a tu cuenta de Klaviyo las alumnas que han consentido marketing por email.'],
      ['Zapier', 'Conecta Tentare con miles de apps: crea reservas, sincroniza alumnas o avisa por Slack cuando pasa algo en tu estudio.'],
      ['Mailchimp', 'Envía a tu audiencia de Mailchimp las alumnas que han consentido marketing por email — pegando tu clave API.'],
    ],
  },
];

export default function Contenido() {
  return (
    <>
      <p>
        Puedes conectar Tentare con las herramientas que ya usas — cada una con un botón, sin tocar código. Cada
        integración está en la sección de Configuración de lo que hace: el cobro con tarjeta en Cobros y facturas, los
        canales para escribir a tus alumnas en Cómo me comunico, y el resto en Conexiones.
      </p>

      {GRUPOS.map(({ seccion, tarjetas }) => (
        <div key={seccion}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Configuración &gt; {seccion}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tarjetas.map(([nombre, texto]) => (
              <div key={nombre} style={{ border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 18px' }}>
                <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{nombre}</p>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5A5A52', margin: 0 }}>{texto}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo se conectan</h2>
      <p>
        La mayoría se conecta entrando con tu cuenta (Google Calendar, Gmail, Klaviyo, Stripe, Zoom): das permiso en
        la ventana del propio servicio, sin copiar ninguna clave. Mailchimp y Kisi piden tu clave API, y WhatsApp los
        datos de tu cuenta de Meta. Zapier funciona al revés: la conexión se autoriza desde Zapier, no desde Tentare.
      </p>
      <p>
        Para llevarte tus datos a una hoja de cálculo no hace falta conectar nada: en Configuración &gt; Datos y
        seguridad, «Exportar mis datos» te da un archivo por tabla que abre Excel.
      </p>

      <AyudaResultado>
        Ninguna integración es obligatoria — Tentare funciona completo sin conectar ninguna. Relacionado:{' '}
        <Link href="/ayuda/pagos/conectar-stripe" style={{ color: 'inherit', textDecoration: 'underline' }}>conectar Stripe</Link>.
      </AyudaResultado>
    </>
  );
}
