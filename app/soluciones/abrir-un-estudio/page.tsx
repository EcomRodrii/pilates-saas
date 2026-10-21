import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AppAlumna,
  CierreSolucion,
  FaqSolucion,
  FilaProducto,
  HeroSolucion,
  PlanesSolucion,
  ResumenSolucion,
  Situaciones,
  SolucionShell,
} from '@/components/soluciones/LandingSolucion';
import { AgendaDia, PanelCobros } from '@/components/web/home/piezas';
import { FOTOS, rutaFoto } from '@/components/landing/fotos';
import { GRATIS_ALUMNAS, GRATIS_CON_LIMITES, GRATIS_MARGEN_DIAS, GRATIS_RESERVAS_MES, PRECIO_FOUNDING_PAGO } from '@/lib/landing/founding-gratis';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// Tentare para quien VA A ABRIR su estudio (fase 2.3 de la web, 20-oct-2026). Una
// de las dos soluciones nuevas de la estrategia de la fase 1: la otra, «Varias
// sedes», se quedó en /funcionalidades/multi-centro (dos páginas casi iguales
// competirían en el buscador por la misma búsqueda).
//
// No compite con la guía «Cómo abrir un estudio de pilates» (/recursos): esa
// responde a cómo se abre (trámites, local, dinero); esta, a con qué programa,
// y manda a las guías para todo lo demás.
//
// ⚠️ Cada frase, contra lo que ya existe: el plan gratis y sus límites salen de
// lib/landing/founding-gratis.ts; «tu horario y tu página de reservas, listos en tu
// primera sesión» es la promesa ya publicada en la home (CierreHome); la app con la
// marca del estudio va en todos los planes; los pagos van por la cuenta de Stripe
// del estudio sin comisión de Tentare (PrecioHome). Tentare NO hace trámites: lo
// dicen las guías y lo dice la FAQ.

const PATH = '/soluciones/abrir-un-estudio';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    siteName: 'Tentare',
    type: 'website',
    locale: 'es_ES',
    title: pagina.titulo,
    description: pagina.descripcion,
    url: urlDe(PATH),
  },
};

// Las guías de apertura del blog, en el orden en que se necesitan.
const GUIAS = [
  { href: '/recursos/como-abrir-un-estudio-de-pilates', titulo: 'Cómo abrir un estudio de Pilates', resumen: 'De la idea a la primera semana abierta, paso a paso.' },
  { href: '/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates', titulo: 'Cuánto cuesta abrirlo', resumen: 'Presupuesto por partidas, con precios reales.' },
  { href: '/recursos/requisitos-para-abrir-un-estudio-de-pilates', titulo: 'Requisitos y trámites', resumen: 'Licencia, epígrafe y titulación, con sus fuentes.' },
  { href: '/recursos/rentabilidad-estudio-de-pilates', titulo: 'Rentabilidad', resumen: 'Cuándo cubre gastos un estudio, con calculadora.' },
  { href: '/recursos/como-abrir-un-estudio-de-yoga', titulo: 'Cómo abrir un estudio de yoga', resumen: 'Estilos, local, material, trámites y precios.' },
  { href: '/recursos/nombres-para-estudio-de-pilates', titulo: 'Nombres para tu estudio', resumen: 'Ideas y cómo comprobar que están libres.' },
];

