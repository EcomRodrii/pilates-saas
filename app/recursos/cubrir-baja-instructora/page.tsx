import type { Metadata } from 'next';
import { ArticleShell } from '@/components/recursos/ArticleShell';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageShell } from '@/components/recursos/PageShell';
import { BeforeAfterCols, Callout, Checklist, CtaBlock, RelatedLinks, StatBlock } from '@/components/recursos/ArticlePrimitives';

export const metadata: Metadata = {
  title: 'Cómo cubrir una baja de instructora sin hacer una llamada — Tentare',
  description: 'El proceso que roba noches a las propietarias de estudios de Pilates y cómo automatizarlo paso a paso, hasta que la baja se cubre sola.',
  alternates: { canonical: 'https://tentare.app/recursos/cubrir-baja-instructora' },
  openGraph: {
    type: 'article',
    title: 'Cómo cubrir una baja de instructora sin hacer una llamada',
    description: 'El proceso que roba noches a las propietarias — y cómo convertirlo en algo que ocurre solo.',
    url: 'https://tentare.app/recursos/cubrir-baja-instructora',
  },
};

const TOC = [
  { id: 's1', label: 'El problema: por qué te roba la noche' },
  { id: 's2', label: 'Los 4 pasos que haces a mano' },
  { id: 's3', label: 'Cómo se ve automatizado' },
  { id: 's4', label: 'Lo que necesitas para llegar ahí' },
  { id: 's5', label: 'Hasta dónde delegar' },
  { id: 's6', label: 'Preguntas frecuentes' },
];

const FAQ = [
  { q: '¿Y si ninguna instructora puede cubrirla?', a: 'Te avisa enseguida con las opciones sobre la mesa: reprogramar, cancelar avisando a las alumnas, o cubrir tú. Nunca te deja descubrir el hueco a última hora.' },
  { q: '¿La instructora tiene que instalar una app?', a: 'No. Avisa de su baja desde un enlace en el móvil, sin instalar ni crear cuenta. Cuanto más fácil sea avisar, antes te enteras.' },
  { q: '¿Puedo seguir aprobando cada sustitución?', a: 'Claro. En modo asistido apruebas cada candidata con un toque. Solo pasas a autónomo cuando tú quieras.' },
];

