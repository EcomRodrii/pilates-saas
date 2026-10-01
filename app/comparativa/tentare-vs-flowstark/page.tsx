import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-flowstark';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Flowstark',
    description: 'Precio y alcance — comparados con lo que consta en la web pública de Flowstark.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de Flowstark lo que consta en su web pública (flowstark.com,
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['partial', 'Desde 29 €/mes, IVA incluido'], them: ['yes', 'Gratis (hasta 50 clientes) o 19 €/mes + impuestos'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['yes', 'Cancelas cuando quieras; surte efecto al final del periodo'] },
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['partial', 'Dice cumplir el RGPD; no consta el país'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  // Ejes añadidos el 29-sep-2026 (flowstark.com y flowstark.com/centros-yoga-y-pilates,
  // revisadas esa fecha). Flowstark se centra en cobros y suscripciones, no en
  // reservas de clase con sala — de ahí que estos cuatro ejes no consten.
  { feature: 'Aforo por sala o aparato individual', tentare: ['yes', 'Capacidad por reformer, no solo un número de aforo'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación mínima/máxima y lista de espera propias por tipo de clase'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Portal instalable con marca propia', tentare: ['yes', 'Se instala en el móvil con el logo y los colores del estudio, sin pasar por ninguna tienda'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Con una sola suscripción (plan Cadena)'], them: ['partial', 'No consta en su web pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un plan gratuito y un precio más bajo',
    body: 'Flowstark tiene un plan gratis (hasta 50 clientes, 30 servicios y 30 suscripciones) y un plan Pro a 19 €/mes, más barato que la entrada de Tentare. Si solo necesitas cobrar cuotas, es más ligero.',
  },
  {
    title: 'Una herramienta de cobros',
    body: 'Está centrada en suscripciones y cobros recurrentes. Tentare cubre además reservas con sala y reformer, plazas fijas y sustituciones, pero con un precio de entrada más alto.',
  },
];

// Las preguntas que de verdad se buscan de Flowstark (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Flowstark?',
    a: 'Tiene un plan gratuito (con límites de clientes, servicios y suscripciones) y un plan Pro a 19 €/mes sin límite; los precios no incluyen impuestos. Tentare empieza en 29 €/mes, IVA incluido.',
  },
];

export default function TentareVsFlowstarkPage() {
  return (
    <CompetitorPage
      name="Flowstark"
      slug="tentare-vs-flowstark"
      logo={{ src: '/comparativa/logos/flowstark.svg', alt: 'Logo de Flowstark', height: 20, width: 120 }}
      h1={<>¿Flowstark o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>Flowstark es una herramienta española de gestión de cobros recurrentes y suscripciones, con página para centros de yoga y pilates. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, es más una herramienta de cobros y cuotas que un software completo de reservas de clases con sala y reformer.</>}
      rows={ROWS}
      veredicto={<>Para gestionar un estudio de Pilates entero —reservas con plaza por reformer, plazas fijas, bonos y sustituciones—, Tentare. Flowstark se queda en cobrar cuotas recurrentes al menor coste: si solo necesitas eso, es ligero y barato.</>}
      honesty={HONESTY}
      footnote="Basado en la información pública de Flowstark (flowstark.com) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Flowstark es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
