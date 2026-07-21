import { Text } from '@react-email/components';
import { EmailLayout } from '@/lib/emails/layout';

interface Props {
  socioNombre: string;
  titulo: string;
  mensaje: string;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
}

export function AutomatizacionEmail({
  socioNombre,
  titulo,
  mensaje,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
}: Props) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo={titulo} preview={mensaje.slice(0, 90)}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 8px' }}>
        Hola <strong>{socioNombre}</strong>,
      </Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, margin: 0 }}>
        {mensaje}
      </Text>
    </EmailLayout>
  );
}
