import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorPage, type ComparativaRow, type ResumenCompetidor, type SeccionAnalisis } from '@/components/comparativa/CompetitorPage';
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

// El resumen y el análisis propios de esta comparativa (7-oct-2026): lo que
// responde a «¿merece la pena?» y a «cuánto cuesta», con los mismos datos
// verificados de la tabla. Nada aquí sale de lo que «se dice» del competidor.
const RESUMEN: ResumenCompetidor = {
  queEs: 'Software de reservas y citas para muchos tipos de negocio',
  precio: 'Por centro y por profesionales: de 50 €/mes (1) a 170 €/mes (15)',
  permanencia: 'Mínimo de 3 meses en la mayoría de planes',
  destacado: { etiqueta: 'Instructoras', suyo: 'El precio sube con cada profesional del centro', nuestro: 'El precio no cuenta instructoras' },
  respuesta: <>TIMP sirve para muchos negocios de citas y clases, y su precio depende de cuántos profesionales trabajan en tu centro, con un mínimo de 3 meses en la mayoría de planes. Un estudio de Pilates con cuatro instructoras ya entra en su plan de 130 €/mes. Si quieres un precio que no cuente instructoras y sin compromiso, la alternativa es Tentare: desde 29 €/mes con IVA, mes a mes.</>,
};

const ANALISIS: SeccionAnalisis[] = [
  {
    titulo: 'Cuánto cuesta TIMP según tu equipo',
    cuerpo: (
      <>
        <p>TIMP cotiza por centro y al mes, según los profesionales: Starter 50 € (1), Basic 85 € (3), Pro 130 € (10) y Premium 170 € (15), con pago mensual y algo menos en planes semestrales y anuales. Su web no aclara si el precio incluye IVA, y la contratación mínima en la mayoría de planes es de 3 meses.</p>
        <p>En un estudio de Pilates el equipo crece pronto: con cuatro instructoras ya no vale el plan Basic y pasas a Pro, 130 € al mes. En Tentare el precio no depende de cuántas instructoras tengas: Founding Studio 29 €/mes hasta 150 alumnas activas y Estudio 59 €/mes sin límite, IVA incluido y sin permanencia. <Link href="/precios">Ver los planes</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Hecho para estudios de Pilates y yoga',
    cuerpo: (
      <>
        <p>TIMP sirve para negocios muy distintos: fisioterapia, estética, academias, yoga o pilates. Tentare está hecho para estudios de clases: plaza por reformer, aforo por sala, plazas fijas, bonos por tipo de clase y lista de espera que se gestiona sola. <Link href="/soluciones/estudio-de-pilates-reformer">Tentare para estudios de reformer</Link>.</p>
        <p>Su web tampoco menciona sustituciones de instructoras. En Tentare, si una instructora no puede, el sistema busca quién la cubre, la contacta y avisa a las alumnas. <Link href="/funcionalidades/sustituciones">Así funcionan</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Cómo cambiarte de TIMP a Tentare',
    cuerpo: (
      <p>El importador de Tentare reconoce las exportaciones de TIMP: clientas, bonos, clases y reservas, con un acta para revisarlo y un botón para deshacerlo. Si prefieres, te lo hacemos nosotros. <Link href="/soluciones/cambiar-de-software">Cómo es el cambio</Link>. Y si aún estás comparando, tenemos una guía con <Link href="/recursos/alternativas-a-timp">las alternativas a TIMP</Link>.</p>
    ),
  },
];

export default function TentareVsTimpPage() {
  return (
    <CompetitorPage
      name="TIMP"
      slug="tentare-vs-timp"
      logo={{ src: '/comparativa/logos/timp.webp', alt: 'Logo de TIMP', height: 24, width: 89 }}
      intro={<>TIMP es un software de gestión para muchos tipos de negocio de citas y clases. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare cuesta menos para empezar, no te pide compromiso mínimo y no cobra comisión por captar clientas.</>}
      resumen={RESUMEN}
      rows={ROWS}
      analisis={ANALISIS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: precio de entrada más bajo, sin compromiso mínimo ni comisión por captar clientas, y un producto hecho para Pilates. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de TIMP.</>}
      footnote="Basado en la información pública de TIMP (timp.pro) revisada el 7 de octubre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. TIMP es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
