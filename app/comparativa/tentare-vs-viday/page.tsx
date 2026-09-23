import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-viday';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs ViDay',
    description: 'Precio, facturación y funciones — comparados con lo que consta en la web pública de ViDay.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de ViDay lo que consta en su web pública (viday.es,
// revisada el 23-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['partial', 'Desde 39 €/mes (Individual), IVA no incluido'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['yes', 'Sí: «solo avísanos y te damos de baja»'] },
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['yes', 'VeriFactu incluido (plan Pro) y TicketBAI, según su web'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador, con tu nombre y tu icono'], them: ['yes', 'App con tu marca, incluida desde el plan Estándar'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', 'No consta; sí ofrece plazas fijas con recuperación'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Planes por equipo y Veri*factu ya incluido',
    body: 'ViDay tiene planes pensados para varios profesionales (44 €/mes con 2 incluidos), Veri*factu y TicketBAI ya integrados y streaming de clases en el plan Pro. Tentare no cobra por profesional, pero su envío a la AEAT está en desarrollo.',
  },
  {
    title: 'Más recorrido',
    body: 'ViDay declara más de 3.500 profesionales y más de 10 años de experiencia. Tentare es un producto mucho más reciente.',
  },
];

// Las preguntas que de verdad se buscan de ViDay (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta ViDay?',
    a: 'Según su web (IVA no incluido): planes Individual Estándar 39 €/mes y Pro 59 €/mes, y planes de Equipo desde 44 €/mes (Estándar), 75 €/mes (Pro) y 129 €/mes (Empresa), con descuento por pago anual. Tentare: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
];

export default function TentareVsVidayPage() {
  return (
    <CompetitorPage
      name="ViDay"
      slug="tentare-vs-viday"
      logo={{ src: '/comparativa/logos/viday.svg', alt: 'Logo de ViDay', height: 22, width: 100 }}
      h1={<>Tentare frente a ViDay.</>}
      intro={<>ViDay es un software español (VIDAYAPPS S.L., Valladolid) de gestión de reservas y clases, con página para estudios de pilates. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, es una alternativa muy cercana: la diferencia está en el precio de entrada, el modelo de planes y la sustitución de instructoras.</>}
      rows={ROWS}
      veredicto={<>ViDay es una alternativa española muy cercana, con Veri*factu y TicketBAI ya incluidos. Si valoras el precio de entrada más bajo, la plaza por reformer y las sustituciones de instructoras de un producto pensado para Pilates, Tentare está más enfocado en eso.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de ViDay (viday.es) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. ViDay es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