const FAQ = [
  {
    q: '¿Puedo montar Tentare antes de abrir?',
    a: 'Sí. Montas tus clases, tus salas, tus bonos y la app de tu estudio antes de la primera clase, y tu página de reservas puede aceptar reservas desde el día que la publiques.',
  },
  {
    q: '¿Cuánto cuesta mientras empiezo?',
    a: `Nada: Founding Studio es gratis hasta ${GRATIS_ALUMNAS} alumnas activas y ${GRATIS_RESERVAS_MES} reservas al mes, sin tarjeta y sin permanencia. Si pasas de ahí, tienes ${GRATIS_MARGEN_DIAS} días de margen antes de pasar al plan de pago, de ${PRECIO_FOUNDING_PAGO} €/mes.`,
  },
  {
    q: '¿Puedo cobrar online desde el primer día?',
    a: 'Sí, en cuanto conectas tu cuenta de Stripe: las alumnas pagan con tarjeta, el dinero va a tu cuenta y Tentare no se queda comisión sobre lo que cobras.',
  },
  {
    q: '¿Tentare me ayuda con los trámites de apertura?',
    a: 'No: Tentare es el programa del estudio, no una gestoría. Lo que cuesta abrir, la licencia, el epígrafe o la titulación lo explican nuestras guías, con sus fuentes a la vista.',
  },
  {
    q: '¿Sirve igual para un estudio de yoga?',
    a: 'Sí. Las reservas, los bonos, las mensualidades, la lista de espera y la app funcionan igual para el yoga que para el Pilates: cada estilo es un tipo de clase con su horario, su aforo y su precio.',
  },
];

