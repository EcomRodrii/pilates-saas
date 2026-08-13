import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-lorari';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Lorari',
    description: 'Precio, permanencia, Veri*factu y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['partial', 'Desde 29€/mes'], them: ['yes', 'Desde 12€/mes'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['partial', 'No lo especifica'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['no', 'Sin mención pública'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['partial', 'No especifica el país'] },
  { feature: 'Sin comisión por captar clientas', tentare: ['yes', 'Sin marketplace'], them: ['yes', 'Sin marketplace'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Con niveles de autonomía'], them: ['no', 'No encontrada'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un plan de entrada más barato',
    body: 'El plan Starter de Lorari cuesta 12€/mes, menos que nuestro plan de entrada (29€/mes). Si tu estudio es muy pequeño y solo necesitas reservas y bonos, esa diferencia pesa.',
  },
  {
    title: 'App nativa para tus alumnas',
    body: 'Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). La nuestra app nativa está en el camino.',
  },
];

export default function TentareVsLorariPage() {
  return (
    <CompetitorPage
      name="Lorari"
      slug="tentare-vs-lorari"
      logo={{ src: '/comparativa/logos/lorari.png', alt: 'Logo de Lorari', height: 34, width: 34 }}
      h1={<>Tentare frente a Lorari.</>}
      intro={<>Lorari es un software de reservas más ligero y con un plan de entrada más barato. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia real está en lo que cada uno cubre por debajo: fiscalidad, sustituciones y dónde viven tus datos.</>}
      rows={ROWS}
      veredicto={<>Si tu estudio es muy pequeño y solo necesita reservas y bonos sin más, el plan de entrada de Lorari es más barato que el nuestro. En cuanto entra en juego la parte fiscal española o necesitas cubrir la baja de una instructora sin hacer tú misma las llamadas, Tentare cubre algo que Lorari no muestra tener en público.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de Lorari a mediados de 2026 (lorari.com/pricing). Lorari no publica de forma explícita su política de permanencia ni dónde aloja los datos — lo marcamos como no confirmado en vez de asumirlo. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Lorari es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
