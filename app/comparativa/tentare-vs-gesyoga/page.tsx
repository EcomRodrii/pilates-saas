import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorPage, type ComparativaRow, type ResumenCompetidor, type SeccionAnalisis } from '@/components/comparativa/CompetitorPage';
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
    description: 'Precio, facturación y funciones — comparados con lo que consta en la web pública de GesYoga.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de GesYoga lo que consta en su web pública (gesyoga.com,
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  // Ejes añadidos el 29-sep-2026 (gesyoga.com y
  // gesyoga.com/funcionalidades-software-gestion-yoga/, revisadas esa fecha).
  { feature: 'Aforo por sala o aparato individual', tentare: ['yes', 'Capacidad por reformer, no solo un número de aforo'], them: ['partial', '«Asignación de sala según la capacidad que requiere cada clase», según su web; no consta a nivel de aparato individual'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación mínima/máxima y lista de espera propias por tipo de clase'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta'], them: ['yes', '30 días, sin tarjeta, según su web'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Con una sola suscripción (plan Cadena)'], them: ['partial', 'El plan Enterprise menciona «múltiples sedes»; no consta si es un panel único con una sola suscripción'] },
];


// Las preguntas que de verdad se buscan de GesYoga (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta GesYoga?',
    a: 'Según su web, Personal 12 €/mes (o 120 €/año), Profesional 45 €/mes (450 €/año) y Enterprise 65 €/mes (654 €/año), con IVA no incluido y 30 días de prueba sin tarjeta. Tentare: Founding Studio 29, Estudio 59 y Cadena 149 €/mes, IVA incluido, con 7 días de prueba.',
  },
];

// El resumen y el análisis propios de esta comparativa (7-oct-2026): lo que
// responde a «¿merece la pena?» y a «cuánto cuesta», con los mismos datos
// verificados de la tabla. Nada aquí sale de lo que «se dice» del competidor.
const RESUMEN: ResumenCompetidor = {
  queEs: 'Software de gestión para estudios de yoga, pilates y similares',
  precio: 'De 12 a 65 €/mes + IVA según el plan',
  permanencia: 'No consta en su web pública',
  destacado: { etiqueta: 'Elegir reformer', suyo: 'No consta: asigna sala según la capacidad de la clase', nuestro: 'Sí: cada alumna elige su máquina' },
  respuesta: <>GesYoga es un software de gestión para estudios de yoga y pilates con planes desde 12 €/mes sin IVA. Para un estudio de Pilates con reformers, la diferencia está en lo que hace solo: plaza por máquina, plazas fijas, cobros que se reintentan y sustituciones de instructoras. Eso es Tentare: desde 29 €/mes con IVA y sin permanencia.</>,
};

const ANALISIS: SeccionAnalisis[] = [
  {
    titulo: 'Para un estudio de Pilates con máquinas',
    cuerpo: (
      <>
        <p>GesYoga asigna una sala según la capacidad que pide cada clase, pero su web no habla de elegir aparato. En Tentare cada reformer es una plaza: la alumna elige el suyo y una máquina averiada baja el aforo de esa clase sola. <Link href="/funcionalidades/calendario-y-salas">Calendario y salas</Link>.</p>
        <p>Y cuando una instructora no puede, Tentare busca quién la cubre y avisa a las alumnas, algo que la web de GesYoga no menciona. <Link href="/funcionalidades/sustituciones">Sustituciones</Link>.</p>
      </>
    ),
  },
];

export default function TentareVsGesYogaPage() {
  return (
    <CompetitorPage
      name="GesYoga"
      slug="tentare-vs-gesyoga"
      logo={{ src: '/comparativa/logos/gesyoga.svg', alt: 'Logo de GesYoga', height: 20, width: 110 }}
      intro={<>GesYoga es un software de gestión para estudios de yoga, pilates y similares. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare va más allá: plaza por reformer, plazas fijas, cobros que se reintentan solos y sustituciones de instructoras.</>}
      resumen={RESUMEN}
      rows={ROWS}
      analisis={ANALISIS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: plaza por reformer, plazas fijas, cobros que se reintentan solos y sustituciones de instructoras, con precio público y sin permanencia. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos de GesYoga.</>}
      footnote="Basado en la información pública de GesYoga (gesyoga.com) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. GesYoga es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
