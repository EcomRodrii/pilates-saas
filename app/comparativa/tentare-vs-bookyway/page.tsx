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
    description: 'Precio, modelo de pago, Veri*factu, reformer individual y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['yes', 'Desde 29€/mes, todo incluido'], them: ['partial', 'Sin cuota fija: 1,50€ por usuario añadido (modelo de pago por uso, no comparable directamente)'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['partial', 'No es suscripción — pago por uso, sin permanencia declarada'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['no', 'Sin mención pública'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en España'], them: ['yes', 'Sí, en Italia (empresa italiana)'] },
  { feature: 'Gestión por reformer individual', tentare: ['yes', 'Sí, con lista de espera por aparato'], them: ['no', 'Menciona "Pilates Reformer" como tipo de clase, sin sistema de aparato individual'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Automática, con niveles de autonomía'], them: ['no', 'No encontrada'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Cientos de reseñas ya publicadas',
    body: 'BookyWay tiene 321 reseñas en Capterra con 4,7 sobre 5 — un volumen de prueba social que nosotros, con meses en el mercado, todavía no tenemos.',
  },
  {
    title: 'App nativa para tus alumnas',
    body: 'Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). La nuestra app nativa está en el camino.',
  },
];

export default function TentareVsBookyWayPage() {
  return (
    <CompetitorPage
      name="BookyWay"
      slug="tentare-vs-bookyway"
      logo={{ src: '/comparativa/logos/bookyway.svg', alt: 'Logo de BookyWay', height: 20, width: 120 }}
      h1={<>Tentare frente a BookyWay.</>}
      intro={<>BookyWay es un software italiano (Gymtrainer Srl, Verona), con servidores en Italia, usado también por estudios de Pilates en España vía su web traducida. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia principal hoy está en la facturación con Veri*factu y en la sustitución automática de instructoras — dos cosas pensadas específicamente para el mercado español que BookyWay no documenta.</>}
      rows={ROWS}
      veredicto={<>BookyWay tiene un modelo de precio distinto (pago por usuario añadido, no cuota mensual fija) y un volumen de reseñas mucho mayor que el nuestro. Pero es una herramienta italiana sin foco declarado en la normativa fiscal española ni en la sustitución de instructoras — para un estudio que factura en España, esas dos ausencias pesan cada mes.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de BookyWay a mediados de 2026 (bookyway.com). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. BookyWay es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
