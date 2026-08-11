import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CasoDeUso, CierreCta, Entradilla, FeatureFaq, Limite, Seccion } from '@/components/funcionalidades/bloques';
import {
  ComoSeEligeLaCandidata, EscaladoEnElTiempo, NivelesDeAutonomia, ResumenSustitucion,
} from '@/components/funcionalidades/visuales/sustituciones';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/sustituciones';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Y si ninguna instructora puede cubrirla?',
    a: 'El sistema te avisa en cuanto se agotan las candidatas, con las opciones sobre la mesa: reprogramar la clase, cancelarla avisando a las alumnas, o cubrirla tú. Lo que nunca pasa es que te enteres al llegar al estudio.',
  },
  {
    q: '¿La instructora tiene que instalar una app para avisar de su baja?',
    a: 'No. Avisa desde un enlace firmado en el móvil, sin instalar nada ni crear cuenta. Es deliberado: cuanto menos cueste avisar, antes te enteras, y el margen para cubrir la clase es justo lo que estás comprando.',
  },
  {
    q: '¿Puedo seguir aprobando cada sustitución a mano?',
    a: 'Sí, y es el modo por defecto. En asistido el sistema contacta a las candidatas y gestiona los recordatorios, pero la sustitución no se cierra hasta que tú la apruebas. Solo pasas a autónomo si quieres.',
  },
  {
    q: '¿Cómo sabe el sistema quién puede dar cada clase?',
    a: 'De la disponibilidad semanal que das de alta una vez por instructora, más sus vacaciones y bajas, más las clases que ya tiene asignadas. No hay que enseñarle nada aparte: son los mismos datos con los que cuadras el horario.',
  },
  {
    q: '¿Y si una candidata no tiene email?',
    a: 'La salta y pasa a la siguiente, y la ficha queda marcada en el panel para que lo completes. El motor no se queda esperando una respuesta que no puede llegar.',
  },
  {
    q: '¿Las alumnas se enteran de que cambia la instructora?',
    a: 'Sí, en cuanto la sustitución se confirma, por el canal de cada una. Es el paso que más caro se paga cuando falla, y por eso no depende de que alguien se acuerde de escribirlo.',
  },
];

