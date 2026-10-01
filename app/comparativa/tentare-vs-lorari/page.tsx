import type { Metadata } from 'next';
import { CompetitorPage, type ComparativaRow } from '@/components/comparativa/CompetitorPage';
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
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador, con tu nombre y tu icono'], them: ['yes', '«Tu app con tu logo», según su web'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Cada sala tiene su propio aforo (y su mapa de puestos, si lo usas), no un número global por clase'], them: ['partial', 'Menciona «control de capacidad y espacios» sin detallar si el aforo se fija por sala'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'La antelación para cancelar puede ser distinta por tipo de clase (p. ej. reformer vs. mat)'], them: ['partial', 'Habla de reprogramar «según las políticas del centro», sin detallar si son distintas por tipo de clase'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['partial', '14 días de prueba, según su web; no indica si pide tarjeta'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Varias sedes con un solo acceso y una sola suscripción'], them: ['partial', 'Menciona «gestión de ubicaciones» sin detallar si es un panel único con una sola suscripción'] },
];


// Las preguntas que de verdad se buscan de Lorari (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta Lorari?',
    a: 'Según su web, pagando el año: Starter 12 €/mes (50 alumnos activos), Pro 27 €/mes (150) y Business 51 €/mes (ilimitados); mes a mes, 16, 36 y 68 €. IVA aparte y 14 días de prueba. Tentare: Base 29 €/mes (hasta 150 alumnas), Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
];

export default function TentareVsLorariPage() {
  return (
    <CompetitorPage
      name="Lorari"
      slug="tentare-vs-lorari"
      logo={{ src: '/comparativa/logos/lorari.png', alt: 'Logo de Lorari', height: 34, width: 34 }}
      h1={<>¿Lorari o Tentare? Para tu estudio de Pilates, Tentare.</>}
      intro={<>Lorari es una plataforma de reservas para estudios de pilates y yoga, con precios por número de alumnas activas. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare cubre lo que de verdad te quita tiempo: las bajas de las instructoras, el aforo de cada sala y los cobros.</>}
      rows={ROWS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: sustituciones de instructoras, plazas fijas, aforo por sala y cobros que se reintentan solos, con precio público en cada plan. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de Lorari.</>}
      footnote="Basado en la información pública de Lorari (lorari.com) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. Lorari es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
