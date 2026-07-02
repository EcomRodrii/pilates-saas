import {
  Html, Head, Body, Container, Section, Text,
  Heading, Hr, Row, Column, Font,
} from '@react-email/components';

interface Props {
  socioNombre: string;
  concepto: string;
  importe: number;
  fechaCobro: string;
  numeroFactura?: string;
  estudioNombre?: string;
}

export function ReciboEmail({
  socioNombre,
  concepto,
  importe,
  fechaCobro,
  numeroFactura,
  estudioNombre = 'Pilates Boutique',
}: Props) {
  const fecha = new Date(fechaCobro).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <Html lang="es">
      <Head>
        <Font fontFamily="Inter" fallbackFontFamily="Arial" />
      </Head>
      <Body style={{ backgroundColor: '#F4F5F7', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: '40px 0' }}>
        <Container style={{ maxWidth: 520, margin: '0 auto', backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E8EAED' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#111827', padding: '28px 32px' }}>
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
              {estudioNombre}
            </Text>
            <Heading as="h1" style={{ color: '#ffffff', fontSize: 22, fontWeight: 700, margin: '6px 0 0', letterSpacing: '-0.02em' }}>
              Pago confirmado
            </Heading>
          </Section>

          {/* Body */}
          <Section style={{ padding: '28px 32px' }}>
            <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
              Hola <strong>{socioNombre}</strong>, hemos recibido tu pago correctamente.
            </Text>

            {/* Amount */}
            <Section style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
              <Row>
                <Column>
                  <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
                    Concepto
                  </Text>
                  <Text style={{ color: '#111827', fontSize: 15, fontWeight: 600, margin: 0 }}>
                    {concepto}
                  </Text>
                </Column>
                <Column style={{ textAlign: 'right' }}>
                  <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
                    Total
                  </Text>
                  <Text style={{ color: '#059669', fontSize: 24, fontWeight: 800, margin: 0 }}>
                    {importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </Text>
                </Column>
              </Row>
            </Section>

            <Hr style={{ borderColor: '#E8EAED', margin: '0 0 20px' }} />

            <Row>
              <Column>
                <Text style={{ color: '#9CA3AF', fontSize: 12, margin: '0 0 2px' }}>Fecha</Text>
                <Text style={{ color: '#374151', fontSize: 14, fontWeight: 600, margin: 0 }}>{fecha}</Text>
              </Column>
              {numeroFactura && (
                <Column>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, margin: '0 0 2px' }}>Nº Factura</Text>
                  <Text style={{ color: '#374151', fontSize: 14, fontWeight: 600, margin: 0 }}>{numeroFactura}</Text>
                </Column>
              )}
            </Row>
          </Section>

          {/* Footer */}
          <Section style={{ borderTop: '1px solid #E8EAED', padding: '20px 32px', backgroundColor: '#F9FAFB' }}>
            <Text style={{ color: '#9CA3AF', fontSize: 12, margin: 0, textAlign: 'center' }}>
              {estudioNombre} · Si tienes alguna pregunta, responde a este email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
