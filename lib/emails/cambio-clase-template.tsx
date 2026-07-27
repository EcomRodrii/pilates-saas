import { Text, Section, Hr } from '@react-email/components';
import { EmailLayout, EmailInfoRow } from '@/lib/emails/layout';

// Cambio en una clase ya reservada. Hoy lo usa el cambio de instructora
// ("hoy da Laura"), que es el caso que más llama al estudio: la alumna reservó
// POR la profesora y llegaba sin saberlo.
//
// Va aparte del Notification Engine a propósito, igual que la cancelación: la
// notificación in-app sólo la ve quien ha reclamado su cuenta del portal, y la
// mayoría de alumnas de un estudio pequeño no la tienen. El email llega igual.
interface Props {
  socioNombre: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
  // Quién la daba antes. Si viene, el email lo dice explícitamente — es la
  // información que la alumna está buscando cuando abre el correo.
  instructorAnterior?: string;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  intro?: string;
}

export function CambioClaseEmail({
  socioNombre,
  claseNombre,
  fecha,
  hora,
  sala,
  instructor,
  instructorAnterior,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  intro,
}: Props) {
  return (
    <EmailLayout
      studioNombre={estudioNombre}
      logoUrl={logoUrl}
      colorPrimario={colorPrimario}
      headerColor="#B45309"
      titulo="Un cambio en tu clase"
      preview={`${claseNombre}: cambia la instructora`}
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        {intro ?? <>Hola <strong>{socioNombre}</strong>, tu clase sigue en pie a la misma hora y en la
        misma sala, pero la dará <strong>otra instructora</strong>. Te lo contamos para que no te
        pille de sorpresa.</>}
      </Text>

      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>
          {claseNombre}
        </Text>
        <Hr style={{ borderColor: '#E5E1DA', margin: '0 0 16px' }} />
        <EmailInfoRow label="Fecha" value={fecha} />
        <EmailInfoRow label="Hora" value={hora} />
        <EmailInfoRow label="Sala" value={sala} />
        {instructorAnterior && <EmailInfoRow label="Antes la daba" value={instructorAnterior} tachado />}
        <EmailInfoRow label="Ahora la da" value={instructor} />
      </Section>

      <Text style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
        No tienes que hacer nada: tu plaza sigue reservada. Si no te viene bien, puedes cancelar
        desde la app.
      </Text>
    </EmailLayout>
  );
}
