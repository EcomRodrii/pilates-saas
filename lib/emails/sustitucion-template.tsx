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
      <Text style={{ color: '#63635D', fontSize: 12, margin: '22px 0 0', textAlign: 'center' as const }}>
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
  const color = baja ? (colorPrimario || '#343825') : agotada ? '#B91C1C' : '#92400E';
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

// ── Aviso a las alumnas apuntadas ───────────────────────────────────────────
//
// Los tres desenlaces posibles de una sustitución (hay sustituta / la clase se
// mueve / la clase se cae) eran tres componentes con el mismo cuerpo: saludo +
// un párrafo. Solo cambiaban el titular, esa frase y —en la cancelación— el
// color de la banda. Con tres copias, cualquier retoque de tono o de estructura
// había que repetirlo tres veces y era fácil dejarse una descolgada.
//
// El discriminante no es nuevo: `tipo` ya venía intacto desde `avisarAlumnas`
// (lib/sustituciones/avisos.ts) y se volvía a ramificar en cada escalón. Ahora
// se ramifica una sola vez, aquí, donde vive la copy.
export type AvisoAlumna =
  | { tipo: 'cubierta'; sustituta: string }
  | { tipo: 'reprogramada'; cuandoNuevo: string }
  | { tipo: 'cancelada' };

interface AlumnaProps {
  toName: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  claseNombre: string;
  cuando: string;
  aviso: AvisoAlumna;
}

// El asunto vive junto al titular y al cuerpo porque es la misma pieza de copy:
// antes estaba en lib/sustituciones/email.ts, así que cambiarle el tono a un
// caso obligaba a acordarse de tocar dos ficheros.
export function asuntoAvisoAlumna(aviso: AvisoAlumna, claseNombre: string): string {
  switch (aviso.tipo) {
    case 'cubierta': return `Tu clase sigue en pie — ${claseNombre}`;
    case 'reprogramada': return `Cambio de horario — ${claseNombre}`;
    case 'cancelada': return `Clase cancelada — ${claseNombre}`;
  }
}

// `headerColor` solo en la cancelación: es la única de las tres que es mala
// noticia. En las otras dos va `undefined` y EmailLayout cae al color de marca
// del estudio, exactamente igual que cuando no se pasaba el prop.
function contenido({ claseNombre, cuando, aviso }: AlumnaProps): {
  titulo: string; preview: string; headerColor?: string; cuerpo: React.ReactNode;
} {
  switch (aviso.tipo) {
    case 'cubierta':
      return {
        titulo: 'Tu clase sigue en pie',
        preview: `${claseNombre} la dará ${aviso.sustituta}`,
        cuerpo: <>Tu clase <strong>{claseNombre}</strong> del {cuando} <strong>sigue en pie</strong>. La dará <strong>{aviso.sustituta}</strong>. No tienes que hacer nada.</>,
      };
    case 'reprogramada':
      return {
        titulo: 'Tu clase cambia de horario',
        preview: `${claseNombre} pasa al ${aviso.cuandoNuevo}`,
        cuerpo: <>Tu clase <strong>{claseNombre}</strong> del {cuando} <strong>cambia de horario</strong>: pasa al <strong>{aviso.cuandoNuevo}</strong>. Tu plaza se mantiene — si el nuevo horario no te viene bien, puedes cancelarla desde tu portal como siempre.</>,
      };
    case 'cancelada':
      return {
        titulo: 'Clase cancelada',
        preview: `${claseNombre} se cancela`,
        headerColor: '#B91C1C',
        cuerpo: <>Sentimos avisarte de que tu clase <strong>{claseNombre}</strong> del {cuando} <strong>se cancela</strong>. Disculpa las molestias — te esperamos en la próxima.</>,
      };
  }
}

export function AlumnaAvisoClaseEmail(props: AlumnaProps) {
  const { toName, estudioNombre, logoUrl, colorPrimario } = props;
  const { titulo, preview, headerColor, cuerpo } = contenido(props);
  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} headerColor={headerColor} titulo={titulo} preview={preview}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 14px' }}>Hola <strong>{toName}</strong>,</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.5, margin: 0 }}>
        {cuerpo}
      </Text>
    </EmailLayout>
  );
}
