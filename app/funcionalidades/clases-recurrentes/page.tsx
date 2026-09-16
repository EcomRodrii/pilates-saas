import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CasoDeUso, CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion, Tabla } from '@/components/funcionalidades/bloques';
import { PanelClaro } from '@/components/funcionalidades/visuales/comunes';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/clases-recurrentes';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Qué es una clase recurrente?',
    a: 'Una clase que se repite cada semana el mismo día y a la misma hora durante un número de semanas que eliges tú. Tentare crea todas esas clases de una vez y las trata como una serie, así que después puedes editarlas o cancelarlas juntas.',
  },
  {
    q: '¿Cuántas semanas puedo programar?',
    a: 'Las que quieras dentro del rango que permite el formulario. La duración la decides tú según cómo trabajes: hay estudios que programan por trimestres y otros que prefieren un curso entero.',
  },
  {
    q: '¿Qué pasa cuando la serie se acaba?',
    a: 'Tentare te avisa antes, no después. Cuando quedan pocas semanas aparece en Inicio, y según se acerca el final recibes aviso en el móvil y por correo. Desde ahí dices cuántas semanas más quieres y, antes de confirmar, te enseña cuántas clases salen, qué fechas no puede crear y por qué, y qué plazas fijas siguen.',
  },
  {
    q: '¿Puede renovarse sola?',
    a: 'Sí, pero viene apagado y se activa serie por serie, no de golpe. Es deliberado: renovar crea clases reservables durante semanas, y esa no es una decisión que deba tomarse por defecto para todo el horario.',
  },
  {
    q: '¿Y si renueva sobre un festivo o una semana que cierro?',
    a: 'No crea clase ese día. Tentare se salta las fechas en las que tengas cerrado el centro y te dice cuáles ha omitido, para que no acabes con clases publicadas un 25 de diciembre.',
  },
  {
    q: '¿Qué pasa con las plazas fijas al renovar?',
    a: 'Nada que tengas que tocar. La plaza fija está anclada al día y la hora, así que las clases nuevas de la serie renovada entran en el mismo hueco y se le vuelven a reservar solas.',
  },
];