export default function AbrirUnEstudioPage() {
  // Una sala lista y vacía, a la espera de su primera clase (el registro: fotos.ts).
  const foto = FOTOS.cierre;
  return (
    <SolucionShell path={PATH}>
      <HeroSolucion
        miga="Abrir un estudio"
        busqueda="Software para abrir un estudio de Pilates o yoga"
        titular={<>Abre tu estudio con las reservas listas desde el primer día.</>}
        entrada={<>Antes de la primera clase ya tienes tu horario, tu página de reservas y la app con el nombre de tu estudio. Empiezas gratis y sin tarjeta, y solo pagas si el estudio crece.</>}
        foto={{
          src: rutaFoto(foto, 'movil', 1170, 'webp'),
          srcAvif: rutaFoto(foto, 'movil', 1170, 'avif'),
          alt: foto.alt,
          ancho: 1170,
          alto: 878,
          encuadre: '58% 60%',
        }}
        avisos={[
          { etiqueta: 'Primera semana · Lun 09:00', estado: 'Reservada', texto: 'Reservó desde tu página' },
          { etiqueta: 'Bono 10 clases', estado: 'Cobrado', texto: 'Con su tarjeta, en la app' },
        ]}
        pieFoto="Una sala de Pilates con reformers de madera, lista para su primera clase, con dos avisos de ejemplo de Tentare: una reserva de la primera semana hecha desde la página del estudio y un bono cobrado con tarjeta en la app."
      />

      <ResumenSolucion
        pregunta="¿Qué programa necesita un estudio que va a abrir?"
        datos={[
          { cifra: 'Gratis', texto: GRATIS_CON_LIMITES },
          { cifra: '0 %', texto: 'Comisión de Tentare sobre lo que cobras' },
          { cifra: '1 sesión', texto: 'Para tener tu horario, tus bonos y tu app listos' },
        ]}
      >
        Uno que esté listo antes que el local: un horario que tus alumnas puedan reservar desde el móvil, bonos y
        cuotas que se cobren solos y una app con el nombre de tu estudio. Tentare lo monta en tu primera sesión, es
        gratis mientras el estudio es pequeño y crece contigo cuando ya no lo es.
      </ResumenSolucion>

      <Situaciones
        titulo="Las semanas en que abres"
        items={[
          { hora: 'Antes de abrir', titulo: 'Publicas tu horario', texto: 'Creas tus clases, tus salas y tus bonos, y compartes el enlace de tu página de reservas en Instagram o en WhatsApp.' },
          { hora: 'La semana de apertura', titulo: 'Las primeras reservas llegan solas', texto: 'Tus primeras alumnas reservan desde el móvil y, si una clase se llena, entran en la lista de espera.' },
          { hora: 'El primer mes', titulo: 'Los bonos y las cuotas se cobran solos', texto: <>Con la tarjeta guardada y, si un cobro falla, se reintenta; por domiciliación, con la remesa SEPA que presentas en tu banco. Tú das las clases. Más en <Link href="/funcionalidades/cobros-recurrentes">cobros recurrentes</Link>.</> },
        ]}
      />

      <FilaProducto
        eyebrow="Tu horario"
        titulo="Tu horario, listo en tu primera sesión"
        pieza={{ descripcion: 'Ejemplo del día en el calendario de Tentare: tres clases con su ocupación y una llena con dos alumnas en lista de espera.', contenido: <AgendaDia /> }}
        puntos={[
          'Clases semanales que programas una vez',
          'Aforo por sala y lista de espera automática',
          'Reglas de reserva y cancelación para cada tipo de clase',
        ]}
        enlace={{ href: '/funcionalidades/reservas-online', texto: 'Reservas online' }}
      >
        <p>Pones tus tipos de clase, tus salas y tus horas, y la semana se repite sola. Tu página de reservas enseña las plazas libres de cada clase en cuanto la publicas.</p>
      </FilaProducto>

      <FilaProducto
        invertida
        eyebrow="Tu app"
        titulo="Tu estudio, en el móvil de tus primeras alumnas"
        pieza={{ descripcion: 'La app de una alumna con la marca de su estudio, en un iPhone: su próxima clase, accesos a reservar y a su plan y su progreso de la semana.', contenido: <AppAlumna />, movil: true }}
        puntos={[
          'Con tu nombre, tu icono y tus colores',
          'En todos los planes, también en el gratuito',
          'Sin pasar por ninguna tienda de aplicaciones',
        ]}
        enlace={{ href: '/funcionalidades/app-para-alumnas', texto: 'La app de tus alumnas' }}
      >
        <p>Tus alumnas la añaden a la pantalla de inicio desde el navegador. Desde ahí reservan, cancelan, compran su bono y ven sus próximas clases.</p>
      </FilaProducto>

      <FilaProducto
        eyebrow="Tus cobros"
        titulo="Cobrar sin perseguir a nadie, desde el primer bono"
        pieza={{ descripcion: 'Ejemplo del resumen de cobros de Tentare: quién ha pagado, quién se reintenta solo y las próximas cuotas.', contenido: <PanelCobros completo /> }}
        puntos={[
          'Clase suelta, bono y cuota mensual a la vez',
          'Tarjeta guardada o remesa SEPA para tu banco',
          'Sin comisión de Tentare sobre lo que cobras',
        ]}
        enlace={{ href: '/funcionalidades/bonos-y-membresias', texto: 'Bonos y cuotas' }}
      >
        <p>Conectas tu cuenta de Stripe y el dinero entra en tu cuenta. Los bonos se descuentan solos al reservar y las cuotas se cobran cada mes.</p>
      </FilaProducto>

      <section className="sol-zona">
        <div className="sol-ancho">
          <p className="sol-eyebrow">Antes de firmar el local</p>
          <h2 className="sol-h2">Las guías para abrir tu estudio</h2>
          <div className="sol-prosa">
            <p>Lo que cuesta, lo que pide la ley y cuánto cobrar, con las fuentes a la vista. Escritas para estudios de Pilates y yoga en España.</p>
          </div>
          <div className="sol-rel sol-rel-3">
            {GUIAS.map((g) => (
              <Link key={g.href} href={g.href} className="sol-rel-card">
                <span className="sol-rel-nombre">{g.titulo}</span>
                <span className="sol-rel-resumen">{g.resumen}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <PlanesSolucion titulo="Lo que cuesta mientras empiezas" />

      <FaqSolucion titulo="Preguntas antes de abrir" items={FAQ} />

      <CierreSolucion
        titulo="Monta tu estudio antes de abrirlo."
        texto="Tu horario, tus bonos y tu app, listos en tu primera sesión. Empieza gratis, sin tarjeta y sin permanencia."
      />
    </SolucionShell>
  );
}
