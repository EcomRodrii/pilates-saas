import { Text, Section, Hr } from '@react-email/components';
import { EmailLayout, EmailInfoRow } from '@/lib/emails/layout';

// Cambio en una clase ya reservada. Nació para el cambio de instructora ("hoy
// da Laura"), que es el caso que más llama al estudio: la alumna reservó POR
// la profesora y llegaba sin saberlo. `cambioHora`/`cambioSala` extienden el
// mismo email al cambio de horario/sala (antes solo llevaba PUSH — una socia
// sin cuenta de portal reclamada no se enteraba nunca de que su clase se movió,
// justo el cambio más disruptivo de reprogramar una clase).
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
  // Qué ha cambiado de verdad — determina el texto de intro cuando no hay
  // override de plantilla del estudio. Puede ser más de uno a la vez (mover
  // una clase de sala Y de hora en la misma edición).
  cambioHora?: boolean;
  cambioSala?: boolean;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  intro?: string;
}

function introPorDefecto(socioNombre: string, cambioHora?: boolean, cambioSala?: boolean, instructorAnterior?: string) {
  const cambios: string[] = [];
  if (cambioHora) cambios.push('la hora');
  if (cambioSala) cambios.push('la sala');
  if (instructorAnterior) cambios.push('la instructora');
  if (cambios.length === 0) {
    return <>Hola <strong>{socioNombre}</strong>, tu clase sigue en pie a la misma hora y en la
    misma sala, pero la dará <strong>otra instructora</strong>. Te lo contamos para que no te
    pille de sorpresa.</>;
  }
  const lista = cambios.length === 1
    ? cambios[0]
    : `${cambios.slice(0, -1).join(', ')} y ${cambios[cambios.length - 1]}`;
  return <>Hola <strong>{socioNombre}</strong>, ha cambiado {lista} de tu clase. Te lo contamos
  para que no te pille de sorpresa.</>;
}

export function CambioClaseEmail({
  socioNombre,
  claseNombre,
  fecha,
  hora,
  sala,
  instructor,
  instructorAnterior,
  cambioHora,
  cambioSala,
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
      preview={`${claseNombre}: ha cambiado ${[cambioHora && 'la hora', cambioSala && 'la sala', instructorAnterior && 'la instructora'].filter(Boolean).join(', ') || 'la instructora'}`}
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        {intro ?? introPorDefecto(socioNombre, cambioHora, cambioSala, instructorAnterior)}
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
