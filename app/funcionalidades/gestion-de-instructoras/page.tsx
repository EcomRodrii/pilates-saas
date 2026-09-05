import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion, Tabla } from '@/components/funcionalidades/bloques';
import { DisponibilidadSemanal, QuienVeQue, RiesgoDeConcentracion } from '@/components/funcionalidades/visuales/equipo';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/gestion-de-instructoras';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Puede una instructora ver lo que cobran sus compañeras?',
    a: 'No. Las tarifas viven en una tabla separada de la ficha de instructora precisamente por eso: la ficha general es visible para el equipo, y un campo salarial dentro de ella se filtraría. Cada instructora lee su propia tarifa y no puede escribirla.',
  },
  {
    q: '¿Pueden crear ellas sus propias clases?',
    a: 'Sí, pero solo para sí mismas: sin elegir instructora, con el aforo de la sala y sin series recurrentes. Montar series sigue siendo trabajo de mostrador, que es donde se ve el horario completo.',
  },
  {
    q: '¿Puede una instructora trabajar en dos sedes de mi cadena?',
    a: 'Sí, con horario, disponibilidad y hasta rol distintos en cada una: puede ser gerencia en una sede e instructora en otra. Cambia de sede desde su propio selector y ve el rol que tiene en cada sitio.',
  },
  {
    q: '¿Cómo se calculan las horas para la nómina?',
    a: 'De las clases realmente impartidas, cruzadas con la tarifa por hora que hayas fijado. La liquidación mensual se genera desde ahí. No ejecuta el pago: prepara el número para que lo pagues como pagues siempre.',
  },
  {
    q: '¿Qué pasa cuando doy de baja a una instructora?',
    a: 'Deja de aparecer como candidata y de poder acceder, pero su historial no se borra: las clases que dio siguen contando en el histórico y en los informes.',
  },
];

