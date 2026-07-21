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
  logoUrl,
  colorPrimario,
  bonoConsumido = false,
  intro,
}: Props) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} headerColor="#065F46" titulo="¡Se ha liberado tu plaza!" preview={`Tu plaza en ${claseNombre} ya está confirmada`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        {intro ?? <>Hola <strong>{socioNombre}</strong>, estabas en lista de espera y ha quedado una plaza libre. </>}
        Tu reserva ya está <strong>confirmada</strong>.
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

      {bonoConsumido && (
        <Text style={{ color: '#6B7280', fontSize: 13, margin: '0 0 12px' }}>
          Se ha descontado una sesión de tu bono para confirmar esta plaza.
        </Text>
      )}
      <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
        Si ya no puedes asistir, cancela tu plaza cuanto antes para dejársela a otra persona.
      </Text>
    </EmailLayout>
  );
}
