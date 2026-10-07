import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorPage, type ComparativaRow, type ResumenCompetidor, type SeccionAnalisis } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-momence';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Momence',
    description: 'Precio, funciones y marketplace — comparados con lo que consta en la web pública de Momence.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de Momence lo que consta en su web pública (momence.com,
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['no', 'No publica cifras: pide hablar con ellos'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['yes', '«Automate instructor substitutions», según su web'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['yes', '«Spot scheduling», según su web'] },
  { feature: 'Marketplace de consumidores', tentare: ['yes', 'Sin marketplace'], them: ['yes', 'Sin marketplace: «strictly a booking app», según su web'] },
  { feature: 'Reglas de cancelación por tipo de clase', tentare: ['yes', 'La antelación para cancelar puede ser distinta por tipo de clase (p. ej. reformer vs. mat)'], them: ['yes', 'Política de cancelación con «override» por plantilla de clase, según su centro de ayuda'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['yes', '«No se requiere tarjeta de crédito» en su alta, según su web'] },
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Cada sala tiene su propio aforo, independiente del de la clase'], them: ['partial', 'No consta en su web pública que el aforo se fije por sala y no por clase'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Varias sedes con un solo acceso y una sola suscripción, sin mínimo de sedes'], them: ['partial', 'Su «panel corporativo» es solo para franquicias: exige un documento FDD firmado y mínimo 6 sedes, según su centro de ayuda'] },
];


// Las preguntas que de verdad se buscan de Momence (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Momence?',
    a: 'Momence no publica precios en su web: hay que hablar con ellos para conocer el suyo. Tentare publica los suyos: Founding Studio 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
  {
    q: '¿Puedo pasar mis datos de Momence a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de Momence (y de bsport, Eversports, Mindbody, Timp y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros.',
  },
];

// El resumen y el análisis propios de esta comparativa (7-oct-2026): lo que
// responde a «¿merece la pena?» y a «cuánto cuesta», con los mismos datos
// verificados de la tabla. Nada aquí sale de lo que «se dice» del competidor.
const RESUMEN: ResumenCompetidor = {
  queEs: 'Plataforma internacional para estudios, del grupo Xplor; su web está en inglés',
  precio: 'No lo publica: pide hablar con ellos',
  permanencia: 'No consta en su web pública',
  destacado: { etiqueta: 'Varias sedes', suyo: 'Panel corporativo solo para franquicias de 6 sedes o más', nuestro: 'Plan Cadena, sin mínimo de sedes' },
  respuesta: <>Momence es una plataforma internacional para estudios, con reservas por plaza y sustituciones, pero no publica precios: hay que hablar con su equipo para saber cuánto cuesta. Para un estudio de Pilates o yoga en España que quiere el precio a la vista, soporte en español y una app con su marca desde el primer plan, la alternativa es Tentare: desde 29 €/mes con IVA y sin permanencia.</>,
};

const ANALISIS: SeccionAnalisis[] = [
  {
    titulo: '¿Cuánto cuesta Momence?',
    cuerpo: (
      <>
        <p>Momence no publica cifras en su web: para conocer el precio hay que hablar con ellos. Sí deja empezar sin tarjeta.</p>
        <p>Tentare publica sus tres planes: Founding Studio 29 €/mes (hasta 150 alumnas activas, con la app con tu marca), Estudio 59 €/mes y Cadena 149 €/mes, con IVA y sin permanencia. <Link href="/precios">Qué incluye cada uno</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Si tienes dos o tres estudios',
    cuerpo: (
      <>
        <p>Según su centro de ayuda, el panel corporativo de Momence es para franquicias: pide un documento de franquicia firmado y un mínimo de seis sedes. Un estudio que abre su segundo o tercer local en España no suele ser una franquicia ni tener seis sedes.</p>
        <p>En Tentare, el plan Cadena reúne todas tus sedes con un solo acceso y una sola suscripción, sin mínimo de centros. Cada sede tiene sus datos separados, y una instructora puede trabajar en dos con un rol y una tarifa distintos en cada una. <Link href="/funcionalidades/multi-centro">Cómo funciona con varias sedes</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Cómo cambiarte de Momence a Tentare',
    cuerpo: (
      <p>El importador de Tentare reconoce las exportaciones de Momence: te enseña lo que va a traer antes de guardarlo y lo puedes deshacer con un botón. Si prefieres, te lo hacemos nosotros. <Link href="/soluciones/cambiar-de-software">Cómo es el cambio</Link>.</p>
    ),
  },
];

export default function TentareVsMomencePage() {
  return (
    <CompetitorPage
      name="Momence"
      slug="tentare-vs-momence"
      logo={{ src: '/comparativa/logos/momence.svg', alt: 'Logo de Momence', height: 15, width: 122, cardBg: '#171717' }}
      intro={<>Momence es una plataforma internacional de reservas para estudios. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare tiene precio público, soporte en español y un producto pensado para ti.</>}
      resumen={RESUMEN}
      rows={ROWS}
      analisis={ANALISIS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates en España: precio público, soporte en español y un producto hecho para estudios como el tuyo. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de Momence.</>}
      footnote="Basado en la información pública de Momence (momence.com) a 7 de octubre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Momence es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
