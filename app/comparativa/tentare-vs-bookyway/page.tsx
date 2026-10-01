import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-bookyway';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs BookyWay',
    description: 'Modelo de precio, sustitución de instructoras y elección de reformer — comparados con lo que consta en la web pública de BookyWay.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de BookyWay lo que consta en su web pública (bookyway.com,
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['yes', 'Sin suscripción ni cancelación, según su web'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', '«Reformer» es un tipo de actividad; no consta elegir máquina'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  // Nuevos ejes (bookyway.com/es/ y bookyway.com/es/sistema-de-reservas/, revisados el 29-sep-2026):
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Aforo propio por sala, no solo un aforo global por clase; en el reformer, capacidad por puesto'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación, cancelación, bono exigido y lista de espera se fijan por tipo de clase; lo que no se toca hereda del estudio'], them: ['partial', 'Su web solo menciona límites de reservas semanales generales; no consta configuración por tipo de actividad'] },
  { feature: 'App instalable con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador con el nombre, el icono y los colores del estudio; no pasa por App Store ni Google Play'], them: ['partial', 'App de reservas «para cualquier negocio», descargable en App Store y Google Play; no consta personalización de marca por estudio'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['partial', '30 días de prueba, según su web («Prueba BookyWay gratis durante 30 días»); no consta si pide tarjeta de crédito'] },
];


// Las preguntas que de verdad se buscan de BookyWay (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta BookyWay?',
    a: 'No tiene suscripción: según su web, tras 30 días de prueba se paga un único pago de 1,50 € por cada usuario adicional. Tentare funciona por cuota mensual: Founding Studio 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
];

export default function TentareVsBookyWayPage() {
  return (
    <CompetitorPage
      name="BookyWay"
      slug="tentare-vs-bookyway"
      logo={{ src: '/comparativa/logos/bookyway.svg', alt: 'Logo de BookyWay', height: 20, width: 120 }}
      h1={<>¿BookyWay o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>BookyWay es una plataforma italiana de reservas para estudios y gimnasios que cobra por cada usuario adicional. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare es un software hecho para Pilates, con un precio mensual fijo que sabes desde el primer día.</>}
      rows={ROWS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: plaza por reformer, plazas fijas, cobros recurrentes y sustituciones de instructoras, con un precio mensual fijo y público. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos.</>}
      footnote="Basado en la información pública de BookyWay (bookyway.com) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. BookyWay es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
