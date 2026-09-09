import { Text, Link, Section } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';

interface Props {
  socioNombre: string;
  titulo: string;
  mensaje: string;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  // Presente SOLO en envíos de marketing (campañas, automatizaciones de
  // marketing) — LSSI exige el enlace de baja en toda comunicación comercial.
  // Ausente en el resto de usos de esta plantilla (motor clásico de
  // automatizaciones, día 7/14/25 de ausencia, etc. — ver
  // docs/marketing-integrations-arquitectura.md §7 para el porqué del corte).
  unsubscribeUrl?: string;
  // Llamada a la acción opcional. Existe para el aviso de hueco libre, cuyo
  // único fin es que la socia RESERVE: con el enlace suelto dentro del texto
  // dependes de que el cliente de correo lo detecte y lo subraye, que es
  // justo lo que no hace Outlook. Ausente = el correo se pinta igual que
  // siempre, así que ningún emisor previo cambia.
  accion?: { url: string; texto: string };
}

export function AutomatizacionEmail({
  socioNombre,
  titulo,
  mensaje,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  unsubscribeUrl,
  accion,
}: Props) {
  return (
    <EmailLayout
      studioNombre={estudioNombre}
      logoUrl={logoUrl}
      colorPrimario={colorPrimario}
      titulo={titulo}
      preview={mensaje.slice(0, 90)}
      pie={unsubscribeUrl ? (
        <>
          Enviado por {estudioNombre} · Powered by Tentare · {new Date().getFullYear()}
          <br />
          <Link href={unsubscribeUrl} style={{ color: '#63635D', textDecoration: 'underline' }}>
            Darme de baja de estos emails
          </Link>
        </>
      ) : undefined}
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 8px' }}>
        Hola <strong>{socioNombre}</strong>,
      </Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, margin: 0 }}>
        {mensaje}
      </Text>
      {accion && (
        <Section style={{ margin: '24px 0 0' }}>
          <EmailButton href={accion.url} colorPrimario={colorPrimario}>{accion.texto}</EmailButton>
        </Section>
      )}
    </EmailLayout>
  );
}
