import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorPage, type ComparativaRow, type ResumenCompetidor, type SeccionAnalisis } from '@/components/comparativa/CompetitorPage';
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
    description: 'Precio, permanencia, plaza por reformer y sustitución de instructoras, comparados con lo que consta en la web pública de Glofox.',
    url: urlDe(PATH),
  },
};

// ⚠️ Solo se afirma de Glofox lo que consta en su web pública (www.glofox.com,
// /features/scheduling/, /features/billing/ y /pricing/, revisada el
// 29-sep-2026). Lo que no consta se dice tal cual, nunca se rellena con «sí» ni
// con «no». Hasta el 11-oct esta página era un artículo largo con cifras de
// «fuentes de terceros», notas de Trustpilot y «contratos anuales» que ni su web
// ni nosotros habíamos comprobado: se quitaron al pasarla a la plantilla de las
// demás comparativas.
const ROWS: ComparativaRow[] = [
  { feature: 'Precio público en la web', tentare: ['yes', 'Desde 29 €/mes, IVA incluido'], them: ['partial', 'Anuncia planes desde 99 USD/mes, en dólares; su web remite a pedir una demo para el precio'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí, mes a mes'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Plaza por reformer individual', tentare: ['yes', 'Cada alumna reserva su reformer concreto'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Lista de espera por aparato', tentare: ['yes', 'Automática: la plaza que se libera pasa a la siguiente'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Sustitución de instructoras', tentare: ['yes', 'Propone candidatas, contacta y avisa; autónoma desde el plan Estudio'], them: ['partial', 'No consta como función nativa en su web pública'] },
  { feature: 'App con la marca del estudio', tentare: ['yes', 'Con tu nombre, tu icono, tu logo y tus colores, en todos los planes; se instala desde el navegador'], them: ['yes', 'App con marca propia, según su web'] },
  { feature: 'Reglas de reserva y cancelación por tipo de clase', tentare: ['yes', 'Antelación, cancelación, bono exigido y lista de espera se fijan por tipo de clase'], them: ['yes', 'Aforo, ventana de reserva y cancelación configurables por clase, según su web'] },
  { feature: 'Cobros con Stripe y domiciliación', tentare: ['yes', 'Stripe (tarjeta y domiciliación SEPA); Tentare genera su propia remesa SEPA'], them: ['yes', 'Stripe y GoCardless, según su web'] },
  { feature: 'Prueba gratuita sin tarjeta', tentare: ['yes', '7 días, sin pedir tarjeta de crédito'], them: ['partial', 'No consta en su web pública'] },
  { feature: 'Varias sedes en un panel único', tentare: ['yes', 'Una sola suscripción y un solo acceso, con datos aislados por sede (plan Cadena)'], them: ['yes', 'Plan para varias sedes y franquicias, según su web'] },
  { feature: 'Soporte en español', tentare: ['yes', 'Nativo en castellano'], them: ['yes', 'Disponible, según su web'] },
];

const FAQ = [
  {
    q: '¿Cuánto cuesta Glofox?',
    a: 'Su web anuncia planes desde 99 USD al mes, en dólares, y remite a pedir una demo para conocer el precio de cada nivel. Tentare publica sus tres planes en euros con IVA incluido: Founding Studio 29 €/mes, Estudio 59 €/mes y Cadena 149 €/mes.',
  },
  {
    q: '¿Glofox tiene permanencia?',
    a: 'No consta en su web pública. Si estás valorando contratarlo, pregúntales por escrito la duración del contrato y las condiciones de baja. Tentare no tiene permanencia: se paga mes a mes.',
  },
  {
    q: '¿Glofox gestiona cada reformer por separado?',
    a: 'No consta en su web pública que reserve una máquina concreta dentro de una misma sesión; sí describe aforo y reglas por clase. En Tentare cada alumna reserva su reformer, y la lista de espera es por aparato.',
  },
  {
    q: '¿Puedo pasar mis datos de Glofox a Tentare?',
    a: 'Sí, con el importador de Tentare: te enseña un acta con lo importado antes de guardar nada y puedes deshacerlo con un botón. Conviene exportar antes tus clientas, bonos y reservas desde Glofox.',
  },
];

const RESUMEN: ResumenCompetidor = {
  queEs: 'Plataforma irlandesa de gestión para gimnasios y centros de fitness',
  precio: 'Desde 99 USD/mes según su web, en dólares; para el resto remite a una demo',
  permanencia: 'No consta en su web pública',
  prueba: 'No consta en su web pública',
  respuesta: <>Glofox está pensado para gimnasios y centros de fitness con volumen, y su web no detalla la gestión por reformer ni la sustitución de instructoras. Para un estudio de Pilates en España pesan además el precio en dólares y que no consta su permanencia. Tentare publica sus tres planes en euros, sin permanencia, y gestiona cada reformer y las bajas de instructoras.</>,
};

const ANALISIS: SeccionAnalisis[] = [
  {
    titulo: '¿Cuánto cuesta Glofox en 2026?',
    cuerpo: (
      <>
        <p>Glofox anuncia planes desde 99 USD al mes y, para saber el precio de cada nivel, remite a pedir una demo. Está en dólares, así que lo que pagas en euros depende del cambio y de las condiciones que te den por escrito.</p>
        <p>Pide tres cosas: la cuota mensual con impuestos, la duración mínima del contrato y qué incluye cada nivel (app propia, varias sedes, integraciones). En Tentare los tres planes están publicados en <Link href="/precios">/precios</Link>: Founding Studio a 29 €/mes (hasta 150 alumnas activas, con la app con tu marca), Estudio a 59 €/mes y Cadena a 149 €/mes, todos con IVA y sin permanencia.</p>
      </>
    ),
  },
  {
    titulo: 'Lo que cambia en un estudio con reformers',
    cuerpo: (
      <>
        <p>En un estudio de reformer no vendes clases: vendes una máquina a una hora. Tentare gestiona cada sala con su aforo y cada reformer con su plaza, con <Link href="/funcionalidades/plazas-fijas">plazas fijas</Link> para las alumnas de siempre y <Link href="/funcionalidades/lista-de-espera">lista de espera</Link> por aparato.</p>
        <p>Cuando una instructora avisa de que no puede, <Link href="/funcionalidades/sustituciones">Tentare busca quién la cubre</Link> según su disponibilidad, la contacta y avisa a las alumnas del cambio.</p>
      </>
    ),
  },
  {
    titulo: 'Cómo cambiarte de Glofox a Tentare',
    cuerpo: (
      <>
        <p>El importador de Tentare lee las exportaciones de otras plataformas. Antes de guardar nada te enseña un acta con lo que va a entrar, y si algo no cuadra lo deshaces con un botón. Más detalle en <Link href="/soluciones/cambiar-de-software">cambiarte de software</Link>.</p>
        <p>Lo único que ninguna plataforma puede pasarte son las tarjetas guardadas de tus alumnas: cada una la vuelve a introducir la primera vez que paga.</p>
      </>
    ),
  },
];

export default function TentareVsGlofoxPage() {
  return (
    <CompetitorPage
      name="Glofox"
      slug="tentare-vs-glofox"
      logo={{ src: '/comparativa/logos/glofox.svg', alt: 'Logo de Glofox', height: 24, width: 120 }}
      intro={<>Glofox es una plataforma irlandesa de gestión para gimnasios y centros de fitness. Para un <strong style={{ color: '#1A1A1A' }}>estudio de Pilates en España</strong>, Tentare te deja saber el precio antes de hablar con nadie, gestiona cada reformer y cubre las bajas de las instructoras.</>}
      resumen={RESUMEN}
      rows={ROWS}
      analisis={ANALISIS}
      veredicto={<>Si tu estudio es de Pilates con reformers y equipo de instructoras, Tentare encaja mejor: precio en euros publicado, sin permanencia, plaza por reformer y sustituciones. Glofox puede tener sentido si gestionas un centro de fitness de más volumen y ya trabajas con su ecosistema.</>}
      footnote="Basado en la información pública de Glofox (www.glofox.com) a 29 de septiembre de 2026. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian: verifica siempre con el proveedor."
      faq={FAQ}
    />
  );
}
