import { Text } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';

interface Props {
  nombreReferente: string;
  profesionalNombre: string;
  relacion?: string | null;
  url: string;
}

// Solicitud de referencia profesional (Tentare Network, Fase 1 — la pieza
// que faltaba de la migración 20260813111231). El referente no tiene por
// qué ser usuaria de Tentare (no tiene por qué haber trabajado en un estudio
// que use la plataforma), así que este correo va SIEMPRE por envío directo
// (lib/emails/referencia-solicitud-server.ts), nunca por el Notification
// Engine: sus audiencias solo resuelven auth_user_id de Tentare
// (lib/notifications/recipients.ts) y `red_referencias` no tiene studio_id
// — no hay forma de encajarla en `NotificationEvent.studioId` (obligatorio)
// sin inventar un estudio que no existe.
export function ReferenciaSolicitudEmail({ nombreReferente, profesionalNombre, relacion, url }: Props) {
  return (
    <EmailLayout
      studioNombre="Tentare Network"
      titulo="Te piden una referencia profesional"
      preview={`${profesionalNombre} te ha puesto como referencia en Tentare Network`}
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola <strong>{nombreReferente}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
        <strong>{profesionalNombre}</strong> te ha puesto como referencia profesional
        {relacion ? <> ({relacion})</> : null} en su perfil de Tentare Network, la red de
        instructoras de Pilates y estudios que usan Tentare.
      </Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
        Solo te pedimos que confirmes que la conoces por haber trabajado con ella — no hace
        falta crear ninguna cuenta.
      </Text>
      <EmailButton href={url}>Responder a la solicitud</EmailButton>
      <Text style={{ color: '#63635D', fontSize: 12, margin: '22px 0 0', textAlign: 'center' as const }}>
        Este enlace caduca en 7 días. Si no reconoces a {profesionalNombre}, puedes ignorar este correo o rechazar la solicitud.
      </Text>
    </EmailLayout>
  );
}
