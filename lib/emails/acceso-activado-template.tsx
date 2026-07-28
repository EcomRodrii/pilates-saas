import { Text, Section } from '@react-email/components';
import { EmailLayout } from '@/lib/emails/layout';

interface Props {
  nombre: string;
  emailCuenta: string | null;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
}

// Aviso a la dueña de que alguien de su equipo acaba de activar su acceso.
//
// No es una notificación de cortesía: enseña CON QUÉ CORREO se ha activado, y
// eso es lo único que delata un email mal tecleado en la ficha. El enlace de
// invitación no lo arregla —sale hacia el mismo buzón equivocado—, así que si
// nadie mira este dato el fallo solo aparece semanas después, cuando alguien se
// queja de que no entra.
export function AccesoActivadoEmail({ nombre, emailCuenta, estudioNombre, logoUrl, colorPrimario }: Props) {
  return (
    <EmailLayout
      studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario}
      titulo="Ya tiene acceso" preview={`${nombre} ya puede entrar al panel de ${estudioNombre}`}
    >
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
        <strong>{nombre}</strong> ha creado su cuenta y ya puede entrar al panel de <strong>{estudioNombre}</strong>.
      </Text>
      {emailCuenta && (
        <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
          <Text style={{ color: '#6B7280', fontSize: 13, margin: '0 0 4px' }}>Ha entrado con este correo:</Text>
          <Text style={{ color: '#374151', fontSize: 14, fontWeight: 700, margin: 0, wordBreak: 'break-all' as const }}>
            {emailCuenta}
          </Text>
        </Section>
      )}
      <Text style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        Si no esperabas este acceso, entra en <strong>Equipo</strong> y dale de baja: se lo retira al momento.
      </Text>
    </EmailLayout>
  );
}
