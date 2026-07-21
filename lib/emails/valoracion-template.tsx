import { Text, Section } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';

interface Props {
  toName: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  claseNombre: string;
  cuando: string;
  instructorNombre: string;
  url: string;
}

// Email a la alumna tras la clase pidiéndole que la valore. Un botón → la
// página pública de valoración (deep link firmado, sin login).
export function PedirValoracionEmail({ toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, instructorNombre, url }: Props) {
  const conQuien = instructorNombre ? ` con ${instructorNombre}` : '';
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="¿Qué tal tu clase?" preview={`Cuéntanos qué tal tu clase de ${claseNombre}`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola <strong>{toName}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
        ¿Qué tal tu clase{conQuien}? Tu opinión ayuda a {estudioNombre} a cuidar cada clase. Es un toque, 10 segundos:
      </Text>
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 18px', marginBottom: 24 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>{claseNombre}</Text>
        <Text style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>{cuando}</Text>
      </Section>
      <EmailButton href={url} colorPrimario={colorPrimario}>⭐ Valorar la clase</EmailButton>
      <Text style={{ color: '#9C9C94', fontSize: 12, margin: '22px 0 0', textAlign: 'center' as const }}>
        Sin instalar nada. Solo tú y tu estudio veis esto.
      </Text>
    </EmailLayout>
  );
}
