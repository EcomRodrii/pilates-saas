import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-gesyoga';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs GesYoga',
    description: 'Precio, facturación y funciones — comparados con lo que consta en la web pública de GesYoga.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de GesYoga lo que consta en su web pública (gesyoga.com,
// revisada el 23-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['partial', 'Desde 29 €/mes, IVA incluido'], them: ['yes', 'Desde 12 €/mes (Personal), IVA no incluido'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Facturas con registro Veri*Factu', tentare: ['partial', 'Sí; el envío automático a la AEAT, en desarrollo'], them: ['yes', 'Sí, en modo ERP'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un precio de entrada más bajo',
    body: 'El plan Personal de GesYoga empieza en 12 €/mes (IVA no incluido), muy por debajo de los 29 €/mes de Tentare. Si tu estudio es pequeño y solo necesitas lo básico, esa diferencia es real.',
  },
  {
    title: 'Veri*factu ya integrado y vídeo',
    body: 'En modo ERP incluye facturación conforme a VeriFactu, y permite publicar grabaciones de clases en una biblioteca de vídeo. Tentare no ofrece vídeo bajo demanda, y su envío automático a la AEAT está en desarrollo.',
  },
];

// Las preguntas que de verdad se buscan de GesYoga (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta GesYoga?',
    a: 'Según su web, Personal 12 €/mes (o 120 €/año), Profesional 45 €/mes (450 €/año) y Enterprise 65 €/mes (654 €/año), con IVA no incluido y 30 días de prueba sin tarjeta. Tentare: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido, con 7 días de prueba.',
  },
];

export default function TentareVsGesYogaPage() {
  return (
    <CompetitorPage
      name="GesYoga"
      slug="tentare-vs-gesyoga"
      logo={{ src: '/comparativa/logos/gesyoga.svg', alt: 'Logo de GesYoga', height: 20, width: 110 }}
      h1={<>Tentare frente a GesYoga.</>}
      intro={<>GesYoga es un software español de gestión para estudios de yoga, pilates y similares, con Veri*factu en su modo ERP. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia está en el precio de entrada y en las funciones de reformer y sustituciones.</>}
      rows={ROWS}
      veredicto={<>Si tu prioridad es el precio más bajo, la facturación con VeriFactu ya integrada o publicar grabaciones, GesYoga encaja bien. Si buscas plaza por reformer, plazas fijas, cobros que se reintentan solos y sustituciones de instructoras, Tentare está pensado para un estudio de Pilates.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en la información pública de GesYoga (gesyoga.com) a 23 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. GesYoga es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
