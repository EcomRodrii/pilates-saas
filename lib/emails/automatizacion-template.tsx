import {
  Html, Head, Body, Container, Section, Text,
  Heading, Font,
} from '@react-email/components';

interface Props {
  socioNombre: string;
  titulo: string;
  mensaje: string;
  estudioNombre?: string;
}

export function AutomatizacionEmail({
  socioNombre,
  titulo,
  mensaje,
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
              {titulo}
            </Heading>
          </Section>

          <Section style={{ padding: '28px 32px' }}>
            <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 8px' }}>
              Hola <strong>{socioNombre}</strong>,
            </Text>
            <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, margin: 0 }}>
              {mensaje}
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
