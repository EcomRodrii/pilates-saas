import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-timp';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs TIMP',
    description: 'Precio, permanencia, Veri*factu/TicketBAI y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
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
      veredicto={<>Entre dos españoles con Veri*factu nativo, la diferencia está en el enfoque: TIMP cubre fisioterapia, nutrición, psicología y más disciplinas con más de 15 módulos; Tentare solo hace pilates, pero cubre la sustitución de instructoras de una forma que TIMP no muestra en su web pública. Si necesitas gestionar varias disciplinas distintas desde un solo software, TIMP tiene hoy más recorrido en eso.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de TIMP a mediados de 2026 (timp.pro). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. TIMP es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
