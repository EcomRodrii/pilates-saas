import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { urlDe } from '@/lib/seo/paginas';

export const metadata: Metadata = {
  title: 'Tentare vs Momence: comparativa para estudios de Pilates en España',
  description: 'Precio real (con comisiones), facturación Veri*factu, dónde se alojan tus datos y sustitución de instructoras — Tentare frente a Momence, punto por punto.',
  alternates: { canonical: urlDe('/comparativa/tentare-vs-momence') },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Momence',
    description: 'Precio real con comisiones, Veri*factu y dónde viven tus datos — comparados punto por punto.',
    url: urlDe('/comparativa/tentare-vs-momence'),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio sin comisión por cobro', tentare: ['yes', 'Desde 29€/mes, fijo'], them: ['partial', 'Solo en el plan de 199$/mes'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['no', 'No'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['no', 'Estados Unidos'] },
  { feature: 'Sin comisión por captar clientas', tentare: ['yes', 'Sin marketplace'], them: ['partial', 'Solo con el plan más caro'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Con niveles de autonomía'], them: ['yes', 'Notificación automática por SMS'] },
  { feature: 'Vídeo bajo demanda incluido', tentare: ['no', 'No, fuera de nuestro foco hoy'], them: ['yes', 'Sí, incluido'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Vídeo bajo demanda incluido',
    body: 'Momence integra clases grabadas y contenido bajo demanda en el mismo plan. Hoy no lo ofrecemos — no es nuestro foco.',
  },
  {
    title: 'App de cliente con marketplace de descubrimiento',
    body: 'Con el plan más caro, tu estudio aparece en la app de consumidores de Momence — visibilidad extra a cambio de compartir vitrina con otros estudios. Nosotros no la tenemos.',
  },
];

export default function TentareVsMomencePage() {
  return (
    <CompetitorPage
      name="Momence"
      slug="tentare-vs-momence"
      logo={{ src: '/comparativa/logos/momence.svg', alt: 'Logo de Momence', height: 15, width: 122, cardBg: '#171717' }}
      h1={<>Tentare frente a Momence.</>}
      intro={<>Momence anuncia un plan gratuito, pero cobra comisión por cada cobro que procesas. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, el precio real suele acabar muy por encima del que ves en su web — y falta la parte fiscal española.</>}
      rows={ROWS}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de Momence a mediados de 2026 (momence.com/pricing). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Momence es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
