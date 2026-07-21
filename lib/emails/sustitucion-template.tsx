import { Text, Section } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';

interface ContactoProps {
  toName: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  claseNombre: string;
  cuando: string;
  url: string;
  recordatorio?: boolean;
}

// Contacto a una candidata para cubrir una clase. Un solo botón grande, que
// lleva a una PÁGINA (nunca acepta por GET: los prefetchers de correo
// dispararían la aceptación al abrir el email) — ACEPTO / No puedo se pulsan allí.
export function ContactoSustitutaEmail({ toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, url, recordatorio }: ContactoProps) {
  const intro = recordatorio
    ? `Te escribimos hace un rato para cubrir una clase y aún no tenemos tu respuesta. Sigue disponible:`
    : `${estudioNombre} necesita cubrir una clase y has salido como la mejor opción:`;
  const titulo = recordatorio ? `Recordatorio: ¿puedes cubrir ${claseNombre}?` : `¿Puedes cubrir ${claseNombre}?`;
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo={titulo} preview={intro}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola <strong>{toName}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>{intro}</Text>
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 18px', marginBottom: 24 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>{claseNombre}</Text>
        <Text style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>{cuando}</Text>
      </Section>
      <EmailButton href={url} colorPrimario={colorPrimario}>Ver la clase y responder</EmailButton>
      <Text style={{ color: '#9C9C94', fontSize: 12, margin: '22px 0 0', textAlign: 'center' as const }}>
        Un solo toque, sin instalar nada. Si otra persona la coge antes, te avisamos.
      </Text>
    </EmailLayout>
  );
}

interface AlertaProps {
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  claseNombre: string;
  cuando: string;
  tipo: 'baja' | 'sin_respuesta' | 'agotada';
  candidataNombre?: string;
  urlPanel: string;
  yaContactando?: boolean;
}

// Alerta a la propietaria: nadie responde o se agotó el ranking — el fallo
// controlado del motor, para que se entere ELLA y no una alumna en la puerta.
export function AlertaPropietariaEmail({ estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, tipo, candidataNombre, urlPanel, yaContactando }: AlertaProps) {
  const agotada = tipo === 'agotada';
  const baja = tipo === 'baja';
  const titulo = baja
    ? `${candidataNombre ?? 'Una instructora'} no puede dar esta clase`
    : agotada
      ? 'Nadie ha podido cubrir esta clase'
      : `${candidataNombre ?? 'La candidata'} aún no responde`;
  // Una baja recién avisada NO es una alarma: es "nos hemos enterado y ya
  // estamos en ello". Rojo/ámbar se reservan para cuando algo requiere que la
  // propietaria actúe ya — si todo pinta urgente, nada lo parece.
  const color = baja ? (colorPrimario || '#6D28D9') : agotada ? '#B91C1C' : '#92400E';
  const cuerpo = baja
    ? (yaContactando
        ? `Nos lo ha dicho desde su móvil y ya estamos avisando a las candidatas por ti. Te escribimos en cuanto alguna confirme — no tienes que hacer nada ahora mismo.`
        : `Nos lo ha dicho desde su móvil. Ya tenemos las candidatas ordenadas y listas: solo falta tu visto bueno en el panel para que empecemos a avisarlas.`)
    : agotada
      ? `Hemos avisado a todas las candidatas disponibles y ninguna ha confirmado. La clase sigue sin sustituta y necesita tu decisión: avisar a alguien por tu cuenta o cancelarla (avisamos a las alumnas por ti).`
      : `Avisamos a ${candidataNombre ?? 'la candidata'} y aún no ha respondido. Puedes esperar, avisar a otra candidata o cancelar la clase desde el panel.`;
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} headerColor={color} titulo={titulo} preview={cuerpo.slice(0, 90)}>
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>{claseNombre}</Text>
        <Text style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>{cuando}</Text>
      </Section>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: '0 0 24px' }}>{cuerpo}</Text>
      <EmailButton href={urlPanel} colorPrimario={colorPrimario}>Abrir el panel de sustituciones</EmailButton>
    </EmailLayout>
  );
}

interface AlumnaProps {
  toName: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  claseNombre: string;
  cuando: string;
}

// Se ha confirmado sustituta: la clase sigue en pie (mensaje tranquilizador).
export function AlumnaClaseCubiertaEmail({ toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, sustituta }: AlumnaProps & { sustituta: string }) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="Tu clase sigue en pie" preview={`${claseNombre} la dará ${sustituta}`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 14px' }}>Hola <strong>{toName}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: 0 }}>
        Tu clase <strong>{claseNombre}</strong> del {cuando} <strong>sigue en pie</strong>. La dará <strong>{sustituta}</strong>. No tienes que hacer nada.
      </Text>
    </EmailLayout>
  );
}

// No hay sustituta: la clase se cancela (que se entere por ti, no en la puerta).
export function AlumnaClaseCanceladaEmail({ toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando }: AlumnaProps) {
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} headerColor="#B91C1C" titulo="Clase cancelada" preview={`${claseNombre} se cancela`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 14px' }}>Hola <strong>{toName}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: 0 }}>
        Sentimos avisarte de que tu clase <strong>{claseNombre}</strong> del {cuando} <strong>se cancela</strong>. Disculpa las molestias — te esperamos en la próxima.
      </Text>
    </EmailLayout>
  );
}
