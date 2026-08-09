import type { Metadata } from 'next';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { ArticleStructuredData, FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { Callout, Checklist, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';

export const metadata: Metadata = {
  title: 'Reduce las cancelaciones de última hora — Tentare',
  description: 'Lo que cobran de verdad SoulCycle, Barry\'s o CorePower por cancelar tarde, y lo que dice la evidencia clínica sobre los recordatorios — aplicado a tu estudio de Pilates.',
  alternates: { canonical: 'https://tentare.app/recursos/reducir-cancelaciones-ultima-hora' },
  openGraph: {
    type: 'article',
    title: 'Reduce las cancelaciones de última hora',
    description: 'Políticas reales de grandes cadenas de fitness, y el dato clínico detrás de por qué un recordatorio SÍ cambia el comportamiento.',
    url: 'https://tentare.app/recursos/reducir-cancelaciones-ultima-hora',
  },
};

const TOC = [
  { id: 's1', label: 'Por qué una cancelación tardía es peor que una vacía' },
  { id: 's2', label: 'Lo que cobran de verdad los grandes' },
  { id: 's3', label: 'El dato que nadie usa: el recordatorio SÍ funciona' },
  { id: 's4', label: 'Cómo diseñar tu política sin parecer agresiva' },
  { id: 's5', label: 'Checklist de tu política de cancelación' },
  { id: 's6', label: 'Preguntas frecuentes' },
];

const FAQ = [
  {
    q: '¿No es agresivo cobrar por cancelar tarde?',
    a: 'Cadenas como SoulCycle o Barry\'s lo cobran desde hace años y siguen llenas — la clave es la ventana y la comunicación, no la existencia de la penalización. Un cargo con 12h de margen y una explicación clara ("protege el sitio de otra alumna") se percibe como justo; uno con 1h de margen y sin explicación se percibe como una trampa.',
  },
  {
    q: '¿El recordatorio automático sustituye a la política de cancelación?',
    a: 'No, se complementan. El recordatorio reduce el olvido genuino — el motivo más común de no-show. La política de cancelación gestiona el caso distinto: alguien que decide no ir y no avisa a tiempo aun sabiéndolo.',
  },
  {
    q: '¿Debo aplicar la misma política a todo mi horario?',
    a: 'No necesariamente. Tiene más sentido ser estricto en las clases con lista de espera activa —donde tu cancelación tardía le quita el sitio a otra persona con seguridad— y más flexible en las que casi siempre tienen hueco de sobra.',
  },
];

export default function ReducirCancelacionesPage() {
  return (
    <PageShell>
      <ArticleStructuredData
        title="Reduce las cancelaciones de última hora"
        description="Lo que cobran de verdad SoulCycle, Barry's o CorePower por cancelar tarde, y lo que dice la evidencia clínica sobre los recordatorios."
        slug="reducir-cancelaciones-ultima-hora"
        datePublished="2026-08-06"
      />
      <FaqStructuredData items={FAQ} />
      <ArticleShell
        category="Operación"
        coverGradient="linear-gradient(140deg,#5e2318,#C2503A)"
        title="Reduce las cancelaciones de última hora"
        intro="Una plaza que se cancela a las 18:45 para una clase de las 19:00 es peor que una que nunca se reservó: ya no hay tiempo de ofrecérsela a nadie más. Esto es lo que cobran las grandes cadenas de fitness por eso — y lo que dice la evidencia sobre por qué un simple recordatorio cambia el comportamiento."
        readTime="7 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>
          Hay una diferencia importante entre &quot;no reservó&quot; y &quot;reservó, canceló tarde y dejó el hueco muerto&quot;. La primera nunca ocupó el sitio. La segunda lo bloqueó justo el tiempo suficiente para que nadie más pudiera cogerlo. Es el peor escenario para tu ocupación real, y casi ningún estudio pequeño tiene una política clara para desincentivarlo.
        </p>

        <h2 id="s1">Por qué una cancelación tardía es peor que una plaza vacía desde el principio</h2>
        <p>
          Si una clase nunca se llena, al menos lo sabes con antelación y puedes reaccionar: avisar a la lista de espera, mover instructora, reprogramar. Una cancelación a última hora no te da ese margen. El coste no es solo el ingreso perdido de esa plaza — es la plaza de la <em>siguiente</em> persona en la lista de espera, que ya no llega a tiempo de organizarse.
        </p>

        <h2 id="s2">Lo que cobran de verdad los grandes por cancelar tarde</h2>
        <p>
          Las cadenas boutique más grandes de Estados Unidos lo tienen resuelto desde hace años, con cifras y ventanas muy concretas, según recopilan medios como{' '}
          <a href="https://crinthecityy.substack.com/p/nyc-fitness-class-cancelation-fees" target="_blank" rel="noopener noreferrer nofollow">un repaso de políticas de fitness en Nueva York</a>
          {' '}y{' '}
          <a href="https://www.fitnessgm.com/blog/is-class-pass-worth-it" target="_blank" rel="noopener noreferrer nofollow">guías de operadores del sector</a>
          :
        </p>
        <Checklist
          eyebrow="Políticas reales de cancelación tardía · cadenas de fitness boutique"
          items={[
            <><strong>SoulCycle</strong> — 20$ de recargo si cancelas con menos de 12h de antelación.</>,
            <><strong>Barry&apos;s Bootcamp</strong> — 20$ de recargo por no presentarte sin cancelar dentro de las 12h previas.</>,
            <><strong>CorePower</strong> — 15$ de recargo, con una ventana más corta: basta avisar con 2h de margen.</>,
            <><strong>Y7</strong> — 10$ de recargo con 12h de ventana.</>,
            <><strong>F45</strong> — 15$ si cancelas dentro de las 2h previas, 20$ si no te presentas.</>,
          ]}
        />
        <p>El patrón es claro: <strong>todas cobran algo, todas fijan una ventana explícita, y ninguna es tan agresiva como para parecer una trampa</strong> — entre 10 y 20 dólares, con márgenes de entre 2 y 12 horas.</p>

        <StatBlock
          eyebrow="Ventanas y recargos reales · cadenas de fitness EE. UU."
          stats={[
            { value: '2-12h', label: 'ventana de aviso antes de la clase' },
            { value: '10-20$', label: 'recargo por cancelación tardía o no-show' },
            { value: '5 cadenas', label: 'con política pública y explícita, ninguna la esconde' },
          ]}
          note="Fuentes: recopilación de políticas públicas de SoulCycle, Barry's Bootcamp, CorePower, Y7 y F45."
        />

        <h2 id="s3">El dato que nadie usa: el recordatorio sí cambia el comportamiento</h2>
        <p>
          Antes de pensar en cobrar nada, hay una palanca más barata y menos incómoda: el recordatorio. No es intuición — es uno de los hallazgos más replicados en estudios clínicos sobre asistencia a citas. Un metaanálisis de 29 estudios encontró que los recordatorios automáticos reducen la inasistencia en una media del 28,9%, y las llamadas en persona hasta un 39,1%, según recoge{' '}
          <a href="https://catalyst.nejm.org/doi/full/10.1056/CAT.25.0322" target="_blank" rel="noopener noreferrer nofollow">NEJM Catalyst</a>
          . Un estudio concreto en una clínica de oftalmología encontró un 38% menos de no-shows solo con SMS, y un ensayo controlado en pediatría redujo la inasistencia del 38,1% al 23,5%, según{' '}
          <a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5227159/" target="_blank" rel="noopener noreferrer nofollow">un ensayo publicado en PMC</a>
          .
        </p>
        <Callout title="La idea clave" bg="#FBF6F4" border="#F0DCD5" iconColor="#C2503A" textColor="#5A342A">
          Estos datos son de contextos médicos, no de estudios de pilates — pero el mecanismo es el mismo: la mayoría de cancelaciones tardías no son mala fe, son olvido. Un recordatorio por el canal que la alumna realmente mira (WhatsApp, no un email que no abre) resuelve gran parte del problema antes de necesitar cobrar nada.
        </Callout>

        <h2 id="s4">Cómo diseñar tu política sin parecer agresiva</h2>
        <p>Con los datos de arriba, una política razonable para un estudio de pilates se parece a esto:</p>
        <Checklist
          eyebrow="Principios para no sonar a castigo"
          items={[
            <><strong>Ventana de al menos 8-12h</strong>, no de 1h — da tiempo real a que otra alumna coja el hueco.</>,
            <><strong>Explica el motivo</strong>, no solo el cargo: &quot;para poder ofrecer tu plaza a otra persona a tiempo&quot;.</>,
            <><strong>Un margen de cortesía</strong> las primeras veces, especialmente con socias nuevas que aún no conocen la política.</>,
            <><strong>Recordatorio antes que castigo</strong>: manda el aviso automático primero — muchas cancelaciones tardías ni siquiera llegarán a producirse.</>,
          ]}
        />

        <h2 id="s5">Checklist de tu política de cancelación</h2>
        <Checklist
          eyebrow="Antes de publicarla"
          items={[
            <>Define la ventana (recomendado: 8-12h) y ponla por escrito en tu web y en el proceso de alta.</>,
            <>Decide si el recargo es fijo o un % del bono — más simple de explicar si es fijo.</>,
            <>Activa un recordatorio automático 24h y otro 2-3h antes de cada clase, no solo uno.</>,
            <>Revisa cada mes de dónde vienen realmente tus cancelaciones tardías — puede ser una sola franja o instructora, no un problema general.</>,
          ]}
        />

        <h2 id="s6">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock
          title="Avisos automáticos, antes de necesitar cobrar nada"
          body="Tentare manda recordatorios por el canal de cada alumna —app, email o WhatsApp— y gestiona la lista de espera sola cuando alguien cancela a tiempo."
        />

        <RelatedLinks
          items={[
            { href: '/recursos/ocupacion-clases-valle', category: 'Rentabilidad', categoryColor: '#3E7C86', title: 'Cómo subir la ocupación de tus clases valle' },
            { href: '/recursos/cubrir-baja-instructora', category: 'Sustituciones y equipo', categoryColor: '#4E9E7F', title: 'Cómo cubrir una baja de instructora sin hacer una llamada' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}
