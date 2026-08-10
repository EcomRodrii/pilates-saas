import type { Metadata } from 'next';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { ArticleStructuredData, FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { BeforeAfterCols, Callout, Checklist, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';

export const metadata: Metadata = {
  title: 'Cómo subir la ocupación de tus clases valle — Tentare',
  description: 'Las 10:00 de un martes vacías cuestan dinero igual. Qué hace ClassPass con el precio dinámico, y qué puedes copiar sin depender de ninguna plataforma externa.',
  alternates: { canonical: 'https://tentare.app/recursos/ocupacion-clases-valle' },
  openGraph: {
    type: 'article',
    title: 'Cómo subir la ocupación de tus clases valle',
    description: 'Tácticas reales — con lo que hace ClassPass de fondo — para llenar las horas flojas sin regalar el precio.',
    url: 'https://tentare.app/recursos/ocupacion-clases-valle',
  },
};

const TOC = [
  { id: 's1', label: 'Por qué una clase vacía cuesta igual que llena' },
  { id: 's2', label: 'La lección de ClassPass: precio por demanda' },
  { id: 's3', label: 'Lo que puedes hacer sin depender de una plataforma' },
  { id: 's4', label: 'Antes de bajar el precio, prueba a reprogramar' },
  { id: 's5', label: 'Checklist para la semana que viene' },
  { id: 's6', label: 'Preguntas frecuentes' },
];

const FAQ = [
  {
    q: '¿Bajar el precio de las clases valle no devalúa mi marca?',
    a: 'Depende de cómo lo comuniques. Un descuento permanente en la web sí devalúa. Un crédito o bono que solo se ve al reservar esa franja concreta —igual que hace ClassPass con sus créditos variables— no, porque la alumna sigue viendo el precio "normal" como referencia.',
  },
  {
    q: '¿Y si ninguna táctica funciona y la clase sigue vacía?',
    a: 'En ese punto el problema no es de precio, es de programación: esa franja no tiene demanda suficiente en tu zona. Fusionarla con otra o moverla a un horario con más tráfico natural suele rendir más que seguir intentando llenarla con descuentos.',
  },
  {
    q: '¿Necesito una plataforma como ClassPass para aplicar esto?',
    a: 'No. La plataforma solo automatiza el cálculo del precio según demanda. El principio —cobrar menos cuando sobra sitio y a las horas de siempre cuando no— lo puedes aplicar a mano con bonos propios o con reglas de reserva que ya tenga tu software.',
  },
];

export default function OcupacionClasesVallePage() {
  return (
    <PageShell>
      <ArticleStructuredData
        title="Cómo subir la ocupación de tus clases valle"
        description="Las 10:00 de un martes vacías cuestan dinero igual. Qué hace ClassPass con el precio dinámico, y qué puedes copiar sin depender de ninguna plataforma externa."
        slug="ocupacion-clases-valle"
        datePublished="2026-08-06"
      />
      <FaqStructuredData items={FAQ} />
      <ArticleShell
        category="Rentabilidad"
        coverGradient="linear-gradient(140deg,#1f3d42,#3E7C86)"
        title="Cómo subir la ocupación de tus clases valle"
        intro="Las 10:00 de un martes vacías cuestan lo mismo que llenas: sala, instructora, luz. Esto es lo que hacen las plataformas grandes con el precio dinámico — y lo que puedes copiar sin depender de ninguna de ellas."
        readTime="7 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>
          Todo estudio tiene una franja que nunca se llena del todo. Normalmente es a media mañana entre semana, o justo después de comer. Y el error más habitual es tratarla igual que las clases que sí funcionan: mismo precio, mismo aforo, misma comunicación — esperando que un día se arregle sola.
        </p>

        <h2 id="s1">Por qué una clase vacía cuesta igual que una llena</h2>
        <p>
          La sala, la instructora y la luz están pagadas exista o no exista una alumna dentro. El coste es fijo; el ingreso, no. Por eso una clase al 30% de aforo no es &quot;un poco menos rentable&quot; — es casi pura pérdida frente a su coste de oportunidad. Y el efecto se nota más en reformer que en mat: las clases de reformer suelen llenar bastante más aforo que las de mat en un estudio boutique medio, según los datos que reunimos en{' '}
          <a href="/recursos/precios-reformer-mat">nuestra guía de precios reformer vs. mat</a>
          , así que un hueco de reformer vacío duele más que uno de mat.
        </p>

        <h2 id="s2">La lección de ClassPass: cobrar menos cuando sobra sitio</h2>
        <p>
          ClassPass construyó buena parte de su negocio sobre una idea simple: el precio de una clase no debería ser fijo, debería moverse con la demanda — igual que un vuelo o un Uber. Sus herramientas internas, <strong>SmartRate</strong> y <strong>SmartSpot</strong>, analizan el histórico de reservas de cada estudio y ajustan cuántas plazas liberar y a qué precio, según recoge{' '}
          <a href="https://classpass.com/partners/blog/classpass-worth-it-studios-gyms" target="_blank" rel="noopener noreferrer nofollow">el propio blog para partners de ClassPass</a>
          . En la práctica, una clase en horario valle puede costar entre un 30% y un 50% menos en créditos que la misma clase en hora punta, de acuerdo con las guías de uso de la plataforma.
        </p>
        <p>
          El dato importante no es &quot;usa ClassPass&quot;. Es que la plataforma con más datos del sector boutique ha decidido que <strong>el precio variable por franja funciona mejor que el descuento plano</strong> para llenar huecos sin malacostumbrar a nadie a pagar menos siempre.
        </p>

        <StatBlock
          eyebrow="Lo que hace ClassPass con sus mejores estudios · fuente pública"
          stats={[
            { value: '30-50%', label: 'menos coste en horario valle vs. hora punta' },
            { value: 'SmartRate', label: 'ajusta precio según histórico real de reservas' },
            { value: 'SmartSpot', label: 'decide cuántas plazas liberar por franja' },
          ]}
          note="Fuente: blog para partners de ClassPass. Explican el principio de precio dinámico, no una funcionalidad de Tentare."
        />

        <h2 id="s3">Lo que puedes hacer sin depender de ninguna plataforma</h2>
        <p>El principio se copia sin necesidad de ceder tu margen a un intermediario:</p>
        <Checklist
          eyebrow="Tácticas de precio y programación para horas valle"
          items={[
            <><strong>Bono propio para esa franja</strong> — un paquete de 5 clases valle más barato que 5 clases sueltas, visible solo al reservar esa hora, no en tu web pública.</>,
            <><strong>Doble check-in</strong>: una alumna que trae a una amiga a la clase valle entra gratis esa vez. Cuesta menos que un descuento y capta gente nueva.</>,
            <><strong>Acuerdo con negocios cercanos</strong> — oficinas o coworkings a los que ofrecer esa franja como &quot;clase de empresa&quot; a un precio de grupo.</>,
            <><strong>Comunicación distinta, no solo precio</strong>: una clase valle con grupo reducido es, en realidad, casi una sesión semi-privada — véndela como eso, no como &quot;la clase que sobra&quot;.</>,
          ]}
        />

        <BeforeAfterCols
          beforeLabel="Descuento plano"
          beforeItems={['Mismo -20% siempre, visible en la web', 'La alumna espera ese precio para siempre', 'No cambia el patrón de reserva', 'Erosiona el precio de referencia del estudio']}
          afterLabel="Precio por franja, no por descuento"
          afterItems={['Bono visible solo al reservar esa hora', 'El precio "normal" sigue siendo la referencia', 'Cambia el hábito hacia la franja floja', 'Protege el margen del resto del horario']}
        />

        <h2 id="s4">Antes de bajar el precio, prueba a reprogramar</h2>
        <p>
          Si una franja lleva meses sin arrancar pase lo que pase, el problema puede no ser de precio: puede ser que, sencillamente, no hay suficiente demanda en tu zona a esa hora. En ese caso, fusionar dos clases flojas en una sola con más energía suele rendir más que seguir descontando una que nunca despega.
        </p>
        <Callout title="La idea clave">
          Antes de tocar el precio, mira el dato: ¿esa franja ha bajado de ocupación recientemente, o nunca ha funcionado? Lo primero se arregla con precio o comunicación. Lo segundo se arregla moviendo la clase, no regalándola.
        </Callout>

        <h2 id="s5">Checklist para la semana que viene</h2>
        <Checklist
          eyebrow="De la teoría a la agenda de esta semana"
          items={[
            <>Identifica tu franja con menos ocupación de las últimas 4 semanas, no de siempre — puede haber cambiado.</>,
            <>Prueba UNA táctica (bono propio o doble check-in) durante 3 semanas antes de decidir si funciona.</>,
            <>Si sigue vacía tras 3 semanas, plantea fusionarla con otra franja cercana en vez de seguir descontando.</>,
            <>Activa un aviso automático cuando esa clase esté por debajo de un umbral de aforo, en vez de mirarlo a mano cada día.</>,
          ]}
        />

        <h2 id="s6">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock
          title="Un aviso automático cuando una clase se queda vacía"
          body="El Radar de Ocupación de Tentare vigila tus próximas 48h y avisa por WhatsApp solo a las socias con bono activo que ya han hecho esa clase antes — sin que muevas un dedo."
        />

        <RelatedLinks
          items={[
            { href: '/recursos/precios-reformer-mat', category: 'Rentabilidad', categoryColor: '#3E7C86', title: 'Reformer vs. mat: cómo poner precio a cada clase' },
            { href: '/recursos/estudios-pilates-de-exito', category: 'Rentabilidad', categoryColor: '#3E7C86', title: 'Qué puedes aprender de los estudios de pilates que más crecen' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}
