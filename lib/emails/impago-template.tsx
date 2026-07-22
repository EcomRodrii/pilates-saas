import { Text, Section, Hr } from '@react-email/components';
import { EmailLayout } from '@/lib/emails/layout';

interface Props {
  socioNombre: string;
  concepto: string;
  importe: number;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  // true = fallo definitivo tras agotar los reintentos (acción requerida);
  // false = primer fallo (informativo, aún se reintentará solo).
  definitivo: boolean;
}

// Email a la SOCIA cuando un cobro de su recibo falla. Solo se envía en el primer
// fallo (informativo) y en el fallo definitivo (acción requerida) — no en los
// reintentos intermedios.
export function ImpagoEmail({
  socioNombre,
  concepto,
  importe,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  definitivo,
}: Props) {
  const acento = definitivo ? '#B91C1C' : '#D97706';
  const titulo = definitivo ? 'No hemos podido cobrar tu cuota' : 'Problema con tu pago';
  const cuerpo = definitivo
    ? 'Hemos intentado cobrar tu cuota varias veces y no ha sido posible. Ponte en contacto con el estudio para regularizar el pago y no perder tu plaza.'
    : 'Hemos intentado cobrar tu cuota y el pago no se ha completado. Lo volveremos a intentar automáticamente en los próximos días — no tienes que hacer nada, pero revisa que tu método de pago esté al día.';

  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} headerColor={acento} titulo={titulo} preview={cuerpo.slice(0, 90)}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        Hola <strong>{socioNombre}</strong>, {cuerpo}
      </Text>

      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
        <Text style={{ color: '#9C9C94', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px' }}>
          Concepto
        </Text>
        <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>
          {concepto}
        </Text>
        <Hr style={{ borderColor: '#E5E1DA', margin: '0 0 14px' }} />
        <Text style={{ color: '#9C9C94', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px' }}>
          Importe
        </Text>
        <Text style={{ color: acento, fontSize: 20, fontWeight: 700, margin: 0 }}>
          {importe.toFixed(2)} €
        </Text>
      </Section>

      <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
        {definitivo
          ? 'Si ya lo has resuelto o crees que es un error, avísanos y lo revisamos.'
          : 'Si tu tarjeta o cuenta bancaria ha cambiado, actualízala con el estudio para evitar más incidencias.'}
      </Text>
    </EmailLayout>
  );
}
