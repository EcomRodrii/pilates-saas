import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';

export const metadata: Metadata = {
  title: 'Tentare vs TIMP: comparativa para estudios de Pilates en España',
  description: 'Precio, permanencia, Veri*factu y TicketBAI, comisión por captar clientas y sustitución de instructoras — Tentare frente a TIMP, punto por punto.',
  alternates: { canonical: 'https://tentare.app/comparativa/tentare-vs-timp' },
  openGraph: {
    type: 'website',
    title: 'Tentare vs TIMP',
    description: 'Precio, permanencia, Veri*factu/TicketBAI y sustitución de instructoras — comparados punto por punto.',
    url: 'https://tentare.app/comparativa/tentare-vs-timp',
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29€/mes'], them: ['yes', 'Desde 50€/mes'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['partial', 'Preaviso de 15 días'] },
  { feature: 'Facturación España (Veri*factu / TicketBAI) nativa', tentare: ['yes', 'Nativo'], them: ['yes', 'Nativo, con TicketBAI'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['partial', 'No especifica el país'] },
  { feature: 'Sin comisión por captar clientas', tentare: ['yes', 'Sin marketplace'], them: ['no', 'Vía TIMPY, con comisión'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Con niveles de autonomía'], them: ['no', 'Sin evidencia pública'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Más años y más módulos en el mercado español',
    body: 'TIMP es un software español consolidado, con más de 2.300 centros y más de 15 módulos. Nosotros somos más recientes y más enfocados: hacemos menos cosas, pero las de Pilates las hacemos a fondo.',
  },
  {
    title: 'Visibilidad extra vía marketplace',
    body: 'Con TIMPY, su app de descubrimiento, TIMP te da visibilidad ante clientas que ya buscan clase — a cambio de comisión por reserva. Nosotros no la tenemos.',
  },
];

export default function TentareVsTimpPage() {
  return (
    <CompetitorPage
      name="TIMP"
      slug="tentare-vs-timp"
      logo={{ src: '/comparativa/logos/timp.webp', alt: 'Logo de TIMP', height: 24, width: 89 }}
      h1={<>Tentare frente a TIMP.</>}
      intro={<>TIMP es un software de gestión español, con Veri*factu y TicketBAI nativos igual que nosotros. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates</strong>, la diferencia está en el precio de entrada, la permanencia y si pagas comisión por captar clientas.</>}
      rows={ROWS}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de TIMP a mediados de 2026 (timp.pro). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. TIMP es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
