import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
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
// revisada el 23-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Modelo de precio', tentare: ['partial', 'Suscripción mensual con precio público'], them: ['partial', 'Sin suscripción: 1,50 € por usuario adicional tras 30 días'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['yes', 'Sin suscripción ni cancelación, según su web'] },
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', '«Reformer» es un tipo de actividad; no consta elegir máquina'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Sin cuota fija',
    body: 'BookyWay no cobra suscripción: pagas 1,50 € por cada usuario adicional después de los 30 primeros días. Para un estudio muy pequeño o con poca rotación puede salir más barato que una cuota mensual.',
  },
  {
    title: 'Escala y apps móviles',
    body: 'Declara más de 2.300 actividades y más de 1 millón de usuarios, con app gratuita para iOS y Android. Tentare no tiene apps en las tiendas.',
  },
];

// Las preguntas que de verdad se buscan de BookyWay (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta BookyWay?',
    a: 'No tiene suscripción: según su web, tras 30 días de prueba se paga un único pago de 1,50 € por cada usuario adicional. Tentare funciona por cuota mensual: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
];

export default function TentareVsBookyWayPage() {
  return (
    <CompetitorPage
      name="BookyWay"
      slug="tentare-vs-bookyway"
      logo={{ src: '/comparativa/logos/bookyway.svg', alt: 'Logo de BookyWay', height: 20, width: 120 }}
      h1={<>Tentare frente a BookyWay.</>}
      intro={<>BookyWay es una plataforma italiana de reservas para estudios y gimnasios que no cobra suscripción: solo un pago por cada usuario adicional. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, es un modelo de precio distinto, no comparable euro a euro con una cuota mensual.</>}
      rows={ROWS}
      veredicto={<>Si prefieres no tener una cuota y pagar solo por usuario, BookyWay encaja mejor con ese modelo. Si buscas plaza por reformer, plazas fijas, cobros recurrentes y sustituciones de instructoras con un precio mensual fijo y público, Tentare está pensado para eso.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de BookyWay (bookyway.com) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. BookyWay es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
