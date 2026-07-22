import { Text, Section } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';

interface Props {
  nombre: string;
  propietariaNombre: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  rol: string;
  url: string;
}

const ROL_LABEL: Record<string, string> = {
  PROPIETARIO: 'propietaria',
  RECEPCION: 'recepción',
  INSTRUCTOR: 'instructora',
};

// Alta de una persona en el equipo (app/api/equipo/route.ts): antes se creaba
// la ficha con email pero no se avisaba a nadie — solo se enteraba si alguien
// se lo decía de palabra. Un solo botón: crear su cuenta con este email vincula
// automáticamente su acceso a esta ficha (self-claim, ver lib/auth-server.ts).
export function InvitacionEquipoEmail({ nombre, propietariaNombre, estudioNombre, logoUrl, colorPrimario, rol, url }: Props) {
  const rolLabel = ROL_LABEL[rol] ?? 'miembro del equipo';
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="Te han invitado al equipo" preview={`${propietariaNombre} te ha invitado a ${estudioNombre}`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola <strong>{nombre}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
        <strong>{propietariaNombre}</strong> te ha dado de alta como <strong>{rolLabel}</strong> en el equipo de <strong>{estudioNombre}</strong> en Tentare.
      </Text>
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
        <Text style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Crea tu cuenta usando <strong>este mismo email</strong> y quedará vinculada automáticamente a tu ficha — no hace falta ningún código.
        </Text>
      </Section>
      <EmailButton href={url} colorPrimario={colorPrimario}>Crear mi cuenta</EmailButton>
      <Text style={{ color: '#9C9C94', fontSize: 12, margin: '22px 0 0', textAlign: 'center' as const }}>
        Si no esperabas esta invitación, puedes ignorar este email.
      </Text>
    </EmailLayout>
  );
}
