import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorPage, type ComparativaRow, type ResumenCompetidor, type SeccionAnalisis } from '@/components/comparativa/CompetitorPage';
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
    description: 'Precio, facturación y elección de reformer — comparados con lo que consta en la web pública de DeporWeb.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de DeporWeb lo que consta en su web pública (deporweb.es,
// revisada el 29-sep-2026, con la URL de cada dato). Lo que no consta se dice tal
// cual —«no consta en su web pública»— y nunca se rellena con «sí» ni con «no».
// Una versión anterior de esta tabla atribuía al competidor datos que nadie había
// comprobado (contratos, comisiones, dónde aloja los datos): eso no vuelve a entrar.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['no', 'No publica cifras'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí, en la UE'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Elegir reformer al reservar', tentare: ['yes', 'Plaza por reformer si la sala tiene sus puestos definidos'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas y contacta con tu visto bueno; autónoma en el plan Estudio'], them: ['partial', 'No consta en su web pública'] },
  // Nuevos ejes (deporweb.es/gestion-de-clientes, /pilates/ y
  // /app-gestionar-gimnasio/, revisados el 29-sep-2026):
  { feature: 'Aforo por sala individual', tentare: ['yes', 'Aforo propio por sala, no solo un aforo global por clase; en el reformer, capacidad por puesto'], them: ['partial', 'Menciona «reserva de zonas»; no consta un aforo propio por sala'] },
  { feature: 'Reglas de reserva/cancelación por tipo de clase', tentare: ['yes', 'Antelación, cancelación, bono exigido y lista de espera se fijan por tipo de clase; lo que no se toca hereda del estudio'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'App instalable con la marca del estudio', tentare: ['yes', 'Instalable desde el navegador con el nombre, el icono y los colores del estudio; no pasa por App Store ni Google Play'], them: ['partial', 'Su app lleva «colores, logos y estética» propios del centro, según su web; no consta si se instala sin pasar por App Store/Google Play'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Una sola suscripción y un solo acceso, con datos aislados por sede (plan Cadena)'], them: ['partial', 'Ofrece una opción de «cadena de gimnasios» que remite a solicitar demo; no consta si es un panel único con una sola suscripción'] },
];


// Las preguntas que de verdad se buscan de DeporWeb (precio, permanencia,
// migrar), respondidas solo con lo que se puede comprobar.
const FAQ = [
  {
    q: '¿Cuánto cuesta DeporWeb?',
    a: 'DeporWeb no publica precios en su web: hay que contactar con ellos. Tentare sí: Founding Studio 29, Estudio 59 y Cadena 149 €/mes, IVA incluido.',
  },
];

// El resumen y el análisis propios de esta comparativa (7-oct-2026): lo que
// responde a «¿merece la pena?» y a «cuánto cuesta», con los mismos datos
// verificados de la tabla. Nada aquí sale de lo que «se dice» del competidor.
const RESUMEN: ResumenCompetidor = {
  queEs: 'Software de gestión para centros deportivos con muchas disciplinas',
  precio: 'No lo publica: hay que contactar con ellos',
  permanencia: 'No consta en su web pública',
  prueba: 'No consta en su web pública',
  respuesta: <>DeporWeb está pensado para centros deportivos con muchas disciplinas y no publica sus precios. Para un estudio de Pilates o yoga que quiere saber lo que paga sin pedir una demo, y un producto hecho para clases con reformer, la alternativa es Tentare: desde 29 €/mes con IVA, sin permanencia y con 7 días de prueba sin tarjeta.</>,
};

const ANALISIS: SeccionAnalisis[] = [
  {
    titulo: 'Un gimnasio y un estudio de Pilates no se gestionan igual',
    cuerpo: (
      <>
        <p>Un centro deportivo vende accesos, zonas y muchas actividades. Un estudio de Pilates vende plazas en una máquina a una hora concreta, con alumnas que repiten cada semana. Por eso Tentare trae plaza por reformer, aforo por sala, plazas fijas y lista de espera automática. <Link href="/soluciones/estudio-de-pilates-reformer">Tentare para estudios de reformer</Link>.</p>
        <p>Y el precio está publicado: Founding Studio 29 €/mes, Estudio 59 €/mes y Cadena 149 €/mes, con IVA. <Link href="/precios">Ver los planes</Link>.</p>
      </>
    ),
  },
];

export default function TentareVsDeporWebPage() {
  return (
    <CompetitorPage
      name="DeporWeb"
      slug="tentare-vs-deporweb"
      logo={{ src: '/comparativa/logos/deporweb.svg', alt: 'Logo de DeporWeb', height: 20, width: 130 }}
      intro={<>DeporWeb es un software de gestión para centros deportivos con muchas disciplinas. Para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, Tentare es un producto hecho para tu estudio, con precios públicos desde el primer día.</>}
      resumen={RESUMEN}
      rows={ROWS}
      analisis={ANALISIS}
      veredicto={<>Tentare es la mejor opción para tu estudio de Pilates: un producto hecho para estudios como el tuyo y con precios públicos, sin tener que hablar con nadie para saber lo que pagas. Pruébalo 7 días gratis, sin tarjeta, y te traemos tus datos.</>}
      footnote="Basado en la información pública de DeporWeb (deporweb.es) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. DeporWeb es marca de su respectivo propietario; esta comparación es orientativa y sin ánimo de menoscabo."
      faq={FAQ}
    />
  );
}
