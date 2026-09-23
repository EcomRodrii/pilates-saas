import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-mindbody';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Mindbody',
    description: 'Precio, contrato, comisión del marketplace y funciones — comparados con lo que consta en la web pública de Mindbody.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de Mindbody lo que consta en su web pública (mindbodyonline.com,
// revisada el 23-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['partial', 'Desde 99 € al mes por ubicación; el resto de planes, «hablemos»'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'Depende del plan y de las condiciones que contrates; la baja puede requerir preaviso'] },
  { feature: 'Comisión por clientas nuevas del marketplace', tentare: ['yes', 'Sin marketplace ni comisión'], them: ['partial', '20 % (tope de 30 $ o su equivalente) en la primera compra de una clienta nueva'] },
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Elegir plaza en la sala', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['yes', '«Client Pick-a-Spot», en el plan Accelerate'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador, con tu nombre y tu icono'], them: ['partial', 'App de marca como complemento de pago (precio no publicado)'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un marketplace con clientas nuevas',
    body: 'Mindbody tiene su propia app de consumidores, con tráfico real buscando clase. Listarse es gratis y solo se paga una comisión de hasta el 20 % (con tope) en la primera compra de cada clienta nueva. Tentare no tiene marketplace.',
  },
  {
    title: 'Escala',
    body: 'Declara más de 40.000 negocios y más de 3 millones de consumidores. Tentare es un producto mucho más reciente.',
  },
];

// Las preguntas que de verdad se buscan de Mindbody (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Mindbody?',
    a: 'Su página de precios indica «desde 99 € al mes por ubicación» y el resto de planes se consultan con ellos; no hay cuota de alta. Tentare publica todos sus precios: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
  {
    q: '¿Puedo pasar mis datos de Mindbody a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de Mindbody (y de bsport, Momence, Eversports, Timp y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros.',
  },
];

export default function TentareVsMindbodyPage() {
  return (
    <CompetitorPage
      name="Mindbody"
      slug="tentare-vs-mindbody"
      logo={{ src: '/comparativa/logos/mindbody.svg', alt: 'Logo de Mindbody', height: 24, width: 115 }}
      h1={<>Tentare frente a Mindbody.</>}
      intro={<>Mindbody es una de las plataformas más grandes del mundo para fitness y bienestar, con su propio marketplace de consumidores. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la pregunta es qué se gana y qué se paga por ese ecosistema.</>}
      rows={ROWS}
      veredicto={<>Si te interesa captar clientas nuevas a través de un marketplace con mucho tráfico, Mindbody puede compensar su comisión. Si prefieres saber lo que pagas por adelantado, no tener comisión por clienta nueva y un software pensado para un estudio de Pilates, Tentare publica su precio y no cobra comisión sobre tus cobros.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de Mindbody (mindbodyonline.com) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Mindbody es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
