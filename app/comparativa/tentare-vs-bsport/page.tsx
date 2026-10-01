import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow } from '@/components/comparativa/CompetitorPage';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa/tentare-vs-bsport';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: 'Tentare vs bsport',
    description: 'Cuánto cuesta cada uno, permanencia, facturación y sustitución de instructoras — comparados con lo que consta en la web pública de bsport.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de bsport lo que consta en su web pública (pro.bsport.io,
// revisada el 29-sep-2026). Lo que no consta se dice tal cual —«no consta en su
// web pública»—, nunca se rellena con «no» ni con «sí»: una comparativa que
// atribuye al competidor lo que nadie ha comprobado es una afirmación
// inventada. Hasta el 23-sep esta tabla decía «contrato anual» y «vía ERP
// externo» de bsport sin que su web lo diga en ningún sitio.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['no', 'No publica cifras: hay que pedir presupuesto'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas, contacta y avisa; autónoma desde el plan Estudio'], them: ['yes', 'Sustituciones automáticas, según su web'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Con tu nombre, tu icono, tu logo y tus colores, en todos los planes; se instala desde el navegador'], them: ['yes', 'App propia, en los planes superiores'] },
  { feature: 'Aviso de dependencia de una instructora', tentare: ['yes', 'Riesgo de concentración'], them: ['partial', 'No consta en su web pública'] },
  // Nuevos ejes (pro.bsport.io/pricing, /studios/multilocations-franchises y su
  // centro de ayuda en intercom.help/bsport-helpcenter, revisados el 29-sep-2026):
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Aforo propio por sala, no solo un aforo global por clase; en el reformer, capacidad por puesto'], them: ['partial', 'Su centro de ayuda distingue el aforo del establecimiento de la capacidad por sesión, pero no confirma un aforo propio por sala dentro del mismo local'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación, cancelación, bono exigido y lista de espera se fijan por tipo de clase; lo que no se toca hereda del estudio'], them: ['yes', 'Al crear cada tipo de cita se fija la antelación de cancelación gratuita y el plazo límite para reservar, según su centro de ayuda'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['partial', 'No ofrece prueba de autoservicio; su web de precios habla de un «periodo inicial gratuito» integrado en el contrato para estudios nuevos'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Una sola suscripción y un solo acceso, con datos aislados por sede (plan Cadena)'], them: ['yes', 'Un solo panel para varias sedes o franquicias («one platform for every growth model»), con plan Scale a medida y sin precio público'] },
];


// Las preguntas que de verdad se buscan de bsport. Todas respondidas solo con lo
// que se puede comprobar; donde no hay dato, se dice y se manda a preguntar.
const FAQ = [
  {
    q: '¿Cuánto cuesta bsport?',
    a: 'bsport no publica precios en su web: ofrece varios planes (con funciones distintas, como la app propia en los superiores) y hay que pedir un presupuesto para saber la cifra. Tentare publica los suyos: Founding Studio 29 €/mes, con la app con tu marca incluida, Estudio 59 €/mes y Cadena 149 €/mes, IVA incluido, con 7 días de prueba gratis sin tarjeta.',
  },
  {
    q: '¿Qué alternativas a bsport hay para un estudio de Pilates en España?',
    a: 'La mejor alternativa a bsport para un estudio de Pilates en España es Tentare. Está pensado para estudios de Pilates y Yoga: reservas con plaza por reformer, plazas fijas, cobros que se reintentan solos y sustituciones de instructoras, con precio público. Otras opciones que se comparan a menudo son Eversports, Momence, Mindbody o TIMP; las tienes en la comparativa general.',
  },
  {
    q: '¿bsport tiene permanencia?',
    a: 'No consta en su web pública. Si estás valorando cambiar, pregúntales por escrito la duración del contrato y las condiciones de baja. Tentare no tiene permanencia: se paga mes a mes.',
  },
  {
    q: '¿Puedo pasar mis datos de bsport a Tentare?',
    a: 'Sí. El importador de Tentare reconoce las exportaciones de bsport (y de Momence, Eversports, Mindbody, Timp y Excel): te enseña un acta con lo importado y puedes deshacerlo con un botón. Si prefieres, te ayudamos nosotros. Las tarjetas guardadas de las alumnas no se pueden pasar de una plataforma a otra.',
  },
];

export default function TentareVsBsportPage() {
  return (
    <CompetitorPage
      name="bsport"
      slug="tentare-vs-bsport"
      logo={{ src: '/comparativa/logos/bsport.svg', alt: 'Logo de bsport', height: 24, width: 69 }}
      h1={<>¿bsport o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>bsport es una plataforma europea de fitness boutique que no publica sus precios. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare te deja saber lo que pagas antes de hablar con nadie, sin contrato y con todo lo que necesita tu estudio.</>}
      rows={ROWS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates en España: sabes lo que vas a pagar antes de hablar con nadie, sin contrato, y tienes sustituciones, plazas fijas y cobros pensados para Pilates. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de bsport.</>}
      footnote="Basado en la información pública de bsport (pro.bsport.io) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. bsport es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
