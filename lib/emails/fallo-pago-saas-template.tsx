import { Text } from '@react-email/components';
import { EmailLayout } from '@/lib/emails/layout';

// Aviso a la PROPIETARIA de que el cobro de su propia suscripción a Tentare
// (Stripe Billing, no el cobro de una socia) ha fallado. Sin este email, un
// impago de tarjeta caducada solo se veía si la propietaria entraba al panel
// de facturación por su cuenta — la primera noticia real era el estudio
// suspendido semanas después (studios.suspendido_en).
interface Props {
  estudioNombre: string;
  plan: string;
  proximoIntento?: string;
}

export function FalloPagoSaasEmail({ estudioNombre, plan, proximoIntento }: Props) {
  return (
    <EmailLayout
      studioNombre="Tentare"
      headerColor="#B91C1C"
      titulo="No hemos podido cobrar tu suscripción"
      preview={`Problema con el cobro de tu plan ${plan}`}
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 16px' }}>
        Hola, no hemos podido cobrar la suscripción de <strong>{estudioNombre}</strong> al
        plan <strong>{plan}</strong>. Suele pasar por una tarjeta caducada o sin fondos.
      </Text>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 16px' }}>
        {proximoIntento
          ? <>Stripe volverá a intentarlo automáticamente el <strong>{proximoIntento}</strong>. Actualiza el método
            de pago antes de esa fecha para no perder interrupciones en tu cuenta.</>
          : <>Actualiza tu método de pago desde el panel de facturación para evitar que se suspenda tu cuenta.</>}
      </Text>
      <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
        Puedes cambiar la tarjeta desde Ajustes → Facturación en tu panel de Tentare.
      </Text>
    </EmailLayout>
  );
}
