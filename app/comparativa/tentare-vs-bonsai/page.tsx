import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-bonsai';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Bonsai',
    description: 'Precio, permanencia, Veri*factu y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['partial', 'Desde 29€/mes'], them: ['yes', 'Gratis (con 3% de comisión) o desde 29€/mes'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['yes', 'Sí'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['no', 'Sin mención pública'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['yes', 'Lo declaran en su web'] },
  { feature: 'Sin comisión por captar clientas', tentare: ['yes', 'Sin marketplace'], them: ['yes', 'Sin marketplace'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Con niveles de autonomía'], them: ['no', 'No encontrada'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un plan gratuito para empezar',
    body: 'El plan Seed de Bonsai es gratis (con un 3% extra en cada cobro con tarjeta). Nosotros no tenemos plan gratuito — empezamos en 29€/mes desde el primer día.',
  },
  {
    title: 'App nativa para tus alumnas',
    body: 'Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). La nuestra app nativa está en el camino.',
  },
];

export default function TentareVsBonsaiPage() {
  return (
    <CompetitorPage
      name="Bonsai"
      slug="tentare-vs-bonsai"
      logo={{ src: '/comparativa/logos/bonsai.svg', alt: 'Logo de Bonsai', height: 26, width: 109 }}
      h1={<>Tentare frente a Bonsai.</>}
      intro={<>Bonsai es un software español, con sede en Valencia, pensado también para estudios de yoga y pilates. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia principal hoy está en Veri*factu y en la sustitución de instructoras.</>}
      rows={ROWS}
      veredicto={<>El plan gratuito de Bonsai puede compensar si tu estudio mueve poco volumen y no te importa el 3% extra en cada cobro con tarjeta. En cuanto factura de verdad, o necesitas cubrir una sustitución de instructora sin hacer tú misma las llamadas, la diferencia empieza a notarse cada mes.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de Bonsai a mediados de 2026 (mybonsai.app). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Bonsai es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
