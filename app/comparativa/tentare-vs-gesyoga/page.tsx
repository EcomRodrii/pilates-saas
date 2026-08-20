import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-gesyoga';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs GesYoga',
    description: 'Precio, permanencia, Veri*factu, gestión por reformer y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['partial', 'Desde 29€/mes'], them: ['yes', 'Desde 12€/mes (plan Personal)'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['partial', 'No lo especifica en público'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['yes', 'Sí (en modo ERP)'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['partial', 'No especifica dónde'] },
  { feature: 'Gestión por reformer individual', tentare: ['yes', 'Sí, con lista de espera por aparato'], them: ['partial', 'Configura máquinas por clase, sin confirmar plaza por aparato'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Automática, con niveles de autonomía'], them: ['no', 'Solo reasignación manual de profesor'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Precio de entrada más bajo',
    body: 'El plan Personal de GesYoga empieza en 12€/mes, bastante por debajo de nuestros 29€/mes. Si tu estudio es muy pequeño y solo necesitas lo básico, esa diferencia de precio es real.',
  },
  {
    title: 'App nativa para tus alumnas',
    body: 'Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). La nuestra app nativa está en el camino.',
  },
];

export default function TentareVsGesYogaPage() {
  return (
    <CompetitorPage
      name="GesYoga"
      slug="tentare-vs-gesyoga"
      logo={{ src: '/comparativa/logos/gesyoga.svg', alt: 'Logo de GesYoga', height: 20, width: 110 }}
      h1={<>Tentare frente a GesYoga.</>}
      intro={<>GesYoga es un software español pensado sobre todo para centros de yoga, usado también por estudios de Pilates. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia principal hoy está en la gestión por reformer individual y en la sustitución automática de instructoras.</>}
      rows={ROWS}
      veredicto={<>Si tu estudio es muy pequeño y el precio manda, el plan Personal de GesYoga (12€/mes) es más barato que el nuestro. En cuanto necesitas gestionar reformers individuales o cubrir una sustitución sin hacer tú misma las llamadas, la diferencia empieza a notarse — GesYoga solo permite reasignar manualmente el profesor de una clase, no automatiza la búsqueda de sustituta.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de GesYoga a mediados de 2026 (gesyoga.com). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. GesYoga es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