export default function CubrirBajaPage() {
  return (
    <PageShell>
      <ArticleShell
        category="Sustituciones y equipo"
        coverGradient="linear-gradient(140deg,#241250,#6D28D9)"
        title="Cómo cubrir una baja de instructora sin hacer una llamada"
        intro="El proceso que roba noches a las propietarias de estudios — y cómo convertirlo en algo que ocurre solo, paso a paso."
        readTime="8 min de lectura"
        toc={TOC}
      >
        <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1A1A1A' }}>Son las 22:47. Suena el móvil: una instructora no puede dar su clase de mañana. Y empieza lo de siempre — abrir el grupo, escribir a una, esperar, escribir a otra, cuadrar horarios y, cuando por fin alguien dice que sí, avisar a las alumnas ya reservadas. Media noche por una clase.</p>
        <p>Esta guía desmonta ese proceso paso a paso y muestra cómo cada parte puede ocurrir sola — hasta el punto de que la baja se cubra mientras duermes. No es magia: es tener los datos correctos y dejar que el sistema los use.</p>

        <h2 id="s1">El problema: por qué una baja te roba la noche</h2>
        <p>Cubrir una baja parece una tarea de cinco minutos, pero rara vez lo es. El problema no es la baja en sí, sino <strong>todo lo que cuelga de ella</strong>: saber quién puede dar esa clase concreta, contactar a las candidatas una por una, esperar respuestas, actualizar el calendario y avisar a las alumnas antes de que se presenten a una clase que ha cambiado.</p>
        <p>Cada uno de esos pasos es una fuente de error y de estrés. Y todos dependen de ti, normalmente a la peor hora.</p>

        <StatBlock
          eyebrow="El coste real de una clase caída · ejemplo"
          stats={[
            { value: '8-10', label: 'plazas que reembolsas o repones' },
            { value: '~45 min', label: 'de gestión manual por baja' },
            { value: 'La confianza', label: 'de las alumnas que avisas tarde' },
          ]}
        />

        <h2 id="s2">Los 4 pasos que haces hoy a mano</h2>
        <p>Si desglosas una sustitución típica, casi siempre son estos cuatro movimientos. El truco está en ver cuál de ellos <strong>no debería depender de ti</strong>:</p>
        <h3>1. Encontrar quién puede cubrirla</h3>
        <p>No vale cualquiera: tiene que saber dar ese formato (reformer, mat, prenatal) y estar libre a esa hora. Esa información suele vivir en tu cabeza o en una hoja de cálculo.</p>
        <h3>2. Contactar una por una</h3>
        <p>Mensajes, llamadas, esperas. Si la primera no puede, vuelta a empezar con la siguiente.</p>
        <h3>3. Actualizar el calendario y las horas</h3>
        <p>Cambiar quién da la clase, registrar las horas de la sustituta para la nómina, evitar que se solapen salas.</p>
        <h3>4. Avisar a las alumnas</h3>
        <p>Que sepan quién les dará la clase — o que se ha cancelado — antes de presentarse. Este paso, si falla, es el que más caro se paga.</p>

        <Callout title="La idea clave">
          De los cuatro pasos, <strong>solo el primero requiere criterio humano</strong> — y ni siquiera, si el sistema ya sabe quién da qué. Los otros tres son mecánicos. Todo lo mecánico se puede automatizar.
        </Callout>

        <h2 id="s3">Cómo se ve cuando está automatizado</h2>
        <p>Con la información del equipo cargada una sola vez (quién da qué formato y cuándo está disponible), el mismo proceso se convierte en esto:</p>
        <BeforeAfterCols
          beforeLabel="A mano"
          beforeItems={['Abres el grupo y escribes a mano', 'Esperas respuestas, insistes', 'Cambias el calendario tú', 'Apuntas las horas para la nómina', 'Avisas a las alumnas una a una']}
          afterLabel="Con Tentare"
          afterItems={['Contacta solo a quien puede cubrirla', 'Gestiona respuestas y escalado', 'Actualiza el calendario solo', 'Registra las horas automáticamente', 'Avisa a las alumnas por su canal']}
        />
        <p>Tú pasas de <strong>ejecutar cinco tareas</strong> a <strong>aprobar una decisión</strong>: «sí, que la cubra Lucía». O ni eso, si lo dejas en modo autónomo.</p>

        <h2 id="s4">Lo que necesitas para llegar ahí</h2>
        <p>La automatización no sale de la nada: se apoya en datos que cargas una vez. Esta es la lista mínima:</p>
        <Checklist
          eyebrow="Checklist de preparación"
          items={[
            <><strong>Tu equipo dado de alta</strong>, con el formato que da cada instructora.</>,
            <><strong>Su disponibilidad</strong> — franjas en las que pueden entrar a cubrir.</>,
            <><strong>El canal de tus alumnas</strong> — app, email o WhatsApp — para avisarlas solo.</>,
            <><strong>Una forma fácil de avisar de la baja</strong> — un enlace que la instructora abre en el móvil, sin instalar nada.</>,
          ]}
        />

        <h2 id="s5">Manual, asistido o autónomo: hasta dónde delegar</h2>
        <p>No tienes que soltar el control de golpe. La confianza se construye por niveles:</p>
        <p><strong>Manual.</strong> El sistema te propone a quién avisar y qué escribir; tú das cada paso. Ideal las primeras semanas.</p>
        <p><strong>Asistido.</strong> Contacta a las candidatas y gestiona los recordatorios. Cuando una acepta, tú lo apruebas con un toque y él cierra el resto. Es el punto dulce para la mayoría.</p>
        <p><strong>Autónomo.</strong> Cubre la baja solo y te lo cuenta después. Sin un toque. Para cuando ya confías en el proceso.</p>

        <h2 id="s6">Preguntas frecuentes</h2>
        <ArticleFaq items={FAQ} />

        <CtaBlock title="¿Y si tu próxima baja se cubriera sola?" body="Tentare es el software completo para tu estudio — y el único que cubre las bajas solo." />

        <RelatedLinks
          items={[
            { href: '/recursos/precios-reformer-mat', category: 'Rentabilidad', categoryColor: '#3E7C86', title: 'Reformer vs. mat: cómo poner precio a cada clase' },
            { href: '/recursos', category: 'Centro de Recursos', categoryColor: '#5B21B6', title: 'Ver todas las guías para tu estudio →' },
          ]}
        />
      </ArticleShell>
    </PageShell>
  );
}
