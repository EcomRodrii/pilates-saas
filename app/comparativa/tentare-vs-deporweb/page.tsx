import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-deporweb';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs DeporWeb',
    description: 'Precio, facturación y elección de reformer — comparados con lo que consta en la web pública de DeporWeb.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de DeporWeb lo que consta en su web pública (deporweb.es,
// revisada el 23-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['no', 'No publica cifras'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['partial', 'Publica artículos y webinars sobre VeriFactu; no consta que su producto esté certificado'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Pensado para centros deportivos grandes',
    body: 'DeporWeb declara más de 600 centros deportivos y ofrece contabilidad y facturación, remesas SEPA e integración con los principales ERP de contabilidad. Si gestionas un centro con muchas actividades, eso pesa.',
  },
  {
    title: 'Una app corporativa',
    body: 'Ofrece una app para los clientes del centro. Tentare ofrece una app instalable desde el navegador con la marca del estudio, no una app en las tiendas.',
  },
];

// Las preguntas que de verdad se buscan de DeporWeb (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta DeporWeb?',
    a: 'DeporWeb no publica precios en su web: hay que contactar con ellos. Tentare sí: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
];

export default function TentareVsDeporWebPage() {
  return (
    <CompetitorPage
      name="DeporWeb"
      slug="tentare-vs-deporweb"
      logo={{ src: '/comparativa/logos/deporweb.svg', alt: 'Logo de DeporWeb', height: 20, width: 130 }}
      h1={<>Tentare frente a DeporWeb.</>}
      intro={<>DeporWeb es un software español de gestión para centros deportivos, con una página dedicada al pilates. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia está en el enfoque (centros deportivos frente a estudios boutique) y en la transparencia de precios.</>}
      rows={ROWS}
      veredicto={<>Si gestionas un centro deportivo con muchas disciplinas y necesitas integrarlo con un ERP, DeporWeb está pensado para eso. Si tu negocio es un estudio de Pilates y quieres saber lo que vas a pagar antes de hablar con nadie, Tentare publica sus precios.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de DeporWeb (deporweb.es) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. DeporWeb es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
