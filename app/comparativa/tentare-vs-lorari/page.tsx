import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorPage, type ComparativaRow, type ResumenCompetidor, type SeccionAnalisis } from '@/components/comparativa/CompetitorPage';
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
    description: 'Precio, permanencia y funciones — comparados con lo que consta en la web pública de Lorari.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de Lorari lo que consta en su web pública (lorari.com,
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['yes', '«Cancela cuando quieras», según su web'] },
  { feature: 'Comisión de la plataforma por cobro', tentare: ['yes', 'Ninguna de Tentare (solo la de Stripe)'], them: ['partial', 'Los cobros por Stripe llevan sus comisiones; no consta si Lorari añade la suya'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Con tu nombre, tu icono, tu logo y tus colores, en todos los planes; se instala desde el navegador'], them: ['yes', '«Tu app con tu logo», según su web'] },
  // Revisado el 7-oct-2026 en lorari.com/pricing: la lista de espera va en el plan Pro.
  { feature: 'Lista de espera automática', tentare: ['yes', 'En todos los planes: la plaza que se libera pasa sola a la siguiente'], them: ['partial', 'Lista de espera por WhatsApp, desde el plan Pro'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Cada sala tiene su propio aforo (y su mapa de puestos, si lo usas), no un número global por clase'], them: ['partial', 'Menciona «control de capacidad y espacios» sin detallar si el aforo se fija por sala'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'La antelación para cancelar puede ser distinta por tipo de clase (p. ej. reformer vs. mat)'], them: ['partial', 'Habla de reprogramar «según las políticas del centro», sin detallar si son distintas por tipo de clase'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['no', '14 días, pero pide tarjeta al empezar, según sus preguntas frecuentes'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Varias sedes con un solo acceso y una sola suscripción'], them: ['partial', 'Menciona «gestión de ubicaciones» sin detallar si es un panel único con una sola suscripción'] },
];


// Las preguntas que de verdad se buscan de Lorari (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Lorari?',
    a: 'Según su web, pagando el año: Starter 12 €/mes (50 alumnos activos), Pro 27 €/mes (150) y Business 51 €/mes (ilimitados); mes a mes, 16, 36 y 68 €. IVA aparte y 14 días de prueba. Tentare: Founding Studio 29 €/mes (hasta 150 alumnas), Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
];

// El resumen y el análisis propios de esta comparativa (7-oct-2026): lo que
// responde a «¿merece la pena?» y a «cuánto cuesta», con los mismos datos
// verificados de la tabla. Nada aquí sale de lo que «se dice» del competidor.
const RESUMEN: ResumenCompetidor = {
  queEs: 'Plataforma de reservas para estudios de pilates y yoga',
  precio: 'Por alumnos activos: de 12 a 51 €/mes + IVA pagando el año; de 16 a 68 € mes a mes',
  permanencia: 'Cancela cuando quieras, según su web',
  prueba: '14 días, pero pide tarjeta al empezar',
  respuesta: <>Lorari es una app de reservas sencilla para estudios de pilates y yoga, con un precio que sube según tus alumnos activos y sin IVA. Para un estudio con 150 alumnas, Tentare cuesta menos con IVA y además cubre lo que más tiempo te quita: las bajas de las instructoras, el aforo de cada sala y los cobros que fallan. Desde 29 €/mes con IVA, sin permanencia.</>,
};

const ANALISIS: SeccionAnalisis[] = [
  {
    titulo: '¿Cuánto cuesta Lorari para un estudio como el tuyo?',
    cuerpo: (
      <>
        <p>Lorari cobra por alumnos activos y sus precios no incluyen IVA. Pagando el año: Starter 12 €/mes (hasta 50 alumnos), Pro 27 €/mes (hasta 150) y Business 51 €/mes (sin límite). Mes a mes: 16, 36 y 68 €.</p>
        <p>Un estudio de reformer en marcha suele pasar de 50 alumnas, así que la comparación real es con el plan Pro. Para 150 alumnas, Lorari Pro sale a 32,67 € al mes con IVA pagando el año por adelantado, o 43,56 € mes a mes. Tentare Founding Studio cubre hasta 150 alumnas activas por 29 €/mes con IVA, mes a mes, y con la app con tu marca incluida. <Link href="/precios">Ver los planes de Tentare</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Lo que Tentare hace por ti cuando algo se tuerce',
    cuerpo: (
      <>
        <p>La web de Lorari no menciona sustituciones de instructoras. En Tentare, cuando una instructora avisa de que no puede, el sistema busca quién la cubre según su disponibilidad y su costumbre, la contacta con tu visto bueno y avisa a las alumnas del cambio. <Link href="/funcionalidades/sustituciones">Así funcionan las sustituciones</Link>.</p>
        <p>Con los cobros pasa algo parecido: si una tarjeta falla, Tentare vuelve a intentarlo en tres momentos distintos y, si no lo consigue, te avisa. Y si prefieres la domiciliación, genera la remesa SEPA para tu banco. <Link href="/funcionalidades/cobros-recurrentes">Cobros automáticos</Link>.</p>
      </>
    ),
  },
  {
    titulo: 'Cómo cambiarte de Lorari a Tentare',
    cuerpo: (
      <p>El importador de Tentare lee ficheros de Excel y CSV: exporta tus alumnas y bonos de Lorari, súbelos y revisa el acta antes de guardar; si algo no cuadra, lo deshaces con un botón. Si prefieres, te lo hacemos nosotros. <Link href="/soluciones/cambiar-de-software">Cómo es el cambio</Link>.</p>
    ),
  },
];

export default function TentareVsLorariPage() {
  return (
    <CompetitorPage
      name="Lorari"
      slug="tentare-vs-lorari"
      logo={{ src: '/comparativa/logos/lorari.png', alt: 'Logo de Lorari', height: 34, width: 34 }}
      intro={<>Lorari es una plataforma de reservas para estudios de pilates y yoga, con precios por número de alumnas activas. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare cubre lo que de verdad te quita tiempo: las bajas de las instructoras, el aforo de cada sala y los cobros.</>}
      resumen={RESUMEN}
      rows={ROWS}
      analisis={ANALISIS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: sustituciones de instructoras, plazas fijas, aforo por sala y cobros que se reintentan solos, con precio público en cada plan. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de Lorari.</>}
      footnote="Basado en la información pública de Lorari (lorari.com) a 7 de octubre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Lorari es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
