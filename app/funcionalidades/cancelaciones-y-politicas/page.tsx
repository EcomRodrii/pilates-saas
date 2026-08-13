import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { CicloDeLaPenalizacion, LaVentana, QuePasaConElBono } from '@/components/funcionalidades/visuales/cancelaciones';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/cancelaciones-y-politicas';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Tengo que cancelarle yo la reserva o dársela de baja de la plaza fija?',
    a: 'No. Lo hace ella desde su portal, dentro de la ventana que hayas configurado — sin escribirte para avisarte. Si tiene plaza fija, también la pausa o la retoma cuando quiera. A tu panel llega ya resuelto.',
  },
  {
    q: '¿Tengo que cobrar por cancelar tarde?',
    a: 'No, y viene desactivado. La penalización económica es opcional y muchos estudios funcionan bien solo con la ventana de cancelación y con no devolver la sesión. Actívala si tu problema es que las plazas se quedan vacías a última hora de forma sistemática.',
  },
  {
    q: '¿Se cobra sola o tengo que aprobarla?',
    a: 'Por defecto, aprobación manual: la penalización aparece en tu panel y se cobra solo si le das al botón. Puedes ponerla en automático, pero es una decisión que tienes que tomar tú, no el valor por defecto.',
  },
  {
    q: '¿Y si una alumna aceptó las condiciones antes de que yo activara esto?',
    a: 'Entonces no se le cobra. El consentimiento se guarda con el texto legal completo que aceptó, no con un número de versión: en cuanto añades la cláusula de penalización, quien firmó el texto anterior deja de tener consentimiento vigente para esto — automáticamente, sin que tengas que revisar a nadie.',
  },
  {
    q: 'Si alguien cancela tarde, ¿su plaza se queda bloqueada?',
    a: 'No. La plaza se libera igual y se ofrece a la lista de espera. Que ella pierda la sesión y que la clase salga llena son dos cosas distintas, y castigar lo primero no debería costarte lo segundo.',
  },
  {
    q: '¿Puedo tener una política distinta para el reformer y para el mat?',
    a: 'Sí. La ventana de cancelación, el importe de la penalización y el mínimo de asistentes se pueden fijar por tipo de clase, heredando lo del estudio en lo que no toques.',
  },
  {
    q: '¿Qué pasa si marco un no-show por error?',
    a: 'Lo reviertes y la penalización queda registrada como revertida, sin cobrarse. Ese histórico es a propósito: quedan por escrito tanto las que se cobraron como las que no y por qué.',
  },
];

