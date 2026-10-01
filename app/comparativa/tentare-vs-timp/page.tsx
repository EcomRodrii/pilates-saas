import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow } from '@/components/comparativa/CompetitorPage';
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
    description: 'Precio, compromiso mínimo, facturación y comisión de TIMPY — comparados con lo que consta en la web pública de TIMP.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de TIMP lo que consta en su web pública (timp.pro,
// revisada el 23-sep-2026 y ampliada el 29-sep-2026, con la URL de cada dato). Lo
// que no consta se dice tal cual —«no consta en su web pública»— y nunca se
// rellena con «sí» ni con «no». Una versión anterior de esta tabla atribuía al
// competidor datos que nadie había comprobado (contratos, comisiones, dónde
// aloja los datos): eso no vuelve a entrar.
//
// Las 3 filas añadidas el 29-sep-2026 se verificaron en vivo con el navegador
// contra: https://timp.pro/ (home, FAQ «¿Puedo gestionar varios centros desde
// una sola cuenta de administrador?»), https://timp.pro/precios/ (tabla de
// comparación de características y nota «Precios por centro») y
// https://timp.pro/app-de-reservas/ (sin mención de aforo por sala ni de
// reglas de reserva por tipo de clase).
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['yes', 'Desde 50 €/mes (1 profesional); no consta si incluye IVA'] },
  { feature: 'Compromiso mínimo', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', '«La contratación mínima en la mayoría de planes es de 3 meses»'] },
  { feature: 'Comisión por captar clientas', tentare: ['yes', 'Sin marketplace ni comisión'], them: ['partial', 'Con TIMPY, «comisión por la gestión del cobro»; el porcentaje no es público'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Con tu nombre, tu icono, tu logo y tus colores, en todos los planes; se instala desde el navegador'], them: ['yes', 'Progressive Web App con tu logo, nombre y colores'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Cada clase pertenece a una sala con capacidad propia, no solo un aforo global de la clase'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación mínima, penalización y mínimo de asistentes se fijan por tipo de clase, heredando lo del estudio'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'El plan Cadena cubre varios centros bajo la misma suscripción'], them: ['partial', 'Según su FAQ, un único panel gestiona varias sedes; pero sus precios se cotizan «por centro»'] },
];


// Las preguntas que de verdad se buscan de TIMP (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta TIMP?',
    a: 'Según su web, por centro y al mes: Starter 50 € (1 profesional), Basic 85 € (3), Pro 130 € (10) y Premium 170 € (15), con descuento en planes semestrales y anuales; la web no aclara si incluye IVA. Tentare: Founding Studio 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
  {
    q: '¿TIMP tiene permanencia?',
    a: 'Su web indica que «la contratación mínima en la mayoría de planes es sólo de 3 meses». Tentare no tiene permanencia: se paga mes a mes.',
  },
  {
    q: '¿Puedo pasar mis datos de TIMP a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de Timp (y de bsport, Momence, Eversports, Mindbody y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros.',
  },
];

export default function TentareVsTimpPage() {
  return (
    <CompetitorPage
      name="TIMP"
      slug="tentare-vs-timp"
      logo={{ src: '/comparativa/logos/timp.webp', alt: 'Logo de TIMP', height: 24, width: 89 }}
      h1={<>¿TIMP o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>TIMP es un software de gestión para muchos tipos de negocio de citas y clases. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare cuesta menos para empezar, no te pide compromiso mínimo y no cobra comisión por captar clientas.</>}
      rows={ROWS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: precio de entrada más bajo, sin compromiso mínimo ni comisión por captar clientas, y un producto hecho para Pilates. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de TIMP.</>}
      footnote="Basado en la información pública de TIMP (timp.pro) a 23 de septiembre de 2026, ampliada el 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. TIMP es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
