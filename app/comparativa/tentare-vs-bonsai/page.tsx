import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-bonsai';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Bonsai',
    description: 'Precio, permanencia, comisiones y sustitución de instructoras — comparados con lo que consta en la web pública de Bonsai.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de Bonsai lo que consta en su web pública (mybonsai.app,
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['yes', 'Plan gratis (con un 3 % extra por cobro) o Starter desde 29 €/mes + IVA con pago anual (39 € mes a mes)'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'Mensual sin compromiso; el plan anual se paga por adelantado'] },
  { feature: 'Comisión de la plataforma por cobro', tentare: ['yes', 'Ninguna de Tentare (solo la de Stripe)'], them: ['partial', '3 % extra en el plan gratis; ninguna en los de pago'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['yes', 'Servidores en la UE, según sus condiciones'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  // Nuevos ejes (mybonsai.app/precios y mybonsai.app/faqs, revisados el 29-sep-2026):
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación, cancelación, bono exigido y lista de espera se fijan por tipo de clase; lo que no se toca hereda del estudio'], them: ['partial', 'Permite fijar cuántos cambios o recuperaciones puede hacer cada alumna y activar lista de espera automática; no consta que la antelación de reserva se configure por tipo de clase'] },
  { feature: 'App instalable con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador con el nombre, el icono y los colores del estudio; no pasa por App Store ni Google Play'], them: ['partial', 'App nativa con marca propia solo en el plan Premium, según su web; en el resto de planes, app genérica de Bonsai para iOS y Android'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['yes', '«No necesitas tarjeta de crédito para empezar tu prueba gratuita», según su web'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Una sola suscripción y un solo acceso, con datos aislados por sede (plan Cadena)'], them: ['partial', 'Según su FAQ, con el plan Premium «puedes gestionar múltiples ubicaciones desde una única cuenta»; no confirma si es una sola suscripción o si hay coste adicional por sede'] },
];


// Las preguntas que de verdad se buscan de Bonsai (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Bonsai?',
    a: 'Tiene un plan Seed gratuito (con un 3 % extra por transacción y límites: hasta 100 reservas grupales al mes y 30 cuotas activas), Starter a 39 €/mes, o 29 €/mes con pago anual (500 reservas al mes), Pro a 69 €/mes, o 49 €/mes con pago anual, y Premium a medida. Los precios de Bonsai no incluyen IVA. Los de Tentare sí: Base 29, Estudio 59 y Cadena 149 €/mes.',
  },
  {
    q: '¿Puedo pasar mis datos de Bonsai a Tentare?',
    a: 'El importador de Tentare lee ficheros de Excel y las exportaciones de otros programas; te enseña un acta con lo importado y puedes deshacerlo. Si prefieres, te ayudamos nosotros.',
  },
];

export default function TentareVsBonsaiPage() {
  return (
    <CompetitorPage
      name="Bonsai"
      slug="tentare-vs-bonsai"
      logo={{ src: '/comparativa/logos/bonsai.svg', alt: 'Logo de Bonsai', height: 26, width: 109 }}
      h1={<>¿Bonsai o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>Bonsai es una app de gestión para estudios de yoga, pilates y barre, con un plan gratuito que cobra un extra por cada transacción. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong> que vende bonos y cuotas, Tentare te da más por un precio claro y sin comisión de la plataforma.</>}
      rows={ROWS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: sustituciones de instructoras, plazas fijas y cobros que se reintentan solos, con precio público y sin que la plataforma se quede nada de tus cobros. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de Bonsai.</>}
      footnote="Basado en la información pública de Bonsai (mybonsai.app) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Bonsai es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
