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
  // Si a la socia se le ha consumido una sesión del bono al ascender, se le
  // dice explícitamente (transparencia: nunca se le descuenta sin avisar).
  bonoConsumido?: boolean;
  intro?: string;
}

export function PromocionEsperaEmail({
  socioNombre,
  claseNombre,
  fecha,
  hora,
  sala,
  instructor,
  estudioNombre = 'Tentare',
  bonoConsumido = false,
  intro,
}: Props) {
  return (
    <Html lang="es">
      <Head>
        <Font fontFamily="Inter" fallbackFontFamily="Arial" />
      </Head>
      <Body style={{ backgroundColor: '#F4F5F7', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: '40px 0' }}>
        <Container style={{ maxWidth: 520, margin: '0 auto', backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E8EAED' }}>
          <Section style={{ backgroundColor: '#065F46', padding: '28px 32px' }}>
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, margin: 0 }}>
              {estudioNombre}
            </Text>
            <Heading as="h1" style={{ color: '#ffffff', fontSize: 22, fontWeight: 700, margin: '6px 0 0' }}>
              ¡Se ha liberado tu plaza!
            </Heading>
          </Section>

          <Section style={{ padding: '28px 32px' }}>
            <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
              {intro ?? <>Hola <strong>{socioNombre}</strong>, estabas en lista de espera y ha quedado una plaza libre.</>}
              Tu reserva ya está <strong>confirmada</strong>.
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

            {bonoConsumido && (
              <Text style={{ color: '#6B7280', fontSize: 13, margin: '0 0 12px' }}>
                Se ha descontado una sesión de tu bono para confirmar esta plaza.
              </Text>
            )}
            <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
              Si ya no puedes asistir, cancela tu plaza cuanto antes para dejársela a otra persona.
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
