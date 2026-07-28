import { Text, Section } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';

interface Props {
  nombre: string;
  propietariaNombre: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  url: string;
}

// P2-10: "con 18 personas es inviable" mandar y perseguir un enlace uno a uno
// por WhatsApp. Este email es el envío masivo — mismo enlace de siempre
// (app/disponibilidad/[token]), pero entregado sin que la propietaria tenga
// que copiar y pegar 18 veces.
export function SolicitudDisponibilidadEmail({ nombre, propietariaNombre, estudioNombre, logoUrl, colorPrimario, url }: Props) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="¿Cuándo puedes cubrir clases?" preview={`${propietariaNombre} te pide tu disponibilidad`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola <strong>{nombre}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
        <strong>{propietariaNombre}</strong> necesita saber cuándo puedes cubrir una clase si hace falta una sustituta en <strong>{estudioNombre}</strong>.
      </Text>
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
        <Text style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Marca tus franjas desde el móvil, sin contraseña ni instalar nada — un toque por franja, menos de un minuto.
        </Text>
      </Section>
      <EmailButton href={url} colorPrimario={colorPrimario}>Marcar mi disponibilidad</EmailButton>
      <Text style={{ color: '#9C9C94', fontSize: 12, margin: '22px 0 0', textAlign: 'center' as const }}>
        Puedes volver a este enlace cuando quieras para actualizarla.
      </Text>
    </EmailLayout>
  );
}
