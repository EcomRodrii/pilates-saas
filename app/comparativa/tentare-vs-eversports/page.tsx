import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-eversports';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Eversports',
    description: 'Precio, permanencia, Veri*factu y comisión por captar clientas — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['partial', 'Add-on de pago'] },
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29€/mes'], them: ['yes', 'Público'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['no', 'Contrato anual'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['yes', 'Sí'] },
  { feature: 'Sin comisión por captar clientas', tentare: ['yes', 'Sin marketplace'], them: ['no', '~25% por venta'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Con niveles de autonomía'], them: ['partial', 'Limitado'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un marketplace con tráfico real',
    body: 'Eversports.es tiene alumnas reales buscando clase en tu ciudad cada día. Nosotros no lo tenemos — a cambio, no te cobramos ~25% de comisión por cada una que llegue por ahí.',
  },
  {
    title: 'App nativa para tus alumnas',
    body: 'Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). Eversports tiene app nativa de marca; la nuestra está en el camino.',
  },
];

export default function TentareVsEversportsPage() {
  return (
    <CompetitorPage
      name="Eversports"
      slug="tentare-vs-eversports"
      logo={{ src: '/comparativa/logos/eversports.svg', alt: 'Logo de Eversports', height: 24, width: 118 }}
      h1={<>Tentare frente a Eversports.</>}
      intro={<>Eversports combina software de gestión con su propio marketplace de clases. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la pregunta es si esa visibilidad compensa la comisión y el contrato anual.</>}
      rows={ROWS}
      veredicto={<>Si prefieres no pagar comisión por cada alumna que te llega y no quieres firmar un contrato anual, Tentare sale más barato en la mayoría de estudios de tamaño normal. Si tu negocio depende de captar clientas nuevas a través de un marketplace con tráfico real buscando clase en tu ciudad, la visibilidad de Eversports.es puede compensar esa comisión — es un cálculo que solo tú puedes hacer con tus propios números.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de Eversports a mediados de 2026 (eversports.es). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Eversports es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
