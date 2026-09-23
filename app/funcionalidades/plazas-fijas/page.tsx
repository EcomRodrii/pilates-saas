import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CasoDeUso, CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion, Tabla } from '@/components/funcionalidades/bloques';
import { PanelClaro } from '@/components/funcionalidades/visuales/comunes';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/plazas-fijas';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Qué es una plaza fija?',
    a: 'Es el sitio de una alumna en una clase que se repite todas las semanas: mismo día, misma hora y misma sala. Tentare le reserva esa clase sola cada semana, sin que ella tenga que entrar a reservar ni tú apuntarla a mano.',
  },
  {
    q: '¿Hace falta que tenga cuota?',
    a: 'Sí. La plaza fija es para quien tiene una cuota activa que incluya esa clase. Con un bono de sesiones se reserva clase a clase, porque cada reserva descuenta una sesión y un hueco semanal automático se comería el bono sin que nadie lo decidiera.',
  },
  {
    q: '¿Qué pasa si se va dos semanas de vacaciones?',
    a: 'Se pausa la plaza con fechas. Esas semanas no se le reserva la clase, las que ya tenía en esas fechas se cancelan sin penalización, y al acabar la pausa vuelve sola. No hay que acordarse de reactivarla.',
  },
  {
    q: 'Durante la pausa, ¿su sitio se queda vacío?',
    a: 'Tú decides. De serie conserva su sitio, que es lo que espera casi todo el mundo. Si prefieres aprovecharlo, puedes activar que las pausas largas lo liberen para otra alumna: entonces, una semana antes de que acabe, Tentare le devuelve la plaza si su sitio sigue libre, y si no te lo pregunta a ti.',
  },
  {
    q: 'Si se queda sin cuota, ¿pierde las clases que ya tenía reservadas?',
    a: 'Lo eliges tú, en Configuración. Puedes conservarlas con tus reglas de siempre, conservarlas sin penalización si falta, o liberarlas para que entre otra persona. En las tres, su plaza se queda guardada y las clases que ya pasaron no se tocan.',
  },
  {
    q: '¿Pueden pedirla ellas desde la app?',
    a: 'Solo si lo activas. Con ese ajuste encendido, una alumna pide la plaza fija desde una clase que se repite, o pide una pausa de la suya, y tú lo apruebas o lo rechazas desde Resumen. Hasta que decides, su plaza no cambia.',
  },
  {
    q: '¿Puede tener dos plazas fijas?',
    a: 'Sí, tantas como franjas distintas: lunes a las 10:00 y jueves a las 18:00, por ejemplo. Lo que no puede es tener dos en la misma franja; eso lo impide la propia base de datos, no solo la pantalla.',
  },
];

