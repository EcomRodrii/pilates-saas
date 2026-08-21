import { Text, Section, Hr } from '@react-email/components';
import type { CanalResuelto } from '@/lib/canales-estudio';
import { EmailLayout, EmailInfoRow } from '@/lib/emails/layout';
import { PlantillaEditableEmail, type PersonalizacionPlantilla } from '@/lib/emails/cuerpo-editable';

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
  // Web y redes del estudio para el pie (MarcaEstudio.canales) — ver lib/canales-estudio.ts.
  canales?: CanalResuelto[];
  intro?: string;
  // Personalización total del estudio (plantillas_email). Si trae `cuerpo`,
  // manda ella y este componente no pinta su estructura por defecto.
  personalizacion?: PersonalizacionPlantilla;
}

export function ReservaEmail({
  socioNombre,
  claseNombre,
  fecha,
  hora,
  sala,
  instructor,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  canales,
  intro,
  personalizacion,
}: Props) {
  if (personalizacion?.cuerpo) {
    return (
      <PlantillaEditableEmail
        estudioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} canales={canales}
        personalizacion={{ ...personalizacion, cuerpo: personalizacion.cuerpo }}
        preview={`Tu plaza en ${claseNombre} está confirmada`}
        filas={[
          { label: 'Fecha', value: fecha },
          { label: 'Hora', value: hora },
          { label: 'Sala', value: sala },
          { label: 'Instructora', value: instructor },
        ]}
      />
    );
  }

  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} canales={canales} titulo="Reserva confirmada" preview={`Tu plaza en ${claseNombre} está confirmada`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        {intro ?? <>Hola <strong>{socioNombre}</strong>, tu plaza está reservada.</>}
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
        Si necesitas cancelar tu plaza, hazlo con al menos 12 horas de antelación.
      </Text>
    </EmailLayout>
  );
}
