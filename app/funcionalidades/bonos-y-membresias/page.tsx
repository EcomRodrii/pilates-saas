import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { AjustesDelPlan, CuatroModelos, PlazaFijaYRecuperacion } from '@/components/funcionalidades/visuales/bonos';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/bonos-y-membresias';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Puede una alumna tener un bono y una cuota a la vez?',
    a: 'Sí, y es más común de lo que parece: la cuota mensual para el mat y un bono suelto para el reformer, por ejemplo. Cada plan cubre los tipos de clase que le digas, y al reservar se usa el que corresponda.',
  },
  {
    q: '¿Los bonos caducan?',
    a: 'Tú decides. Puedes fijar una validez en días desde la compra o dejarlos sin caducidad. Si la fijas, la fecha se calcula al comprar, no al empezar a usarlo.',
  },
  {
    q: '¿Qué es exactamente una plaza fija?',
    a: 'Un hueco reservado a nombre de una alumna en un día, hora y sala concretos — y en un reformer concreto si trabajas con mapa de puestos. Sus reservas se crean solas cada semana, sin que tenga que entrar a reservar.',
  },
  {
    q: '¿Y si una alumna con plaza fija no puede venir un día?',
    a: 'Cancela como cualquier reserva y se le genera una recuperación: un crédito para otra clase, con fecha de caducidad. Es distinto de devolverle una sesión al bono, porque así queda claro qué pagó ella y qué le concediste tú.',
  },
  {
    q: '¿Puedo congelar la cuota de alguien que se va un mes?',
    a: 'Sí. La congelación empuja la fecha de fin en lugar de comerse los días, así que al volver conserva lo que le quedaba. Es lo que evita la conversación incómoda de agosto.',
  },
];

export default function BonosPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Lo que vendes"
      h1={<>Cuatro formas de cobrar, en el mismo estudio.</>}
      intro={<>Cuota mensual, bono de sesiones, clase suelta y plaza fija semanal. Con caducidades, topes y planes que solo valen para ciertas clases.</>}
      chips={['Planes por tipo de clase', 'Plaza fija y recuperaciones', 'Congelación de cuotas']}
      visual={<AjustesDelPlan />}
    >
      <Seccion id="modelos" titulo="Un estudio de Pilates no vende una sola cosa">
        <Entradilla>
          El software genérico de fitness asume que hay socios con una cuota. Un estudio de Pilates tiene, a la vez, gente
          con bono, gente con mensualidad, gente que viene suelta y gente que lleva tres años en el mismo hueco de los
          martes.
        </Entradilla>
        <CuatroModelos />
        <p>
          Que convivan importa porque la alternativa —forzar a todo el mundo al mismo modelo— es la vía rápida a perder a
          quien no encaja. La alumna que solo puede venir cada quince días no quiere una mensualidad, y si se la impones se
          va.
        </p>
      </Seccion>

      <Seccion id="plan" titulo="Lo que puedes definir en un plan">
        <p>
          Un plan no es solo un precio. Es un precio con reglas, y las reglas son las que hacen que el mismo catálogo sirva
          para un estudio de barrio y para uno con lista de espera.
        </p>
        <Rejilla
          columnas={2}
          items={[
            { titulo: 'Validez en días', body: 'Un bono de 10 que caduca a los 90 días desde la compra. O sin caducidad, si prefieres.' },
            { titulo: 'Tope semanal', body: 'Ilimitado pero con un máximo de sesiones por semana — para que «ilimitado» no signifique tres clases diarias.' },
            { titulo: 'Tipos de clase que cubre', body: 'El «Bono 10 Reformer» que no sirve para mat. Si no acotas nada, cubre todo.' },
            { titulo: 'Congelación', body: 'Pausar la suscripción empujando la fecha de fin, para que los días parados no se pierdan.' },
          ]}
        />
        <p>
          Al reservar, el sistema comprueba estas reglas antes de dar la plaza. No es una etiqueta informativa: si el bono no
          cubre ese tipo de clase, la reserva no entra. Cómo se aplica cada regla está en{' '}
          <Link href="/funcionalidades/reservas-online">reservas online</Link>.
        </p>
      </Seccion>

      <Seccion id="plaza-fija" titulo="La plaza fija: el modelo que casi nadie modela">
        <p>
          Es probablemente el formato más español y el peor cubierto por el software internacional. Una alumna no reserva
          cada semana: <strong>tiene su sitio</strong>, y la conversación con el estudio va de qué pasa cuando falta, no de
          si le queda plaza.
        </p>
        <PlazaFijaYRecuperacion />
        <p>
          La plaza se ancla a un hueco —día de la semana, hora local y sala— y sus reservas se materializan solas con
          antelación. Si trabajas con mapa de puestos, puede ser incluso «su reformer», el número cuatro, el de la ventana.
        </p>
        <Limite titulo="Una recuperación no es dinero, y por eso caduca">
          Se concede como crédito con fecha de caducidad, no como sesión devuelta al bono. La diferencia es práctica: sin
          caducidad se acumulan durante años y acabas con alumnas que tienen derecho a doce clases que nadie recuerda haber
          concedido.
        </Limite>
      </Seccion>

      <Seccion id="cobro" titulo="Y todo esto, ¿cómo se cobra?">
        <p>
          Definir el plan es la mitad; la otra es que el dinero entre sin que persigas a nadie. Las cuotas se renuevan y se
          cobran solas con la tarjeta guardada, los bonos se pueden comprar desde el portal de la alumna, y todo lo que se
          cobra genera su factura.
        </p>
        <p>
          El detalle de cómo se cobra, qué pasa cuando una tarjeta falla y cómo se generan las remesas SEPA está en{' '}
          <Link href="/funcionalidades/cobros-recurrentes">cobros recurrentes</Link>. La parte fiscal, en{' '}
          <Link href="/funcionalidades/facturacion">facturación</Link>.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Monta tu catálogo como vendes de verdad"
        body="Cuotas, bonos, sueltas y plazas fijas conviviendo, con las reglas de cada una."
      />
    </FeatureShell>
  );
}