export default function PlazasFijasPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Clases fijas"
      h1={<>Su sitio de los martes, reservado sin que nadie lo pida.</>}
      intro={<>La alumna que viene siempre a la misma clase no debería tener que reservarla cada semana. Le das su plaza una vez y Tentare se la reserva, la pausa cuando se va de vacaciones y la suelta si deja de tener cuota.</>}
      chips={['Reserva automática cada semana', 'Pausa con fechas', 'Reglas que eliges tú']}
      visual={
        <PanelClaro titulo="La semana de una plaza fija" nota="Seis semanas por delante, siempre">
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            <li>Le das la plaza eligiendo la clase a la que viene.</li>
            <li>Sus próximas clases quedan reservadas al momento.</li>
            <li>Cada noche, Tentare reserva la semana que entra en el horizonte.</li>
            <li>Si cancela una suelta, sigue teniendo la de la semana siguiente.</li>
          </ol>
        </PanelClaro>
      }
    >
      <Seccion id="problema" titulo="La alumna de siempre compitiendo por su propia plaza">
        <Entradilla>
          En casi todos los estudios hay un grupo que no cambia: las mismas seis personas, el mismo día, la misma hora,
          desde hace dos años. Y cada semana tienen que entrar a reservar como si fueran nuevas.
        </Entradilla>
        <p>
          Eso tiene dos costes. El primero es suyo: si un martes se le olvida, pierde su sitio de siempre con alguien que
          reservó antes. El segundo es tuyo, y es peor — acabas apuntándolas tú a mano, semana tras semana, o guardando
          plazas de palabra en una lista que solo existe en tu cabeza.
        </p>
        <p>
          La plaza fija convierte esa costumbre en una regla del sistema: <strong>su hueco semanal es suyo</strong> y se
          reserva solo.
        </p>
      </Seccion>

      <Seccion id="como" titulo="Cómo se da una plaza fija">
        <p>
          Desde la ficha de la alumna o desde el calendario, <strong>eligiendo la clase</strong> en la que quieres que
          entre. El día, la hora y la sala se sacan de esa clase: no se escriben a mano, así que no hay forma de crear una
          plaza en un hueco donde no hay clase.
        </p>
        <Rejilla
          items={[
            {
              titulo: 'Se reserva al momento',
              body: 'No hay que esperar a la noche. Al guardarla, sus próximas clases quedan reservadas y ella lo ve en su app.',
            },
            {
              titulo: 'Y sigue sola cada noche',
              body: 'Tentare mantiene reservadas todas las clases que ya tienes programadas, hasta unos seis meses por delante. Cuando creas una clase nueva, su sitio se aparta en el momento.',
            },
            {
              titulo: 'Con su cuota por delante',
              body: 'Solo se da a quien tiene una cuota activa que cubra esa clase. Si va a pasarse de su límite semanal, te avisa antes y decides tú.',
            },
            {
              titulo: 'Y su sitio, si lo usas',
              body: 'Si tu sala tiene sitios numerados —reformers, camas—, la plaza puede llevar el suyo, y nadie más lo ocupa.',
            },
          ]}
        />
        <p>
          Al asignar una cuota a una clienta, Tentare te pregunta si quieres darle también plaza fija. Es el momento en que
          se decide de verdad, y hasta ahora había que acordarse aparte.
        </p>
      </Seccion>

      <Seccion id="pausa" titulo="Vacaciones, una lesión, un mes fuera">
        <p>
          Se pausa la plaza entre dos fechas. Las clases que ya tenía reservadas en esas fechas se cancelan sin
          penalización —y si hay alguien en lista de espera, entra en su lugar—, y al llegar el final vuelve sola.
        </p>
        <Tabla
          cabeceras={['', 'Conserva su sitio (de serie)', 'Su sitio queda libre']}
          filas={[
            ['Durante la pausa', 'Nadie ocupa su sitio', 'Otra alumna puede tener esa plaza'],
            ['Cuándo se suelta', '—', 'Al empezar la pausa, si dura más de una semana'],
            ['Al terminar', 'Vuelve sola', 'Vuelve si su sitio sigue libre; si no, te lo pregunta'],
            ['Quién decide', 'Tú, en Configuración', 'Tú, en Configuración'],
          ]}
        />
        <p>
          La segunda opción existe para estudios con lista de espera y salas pequeñas, donde un sitio vacío cuatro semanas
          es dinero parado. La primera es la de siempre, y es la que viene activada.
        </p>
      </Seccion>

      <Seccion id="sin-cuota" titulo="Qué pasa cuando deja de tener cuota">
        <p>
          Una cuota se cancela, se pausa, vence o se cambia por un bono. Su plaza fija sigue guardada y Tentare deja de
          reservarle clases nuevas. Con las que ya tenía reservadas, eliges entre tres comportamientos:
        </p>
        <Tabla
          cabeceras={['Opción', 'Qué pasa con sus clases futuras']}
          filas={[
            ['Como hasta ahora', 'Las conserva, con tus reglas de cancelación de siempre.'],
            ['Mantenerlas sin penalización', 'Las conserva, pero si falta o cancela tarde no se le cobra nada.'],
            ['Liberar sus clases', 'Se cancelan todas sus reservas futuras de esa plaza, sin penalización. Si hay lista de espera, entra la siguiente.'],
          ]}
        />
        <p>
          Las clases que ya pasaron no se tocan nunca: forman parte de su histórico. Y mientras la renovación solo esté{' '}
          <em>pendiente de cobro</em>, su cuota sigue contando como activa — no se le quita nada por un recibo que aún
          puede cobrarse.
        </p>
      </Seccion>

      <Seccion id="autoservicio" titulo="Que la pidan ellas, si tú quieres">
        <p>
          De serie, las plazas fijas se dan en recepción. Si lo activas, tus alumnas pueden <strong>pedirlas</strong> desde
          su app: la plaza, desde una clase que se repite, o una pausa de la que ya tienen.
        </p>
        <PanelClaro titulo="Una petición, paso a paso">
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            <li>Ella la pide desde su app. Su plaza no cambia.</li>
            <li>A ti te llega un aviso y la petición espera en Resumen.</li>
            <li>Si pasaría del límite de clases por semana de su cuota, te lo dice ahí.</li>
            <li>Al aprobarla, la plaza se crea con las mismas reglas que si la dieras tú.</li>
            <li>Ella recibe tu respuesta en su app, con el motivo si dices que no.</li>
          </ol>
        </PanelClaro>
      </Seccion>

      <Seccion id="casos" titulo="Tres situaciones de una semana normal">
        <div style={{ margin: '24px 0 0' }}>
          <CasoDeUso hora="Martes" titulo="Cancela una suelta">
            Avisa de que este martes no puede. Se cancela solo esa clase; su plaza del martes siguiente sigue intacta. Si
            cancela a tiempo y su cuota tiene límite semanal, se le guarda una recuperación.
          </CasoDeUso>
          <CasoDeUso hora="1 de agosto" titulo="Se va tres semanas">
            Pausas su plaza del 1 al 21. Sus clases de esas fechas se cancelan sin penalización y el 22 vuelve sola, sin que
            nadie tenga que acordarse.
          </CasoDeUso>
          <CasoDeUso hora="Fin de mes" titulo="No renueva la cuota">
            Deja de tener cuota. Tentare deja de reservarle clases nuevas y, con lo ya reservado, hace lo que hayas elegido
            en Configuración.
          </CasoDeUso>
        </div>
      </Seccion>

      <Seccion id="limites" titulo="Lo que hay que tener en cuenta">
        <Limite titulo="No reserva una clase que empieza dentro de tu plazo de cancelación">
          Si das una plaza fija un lunes por la tarde para la clase del martes a las 9:00 y tu plazo de cancelación es de
          24 horas, esa primera clase no se le reserva sola. Sería meterla en una clase que ya no puede cancelar sin coste.
          A partir de la semana siguiente, todo normal.
        </Limite>
        <Limite titulo="La plaza está anclada al día y la hora, no a la serie">
          Si mueves una clase suelta a otra hora, la plaza fija no se mueve con ella: sigue anclada a su franja de siempre.
          Para cambiarle el horario a una alumna, se edita su plaza fija.
        </Limite>
        <p>
          Y una regla que no se puede saltar: una alumna no puede tener dos plazas fijas en la misma franja. Lo impide la
          base de datos, así que no depende de que la pantalla lo compruebe bien.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <Seccion id="relacionado" titulo="Con qué se relaciona">
        <p>
          La plaza fija vive encima de tu catálogo de <Link href="/funcionalidades/bonos-y-membresias">bonos y cuotas</Link>{' '}
          —solo funciona con cuota—, reserva con las mismas reglas que las{' '}
          <Link href="/funcionalidades/reservas-online">reservas online</Link>, libera hueco a la{' '}
          <Link href="/funcionalidades/lista-de-espera">lista de espera</Link> cuando cancela, y se ve en el{' '}
          <Link href="/funcionalidades/calendario-y-salas">calendario</Link> junto a las{' '}
          <Link href="/funcionalidades/clases-recurrentes">clases que se repiten</Link>.
        </p>
        <p>
          Paso a paso, en el centro de ayuda: <Link href="/ayuda/bonos/plazas-fijas">cómo funcionan las plazas fijas</Link>.
        </p>
      </Seccion>

      <CierreCta
        titulo="Deja de apuntar a mano a las de siempre"
        body="Dales su plaza una vez y olvídate: Tentare se la reserva cada semana, con tus reglas."
      />
    </FeatureShell>
  );
}
