import {
  Html, Head, Body, Container, Section, Text,
  Heading, Hr, Font,
} from '@react-email/components';

interface Props {
  socioNombre: string;
  concepto: string;
  importe: number;
  estudioNombre?: string;
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
  definitivo,
}: Props) {
  const acento = definitivo ? '#B91C1C' : '#D97706';
  const titulo = definitivo ? 'No hemos podido cobrar tu cuota' : 'Problema con tu pago';
  const cuerpo = definitivo
    ? 'Hemos intentado cobrar tu cuota varias veces y no ha sido posible. Ponte en contacto con el estudio para regularizar el pago y no perder tu plaza.'
    : 'Hemos intentado cobrar tu cuota y el pago no se ha completado. Lo volveremos a intentar automáticamente en los próximos días — no tienes que hacer nada, pero revisa que tu método de pago esté al día.';

  return (
    <Html lang="es">
      <Head>
        <Font fontFamily="Inter" fallbackFontFamily="Arial" />
      </Head>
      <Body style={{ backgroundColor: '#F4F5F7', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: '40px 0' }}>
        <Container style={{ maxWidth: 520, margin: '0 auto', backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E8EAED' }}>
          <Section style={{ backgroundColor: '#111827', padding: '28px 32px' }}>
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: 0 }}>
              {estudioNombre}
            </Text>
            <Heading as="h1" style={{ color: '#ffffff', fontSize: 22, fontWeight: 700, margin: '6px 0 0' }}>
              {titulo}
            </Heading>
          </Section>

          <Section style={{ padding: '28px 32px' }}>
            <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
              Hola <strong>{socioNombre}</strong>, {cuerpo}
            </Text>

            <Section style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
                Concepto
              </Text>
              <Text style={{ color: '#111827', fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>
                {concepto}
              </Text>
              <Hr style={{ borderColor: '#E8EAED', margin: '0 0 14px' }} />
              <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
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
          </Section>

          <Section style={{ borderTop: '1px solid #E8EAED', padding: '20px 32px', backgroundColor: '#F9FAFB' }}>
            <Text style={{ color: '#9CA3AF', fontSize: 12, margin: 0, textAlign: 'center' }}>
              {estudioNombre}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
