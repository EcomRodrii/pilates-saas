import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-viday';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs ViDay',
    description: 'Precio, permanencia, Veri*factu, gestión por reformer y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['yes', 'Desde 29€/mes'], them: ['no', 'Desde 39€/mes (plan Individual Estándar)'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['yes', 'Sí'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['yes', 'Sí, con TicketBAI también'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['partial', 'No especifica dónde'] },
  { feature: 'Gestión por reformer individual', tentare: ['yes', 'Sí, con lista de espera por aparato'], them: ['no', 'No encontrada — gestión de aforo general'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Automática, con niveles de autonomía'], them: ['no', 'No encontrada'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Planes por equipo con precio por profesional',
    body: 'ViDay tiene planes pensados desde el principio para varias instructoras (44€/mes con 2 profesionales incluidos, +5€ por cada extra). Nosotros no cobramos por profesional — a cambio, no tienes esa granularidad de precio si tu equipo es muy pequeño.',
  },
  {
    title: 'Más años en el mercado español',
    body: 'ViDay (VIDAYAPPS S.L., Valladolid) lleva más tiempo operando en España que nosotros. Nosotros compensamos con un enfoque más estrecho: solo Pilates, no un software genérico de gestión de negocios.',
  },
];

export default function TentareVsVidayPage() {
  return (
    <CompetitorPage
      name="ViDay"
      slug="tentare-vs-viday"
      logo={{ src: '/comparativa/logos/viday.svg', alt: 'Logo de ViDay', height: 22, width: 100 }}
      h1={<>Tentare frente a ViDay.</>}
      intro={<>ViDay es un software español (VIDAYAPPS S.L., Valladolid) de gestión de reservas y clases, usado también por estudios de Pilates. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia principal hoy está en la gestión por reformer individual y en la sustitución automática de instructoras.</>}
      rows={ROWS}
      veredicto={<>ViDay cumple con Veri*factu y TicketBAI igual que nosotros, y tiene planes de equipo bien pensados por número de profesionales. En cuanto necesitas gestionar reformers individuales o cubrir una sustitución sin hacer tú misma las llamadas, la diferencia empieza a notarse.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de ViDay a mediados de 2026 (viday.es). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. ViDay es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
