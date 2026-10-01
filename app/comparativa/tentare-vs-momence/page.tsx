import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
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
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Vídeo bajo demanda', tentare: ['no', 'No, fuera de nuestro foco hoy'], them: ['yes', 'Biblioteca de vídeo y cursos'] },
  { feature: 'Reglas de cancelación por tipo de clase', tentare: ['yes', 'La antelación para cancelar puede ser distinta por tipo de clase (p. ej. reformer vs. mat)'], them: ['yes', 'Política de cancelación con «override» por plantilla de clase, según su centro de ayuda'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['yes', '«No se requiere tarjeta de crédito» en su alta, según su web'] },
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Cada sala tiene su propio aforo, independiente del de la clase'], them: ['partial', 'No consta en su web pública que el aforo se fije por sala y no por clase'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Varias sedes con un solo acceso y una sola suscripción, sin mínimo de sedes'], them: ['partial', 'Su «panel corporativo» es solo para franquicias: exige un documento FDD firmado y mínimo 6 sedes, según su centro de ayuda'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Más funciones y vídeo bajo demanda',
    body: 'Momence ofrece hoy sustituciones automáticas, spot scheduling, biblioteca de vídeo y cursos, y app propia con opciones de marca. Tentare no tiene vídeo bajo demanda.',
  },
  {
    title: 'Una plataforma internacional',
    body: 'Momence está pensada para el mercado global (en inglés). Tentare está hecho para España: facturas con numeración legal, soporte en español y precio en euros.',
  },
];

// Las preguntas que de verdad se buscan de Momence (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Momence?',
    a: 'Momence no publica precios en su web: hay que hablar con ellos para conocer el suyo. Tentare publica los suyos: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
  {
    q: '¿Puedo pasar mis datos de Momence a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de Momence (y de bsport, Eversports, Mindbody, Timp y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros.',
  },
];

export default function TentareVsMomencePage() {
  return (
    <CompetitorPage
      name="Momence"
      slug="tentare-vs-momence"
      logo={{ src: '/comparativa/logos/momence.svg', alt: 'Logo de Momence', height: 15, width: 122, cardBg: '#171717' }}
      h1={<>¿Momence o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>Momence es una plataforma internacional de reservas para estudios, con sustituciones automáticas, elección de reformer y biblioteca de vídeo. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, es una de las comparaciones más parejas en funciones; la diferencia está en el precio público y en el mercado para el que está pensada.</>}
      rows={ROWS}
      veredicto={<>Para un estudio de Pilates en España, Tentare: precio público, soporte en español y un producto hecho para ti. Momence solo encaja si necesitas vídeo bajo demanda y no te importa un producto y un soporte pensados para un mercado internacional.</>}
      honesty={HONESTY}
      footnote="Basado en la información pública de Momence (momence.com) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Momence es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
