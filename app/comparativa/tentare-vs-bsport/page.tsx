import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';

export const metadata: Metadata = {
  title: 'Tentare vs bsport: comparativa para estudios de Pilates en España',
  description: 'Precio, permanencia, facturación Veri*factu, dónde se alojan tus datos y sustitución de instructoras — Tentare frente a bsport, punto por punto.',
  alternates: { canonical: 'https://tentare.app/comparativa/tentare-vs-bsport' },
  openGraph: {
    type: 'website',
    title: 'Tentare vs bsport',
    description: 'Precio, permanencia, Veri*factu y sustitución de instructoras — comparados punto por punto.',
    url: 'https://tentare.app/comparativa/tentare-vs-bsport',
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['no', 'Vía ERP externo'] },
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29€/mes'], them: ['no', 'A demanda'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['no', 'Contrato anual'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['yes', 'Sí'] },
  { feature: 'Sin comisión por captar clientas', tentare: ['yes', 'Sin marketplace'], them: ['yes', 'Sin marketplace'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Con niveles de autonomía'], them: ['yes', 'Herramientas de sustitución'] },
  { feature: 'Aviso de dependencia de una instructora', tentare: ['yes', 'Riesgo de plantón'], them: ['no', 'No'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Más años de recorrido en el sector',
    body: 'bsport lleva más tiempo en el mercado del fitness boutique europeo y acumula más integraciones de terceros (pasarelas, agenda externa, pantallas de sala) que nosotros aún no cubrimos.',
  },
  {
    title: 'App nativa para tus alumnas',
    body: 'Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). bsport tiene app nativa de marca; la nuestra está en el camino.',
  },
];

export default function TentareVsBsportPage() {
  return (
    <CompetitorPage
      name="bsport"
      slug="tentare-vs-bsport"
      logo={{ src: '/comparativa/logos/bsport.svg', alt: 'Logo de bsport', height: 24, width: 69 }}
      h1={<>Tentare frente a bsport.</>}
      intro={<>bsport es una de las plataformas europeas más usadas por estudios de fitness boutique. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, hay diferencias que se notan cada mes: la factura, la permanencia y el precio.</>}
      rows={ROWS}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de bsport a mediados de 2026 (pro.bsport.io). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. bsport es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
