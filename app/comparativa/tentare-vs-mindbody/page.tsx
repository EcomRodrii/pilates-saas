import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorPage, type ComparativaRow, type ResumenCompetidor, type SeccionAnalisis } from '@/components/comparativa/CompetitorPage';
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
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Con tu nombre, tu icono, tu logo y tus colores, en todos los planes; se instala desde el navegador'], them: ['partial', 'App de marca como complemento de pago (precio no publicado)'] },
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
    a: 'Su página de precios indica «desde 99 € al mes por ubicación» y el resto de planes se consultan con ellos; no hay cuota de alta. Tentare publica todos sus precios: Founding Studio 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
  {
    q: '¿Puedo pasar mis datos de Mindbody a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de Mindbody (y de bsport, Momence, Eversports, Timp y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros.',
  },
];

// El resumen y el análisis propios de esta comparativa (7-oct-2026): lo que
// responde a «¿merece la pena?» y a «cuánto cuesta», con los mismos datos
// verificados de la tabla. Nada aquí sale de lo que «se dice» del competidor.
const RESUMEN: ResumenCompetidor = {
  queEs: 'Plataforma internacional de fitness y bienestar, con marketplace de clientas',
  precio: 'Desde 99 €/mes + IVA por local; el resto de planes, a consultar',
  permanencia: 'Depende del plan; la baja puede pedir preaviso',
  prueba: 'No consta en su web pública',
  respuesta: <>Mindbody es una plataforma grande, con marketplace propio, pero su precio arranca en 99 € al mes por ubicación, la app con tu marca es un complemento de pago y se queda una comisión en la primera compra de cada clienta nueva que llega por su marketplace. Para un estudio de Pilates o yoga en España, la alternativa es Tentare: desde 29 €/mes con IVA, la app con tu marca incluida y ninguna comisión sobre tus cobros.</>,
};

const ANALISIS: SeccionAnalisis[] = [
  {
    titulo: 'Lo que cuesta Mindbody de verdad',
    cuerpo: (
      <>
        <p>Su página de precios indica «a partir de 99 € al mes por local», sin IVA (119,79 € con IVA), y el resto de planes se consultan con ellos. A eso hay que sumar dos cosas que no están en la cuota:</p>
        <ul>
          <li><strong>La comisión del marketplace.</strong> Cuando una clienta nueva te encuentra en el marketplace de Mindbody y compra, se queda el 20 % de esa primera compra, con un tope de 30 $. Si vende tu bono de 10 clases a 120 €, son 24 € para Mindbody.</li>
          <li><strong>La app con tu marca.</strong> Es un complemento de pago, sin precio publicado.</li>
        </ul>
        <p>En Tentare la app con tu nombre, tu logo y tus colores va incluida en todos los planes, y Tentare no se queda nada de tus cobros: solo pagas la comisión de Stripe por cobrar con tarjeta. <Link href="/funcionalidades/app-para-alumnas">Cómo es la app de tus alumnas</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Elegir reformer y aforo por sala',
    cuerpo: (
      <>
        <p>En Mindbody, elegir sitio al reservar («Pick-a-Spot») va en el plan Accelerate, y el aforo se fija por clase. En Tentare, si defines los puestos de una sala, la alumna elige su reformer al reservar en cualquier plan, y cada sala tiene su propio aforo: una máquina averiada baja la capacidad de esa clase sin tocar las demás. <Link href="/soluciones/estudio-de-pilates-reformer">Tentare para estudios de reformer</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Cómo cambiarte de Mindbody a Tentare',
    cuerpo: (
      <p>El importador de Tentare reconoce las exportaciones de Mindbody: clientas, bonos, clases y reservas, con un acta para revisarlo antes de guardar y un botón para deshacerlo. Si prefieres, te lo hacemos nosotros. <Link href="/soluciones/cambiar-de-software">Cómo es el cambio</Link>.</p>
    ),
  },
];

export default function TentareVsMindbodyPage() {
  return (
    <CompetitorPage
      name="Mindbody"
      slug="tentare-vs-mindbody"
      logo={{ src: '/comparativa/logos/mindbody.svg', alt: 'Logo de Mindbody', height: 24, width: 115 }}
      intro={<>Mindbody es una plataforma internacional de fitness y bienestar con su propio marketplace de consumidores. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare te da lo que necesitas sin comisiones por clienta nueva ni sobre tus cobros.</>}
      resumen={RESUMEN}
      rows={ROWS}
      analisis={ANALISIS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: sabes lo que pagas por adelantado, sin comisión por clienta nueva ni sobre tus cobros, y con un producto hecho para Pilates. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de Mindbody.</>}
      footnote="Basado en la información pública de Mindbody (mindbodyonline.com) a 7 de octubre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Mindbody es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