export default function InstructorasPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Tu equipo"
      h1={<>Quién puede dar qué, y cuándo.</>}
      intro={<>Disponibilidad, vacaciones, horas y tarifas de cada instructora en un sitio. Los mismos datos con los que cuadras el horario son los que cubren una baja sola.</>}
      chips={['Disponibilidad y bloqueos', 'Tarifa por hora y liquidación', 'Aviso de dependencia']}
      captura={{ src: '/producto/equipo.png', alt: 'Pantalla de equipo de Tentare con las instructoras del estudio', pie: 'Tu equipo, con el rol de cada una y lo que cobra por hora.', ancho: 2880, alto: 1624 }}
    >
      <Seccion id="problema" titulo="El dato que suele vivir en la cabeza de alguien">
        <Entradilla>
          Quién puede dar reformer, quién solo mat, quién no puede los jueves por la tarde y quién está de vacaciones en
          agosto. En la mayoría de estudios eso no está escrito en ningún sitio: está en la memoria de la propietaria.
        </Entradilla>
        <p>
          Funciona hasta que hace falta a las once de la noche, o hasta que la propietaria está de baja, o hasta que el
          estudio crece lo suficiente como para que no quepa en una cabeza. Y el momento en que falla es siempre el peor.
        </p>
        <p>
          Escribirlo una vez es lo que convierte «tengo que pensar a quién llamo» en algo que el sistema ya sabe.
        </p>
      </Seccion>

      <Seccion id="disponibilidad" titulo="Disponibilidad: la ventana semanal y sus excepciones">
        <DisponibilidadSemanal />
        <p>
          Cada instructora tiene una ventana semanal —los tramos en los que puede trabajar— y encima de ella dos tipos de
          excepción para lo que no se repite:
        </p>
        <Tabla
          cabeceras={['Tipo', 'Qué significa', 'Ejemplo']}
          filas={[
            ['Ventana semanal', 'Su horario habitual, día y franja', 'Lunes a viernes de 8 a 12'],
            ['Excepción «extra»', 'Puede ese día concreto aunque no sea su franja', 'El sábado del taller'],
            ['Excepción «bloqueo»', 'No puede ese día o esa franja', 'Cita médica del jueves'],
          ]}
        />
        <p>
          Las vacaciones y las bajas se convierten en bloqueos de los días que ocupan, así que no hay dos sistemas paralelos
          que puedan contradecirse: una sola tabla decide si alguien está disponible.
        </p>
        <p>
          La propia instructora puede mantener esto al día desde su móvil sin pedirte nada, que es lo que hace que el dato
          siga siendo cierto dentro de tres meses.
        </p>
      </Seccion>

      <Seccion id="roles" titulo="Quién ve qué">
        <p>
          Un estudio con recepción y varias instructoras no puede trabajar con un único usuario compartido. Hay cuatro roles
          con alcances distintos, y la separación no es cosmética.
        </p>
        <QuienVeQue />
        <p>
          Dos casos concretos por los que esto importa: recepción no ve el detalle de salud de una alumna —lo necesita quien
          da la clase, no quien cobra—, y una instructora no puede crear ni borrar clases de otras, solo editar las suyas.
        </p>
      </Seccion>

      <Seccion id="horas" titulo="Horas, tarifas y liquidación">
        <p>
          Las clases impartidas ya están registradas; lo que faltaba era convertirlas en un número. Cada instructora tiene su
          tarifa por hora y la liquidación mensual se calcula desde las clases que realmente dio.
        </p>
        <Rejilla
          items={[
            { titulo: 'La tarifa la fijas tú', body: 'Propietaria y gerencia la escriben. La instructora la lee, y solo la suya.' },
            { titulo: 'Guardada aparte a propósito', body: 'No es un campo más de su ficha: la ficha es visible para el equipo y un dato salarial ahí se filtraría.' },
            { titulo: 'Liquidación mensual', body: 'Horas impartidas por tarifa, listo para pasarlo a tu gestoría.' },
            { titulo: 'Rendimiento por instructora', body: 'Ocupación y asistencia de sus clases, para hablar con datos y no con sensaciones.' },
          ]}
        />
        <p>
          Y si la tienes contratada por horas, apunta sus <strong>horas semanales de contrato</strong> y cada mes verás las
          tres cifras que hacen falta para saber si le estás dando lo que le pagas: las <strong>asignadas</strong> (lo que
          tiene en el calendario), las <strong>realizadas</strong> (lo que ya ocurrió) y la diferencia respecto a su
          contrato. La equivalencia mensual usa la convención de nómina de siempre —52 semanas entre 12—, así que 12 h a la
          semana salen 52 al mes y no 48: cuadra con lo que espera tu gestoría.
        </p>
        <Limite titulo="No es un software de nóminas">
          Calcula lo que corresponde pagar y lo deja listo; no genera nóminas ni ejecuta transferencias. El pago sigue
          haciéndose donde lo haces hoy.
        </Limite>
      </Seccion>

      <Seccion id="dependencia" titulo="El riesgo que no se ve hasta que se va">
        <p>
          Hay un dato que ningún estudio mira hasta que es tarde: qué parte del horario depende de una sola persona. No es un
          problema mientras esa persona esté — y es un problema muy serio la semana en que avisa de que se va.
        </p>
        <RiesgoDeConcentracion />
        <p>
          Verlo a tiempo da margen para repartir formatos, meter a otra instructora en las clases que solo lleva una, o
          simplemente saber a qué te expones. Es información para decidir, no una alarma.
        </p>
      </Seccion>

      <Seccion id="reasignar" titulo="Cuando ya sabes quién cubre: pasar sus clases de una vez">
        <p>
          Una baja de tres semanas o un cambio de cuadrante no es una sustitución que haya que buscar: es una decisión que
          ya has tomado y que hay que ejecutar. Eliges a quién pasan sus clases y entre qué fechas, y se mueven todas.
        </p>
        <Rejilla
          items={[
            { titulo: 'Te dice qué va a mover antes de moverlo', body: 'Cuántas clases caen en ese periodo y cuántas alumnas hay apuntadas, antes de tocar nada.' },
            { titulo: 'Decides qué pasa con los choques', body: 'Si la que recibe ya da otra clase a esa hora: o se saltan esas y se mueve el resto, o no se mueve ninguna. Nunca queda a medias.' },
            { titulo: 'Las alumnas se enteran', body: 'Aviso por email y en su app, una vez por clase. Cambiar veinte clases en silencio es peor que no cambiarlas.' },
            { titulo: 'No lo hace nadie por ti', body: 'Registrar una ausencia te dice cuántas clases quedan sin cubrir, pero no las reasigna sola: esa decisión es tuya.' },
          ]}
        />
      </Seccion>

      <Seccion id="sustituciones" titulo="Y de aquí sale la cobertura de bajas">
        <p>
          Todo lo anterior tiene una consecuencia directa: cuando alguien no puede dar su clase, el sistema ya sabe quién
          puede cubrirla sin preguntarte nada. Esa es la parte que más se nota, y tiene su propia página en{' '}
          <Link href="/funcionalidades/sustituciones">sustituciones</Link>.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Saca de tu cabeza el horario de tu equipo"
        body="Da de alta a tus instructoras con su disponibilidad y deja de ser el único sitio donde vive esa información."
      />
    </FeatureShell>
  );
}
