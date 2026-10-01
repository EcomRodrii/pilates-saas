import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-viday';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs ViDay',
    description: 'Precio, facturación y funciones — comparados con lo que consta en la web pública de ViDay.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de ViDay lo que consta en su web pública (viday.es,
// revisada el 23-sep-2026 y ampliada el 29-sep-2026, con la URL de cada dato). Lo
// que no consta se dice tal cual —«no consta en su web pública»— y nunca se
// rellena con «sí» ni con «no». Una versión anterior de esta tabla atribuía al
// competidor datos que nadie había comprobado (contratos, comisiones, dónde
// aloja los datos): eso no vuelve a entrar.
//
// Las 3 filas añadidas el 29-sep-2026 se verificaron en vivo con el navegador
// contra: https://viday.es/clases-grupales/ (sin mención de aforo por sala ni
// de reglas de reserva por tipo de clase) y https://viday.es/precios/ (sin
// mención de periodo de prueba; solo CTAs «Empieza ahora» y «Te llamamos»).
const ROWS: ComparativaRow[] = [
  { feature: 'Precio de entrada', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['partial', 'Desde 39 €/mes (Individual), IVA no incluido'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['yes', 'Sí: «solo avísanos y te damos de baja»'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador, con tu nombre y tu icono'], them: ['yes', 'App con tu marca, incluida desde el plan Estándar'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', 'No consta; sí ofrece plazas fijas con recuperación'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Cada clase pertenece a una sala con capacidad propia, no solo un aforo global de la clase'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación mínima, penalización y mínimo de asistentes se fijan por tipo de clase, heredando lo del estudio'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días gratis del plan que elijas, sin pedir tarjeta'], them: ['partial', 'No consta en su web pública; solo ofrece agendar una demo'] },
];


// Las preguntas que de verdad se buscan de ViDay (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta ViDay?',
    a: 'Según su web (IVA no incluido): planes Individual Estándar 39 €/mes y Pro 59 €/mes, y planes de Equipo desde 44 €/mes (Estándar), 75 €/mes (Pro) y 129 €/mes (Empresa), con descuento por pago anual. Tentare: Base 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
];

export default function TentareVsVidayPage() {
  return (
    <CompetitorPage
      name="ViDay"
      slug="tentare-vs-viday"
      logo={{ src: '/comparativa/logos/viday.svg', alt: 'Logo de ViDay', height: 22, width: 100 }}
      h1={<>¿ViDay o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>ViDay es un software de gestión de reservas y clases con varios modelos de planes. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare cuesta menos para empezar y trae plaza por reformer y sustituciones de instructoras.</>}
      rows={ROWS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: precio de entrada más bajo, plaza por reformer y sustituciones de instructoras. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de ViDay.</>}
      footnote="Basado en la información pública de ViDay (viday.es) a 23 de septiembre de 2026, ampliada el 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. ViDay es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
