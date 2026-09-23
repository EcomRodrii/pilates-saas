import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
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
// revisada el 23-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['yes', 'Plan gratis (con un 3 % extra por cobro) o desde 29 €/mes + IVA (Starter)'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'Mensual sin compromiso; el plan anual se paga por adelantado'] },
  { feature: 'Comisión de la plataforma por cobro', tentare: ['yes', 'Ninguna de Tentare (solo la de Stripe)'], them: ['partial', '3 % extra en el plan gratis; ninguna en los de pago'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['yes', 'Servidores en la UE, según sus condiciones'] },
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un plan gratuito de verdad',
    body: 'El plan Seed de Bonsai es gratis para siempre (hasta 100 reservas grupales al mes y 30 cuotas activas), con un 3 % extra sobre cada cobro. Tentare no tiene plan gratuito: la prueba es de 7 días.',
  },
  {
    title: 'Más recorrido',
    body: 'Bonsai declara más de 20.000 profesionales en su web. Tentare es un producto mucho más reciente.',
  },
];

// Las preguntas que de verdad se buscan de Bonsai (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Bonsai?',
    a: 'Tiene un plan Seed gratuito (con un 3 % extra por transacción y límites: hasta 100 reservas grupales al mes y 30 cuotas activas), Starter a 29 €/mes (500 reservas al mes), Pro a 49 €/mes y Premium a medida. Los precios de Bonsai no incluyen IVA. Los de Tentare sí: Base 29, Estudio 59 y Cadena 149 €/mes.',
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
      h1={<>Tentare frente a Bonsai.</>}
      intro={<>Bonsai es una app española de gestión para estudios de yoga, pilates y barre, con un plan gratuito. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, lo que más pesa al comparar es el precio real (comisiones incluidas), el compromiso y cómo se cubren las bajas.</>}
      rows={ROWS}
      veredicto={<>Si estás empezando y tu volumen es pequeño, el plan gratuito de Bonsai puede bastarte, sabiendo que cobra un 3 % extra por transacción. Si ya vendes bonos y cuotas y quieres sustituciones de instructoras, plazas fijas y cobros que se reintentan solos, Tentare está pensado para eso, con precio público y sin comisión de la plataforma.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de Bonsai (mybonsai.app) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Bonsai es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
