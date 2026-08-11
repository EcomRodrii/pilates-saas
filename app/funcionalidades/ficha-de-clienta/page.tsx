import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { CondicionesYZonas, LineaDeVida, Semaforo } from '@/components/funcionalidades/visuales/ficha';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/ficha-de-clienta';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Esto es una historia clínica?',
    a: 'No, y es importante que no se confunda. No diagnostica, no prescribe y no sustituye a un profesional sanitario. Es una ayuda de atención: recoge lo que la alumna cuenta sobre sus limitaciones para que quien le da la clase lo tenga delante.',
  },
  {
    q: '¿Quién puede ver las condiciones de salud?',
    a: 'Solo quien las necesita para dar la clase. Recepción, que gestiona reservas y cobros, no ve ese detalle. La separación se aplica en la base de datos, no solo escondiendo un botón.',
  },
  {
    q: '¿Hace falta consentimiento para guardar esos datos?',
    a: 'Sí, y queda registrado con la fecha y el texto exacto que la alumna aceptó, no un número de versión. Si el texto cambia, se vuelve a pedir. Es la forma de poder demostrar qué se aceptó y cuándo.',
  },
  {
    q: '¿Puedo importar mis fichas desde otra plataforma?',
    a: 'Sí. Hay asistentes de importación por CSV para alumnas, bonos, reservas, clases, citas y plazas fijas, y cada importación deja constancia de lo que entró para que puedas comprobar que no falta nada.',
  },
  {
    q: '¿Se puede saber quién lleva tiempo sin venir?',
    a: 'Sí, y no hace falta que lo mires tú: la regla de ausencia detecta a quien lleva días sin aparecer y actúa según los umbrales que hayas puesto.',
  },
];

export default function FichaPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="CRM del estudio"
      h1={<>Saber quién es antes de que entre por la puerta.</>}
      intro={<>Historial, bonos, asistencia y notas de progreso de cada alumna. Y sus limitaciones físicas donde tienen que estar: delante de quien le va a dar la clase.</>}
      chips={['Historial completo', 'Ficha de salud operativa', 'Consentimiento trazable']}
      foto={{ src: '/disciplinas/pilates.jpg', alt: 'Alumna en una clase de Pilates reformer', encuadre: 'center 30%' }}
      visual={<Semaforo />}
    >
      <Seccion id="problema" titulo="La información existe. Está repartida en cinco sitios">
        <Entradilla>
          Su bono, en una hoja de cálculo. Su lesión de rodilla, en un WhatsApp de hace ocho meses. Cuántas veces ha venido
          este mes, en la memoria de quien está en recepción ese día.
        </Entradilla>
        <p>
          El resultado es conocido: una instructora nueva le manda hacer un ejercicio que no debería, o nadie se da cuenta de
          que lleva un mes sin aparecer hasta que pide la baja. No por dejadez — porque la información no estaba donde había
          que mirarla.
        </p>
        <LineaDeVida />
      </Seccion>

      <Seccion id="salud" titulo="La parte delicada: lo que no puede hacer">
        <p>
          En Pilates esto no es un extra. Media sala tiene algo: una lumbar delicada, un hombro operado, un embarazo, una
          prótesis de cadera. Y esa información normalmente vive en la cabeza de la instructora que la atendió el primer día.
        </p>
        <CondicionesYZonas />
        <p>
          De ahí sale el semáforo que ve quien da la clase, calculado a partir de las restricciones grabadas, y de ahí salen
          las alertas automáticas: si una alumna tiene una restricción dura en una zona y va a hacer una clase que la
          compromete, se avisa.
        </p>
        <Limite titulo="Qué es y qué no es">
          No es una historia clínica ni un diagnóstico. El propio sistema lo trata así: el semáforo y el nivel de riesgo son
          ayudas de atención para la instructora, no dictámenes, y ninguna función sustituye a un profesional sanitario. Lo
          que se guarda es lo que la alumna cuenta y lo que el estudio decide adaptar.
        </Limite>
      </Seccion>

      <Seccion id="permisos" titulo="Quién puede ver esto">
        <p>
          Un dato de salud no puede ser visible para todo el que tiene acceso al panel. Recepción gestiona reservas, cobros y
          altas — y no necesita saber que alguien está en el segundo trimestre de embarazo.
        </p>
        <Rejilla
          items={[
            { titulo: 'Lo ve quien da la clase', body: 'Instructoras, propietaria y gerencia. Es información operativa para atender bien.' },
            { titulo: 'No lo ve recepción', body: 'Y no es que se le esconda el botón: la restricción está en la base de datos.' },
          ]}
        />
        <p>
          El consentimiento se guarda con el texto legal completo que la alumna aceptó, no con un número de versión. Si el
          texto cambia, el consentimiento anterior deja de estar vigente automáticamente — sin tener que mantener un
          sistema de versiones aparte. Cómo se protegen estos datos está en <Link href="/seguridad">seguridad</Link>.
        </p>
      </Seccion>

      <Seccion id="operativo" titulo="Lo que haces con la ficha cada día">
        <Rejilla
          columnas={2}
          items={[
            { titulo: 'Notas de progreso', body: 'Qué se trabajó, cómo respondió y el plan para la próxima sesión. La continuidad entre instructoras.' },
            { titulo: 'Bonos y sesiones restantes', body: 'Qué tiene contratado y cuánto le queda, sin abrir otra pantalla.' },
            { titulo: 'Asistencia real', body: 'A qué vino, a qué faltó y desde cuándo no aparece.' },
            { titulo: 'Mensajería', body: 'La conversación con el estudio, centralizada y no en el móvil personal de nadie.' },
            { titulo: 'Libreta de mostrador', body: 'Vista rápida de contacto y notas, pensada para responder con alguien delante.' },
            { titulo: 'Importación desde otra plataforma', body: 'Alumnas, bonos, reservas, clases, citas y plazas fijas por CSV.' },
          ]}
        />
      </Seccion>

      <Seccion id="conecta" titulo="La ficha es de donde salen los avisos">
        <p>
          Todo lo que se registra aquí es lo que hace que las{' '}
          <Link href="/funcionalidades/automatizaciones-y-avisos">reglas automáticas</Link> tengan algo que mirar: la
          ausencia se detecta sobre la asistencia real, el aviso de bono casi agotado sobre las sesiones que quedan, y el
          seguimiento de alta nueva sobre la fecha en que entró.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Que la información deje de vivir en cinco sitios"
        body="Trae tus fichas desde donde estén y ten delante lo que hace falta para atender bien."
      />
    </FeatureShell>
  );
}
