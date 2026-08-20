import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-deporweb';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs DeporWeb',
    description: 'Precio, transparencia de información, reformer individual y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['yes', 'Desde 29€/mes, público'], them: ['no', 'No publica precio — hay que contactar'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['partial', 'No lo especifica en público'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['partial', 'Muestra un sello VeriFactu en su web, sin explicar el alcance'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], them: ['partial', 'No especifica dónde'] },
  { feature: 'Gestión por reformer individual', tentare: ['yes', 'Sí, con lista de espera por aparato'], them: ['no', 'No encontrada — funcionalidades genéricas de ficha de socio y reservas'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Automática, con niveles de autonomía'], them: ['no', 'No encontrada'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Alta de socias con lector de DNI',
    body: 'DeporWeb permite dar de alta a una socia leyendo su DNI directamente, algo pensado para centros deportivos de más volumen con recepción física. Nosotros no tenemos esa integración — nuestro alta es siempre digital, sin hardware.',
  },
  {
    title: 'Más años operando con centros deportivos en España',
    body: 'DeporWeb (Sport Consulting, Valladolid) es un proveedor establecido para clubes y centros deportivos. Nosotros somos más recientes, con foco exclusivo en Pilates en vez de en centros deportivos en general.',
  },
];

export default function TentareVsDeporWebPage() {
  return (
    <CompetitorPage
      name="DeporWeb"
      slug="tentare-vs-deporweb"
      logo={{ src: '/comparativa/logos/deporweb.svg', alt: 'Logo de DeporWeb', height: 20, width: 130 }}
      h1={<>Tentare frente a DeporWeb.</>}
      intro={<>DeporWeb es un software español (Sport Consulting, Valladolid) de gestión para centros deportivos en general, con una página específica para Pilates. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, la diferencia principal hoy está en la transparencia de la información pública (sin precio ni condiciones publicadas) y en la especialización: reformer individual y sustitución de instructoras.</>}
      rows={ROWS}
      veredicto={<>DeporWeb no publica precio ni condiciones de contrato en su web — hay que contactar para saberlo, lo que ya es una decisión que toma por ti. Sus funcionalidades públicas son genéricas de centro deportivo (ficha de socio, reservas, alta con DNI), sin nada específico para la lógica de un estudio de Pilates con reformers e instructoras.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de DeporWeb a mediados de 2026 (deporweb.es). Varios datos (precio, permanencia, alojamiento de datos) no están publicados y se marcan como tal — verifica siempre con la fuente actual. DeporWeb es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
