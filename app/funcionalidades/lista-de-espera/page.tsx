import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CasoDeUso, CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { CicloDeLaOferta, EsperaSinPlazo } from '@/components/funcionalidades/visuales/reservas';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/lista-de-espera';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Estar en lista de espera consume una sesión del bono?',
    a: 'No. Mientras está en espera no ocupa plaza ni gasta bono; la sesión se descuenta solo cuando su plaza se confirma. Es la misma regla que se aplica a las reservas pendientes de aprobación.',
  },
  {
    q: '¿Cuánto plazo conviene dar para aceptar?',
    a: 'Depende de cuánto falte para la clase. Para una clase de mañana, unas horas funcionan; para una de dentro de una hora, el plazo tiene que ser corto o la plaza se pierde igual. Se configura por tipo de clase, así que no tienes que elegir un único número para todo.',
  },
  {
    q: 'Si no acepta a tiempo, ¿vuelve al final de la cola?',
    a: 'No: pierde el sitio y se ofrece a la siguiente. Es deliberado. Si volviera al final, una lista de cinco personas podría estar dando vueltas mientras la clase empieza con una plaza vacía.',
  },
  {
    q: '¿Puedo desactivar la lista de espera en algunas clases?',
    a: 'Sí, es una de las reglas que cada tipo de clase puede sobrescribir. Hay formatos donde tener cola no aporta —una individual, por ejemplo— y ahí se apaga sin tocar el resto del estudio.',
  },
  {
    q: '¿Cómo se entera la alumna de que tiene plaza?',
    a: 'Por aviso en la app y notificación al móvil, que es lo que llega a tiempo. Un email para algo que caduca en dos horas no sirve.',
  },
];

export default function ListaEsperaPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Clases llenas"
      h1={<>El hueco que deja una cancelación no se pierde.</>}
      intro={<>Cuando alguien cancela, la plaza se ofrece sola a la siguiente de la cola. Y si le das un plazo para aceptar, no acabas metiendo a nadie en una clase de la que no se ha enterado.</>}
      chips={['Promoción automática', 'Oferta con plazo', 'Sin consumir bono hasta confirmar']}
      gradient="linear-gradient(140deg,#1A1508 0%,#3D3018 55%,#7A6231 100%)"
      visual={<EsperaSinPlazo />}
    >
      <Seccion id="problema" titulo="Una plaza vacía en una clase llena es dinero tirado">
        <Entradilla>
          Es la peor combinación posible: tienes gente que quería entrar y una plaza que se quedó libre a las diez de la
          noche. Nadie las juntó a tiempo.
        </Entradilla>
        <p>
          Cuando la lista de espera es un mensaje en un grupo, esto pasa cada semana. La alumna cancela tarde, nadie lee el
          mensaje hasta la mañana siguiente, y para entonces quien estaba esperando ya ha hecho otros planes. La clase sale
          con nueve de diez, y las dos personas implicadas se quedan con mala sensación.
        </p>
        <p>
          Lo que arregla esto no es tener una lista. Es que la lista <strong>se ejecute sola</strong> en el momento exacto en
          que aparece el hueco.
        </p>
      </Seccion>

      <Seccion id="ciclo" titulo="Qué pasa en los minutos siguientes a una cancelación">
        <CicloDeLaOferta />
        <p>
          Hay una decisión importante en el paso 4a: <strong>el bono se descuenta al aceptar, no al ofrecer</strong>. Si se
          descontara antes, una oferta que caduca dejaría a la alumna con una sesión menos y sin clase, y tú tendrías que
          devolvérsela a mano.
        </p>
      </Seccion>

      <Seccion id="plazo" titulo="Con plazo o sin plazo: cuál te conviene">
        <p>
          Las dos formas son válidas y sirven para estudios distintos. La pregunta que las separa es qué te duele más:{' '}
          <em>que la plaza tarde en llenarse</em> o <em>que alguien no aparezca</em>.
        </p>
        <Rejilla
          items={[
            {
              titulo: 'Promoción instantánea',
              body: 'La plaza se confirma sola a la primera de la cola. El hueco se cubre al segundo. El riesgo es que se encuentre reservada en una clase de dentro de una hora sin haberlo mirado — y no aparezca.',
            },
            {
              titulo: 'Oferta con plazo',
              body: 'Se le pregunta antes de meterla. Tarda un poco más en cubrirse, pero quien entra sabe que entra. Mejor si tienes penalización por no presentarse o si tus clases son de aforo pequeño.',
            },
          ]}
        />
        <p>
          El plazo se configura por tipo de clase, heredando del estudio: puedes dar dos horas en el reformer y dejar el mat
          en promoción instantánea. Las reglas completas de reserva y cancelación están en{' '}
          <Link href="/funcionalidades/reservas-online">reservas online</Link>.
        </p>
      </Seccion>

      <Seccion id="casos" titulo="Tres noches distintas">
        <div style={{ margin: '24px 0 0' }}>
          <CasoDeUso hora="22:10" titulo="Cancelación de la noche anterior">
            Se libera una plaza del reformer de las 19:00 de mañana. La primera de la cola recibe el aviso y acepta a la
            mañana siguiente, dentro de plazo. La clase sale llena.
          </CasoDeUso>
          <CasoDeUso hora="18:05" titulo="Cancelación a una hora de la clase">
            Con plazo corto, la primera no contesta y la oferta pasa a la segunda, que sí. Sin ese salto automático, esa
            plaza se habría quedado vacía.
          </CasoDeUso>
          <CasoDeUso hora="Sábado" titulo="Nadie acepta">
            La cola se agota sin respuesta y la clase sale con una plaza libre. No hay magia: lo que evita el sistema es que
            además nadie se hubiera enterado.
          </CasoDeUso>
        </div>
      </Seccion>

      <Seccion id="limites" titulo="Lo que hay que tener en cuenta">
        <Limite titulo="La oferta caduca en pasadas periódicas, no al segundo exacto">
          El proceso que revisa las ofertas vencidas corre cada pocos minutos. Eso significa que una oferta puede tardar un
          poco más de lo que marca su plazo en pasar a la siguiente persona. Es una decisión de consumo consciente: revisar
          cada minuto una tabla que casi siempre está vacía multiplica el coste sin mejorar nada que se note.
        </Limite>
        <p>
          Y una regla que no se puede saltar: una plaza en espera nunca ocupa aforo. Si la clase tiene diez plazas y hay
          tres personas en cola, siguen siendo diez plazas ocupadas, no trece.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Que ninguna plaza se quede sin cubrir"
        body="Activa la lista de espera y decide, clase por clase, si prefieres velocidad o confirmación."
      />
    </FeatureShell>
  );
}
