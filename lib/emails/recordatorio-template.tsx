import { Text, Section, Hr } from '@react-email/components';
import { EmailLayout, EmailInfoRow } from '@/lib/emails/layout';

interface Props {
  socioNombre: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  intro?: string;
}

export function RecordatorioEmail({
  socioNombre,
  claseNombre,
  fecha,
  hora,
  sala,
  instructor,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  intro,
}: Props) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="Recordatorio de tu clase" preview={`Te esperamos en ${claseNombre}`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        {intro ?? <>Hola <strong>{socioNombre}</strong>, te esperamos en tu próxima clase. Aquí tienes los detalles.</>}
      </Text>

      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>
          {claseNombre}
        </Text>
        <Hr style={{ borderColor: '#E5E1DA', margin: '0 0 16px' }} />
        <EmailInfoRow label="Fecha" value={fecha} />
        <EmailInfoRow label="Hora" value={hora} />
        <EmailInfoRow label="Sala" value={sala} />
        <EmailInfoRow label="Instructora" value={instructor} />
      </Section>

      <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
        Si no puedes asistir, cancela tu plaza con antelación para que otra persona pueda aprovecharla.
      </Text>
    </EmailLayout>
  );
}
