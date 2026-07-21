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
  // Si la reserva ocupaba plaza y se le devuelve la sesión al bono, se indica.
  bonoDevuelto?: boolean;
  intro?: string;
}

export function CancelacionClaseEmail({
  socioNombre,
  claseNombre,
  fecha,
  hora,
  sala,
  instructor,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  bonoDevuelto = false,
  intro,
}: Props) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} headerColor="#B91C1C" titulo="Clase cancelada" preview={`${claseNombre} ha sido cancelada`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        {intro ?? <>Hola <strong>{socioNombre}</strong>, lamentamos avisarte de que esta clase ha sido
        <strong> cancelada</strong>. No hace falta que te presentes.</>}
      </Text>

      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>
          {claseNombre}
        </Text>
        <Hr style={{ borderColor: '#E5E1DA', margin: '0 0 16px' }} />
        <EmailInfoRow label="Fecha" value={fecha} tachado />
        <EmailInfoRow label="Hora" value={hora} tachado />
        <EmailInfoRow label="Sala" value={sala} />
        <EmailInfoRow label="Instructora" value={instructor} />
      </Section>

      {bonoDevuelto && (
        <Text style={{ color: '#6B7280', fontSize: 13, margin: '0 0 12px' }}>
          Te hemos devuelto la sesión a tu bono. Puedes reservar otra clase cuando quieras.
        </Text>
      )}
      <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
        Disculpa las molestias. Reserva otra clase desde la app cuando te venga bien.
      </Text>
    </EmailLayout>
  );
}