export default function CancelacionesPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Plazas que se pierden"
      h1={<>La plaza vacía de las 19:00.</>}
      intro={<>Alguien cancela veinte minutos antes y esa plaza ya no la ocupa nadie. Aquí decides qué pasa con su sesión, con el hueco y —si quieres— con su tarjeta.</>}
      chips={['Ventana por tipo de clase', 'Devolución de bono configurable', 'Penalización opcional']}
      visual={<LaVentana />}
    >
      <Seccion id="problema" titulo="Cancelar tarde no es lo mismo que cancelar">
        <Entradilla>
          Una alumna que avisa el día antes te deja tiempo para llenar el hueco. Una que avisa veinte minutos antes te
          deja una plaza vacía y una clase que ya no puede crecer.
        </Entradilla>
        <p>
          Todos los estudios lo saben y casi ninguno lo aplica, porque aplicarlo a mano significa acordarse de quién
          canceló cuándo, y tener esa conversación incómoda una por una. El resultado habitual es una política escrita en
          las condiciones que no se cumple nunca — que es peor que no tenerla, porque las que sí la respetan ven que a las
          demás no les pasa nada.
        </p>
        <p>
          Lo que hace falta no es más dureza: es que la regla se aplique sola y por igual, y que quede claro por escrito
          qué pasó en cada caso.
        </p>
      </Seccion>

      <Seccion id="ventana" titulo="La ventana: dónde pones la línea">
        <p>
          Es el único ajuste imprescindible. Antes de la línea, cancelar es gratis; después, tiene consecuencias. Las
          horas las decides tú y pueden ser distintas por tipo de clase — es habitual cerrar el reformer con más
          antelación que el mat, porque encontrar quien lo cubra cuesta más.
        </p>
        <p>
          A partir de ahí, lo que cambia es qué pasa con su sesión. Y ahí hay más casos de los que parece.
        </p>
      </Seccion>

      <Seccion id="bono" titulo="Qué pasa con su bono">
        <p>
          Todo esto lo hace <strong>ella</strong>, desde su portal, dentro de la ventana que tú configuraste — no un paso
          de mostrador que tengas que resolver a mano. Cancela, ve si recupera la sesión, y si tiene plaza fija, la
          pausa o la retoma cuando quiera. A ti te llega hecho, no por hacer.
        </p>
        <QuePasaConElBono />
        <p>
          Fíjate en dos filas. La primera: una cancelación tardía <strong>no le devuelve la sesión, pero sí libera la
          plaza</strong>. Son decisiones separadas a propósito; castigar a quien canceló tarde no debería costarte además
          la plaza.
        </p>
        <p>
          La segunda: si eres tú quien cancela una clase, el bono no vuelve por defecto —es tu decisión y la gestionas
          como quieras—, pero si la clase se cae sola por no llegar al mínimo de asistentes, el bono <strong>siempre</strong>{' '}
          se devuelve. Esa no es decisión de nadie, y no puede pagarla la alumna.
        </p>
        <Limite titulo="Una plaza fija no devuelve bono, devuelve recuperación">
          Porque nunca consumió uno: sus reservas se crean solas cada semana sin descontar sesiones. Su compensación es un
          crédito con fecha de caducidad. Sin esa distinción, cancelar una plaza fija regalaría las dos cosas a la vez.
        </Limite>
      </Seccion>

      <Seccion id="penalizacion" titulo="Y si quieres, cobrar por la plaza perdida">
        <p>
          Esto es opcional y viene apagado. Puedes fijar un importe por cancelación tardía y por no presentarse, con la
          tarjeta que la socia ya tiene guardada. Antes de que se cobre nada, el sistema comprueba tres cosas.
        </p>
        <Rejilla
          columnas={3}
          items={[
            { titulo: 'Que haya con qué cobrar', body: 'Sin tarjeta guardada no se intenta y queda anotado.' },
            { titulo: 'Que haya consentido', body: 'Sus condiciones aceptadas tienen que incluir esta cláusula.' },
            { titulo: 'Que lo apruebes tú', body: 'Salvo que hayas puesto el cobro en automático.' },
          ]}
        />
        <CicloDeLaPenalizacion />
        <p>
          El guard de consentimiento merece un párrafo. No se guarda «versión 3 de los términos»: se guarda{' '}
          <strong>el texto completo que la socia aceptó</strong>. Así, en cuanto activas la penalización y la cláusula
          entra en tus condiciones, todas tus alumnas actuales dejan de tener consentimiento vigente para esto —
          automáticamente, sin que tengas que revisar una lista— y vuelven a tenerlo cuando aceptan el texto nuevo. Es la
          diferencia entre poder demostrar qué aceptó cada una y suponerlo.
        </p>
        <Limite titulo="Hay cancelaciones que nunca penalizan, por construcción">
          Si el sistema corta una clase por riesgo de que no vaya nadie, o si cancelas una serie entera desde el panel,
          esas cancelaciones no pasan por el camino que detecta penalizaciones. No hace falta que te acuerdes de
          desactivar nada: no pueden generar un cargo.
        </Limite>
      </Seccion>

      <Seccion id="minimo" titulo="El problema contrario: la clase que sale con dos">
        <p>
          Cancelar tarde no es el único agujero. También está la clase que se sostiene con tres personas y a la que le
          pagas la hora completa a una instructora. Puedes fijar un <strong>mínimo de asistentes</strong>: si dos horas
          antes no se alcanza, la sesión se cancela sola, se avisa a quien había reservado y se le devuelve su sesión.
        </p>
        <p>
          Dos horas fijas, no configurable. Es el margen que deja a la gente reorganizarse sin dejar de ser un aviso con
          tiempo — y como la regla es opcional, quien la activa ya sabe lo que implica.
        </p>
        <p>
          Si tu problema es más de fondo —franjas que van medio vacías todas las semanas— eso no se arregla cancelando,
          se arregla mirando los números: está en{' '}
          <Link href="/funcionalidades/informes-y-rentabilidad">informes y rentabilidad</Link>, y la guía{' '}
          <Link href="/recursos/reducir-cancelaciones-ultima-hora">reduce las cancelaciones de última hora</Link> entra en
          las tácticas.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Empieza solo por la ventana"
        body="Fija las horas de cancelación y decide si la sesión vuelve o no. Lo demás lo activas si te hace falta."
      />
    </FeatureShell>
  );
}
