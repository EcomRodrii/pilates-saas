import { Text, Section } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';

interface Props {
  toName: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  claseNombre: string;
  cuando: string;
}

// Se pide confirmación (víspera de clase, ~24h antes). Un solo botón, sin
// vueltas: la validación en las entrevistas del módulo manda que sea un toque,
// no un formulario.
export function PedirConfirmacionEmail({ toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, url }: Props & { url: string }) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="¿Sigues viniendo a tu clase?" preview={`Confírmanos tu clase de ${claseNombre}`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola <strong>{toName}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
        ¿Sigues viniendo a tu clase? Confírmanoslo en un toque:
      </Text>
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 18px', marginBottom: 24 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>{claseNombre}</Text>
        <Text style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>{cuando}</Text>
      </Section>
      <EmailButton href={url} colorPrimario={colorPrimario}>Sí, voy a venir</EmailButton>
      <Text style={{ color: '#9C9C94', fontSize: 12, margin: '22px 0 0', textAlign: 'center' as const }}>
        Si no confirmas, liberaremos tu plaza para que otra persona pueda venir.
      </Text>
    </EmailLayout>
  );
}

// Recordatorio a mitad de camino entre el aviso y el corte (lib/confirmacion-
// riesgo/logica.ts, VENTANA_RECORDATORIO). Hueco encontrado probando en vivo:
// un solo email que se pierde en la bandeja se convertía en una cancelación
// real de alguien que sí pensaba venir. Reconoce que ya se avisó antes — no
// repite el mensaje como si fuera la primera vez.
export function RecordatorioConfirmacionEmail({ toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, url }: Props & { url: string }) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="¿Nos falta tu confirmación?" preview={`Todavía no hemos sabido de ti para ${claseNombre}`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola <strong>{toName}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
        Te escribimos ayer y todavía no hemos sabido de ti — por si se te pasó. ¿Sigues viniendo?
      </Text>
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 18px', marginBottom: 24 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>{claseNombre}</Text>
        <Text style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>{cuando}</Text>
      </Section>
      <EmailButton href={url} colorPrimario={colorPrimario}>Sí, voy a venir</EmailButton>
      <Text style={{ color: '#9C9C94', fontSize: 12, margin: '22px 0 0', textAlign: 'center' as const }}>
        Si no confirmas, liberaremos tu plaza para que otra persona pueda venir.
      </Text>
    </EmailLayout>
  );
}

// No respondió a tiempo y se liberó su plaza. Tono informativo, no de castigo:
// el objetivo es que sea fácil volver a reservar, no hacerla sentir mal.
export function PlazaLiberadaEmail({ toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando }: Props) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="Hemos liberado tu plaza" preview={`Tu plaza en ${claseNombre} se ha liberado`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola <strong>{toName}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
        No hemos tenido confirmación para tu clase, así que hemos liberado tu plaza para que otra persona en lista de espera pueda venir.
      </Text>
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 18px', marginBottom: 24 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>{claseNombre}</Text>
        <Text style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>{cuando}</Text>
      </Section>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: 0 }}>
        ¿Te apetece reservar otra clase? Estaremos encantados de tenerte.
      </Text>
    </EmailLayout>
  );
}
