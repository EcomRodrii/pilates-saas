import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorPage, type ComparativaRow, type ResumenCompetidor, type SeccionAnalisis } from '@/components/comparativa/CompetitorPage';
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
  { feature: 'App instalable con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador con el nombre, el icono y los colores del estudio; no pasa por App Store ni Google Play'], them: ['partial', 'App nativa con tu marca solo en Premium (precio a medida); los demás planes traen una app «personalizable»'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['yes', '«No necesitas tarjeta de crédito para empezar tu prueba gratuita», según su web'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Una sola suscripción y un solo acceso, con datos aislados por sede (plan Cadena)'], them: ['partial', 'Según su FAQ, con el plan Premium «puedes gestionar múltiples ubicaciones desde una única cuenta»; no confirma si es una sola suscripción o si hay coste adicional por sede'] },
];


// Las preguntas que de verdad se buscan de Bonsai (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Bonsai?',
    a: 'Tiene un plan Seed gratuito (con un 3 % extra por transacción y límites: hasta 100 reservas grupales al mes y 30 cuotas activas), Starter a 39 €/mes, o 29 €/mes con pago anual (500 reservas al mes), Pro a 69 €/mes, o 49 €/mes con pago anual, y Premium a medida. Los precios de Bonsai no incluyen IVA. Los de Tentare sí: Founding Studio 29, Estudio 59 y Cadena 149 €/mes.',
  },
  {
    q: '¿Puedo pasar mis datos de Bonsai a Tentare?',
    a: 'El importador de Tentare lee ficheros de Excel y las exportaciones de otros programas; te enseña un acta con lo importado y puedes deshacerlo. Si prefieres, te ayudamos nosotros.',
  },
];

// El resumen y el análisis propios de esta comparativa (7-oct-2026): lo que
// responde a «¿merece la pena?» y a «cuánto cuesta», con los mismos datos
// verificados de la tabla. Nada aquí sale de lo que «se dice» del competidor.
const RESUMEN: ResumenCompetidor = {
  queEs: 'App de gestión para estudios de yoga, pilates y barre, con plan gratuito',
  precio: 'Gratis con un 3 % extra por cobro; de pago desde 39 €/mes + IVA (29 € pagando el año)',
  permanencia: 'Mensual sin compromiso; el plan anual se paga por adelantado',
  destacado: { etiqueta: 'App con tu marca', suyo: 'App nativa con tu marca solo en Premium, a medida', nuestro: 'En todos los planes, con tu nombre e icono' },
  respuesta: <>Bonsai tiene un plan gratis, pero se queda un 3 % extra de cada cobro y limita las reservas y las cuotas activas; los planes de pago empiezan en 39 €/mes + IVA, y la app nativa con tu marca solo va en Premium, con precio a medida. Para un estudio de Pilates o yoga en España, la alternativa es Tentare: 29 €/mes con IVA, mes a mes, sin comisión de la plataforma y con la app con tu marca en todos los planes.</>,
};

const ANALISIS: SeccionAnalisis[] = [
  {
    titulo: '¿Bonsai es gratis de verdad?',
    cuerpo: (
      <>
        <p>El plan Seed de Bonsai no tiene cuota, pero cobra un 3 % extra en cada transacción y tiene límites: hasta 100 reservas grupales al mes y 30 cuotas activas. Si cobras 3.000 € al mes a través de la plataforma, ese 3 % son 90 € al mes: más que sus planes Starter y Pro, incluso con IVA.</p>
        <p>Los de pago, sin IVA: Starter 39 €/mes (29 € pagando el año, hasta 500 reservas al mes), Pro 69 €/mes (49 € anual) y Premium a medida. Con IVA, el Starter mensual sale a 47,19 €.</p>
        <p>Tentare Founding Studio cuesta 29 €/mes con IVA, mes a mes, sin comisión de la plataforma sobre tus cobros y sin límite de reservas. <Link href="/precios">Ver los planes</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'La app con tu marca, desde el primer plan',
    cuerpo: (
      <>
        <p>Según su web, la app nativa con la marca del estudio va solo en el plan Premium, con precio a medida; los demás planes traen una app «personalizable». En Tentare, todas las alumnas instalan desde el navegador una app con tu nombre, tu icono y tus colores, en todos los planes y sin pasar por ninguna tienda. <Link href="/funcionalidades/app-para-alumnas">Cómo es la app</Link>.</p>
        <p>Y cuando falla una instructora, Tentare busca quién la cubre y avisa a las alumnas: algo que la web de Bonsai no menciona. <Link href="/funcionalidades/sustituciones">Sustituciones</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Cómo cambiarte de Bonsai a Tentare',
    cuerpo: (
      <p>Exporta tus alumnas y bonos de Bonsai en Excel o CSV y súbelos al importador de Tentare: te enseña un acta antes de guardar y lo puedes deshacer con un botón. Si prefieres, te lo hacemos nosotros. <Link href="/soluciones/cambiar-de-software">Cómo es el cambio</Link>.</p>
    ),
  },
];

export default function TentareVsBonsaiPage() {
  return (
    <CompetitorPage
      name="Bonsai"
      slug="tentare-vs-bonsai"
      logo={{ src: '/comparativa/logos/bonsai.svg', alt: 'Logo de Bonsai', height: 26, width: 109 }}
      intro={<>Bonsai es una app de gestión para estudios de yoga, pilates y barre, con un plan gratuito que cobra un extra por cada transacción. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong> que vende bonos y cuotas, Tentare te da más por un precio claro y sin comisión de la plataforma.</>}
      resumen={RESUMEN}
      rows={ROWS}
      analisis={ANALISIS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: sustituciones de instructoras, plazas fijas y cobros que se reintentan solos, con precio público y sin que la plataforma se quede nada de tus cobros. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de Bonsai.</>}
      footnote="Basado en la información pública de Bonsai (mybonsai.app) a 7 de octubre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Bonsai es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
