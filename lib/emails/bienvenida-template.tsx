import {
  Html, Head, Body, Container, Section, Text,
  Heading, Hr, Font,
} from '@react-email/components';

interface Props {
  socioNombre: string;
  planNombre?: string;
  estudioNombre?: string;
}

export function BienvenidaEmail({
  socioNombre,
  planNombre,
  estudioNombre = 'Tentare',
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
              ¡Bienvenida! 🎉
            </Heading>
          </Section>

          <Section style={{ padding: '28px 32px' }}>
            <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
              Hola <strong>{socioNombre}</strong>, estamos encantadas de tenerte en {estudioNombre}.
            </Text>

            {planNombre && (
              <Section style={{ backgroundColor: '#EFF6FF', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
                <Text style={{ color: '#2563EB', fontSize: 13, fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tu plan
                </Text>
                <Text style={{ color: '#111827', fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {planNombre}
                </Text>
              </Section>
            )}

            <Text style={{ color: '#374151', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
              Ya puedes reservar tus clases. Si tienes alguna duda, no dudes en escribirnos.
            </Text>

            <Hr style={{ borderColor: '#E8EAED', margin: '0 0 20px' }} />

            <Text style={{ color: '#9CA3AF', fontSize: 13, margin: 0 }}>
              Con cariño, el equipo de {estudioNombre}
            </Text>
          </Section>

          <Section style={{ borderTop: '1px solid #E8EAED', padding: '20px 32px', backgroundColor: '#F9FAFB' }}>
            <Text style={{ color: '#9CA3AF', fontSize: 12, margin: 0, textAlign: 'center' }}>
              {estudioNombre} · Si no esperabas este email, ignóralo.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
