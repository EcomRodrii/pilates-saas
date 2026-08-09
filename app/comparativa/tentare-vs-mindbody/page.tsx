import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';

export const metadata: Metadata = {
  title: 'Tentare vs Mindbody: comparativa para estudios de Pilates en España',
  description: 'Precio, permanencia, facturación Veri*factu, dónde se alojan tus datos y comisión por captar clientas — Tentare frente a Mindbody, punto por punto.',
  alternates: { canonical: 'https://tentare.app/comparativa/tentare-vs-mindbody' },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Mindbody',
    description: 'Precio, permanencia, Veri*factu y dónde viven tus datos — comparados punto por punto.',
    url: 'https://tentare.app/comparativa/tentare-vs-mindbody',
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29€/mes'], them: ['no', 'A demanda'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['no', '12-24 meses de contrato'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['no', 'No'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['no', 'Estados Unidos'] },
  { feature: 'Sin comisión por captar clientas', tentare: ['yes', 'Sin marketplace'], them: ['no', '~20% por venta'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Con niveles de autonomía'], them: ['partial', 'Limitado'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un marketplace que te trae clientas nuevas',
    body: 'Mindbody tiene su propio directorio de captación, con tráfico real buscando clases. Nosotros no lo tenemos — a cambio, no te cobramos ~20% de comisión por cada alumna que llega por ahí.',
  },
  {
    title: 'App nativa para tus alumnas',
    body: 'Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). Mindbody tiene app nativa de marca desde hace años; la nuestra está en el camino.',
  },
];

export default function TentareVsMindbodyPage() {
  return (
    <CompetitorPage
      name="Mindbody"
      slug="tentare-vs-mindbody"
      logo={{ src: '/comparativa/logos/mindbody.svg', alt: 'Logo de Mindbody', height: 24, width: 115 }}
      h1={<>Tentare frente a Mindbody.</>}
      intro={<>Mindbody es la suite estadounidense más veterana del sector fitness. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia se nota en el precio, la permanencia y en dónde acaban tus datos.</>}
      rows={ROWS}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de Mindbody a mediados de 2026 (mindbodyonline.com). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Mindbody es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
