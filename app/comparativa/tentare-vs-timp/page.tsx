import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-timp';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs TIMP',
    description: 'Precio, compromiso mínimo, facturación y comisión de TIMPY — comparados con lo que consta en la web pública de TIMP.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de TIMP lo que consta en su web pública (timp.pro,
// revisada el 23-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['yes', 'Desde 50 €/mes (1 profesional); no consta si incluye IVA'] },
  { feature: 'Compromiso mínimo', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', '«La contratación mínima en la mayoría de planes es de 3 meses»'] },
  { feature: 'Facturas con Veri*Factu / TicketBAI', tentare: ['partial', 'Veri*Factu en formato; sin TicketBAI; envío a la AEAT en desarrollo'], them: ['yes', 'Contabilidad adaptada a TicketBAI y a Verifactu, según su web'] },
  { feature: 'Comisión por captar clientas', tentare: ['yes', 'Sin marketplace ni comisión'], them: ['partial', 'Con TIMPY, «comisión por la gestión del cobro»; el porcentaje no es público'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador, con tu nombre y tu icono'], them: ['yes', 'Progressive Web App con tu logo, nombre y colores'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Más años y más módulos',
    body: 'TIMP declara más de 10.000 profesionales en 13 países y cubre muchas disciplinas (fisioterapia, nutrición, psicología…) con más módulos. Tentare es más reciente y más enfocado.',
  },
  {
    title: 'Facturación adaptada a TicketBAI y Verifactu',
    body: 'Si tu estudio está en el País Vasco o necesitas TicketBAI, TIMP lo tiene y Tentare no. El envío automático de Tentare a la AEAT está en desarrollo.',
  },
];

// Las preguntas que de verdad se buscan de TIMP (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta TIMP?',
    a: 'Según su web, por centro y al mes: Starter 50 € (1 profesional), Basic 85 € (3), Pro 130 € (10) y Premium 170 € (15), con descuento en planes semestrales y anuales; la web no aclara si incluye IVA. Tentare: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
  {
    q: '¿TIMP tiene permanencia?',
    a: 'Su web indica que «la contratación mínima en la mayoría de planes es sólo de 3 meses». Tentare no tiene permanencia: se paga mes a mes.',
  },
  {
    q: '¿Puedo pasar mis datos de TIMP a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de Timp (y de bsport, Momence, Eversports, Mindbody y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros.',
  },
];

export default function TentareVsTimpPage() {
  return (
    <CompetitorPage
      name="TIMP"
      slug="tentare-vs-timp"
      logo={{ src: '/comparativa/logos/timp.webp', alt: 'Logo de TIMP', height: 24, width: 89 }}
      h1={<>Tentare frente a TIMP.</>}
      intro={<>TIMP es un software español de gestión para muchos tipos de negocio de citas y clases, con Veri*factu y TicketBAI. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia está en el precio de entrada, el compromiso mínimo y si pagas comisión por captar clientas.</>}
      rows={ROWS}
      veredicto={<>Entre dos productos españoles, TIMP cubre más disciplinas y ya adapta su facturación a TicketBAI y Verifactu. Si tu negocio es un estudio de Pilates y quieres precio de entrada más bajo, sin compromiso mínimo ni comisión por captar clientas, Tentare encaja mejor.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de TIMP (timp.pro) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. TIMP es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
