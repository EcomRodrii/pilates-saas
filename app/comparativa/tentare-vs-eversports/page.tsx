import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow } from '@/components/comparativa/CompetitorPage';
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
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido, según alumnas'], them: ['yes', 'Desde 33 €/mes (anual) o 41 €/mes (mensual), sin IVA, según reservas al mes'] },
  { feature: 'Cuota de alta', tentare: ['yes', 'Sin cuota de alta'], them: ['partial', '99 € de configuración (pago único)'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública; el plan anual se factura por año'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['yes', '«Gestión de sustituciones», según su web'] },
  { feature: 'Elegir plaza en la sala', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['yes', '«Gestión de salas y Spot Booking», según su web'] },
  // Ejes añadidos el 29-sep-2026 (eversportsmanager.com/es, /es-ES/precios y
  // /es-ES/funciones-de-gestion, revisadas esa fecha).
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación mínima/máxima y lista de espera propias por tipo de clase'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta'], them: ['partial', 'No consta en su web pública; solo se ofrece reservar una demo'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Con una sola suscripción (plan Cadena)'], them: ['yes', '«Gestionarlos desde un solo panel», según su web'] },
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
      h1={<>¿Eversports o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>Eversports Manager es una plataforma europea de fitness y yoga que cobra según el número de reservas. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare tiene un precio fijo por plan, sin cuota de alta, y está pensado para Pilates.</>}
      rows={ROWS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: precio fijo por plan (no por número de reservas), sin cuota de alta y un producto pensado para Pilates. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de Eversports.</>}
      footnote="Basado en la información pública de Eversports (eversportsmanager.com) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Eversports es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
