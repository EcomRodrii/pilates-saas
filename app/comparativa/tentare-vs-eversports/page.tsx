import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-eversports';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Eversports',
    description: 'Precio por reservas, alta, facturación y funciones — comparados con lo que consta en la web pública de Eversports Manager.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de Eversports lo que consta en su web pública (eversportsmanager.com,
// revisada el 23-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido, según alumnas'], them: ['yes', 'Desde 33 €/mes (anual) o 41 €/mes (mensual), sin IVA, según reservas al mes'] },
  { feature: 'Cuota de alta', tentare: ['yes', 'Sin cuota de alta'], them: ['partial', '99 € de configuración (pago único)'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública; el plan anual se factura por año'] },
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['yes', 'Extensión de Veri*factu y TicketBAI (con fiskaly); no consta su coste'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['yes', '«Gestión de sustituciones», según su web'] },
  { feature: 'Elegir plaza en la sala', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['yes', '«Gestión de salas y Spot Booking», según su web'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Ya cubre lo que aquí sigue en desarrollo',
    body: 'Eversports ofrece hoy Veri*factu y TicketBAI (con fiskaly), spot booking, gestión de sustituciones, app con la imagen de tu negocio, clases online y vídeos a la carta. En varios de esos puntos, Tentare aún no llega.',
  },
  {
    title: 'Escala y su propio marketplace',
    body: 'Declara más de 9.000 estudios y centros en Europa, y tiene marketplace propio. Según su web, no aplica comisión a las reservas hechas por su app o su web.',
  },
];

// Las preguntas que de verdad se buscan de Eversports (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Eversports Manager?',
    a: 'Según su web, depende de las reservas al mes y no incluye IVA. Con pago mensual: Light (hasta 49 reservas) 41 €, Starter (hasta 199) 69 €, Accelerate (hasta 599) 106 €, Professional (hasta 1.499) 149 € y Champion 189 €; con pago anual salen a 33, 55, 85, 119 y 151 € al mes. Hay una configuración de 99 € (pago único). Tentare: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido, sin cuota de alta.',
  },
  {
    q: '¿Puedo pasar mis datos de Eversports a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de Eversports (y de Momence, bsport, Mindbody, Timp y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros. Las tarjetas guardadas no se pueden pasar de una plataforma a otra.',
  },
];

export default function TentareVsEversportsPage() {
  return (
    <CompetitorPage
      name="Eversports"
      slug="tentare-vs-eversports"
      logo={{ src: '/comparativa/logos/eversports.svg', alt: 'Logo de Eversports', height: 24, width: 118 }}
      h1={<>Tentare frente a Eversports.</>}
      intro={<>Eversports Manager es una plataforma europea muy extendida en estudios de fitness y yoga, con sustituciones, elección de plaza y cumplimiento fiscal español. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la comparación honesta es de precio y de cómo se calcula.</>}
      rows={ROWS}
      veredicto={<>Eversports es una opción muy completa y más madura en varios puntos. Tentare compite en precio y en enfoque: publica un precio fijo por plan (no por número de reservas), no cobra cuota de alta y está pensado para el estudio de Pilates. Si ya necesitas hoy Veri*factu y TicketBAI funcionando, o clases online y vídeo a la carta, Eversports te lo da.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de Eversports (eversportsmanager.com) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Eversports es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