export default function ClasesRecurrentesPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Agenda"
      h1={<>Tu horario de siempre, programado una vez.</>}
      intro={<>Las clases que se repiten se crean en bloque, se editan en bloque y avisan antes de acabarse. Para que no descubras en octubre que tu horario se terminó la semana pasada.</>}
      chips={['Series de varias semanas', 'Aviso antes del final', 'Renovación sin sorpresas']}
      visual={
        <PanelClaro titulo="El ciclo de una serie" nota="Los avisos llegan antes, no después">
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            <li>Creas la clase y eliges cuántas semanas se repite.</li>
            <li>Las clases quedan publicadas y reservables.</li>
            <li>Cuando quedan pocas, aparece en Inicio.</li>
            <li>La alargas desde el propio aviso, o se renueva sola si lo activaste.</li>
          </ol>
        </PanelClaro>
      }
    >
      <Seccion id="problema" titulo="El horario que se acabó sin que nadie se diera cuenta">
        <Entradilla>
          Programas el trimestre en septiembre y te olvidas, porque funciona. El problema llega el día en que la última
          clase de la serie ya pasó: el calendario aparece vacío, tus alumnas no pueden reservar y nadie avisó.
        </Entradilla>
        <p>
          Y si algunas de esas alumnas tenían plaza fija, el silencio es doble: no hay clase en su hueco, así que tampoco
          hay nada que reservarles. La plaza sigue ahí, pero no se materializa en nada.
        </p>
        <p>
          Lo que evita eso no es programar más semanas. Es que el sistema <strong>sepa cuándo se acaba</strong> y lo diga a
          tiempo.
        </p>
      </Seccion>

      <Seccion id="serie" titulo="Una serie, no cuarenta clases sueltas">
        <p>
          Al crear una clase recurrente, Tentare genera todas las ocurrencias de una vez, pero las guarda como una{' '}
          <strong>serie</strong>. Esa diferencia es la que te deja trabajar después:
        </p>
        <Rejilla
          items={[
            {
              titulo: 'Editar desde una fecha',
              body: 'Cambias la instructora o la sala a partir del 1 de octubre y se aplica a todas las siguientes, no a las que ya pasaron.',
            },
            {
              titulo: 'Cancelar desde una fecha',
              body: 'Se cancela el resto de la serie en un paso, avisando a quien tuviera reserva.',
            },
            {
              titulo: 'Duplicar una serie',
              body: 'El mismo horario para otra sala u otra instructora, sin volver a crearlo desde cero.',
            },
            {
              titulo: 'Renovar alargando la misma',
              body: 'Al renovar no nace una serie nueva: se alarga la que ya tenías, así que editar «desde» sigue alcanzando lo renovado.',
            },
          ]}
        />
      </Seccion>

      <Seccion id="avisos" titulo="Cuándo te avisa de que se acaba">
        <Tabla
          cabeceras={['Cuándo', 'Dónde te llega']}
          filas={[
            ['Quedan unas semanas', 'En Inicio, en la bandeja de lo que espera tu visto bueno'],
            ['Se acerca el final', 'Aviso en el móvil'],
            ['Última semana y último día', 'Aviso en el móvil y por correo'],
            ['Ya terminó', 'Sigue en la lista, marcada, hasta que la renuevas o la descartas'],
          ]}
        />
        <p>
          Los avisos van agrupados por estudio y por día: si se te acaban seis series la misma semana, recibes un aviso con
          las seis, no seis avisos.
        </p>
      </Seccion>

      <Seccion id="renovar" titulo="Renovar: a mano o sola">
        <p>
          Renovar alarga la serie las semanas que le digas, copiando la última clase que siguiera en pie — misma
          instructora, misma sala, mismo aforo, mismas reglas.
        </p>
        <PanelClaro titulo="Antes de crear nada, te dice qué va a pasar">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            <li>Cuántas clases va a crear y entre qué fechas.</li>
            <li>Qué días se salta por cierre del centro.</li>
            <li>Qué días no puede porque la sala ya está ocupada a esa hora.</li>
          </ul>
        </PanelClaro>
        <p>
          La <strong>renovación automática</strong> se activa por serie. Cuando está encendida, Tentare la alarga sola al
          acercarse el final y te lo cuenta. Si tu estudio no tiene suscripción activa, no renueva nada: no es un despiste,
          es una comprobación que se hace en el último momento.
        </p>
      </Seccion>

      <Seccion id="casos" titulo="Tres momentos del curso">
        <div style={{ margin: '24px 0 0' }}>
          <CasoDeUso hora="Septiembre" titulo="Montas el trimestre">
            Creas el horario con clases recurrentes. Quedan publicadas y tus alumnas ya pueden reservar todas las semanas.
          </CasoDeUso>
          <CasoDeUso hora="Diciembre" titulo="Cierras por Navidad">
            Pones el cierre del centro. Al renovar, esas fechas se saltan solas y Tentare te dice cuáles ha omitido.
          </CasoDeUso>
          <CasoDeUso hora="Enero" titulo="Se acaba la serie">
            Te avisa antes de la última clase. Renuevas doce semanas más desde el aviso y las plazas fijas de esa franja se
            vuelven a reservar solas.
          </CasoDeUso>
        </div>
      </Seccion>

      <Seccion id="limites" titulo="Lo que hay que tener en cuenta">
        <Limite titulo="Renovar no rellena huecos hacia atrás">
          Si una serie lleva tres semanas terminada, al renovarla las clases nuevas empiezan desde ahora. Las tres semanas
          sin clase ya pasaron y no se inventan: lo que se puede hacer es no llegar ahí, y para eso están los avisos.
        </Limite>
        <Limite titulo="Un choque de sala se omite, no se fuerza">
          Si otra clase ya ocupa esa sala a esa hora, ese día no se crea y queda anotado. Es preferible a publicar dos
          clases en la misma sala y descubrirlo cuando llegan las alumnas.
        </Limite>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <Seccion id="relacionado" titulo="Con qué se relaciona">
        <p>
          Las clases recurrentes son el esqueleto del{' '}
          <Link href="/funcionalidades/calendario-y-salas">calendario</Link>: la vista «Horario» las pone delante para ver
          tu semana tipo. Encima de ellas viven las{' '}
          <Link href="/funcionalidades/plazas-fijas">plazas fijas</Link>, y sus reglas de reserva son las de{' '}
          <Link href="/funcionalidades/reservas-online">reservas online</Link>.
        </p>
        <p>
          Paso a paso, en el centro de ayuda:{' '}
          <Link href="/ayuda/reservas/clases-que-se-repiten">crear y renovar una clase que se repite</Link>.
        </p>
      </Seccion>

      <CierreCta
        titulo="Que tu horario no se acabe por sorpresa"
        body="Programa tus clases una vez y deja que Tentare te avise antes del final."
      />
    </FeatureShell>
  );
}
