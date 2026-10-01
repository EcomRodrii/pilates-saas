import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow } from '@/components/comparativa/CompetitorPage';
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
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['partial', 'Desde 99 € al mes por ubicación; el resto de planes, «hablemos»'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'Depende del plan y de las condiciones que contrates; la baja puede requerir preaviso'] },
  { feature: 'Comisión por clientas nuevas del marketplace', tentare: ['yes', 'Sin marketplace ni comisión'], them: ['partial', '20 % (tope de 30 $ o su equivalente) en la primera compra de una clienta nueva'] },
  { feature: 'Elegir plaza en la sala', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['yes', '«Client Pick-a-Spot», en el plan Accelerate'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador, con tu nombre y tu icono'], them: ['partial', 'App de marca como complemento de pago (precio no publicado)'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'La antelación para cancelar puede ser distinta por tipo de clase (p. ej. reformer vs. mat)'], them: ['yes', '«Booking window» y «cancellation window» configurables por servicio, según su web de ayuda'] },
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Cada sala tiene su propio aforo, independiente del de la clase'], them: ['partial', 'Asigna una sala o recurso a la clase o cita, pero el aforo se fija por clase, no por sala, según su ayuda'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Varias sedes con un solo acceso y una sola suscripción, desde el plan Cadena'], them: ['yes', '«Un panel corporativo único» para todas las sedes, según su web; solo en el nivel Enterprise, a consultar'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['partial', 'No consta en su web pública'] },
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
      h1={<>¿Mindbody o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>Mindbody es una plataforma internacional de fitness y bienestar con su propio marketplace de consumidores. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare te da lo que necesitas sin comisiones por clienta nueva ni sobre tus cobros.</>}
      rows={ROWS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: sabes lo que pagas por adelantado, sin comisión por clienta nueva ni sobre tus cobros, y con un producto hecho para Pilates. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de Mindbody.</>}
      footnote="Basado en la información pública de Mindbody (mindbodyonline.com) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Mindbody es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
