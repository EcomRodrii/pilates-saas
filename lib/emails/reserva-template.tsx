import {
  Html, Head, Body, Container, Section, Text,
  Heading, Hr, Row, Column, Font,
} from '@react-email/components';

interface Props {
  socioNombre: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
  estudioNombre?: string;
}

export function ReservaEmail({
  socioNombre,
  claseNombre,
  fecha,
  hora,
  sala,
  instructor,
  estudioNombre = 'Pilates Boutique',
}: Props) {
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
              Reserva confirmada
            </Heading>
          </Section>

          <Section style={{ padding: '28px 32px' }}>
            <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
              Hola <strong>{socioNombre}</strong>, tu plaza está reservada.
            </Text>

            <Section style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
              <Text style={{ color: '#111827', fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>
                {claseNombre}
              </Text>
              <Hr style={{ borderColor: '#E8EAED', margin: '0 0 16px' }} />
              <Row style={{ marginBottom: 10 }}>
                <Column style={{ width: 100 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Fecha</Text>
                </Column>
                <Column>
                  <Text style={{ color: '#111827', fontSize: 14, fontWeight: 600, margin: 0 }}>{fecha}</Text>
                </Column>
              </Row>
              <Row style={{ marginBottom: 10 }}>
                <Column style={{ width: 100 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Hora</Text>
                </Column>
                <Column>
                  <Text style={{ color: '#111827', fontSize: 14, fontWeight: 600, margin: 0 }}>{hora}</Text>
                </Column>
              </Row>
              <Row style={{ marginBottom: 10 }}>
                <Column style={{ width: 100 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Sala</Text>
                </Column>
                <Column>
                  <Text style={{ color: '#111827', fontSize: 14, fontWeight: 600, margin: 0 }}>{sala}</Text>
                </Column>
              </Row>
              <Row>
                <Column style={{ width: 100 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Instructora</Text>
                </Column>
                <Column>
                  <Text style={{ color: '#111827', fontSize: 14, fontWeight: 600, margin: 0 }}>{instructor}</Text>
                </Column>
              </Row>
            </Section>

            <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
              Si necesitas cancelar tu plaza, hazlo con al menos 12 horas de antelación.
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
