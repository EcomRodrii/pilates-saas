import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { fechaModificada, guia } from '@/lib/recursos/guias';
import { openGraphGuia } from '@/lib/recursos/schema';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { ArticleStructuredData, FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { Callout, Checklist, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';
import { urlDe } from '@/lib/seo/paginas';

const GUIA = guia('checklist-elegir-software-estudio');

export const metadata: Metadata = {
  title: 'Elegir software para un estudio de yoga o pilates | Tentare',
  description: 'Checklist para elegir el software de un estudio de yoga o pilates: 10 criterios, las preguntas de la demo y las señales de alarma antes de firmar.',
  alternates: { canonical: urlDe('/recursos/checklist-elegir-software-estudio') },
  openGraph: {
    type: 'article',
    title: 'Checklist: cómo elegir el software de tu estudio',
    description: 'Las señales de alarma que las reseñas públicas ya han encontrado por ti, antes de que firmes un contrato de un año.',
    url: urlDe('/recursos/checklist-elegir-software-estudio'),
    ...openGraphGuia(GUIA.slug),
  },
};

const TOC = [
  { id: 's1', label: 'Por qué esta decisión pesa más de lo que parece' },
  { id: 'criterios', label: '10 criterios para un estudio de yoga o pilates' },
  { id: 's2', label: 'Lo que dicen miles de reseñas reales' },
  { id: 's3', label: 'Las preguntas que hay que hacer en la demo' },
  { id: 's4', label: 'Señales de alarma antes de firmar' },
  { id: 's5', label: 'Checklist final' },
  { id: 's6', label: 'Preguntas frecuentes' },
];

const CRITERIOS: [string, string, string][] = [
  ['Reservas y aforo', 'En reformer la plaza es una máquina; en yoga o mat, un sitio en la sala. Si el aforo es un número global, se te cuelan o se te quedan huecos.', '¿El aforo se fija por sala o por máquina, o es un número por clase?'],
  ['Lista de espera', 'Una plaza libre a última hora es dinero perdido si nadie la ofrece a tiempo.', '¿Se ofrece sola a la siguiente? ¿Hay plazo para aceptarla?'],
  ['Bonos y cuotas', 'Casi todos los estudios venden bonos, cuotas y clases sueltas a la vez.', '¿Caducidad, pausas y planes limitados a un tipo de clase, todo en el mismo sitio?'],
  ['Cobros', 'Lo que se cobra a mano se olvida; lo que falla, se reintenta.', '¿Tarjeta y domiciliación SEPA? ¿Qué pasa con un pago que falla?'],
  ['Facturas', 'En España hacen falta facturas con numeración legal, no solo recibos.', '¿Numeración correlativa? ¿Cómo lo resuelven con Veri*Factu?'],
  ['App y reserva online', 'La alumna reserva desde el móvil y tu web no debería mandarla a otra página.', '¿App con tu marca? ¿Widget para incrustar en tu web?'],
  ['Equipo', 'Con varias instructoras, una baja de última hora es el mayor dolor de cabeza.', '¿Ayuda a encontrar sustituta o lo haces tú con llamadas?'],
  ['Tus datos', 'Es lo que más cuesta recuperar si te vas.', '¿Exportas todo cuando quieras? ¿Te ayudan a traer tus datos actuales?'],
  ['Precio y contrato', 'El precio base importa menos que las comisiones, las subidas y la permanencia.', '¿Precio publicado? ¿Permanencia? ¿Comisión sobre tus cobros?'],
  ['Prueba real', 'Una demo grabada no es una prueba con tu horario.', '¿Cuántos días de prueba, con tu estudio y sin tarjeta?'],
];

const FAQ = [
  {
    q: '¿Sirve el mismo software para un estudio de yoga y uno de pilates?',
    a: 'En lo común sí: reservas, bonos, cuotas, cobros y lista de espera funcionan igual. Lo que cambia es el aforo: en pilates reformer cada plaza es una máquina, y conviene que el programa lo entienda. Tentare nació con foco en Pilates y el mismo motor funciona para yoga y para centros que combinan las dos disciplinas.',
  },
  {
    q: '¿Cuánto cuesta un software para un estudio de pilates o yoga?',
    a: 'Depende del programa y de si publica precio. Mira siempre también las comisiones sobre tus cobros y la permanencia. Tentare publica sus planes, desde 29 € al mes con IVA y sin permanencia, en la página de precios, y la guía de mejor software compara 13 programas con lo que dice la web de cada uno.',
  },
  {
    q: '¿Un contrato anual es siempre una mala señal?',
    a: 'No necesariamente, pero sí lo es si viene sin opción de mes a mes y con penalización dura por salir antes. Las quejas reales en Capterra y G2 no son sobre el contrato en sí, sino sobre la letra pequeña de cancelación y las subidas de precio a mitad de contrato.',
  },
  {
    q: '¿Cuánto debería tardar en migrar mis datos actuales?',
    a: 'Días, no semanas, si el proveedor se implica de verdad. Si la respuesta en la demo es "eso lo haces tú con un CSV" sin más ayuda, cuenta con perder varias tardes — y con errores en el traspaso de bonos o historial.',
  },
  {
    q: '¿Vale la pena mirar varias fuentes de reseñas o con una basta?',
    a: 'Merece la pena cruzar al menos dos (Capterra y G2, por ejemplo). Un mismo software puede tener puntuación alta en volumen de reseñas y, a la vez, una nota baja específica en "relación calidad-precio" — ese matiz solo se ve comparando fuentes.',
  },
];

export default function ChecklistSoftwarePage() {
  return (
    <PageShell>
      <ArticleStructuredData
        title="Cómo elegir el software de tu estudio de yoga o pilates: checklist"
        description="Qué dicen de verdad miles de reseñas en Capterra y G2, y las preguntas exactas que hay que hacer en una demo antes de firmar."
        slug="checklist-elegir-software-estudio"
      />
      <FaqStructuredData items={FAQ} />
      <ArticleShell
        category={GUIA.seccion}
        title="Cómo elegir el software de tu estudio de yoga o pilates: checklist"
        intro="Cambiar de software una vez ya duele. Cambiarlo dos veces por no haber preguntado lo correcto en la demo, duele el doble. Esto es lo que ya han encontrado miles de reseñas públicas — antes de que tengas que descubrirlo tú."
        readTime={`${GUIA.lectura} min de lectura`}
        actualizado={fechaModificada(GUIA)}
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>
          Elegir el software de tu estudio no es como elegir una app de notas: tus reservas, tus cobros y el historial de tus alumnas van a vivir ahí, normalmente durante años. Antes de pedir una demo, merece la pena leer lo que miles de propietarias ya han escrito sobre sus propios errores.
        </p>

        <h2 id="s1">Por qué esta decisión pesa más de lo que parece</h2>
        <p>
          No es solo el precio mensual. Es la migración si te vas, el bloqueo si el contrato es anual, y la letra pequeña de qué pasa con tus datos y tus cobros si algún día decides cambiar. Un error aquí no se corrige en un mes — se arrastra durante todo el contrato.
        </p>

        <h2 id="s2">Lo que dicen miles de reseñas reales, no el argumentario de ventas</h2>
        <p>
          Cruzando reseñas públicas en Capterra y G2, los temas que más se repiten en 2026 no son sobre funcionalidades que faltan — son sobre el contrato: presión para firmar anual, subidas de precio sin nueva funcionalidad, y fricción para cancelar, según recoge un análisis de reseñas de{' '}
          <a href="https://vibefam.com/capterra-vs-g2-vs-software-advice-for-boutique-studios-2026/" target="_blank" rel="noopener noreferrer nofollow">Vibefam</a>
          . Varias propietarias de estudios de yoga citan concretamente contratos con permanencia de 1.200$ al año y procesos de venta agresivos como su principal queja.
        </p>
        <p>
          En cuanto a las plataformas, según el mismo análisis: <strong>Mindbody</strong> domina en volumen de reseñas (cerca de 3.000 en Capterra) pero arrastra una nota de relación calidad-precio de solo 3,6/5 en Software Advice, la más baja de la comparativa. <strong>Glofox</strong> y <strong>WellnessLiving</strong> rondan 4,4-4,5/5 tanto en Capterra como en G2. Los usuarios de <strong>Arketa</strong> señalan de forma recurrente bugs y regresiones en funciones del día a día. Puedes consultar las reseñas originales directamente en{' '}
          <a href="https://www.capterra.com/gym-management-software/" target="_blank" rel="noopener noreferrer nofollow">Capterra</a>
          .
        </p>

        <StatBlock
          eyebrow="Lo que ya han descubierto otras propietarias · Capterra / G2 2026"
          stats={[
            { value: '3,6/5', label: 'nota de relación calidad-precio del software más grande del sector' },
            { value: '4,4-4,5/5', label: 'nota de las alternativas boutique mejor valoradas' },
            { value: '#1 queja', label: 'fricción de contrato y cancelación, no falta de funciones' },
          ]}
          note="Fuentes: Capterra, G2 y análisis agregado de Vibefam sobre reseñas públicas de software de gestión de estudios."
        />

        <Callout title="La idea clave">
          El problema número uno que reportan las propietarias reales no es &quot;le falta una función&quot;. Es el contrato: cuánto tarda en subir el precio, y qué tan difícil es salir. Pregunta eso ANTES de preguntar por funcionalidades — casi todas las plataformas grandes ya las tienen todas.
        </Callout>

        <h2 id="criterios">10 criterios para elegir software para un estudio de yoga o pilates</h2>
        <p>
          Antes de comparar programas, decide qué tiene que resolver el tuyo. Estos son los diez criterios que más pesan en un estudio de yoga o pilates, con la pregunta que conviene hacer en cada caso.
        </p>
        <div style={{ overflowX: 'auto', border: '1px solid #E7E7E0', borderRadius: 16, background: '#fff', margin: '22px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 560 }}>
            <thead>
              <tr style={{ background: '#F5F5F1' }}>
                {['Criterio', 'Por qué importa', 'Qué preguntar'].map((c) => (
                  <th key={c} scope="col" style={{ textAlign: 'left', padding: '11px 14px', fontSize: 12, fontWeight: 700, color: '#5A5A52', borderBottom: '1px solid #E7E7E0' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRITERIOS.map(([c, porque, pregunta]) => (
                <tr key={c} style={{ borderBottom: '1px solid #EDEDE6' }}>
                  <td style={{ padding: '11px 14px', verticalAlign: 'top', fontWeight: 600 }}>{c}</td>
                  <td style={{ padding: '11px 14px', verticalAlign: 'top', lineHeight: 1.45, color: '#3A3A34' }}>{porque}</td>
                  <td style={{ padding: '11px 14px', verticalAlign: 'top', lineHeight: 1.45, color: '#3A3A34' }}>{pregunta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Si das clases de reformer, mira con calma <Link href="/soluciones/estudio-de-pilates-reformer">cómo lo resuelve Tentare en un estudio de Pilates reformer</Link>; si es yoga, <Link href="/soluciones/estudio-de-yoga">en uno de yoga</Link>. Y para ver las diferencias entre programas con lo que publica cada uno, la guía de <Link href="/recursos/mejor-software-para-estudios-de-pilates">mejor software para estudios de pilates</Link>.
        </p>

        <h2 id="s3">Las preguntas que hay que hacer en la demo</h2>
        <Checklist
          eyebrow="Antes de decir que sí"
          items={[
            <><strong>¿Puedo exportar todos mis datos cuando quiera</strong>, en un formato que pueda usar en otro sitio?</>,
            <><strong>¿Qué pasa si cancelo a mitad de un contrato anual?</strong> Pide la cláusula exacta, no un resumen verbal.</>,
            <><strong>¿El precio puede subir sin previo aviso?</strong> Y si sube, ¿con cuánta antelación te avisan?</>,
            <><strong>¿Hay comisión sobre mis cobros</strong>, además de la cuota mensual?</>,
            <><strong>¿Cómo se gestiona una sustitución de última hora?</strong> Pide que te lo enseñen en vivo, no que te lo describan.</>,
            <><strong>¿Cuánto tardan en migrarme los datos</strong> desde mi sistema actual, y quién lo hace?</>,
          ]}
        />

        <h2 id="s4">Señales de alarma antes de firmar</h2>
        <Checklist
          eyebrow="Si ves esto, para y pregunta más"
          items={[
            <>Solo ofrecen contrato anual, sin ninguna opción de mes a mes aunque sea más cara.</>,
            <>El precio &quot;no se puede decir&quot; sin hablar antes con ventas — para funciones básicas de gestión, no debería hacer falta.</>,
            <>No hay periodo de prueba real, solo una demo grabada o guiada por comercial.</>,
            <>La migración de datos &quot;la haces tú&quot; sin ningún acompañamiento ni checklist.</>,
          ]}
        />

        <h2 id="s5">Checklist final</h2>
        <Checklist
          eyebrow="Resumen para llevar a la demo"
          items={[
            <>Lee reseñas de AL MENOS dos fuentes (Capterra + G2) antes de la primera llamada.</>,
            <>Lleva las 6 preguntas de la sección anterior por escrito — no confíes en la memoria durante la demo.</>,
            <>Pide la cláusula de cancelación por escrito, no un resumen de palabra.</>,
            <>Pregunta específicamente por el caso que más dolor te da hoy (sustituciones, cobros, lista de espera) y pide que te lo enseñen en vivo.</>,
          ]}
        />

        <h2 id="s6">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock
          title="Sin permanencia y con ayuda para traer tus datos"
          body="Tentare no ata con contrato anual ni cobra comisión sobre tus cobros. Y si te vas, tus datos son tuyos — los exportas cuando quieras."
        />

        <RelatedLinks
          items={[
            { href: '/recursos/mejor-software-para-estudios-de-pilates', category: 'Elegir software', categoryColor: '#6E7650', title: 'Mejor software para estudios de pilates: 13 comparados' },
            { href: '/precios', category: 'Precios', categoryColor: '#6E7650', title: 'Planes desde 29 €/mes, sin permanencia' },
            { href: '/soluciones/cambiar-de-software', category: 'Cambiarte de software', categoryColor: '#4E9E7F', title: 'Cambiarte a Tentare sin perder nada' },
            { href: '/recursos/cubrir-baja-instructora', category: 'Sustituciones y equipo', categoryColor: '#3E7C86', title: 'Cómo cubrir una baja de instructora sin hacer una llamada' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}