export default function SustitucionesPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="El corazón de Tentare"
      h1={<>La baja se cubre sola.</>}
      intro={<>Una instructora avisa de que no puede dar su clase. Antes de que llegues a leer el mensaje, el sistema ya sabe quién puede cubrirla y está escribiéndoles por orden.</>}
      chips={['Candidatas por disponibilidad real', 'Escalado automático', 'Cuatro niveles de autonomía']}
      gradient="linear-gradient(140deg,#191C11 0%,#343825 62%,#3E4430 100%)"
      visual={<ResumenSustitucion />}
    >
      <Seccion id="problema" titulo="El problema no es la baja. Es todo lo que cuelga de ella">
        <Entradilla>
          Son las 22:47 y suena el móvil: una instructora no puede dar su clase de mañana. Lo que viene después no son cinco minutos.
        </Entradilla>
        <p>
          Hay que saber <strong>quién puede dar esa clase concreta</strong> —no vale cualquiera: tiene que saber llevar un
          reformer, o un prenatal, y estar libre a esa hora—, escribir a una, esperar, escribir a otra, cuadrar el
          calendario, registrar las horas de quien acabe cubriendo para que la nómina salga bien, y avisar a ocho o diez
          alumnas antes de que se presenten a una clase que ha cambiado.
        </p>
        <p>
          Cada uno de esos pasos depende de ti, y casi siempre a la peor hora. El último —avisar a las alumnas— es el que
          más caro se paga si se olvida, y es justo el que se olvida cuando ya has resuelto lo difícil.
        </p>
        <p>
          Tentare no hace ese trabajo más rápido: lo quita. Y lo hace con los datos que ya tienes puestos para cuadrar el
          horario, no con un módulo aparte que haya que alimentar.
        </p>
      </Seccion>

      <Seccion id="candidatas" titulo="Cómo decide a quién avisar, y en qué orden">
        <p>
          Lo primero que hace al entrar una baja es separar dos preguntas que se suelen mezclar:{' '}
          <strong>quién puede cubrirla</strong> y <strong>a quién conviene avisar primero</strong>. La primera es binaria y no
          admite matices. La segunda sí, y es donde se decide si repartes la carga o quemas siempre a la misma persona.
        </p>
        <ComoSeEligeLaCandidata />
        <p>
          El orden importa más de lo que parece. Avisar a las tres a la vez parece más rápido, pero convierte cada baja en
          una subasta incómoda entre compañeras y hace que la que más rápido contesta acabe cubriendo siempre. Por eso se
          avisa por orden y con un plazo.
        </p>
      </Seccion>

      <Seccion id="escalado" titulo="Qué pasa cuando nadie contesta">
        <p>
          Aquí es donde un sistema de sustituciones se gana el sueldo o no sirve de nada. Mandar un email y esperar no es
          automatizar: si la primera candidata está dando clase, o dormida, ese email no se lee a tiempo y la clase se cae
          igual.
        </p>
        <EscaladoEnElTiempo />
        <p>
          El recordatorio cambia de canal a propósito. El primer aviso va por email, con un enlace para aceptar o rechazar
          de un toque; el recordatorio va además por WhatsApp o SMS si la instructora tiene teléfono en su ficha. Es la
          diferencia entre un aviso que se ve a la mañana siguiente y uno que se ve ahora.
        </p>
      </Seccion>

      <Seccion id="autonomia" titulo="Cuánto le dejas decidir">
        <p>
          Ningún estudio empieza dejando que un sistema escriba a su equipo sin mirar. Por eso la autonomía es un ajuste,
          no una promesa de marketing: eliges cuánto hace solo y lo subes cuando te fías.
        </p>
        <NivelesDeAutonomia />
        <p>
          La mayoría de estudios arranca en <strong>asistido</strong> —el sistema hace el trabajo pesado y tú das el visto
          bueno— y sube a autónomo cuando lleva unas semanas acertando. El modo Vacaciones existe porque el peor momento
          para una baja es justo cuando la propietaria no está.
        </p>
      </Seccion>

      <Seccion id="requisitos" titulo="Lo que tiene que estar puesto para que funcione">
        <p>
          Esto no funciona con magia, funciona con datos. Tres cosas, y las tres se configuran una vez:
        </p>
        <ul style={{ fontSize: 17, lineHeight: 1.66, color: '#3A3A34', paddingLeft: 22, margin: '0 0 17px' }}>
          <li style={{ marginBottom: 8 }}>
            La <strong>disponibilidad semanal</strong> de cada instructora — en qué franjas puede trabajar. Se gestiona en{' '}
            <Link href="/funcionalidades/gestion-de-instructoras">gestión de instructoras</Link>, y la propia instructora
            puede mantenerla al día desde su móvil.
          </li>
          <li style={{ marginBottom: 8 }}>
            Sus <strong>vacaciones y bajas</strong>, que se convierten en bloqueos de agenda para las fechas que ocupan.
          </li>
          <li>
            El <strong>historial de clases</strong>, que ya se genera solo: de ahí sale saber quién ha dado antes ese tipo
            de clase.
          </li>
        </ul>
        <Limite titulo="Confirmar una ausencia no reorganiza tus clases ya programadas">
          Si una instructora marca dos semanas de vacaciones, eso entra en el cálculo de <em>futuras</em> candidatas, pero no
          dispara sustituciones automáticas sobre las clases que ya tenía asignadas en esas fechas. Es una decisión
          deliberada: reasignar media agenda sin que nadie lo pida da más sustos que alegrías. Lo que sí hace el sistema es
          avisarte de que hay clases sin quien las dé.
        </Limite>
      </Seccion>

      <Seccion id="casos" titulo="Cuatro situaciones reales">
        <div style={{ margin: '24px 0 0' }}>
          <CasoDeUso hora="22:47" titulo="La baja de la noche anterior">
            Marta avisa desde el sofá. Para cuando abres el móvil por la mañana, dos candidatas ya han recibido el aviso y
            una ha aceptado. Tú apruebas y se acabó.
          </CasoDeUso>
          <CasoDeUso hora="07:40" titulo="La baja a dos horas de la clase">
            Aquí no hay margen para esperar 45 minutos entre avisos. Las ventanas se comprimen solas —el suelo son dos
            minutos— y si el top 3 se agota sin respuesta, te llega la alerta con tiempo para decidir tú.
          </CasoDeUso>
          <CasoDeUso hora="Lunes" titulo="La clase que nadie quiere coger">
            Un reformer avanzado que solo han dado dos personas. La elegibilidad lo refleja: quien no lo ha impartido nunca
            baja mucho en el orden, así que no se avisa primero a quien no debería cubrirlo.
          </CasoDeUso>
          <CasoDeUso hora="Agosto" titulo="La propietaria está fuera">
            En modo Vacaciones el ciclo entero ocurre sin ella: candidatas, contacto, confirmación, calendario, horas y
            aviso a las alumnas. Lo lee cuando vuelve.
          </CasoDeUso>
        </div>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
        <p style={{ marginTop: 26 }}>
          Si lo que buscas es cómo montar este proceso en tu estudio —con o sin Tentare—, la guía{' '}
          <Link href="/recursos/cubrir-baja-instructora">cómo cubrir una baja de instructora sin hacer una llamada</Link>{' '}
          lo desmonta paso a paso.
        </p>
      </Seccion>

      <CierreCta
        titulo="Deja de perder noches por una clase"
        body="Da de alta a tu equipo con su disponibilidad y el sistema hace el resto. Empieza en modo asistido y sube el nivel cuando te fíes."
      />
    </FeatureShell>
  );
}
