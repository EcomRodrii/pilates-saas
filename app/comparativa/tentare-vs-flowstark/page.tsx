import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-flowstark';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Flowstark',
    description: 'Precio, permanencia, Veri*factu, reformer individual y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['partial', 'Desde 29€/mes'], them: ['yes', 'Gratis hasta 50 clientes, o 19€/mes sin límite'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['yes', 'Sí — cancela cuando quieras desde el panel'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['no', 'Sin mención pública'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en España'], them: ['partial', 'Empresa con sede en España; alojamiento de datos no especificado'] },
  { feature: 'Gestión por reformer individual', tentare: ['yes', 'Sí, con lista de espera por aparato'], them: ['no', 'No encontrada'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Automática, con niveles de autonomía'], them: ['no', 'No encontrada'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Un plan gratuito para empezar',
    body: 'Flowstark tiene un plan Free real (hasta 50 clientes, 30 servicios) sin coste. Nosotros no tenemos plan gratuito — empezamos en 29€/mes desde el primer día.',
  },
  {
    title: 'App nativa para tus alumnas',
    body: 'Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). La nuestra app nativa está en el camino.',
  },
];

export default function TentareVsFlowstarkPage() {
  return (
    <CompetitorPage
      name="Flowstark"
      slug="tentare-vs-flowstark"
      logo={{ src: '/comparativa/logos/flowstark.svg', alt: 'Logo de Flowstark', height: 20, width: 120 }}
      h1={<>Tentare frente a Flowstark.</>}
      intro={<>Flowstark es un software español (FLOWSTARK TECH, Olot) de gestión de clientes recurrentes y cobros, pensado para negocios de servicios en general — incluye una página específica para centros de yoga y pilates. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia principal hoy está en la especialización: reformer individual y sustitución de instructoras.</>}
      rows={ROWS}
      veredicto={<>El plan gratuito de Flowstark puede compensar si tu estudio es muy pequeño y solo necesitas gestión básica de clientes y cobros. En cuanto necesitas gestionar reformers individuales, facturar con Veri*factu o cubrir una sustitución sin hacer tú misma las llamadas, la diferencia empieza a notarse — Flowstark es una herramienta genérica de gestión de clientes, no construida para la lógica de un estudio de Pilates.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de Flowstark a mediados de 2026 (flowstark.com). Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Flowstark es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
