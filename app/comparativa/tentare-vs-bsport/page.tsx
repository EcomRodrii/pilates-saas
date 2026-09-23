import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-bsport';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs bsport',
    description: 'Cuánto cuesta cada uno, permanencia, facturación y sustitución de instructoras — comparados con lo que consta en la web pública de bsport.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de bsport lo que consta en su web pública (pro.bsport.io,
// revisada el 23-sep-2026). Lo que no consta se dice tal cual —«no consta en su
// web pública»—, nunca se rellena con «no» ni con «sí»: una comparativa que
// atribuye al competidor lo que nadie ha comprobado es una afirmación
// inventada. Hasta el 23-sep esta tabla decía «contrato anual» y «vía ERP
// externo» de bsport sin que su web lo diga en ningún sitio.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['no', 'No publica cifras: hay que pedir presupuesto'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Facturas con numeración legal y registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas, contacta y avisa; autónoma desde el plan Estudio'], them: ['yes', 'Sustituciones automáticas, según su web'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador, con tu nombre y tu icono'], them: ['yes', 'App propia, en los planes superiores'] },
  { feature: 'Aviso de dependencia de una instructora', tentare: ['yes', 'Riesgo de concentración'], them: ['partial', 'No consta en su web pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Más recorrido y más clientes de referencia',
    body: 'bsport es una plataforma consolidada en el fitness boutique europeo: declara más de 3.500 usuarios y lleva más tiempo puliendo integraciones de terceros (pasarelas, agenda externa, pantallas de sala) que Tentare todavía no cubre.',
  },
  {
    title: 'App en las tiendas de aplicaciones',
    body: 'Las alumnas de Tentare usan una app que se instala desde el navegador, con el nombre y el icono de tu estudio, sin pasar por la App Store ni Google Play. Si necesitas que aparezca en las tiendas, ese es hoy un punto a favor de bsport.',
  },
];

// Las preguntas que de verdad se buscan de bsport. Todas respondidas solo con lo
// que se puede comprobar; donde no hay dato, se dice y se manda a preguntar.
const FAQ = [
  {
    q: '¿Cuánto cuesta bsport?',
    a: 'bsport no publica precios en su web: ofrece varios planes (con funciones distintas, como la app propia en los superiores) y hay que pedir un presupuesto para saber la cifra. Tentare publica los suyos: Base 29 €/mes, Estudio 59 €/mes y Cadena 149 €/mes, IVA incluido, con 7 días de prueba gratis sin tarjeta.',
  },
  {
    q: '¿Qué alternativas a bsport hay para un estudio de Pilates en España?',
    a: 'Depende de qué necesites. Tentare está pensado para estudios de Pilates y Yoga: reservas con plaza por reformer, plazas fijas, cobros que se reintentan solos y sustituciones de instructoras, con precio público. Otras opciones que se comparan a menudo son Eversports, Momence, Mindbody o TIMP; las tienes en la comparativa general.',
  },
  {
    q: '¿bsport tiene permanencia?',
    a: 'No consta en su web pública. Si estás valorando cambiar, pregúntales por escrito la duración del contrato y las condiciones de baja. Tentare no tiene permanencia: se paga mes a mes.',
  },
  {
    q: '¿Puedo pasar mis datos de bsport a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de bsport (y de Momence, Eversports, Mindbody, Timp y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros. Las tarjetas guardadas de las alumnas no se pueden pasar de una plataforma a otra.',
  },
];

export default function TentareVsBsportPage() {
  return (
    <CompetitorPage
      name="bsport"
      slug="tentare-vs-bsport"
      logo={{ src: '/comparativa/logos/bsport.svg', alt: 'Logo de bsport', height: 24, width: 69 }}
      h1={<>Tentare frente a bsport.</>}
      intro={<>bsport es una de las plataformas europeas más usadas por estudios de fitness boutique. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, lo que más pesa al comparar es saber cuánto cuesta, qué compromiso hay y cómo se cubren las bajas de las instructoras.</>}
      rows={ROWS}
      veredicto={<>Si lo que buscas es saber lo que vas a pagar antes de hablar con nadie, no atarte a un contrato y tener sustituciones, plazas fijas y cobros pensados para un estudio de Pilates, Tentare encaja bien. Si ya dependes de integraciones concretas que bsport lleva más tiempo puliendo, o necesitas estar en las tiendas de aplicaciones, bsport es hoy la opción más madura en esos puntos.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de bsport (pro.bsport.io) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. bsport es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
