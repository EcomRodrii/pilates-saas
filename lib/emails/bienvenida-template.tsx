import { Text, Section, Hr } from '@react-email/components';
import { EmailLayout } from '@/lib/emails/layout';

interface Props {
  socioNombre: string;
  planNombre?: string;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  intro?: string; // texto de introducción personalizado por el estudio
}

export function BienvenidaEmail({
  socioNombre,
  planNombre,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  intro,
}: Props) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="¡Bienvenida! 🎉" preview={`Ya eres parte de ${estudioNombre}`}>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
        {intro ?? <>Hola <strong>{socioNombre}</strong>, estamos encantadas de tenerte en {estudioNombre}.</>}
      </Text>

      {planNombre && (
        <Section style={{ backgroundColor: '#F5F0FF', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
          <Text style={{ color: colorPrimario || '#6D28D9', fontSize: 13, fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            Tu plan
          </Text>
          <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700, margin: 0 }}>
            {planNombre}
          </Text>
        </Section>
      )}

      <Text style={{ color: '#374151', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
        Ya puedes reservar tus clases. Si tienes alguna duda, no dudes en escribirnos.
      </Text>

      <Hr style={{ borderColor: '#E5E1DA', margin: '0 0 20px' }} />

      <Text style={{ color: '#9C9C94', fontSize: 13, margin: 0 }}>
        Con cariño, el equipo de {estudioNombre}
      </Text>
    </EmailLayout>
  );
}
