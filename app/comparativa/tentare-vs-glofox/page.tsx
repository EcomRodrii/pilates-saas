import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow, type HonestyCard } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-glofox';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs Glofox',
    description: 'Precio real en euros, permanencia, gestión por reformer y sustitución de instructoras — comparados punto por punto.',
    url: urlDe(PATH),
  },
};

const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['yes', 'Desde 29€/mes'], them: ['no', 'Desde ~100 USD/mes (planes completos hasta ~370€/mes)'] },
  { feature: 'Moneda de facturación', tentare: ['yes', 'Euros'], them: ['no', 'Dólares (según país de contratación)'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], them: ['no', 'Compromiso anual o trimestral habitual'] },
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], them: ['no', 'Sin mención pública'] },
  { feature: 'Gestión por reformer individual', tentare: ['yes', 'Sí, con lista de espera por aparato'], them: ['no', 'No documentada — gestiona aforo general'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Automática, con niveles de autonomía'], them: ['no', 'No nativa — coordinación manual'] },
  { feature: 'Soporte en castellano', tentare: ['yes', 'Nativo'], them: ['partial', 'Disponible, valoraciones desiguales en reseñas europeas'] },
];

const HONESTY: HonestyCard[] = [
  {
    title: 'Escala para múltiples sedes y ecosistema de integraciones',
    body: 'Glofox tiene más recorrido para operativas de gran volumen (cientos de socios, varias sedes con necesidades de CRM/ERP específicas) y un catálogo de integraciones más amplio. Si eso es lo que necesitas, puede encajar mejor que nosotros.',
  },
  {
    title: 'Es un producto probado fuera de España',
    body: 'Glofox lleva más años en el mercado internacional de gimnasios y boxes de fitness. Nosotros llevamos menos tiempo — a cambio, cada pantalla está pensada desde el primer día para un estudio de Pilates, no adaptada desde un software genérico.',
  },
];

export default function TentareVsGlofoxPage() {
  return (
    <CompetitorPage
      name="Glofox"
      slug="tentare-vs-glofox"
      logo={{ src: '/comparativa/logos/glofox.svg', alt: 'Logo de Glofox', height: 20, width: 100 }}
      h1={<>Tentare frente a Glofox.</>}
      intro={<>Glofox es una plataforma irlandesa pensada para gimnasios, boxes de CrossFit y centros de fitness en general. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong> con reformers y un calendario ajustado, la diferencia empieza por el precio en euros sin permanencia y sigue por la gestión de aparato individual.</>}
      rows={ROWS}
      veredicto={<>Glofox funciona bien para operativas de volumen — gimnasios con cientos de socios, varias sedes, necesidades de integración amplias. Si tu negocio son las clases de Pilates con reformers, instructoras y una relación cercana con tus alumnas, pagar entre 100 y 370 euros al mes por un software genérico en dólares, con permanencia, no compite fácilmente con una alternativa especializada desde 29€/mes.</>}
      honestyIntro="No somos mejores en todo — y te lo contamos abajo, sin rodeos."
      honesty={HONESTY}
      footnote="Basado en información pública de Glofox a mediados de 2026 (glofox.com) y en reseñas públicas de usuarios en Trustpilot y Capterra. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Glofox es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
    />
  );
}
