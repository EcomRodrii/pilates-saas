import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CasoDeUso, CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { CadenciaDeReintentos, ViasDeCobro } from '@/components/funcionalidades/visuales/cobros';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/cobros-recurrentes';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Tentare se lleva una comisión de lo que cobro?',
    a: 'No. El dinero va de tu alumna a tu cuenta de Stripe directamente; Tentare no se interpone ni añade comisión propia. Lo único que pagas aparte es la comisión de Stripe, que es suya y la ves en su panel.',
  },
  {
    q: '¿Necesito una cuenta de Stripe?',
    a: 'Para cobrar con tarjeta, sí: se conecta desde configuración y el alta la hace Stripe. Si prefieres seguir con adeudos por banco, puedes trabajar con remesas SEPA sin pasarela, y el registro de cobros funciona igual.',
  },
  {
    q: '¿Puedo devolver un pago desde el panel?',
    a: 'Sí, total o parcial. La devolución se pide desde el panel y se confirma cuando el proveedor la ejecuta de verdad, no cuando se pulsa el botón: el recibo no cambia de estado hasta que hay confirmación.',
  },
  {
    q: '¿Qué pasa si una alumna cambia de tarjeta?',
    a: 'Sus datos de tarjeta los guarda Stripe, no Tentare, y ella los actualiza desde su portal. Además, cuando una tarjeta se acerca a su caducidad el sistema lo detecta antes de que llegue a fallar el cobro.',
  },
  {
    q: '¿Y si alguien paga en efectivo o por Bizum?',
    a: 'Se registra como cobro de mostrador y genera su factura igual. El objetivo es que el histórico refleje todo lo que entra, no solo lo que pasa por pasarela.',
  },
];

export default function CobrosPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Cobros y morosidad"
      h1={<>Cobra sin perseguir a nadie.</>}
      intro={<>La cuota se cobra sola el día que toca. Y cuando una tarjeta falla —que fallará—, el sistema lo reintenta con cabeza en vez de dejarte una lista de impagos a fin de mes.</>}
      chips={['Cobro con tarjeta guardada', 'Tres reintentos escalonados', 'Remesa SEPA 19.14']}
      visual={<ViasDeCobro />}
    >
      <Seccion id="problema" titulo="El dinero no se pierde de golpe, se pierde a goteo">
        <Entradilla>
          Casi ningún estudio tiene un problema de morosidad. Tiene un problema de fricción: cuatro tarjetas que caducaron,
          dos cuotas que nadie reclamó y un bono que se pagó en efectivo y no se apuntó.
        </Entradilla>
        <p>
          Sumado, eso es más dinero al año que cualquier subida de precios que te dé miedo hacer. Y no se arregla con
          disciplina: se arregla haciendo que cobrar no dependa de que alguien se acuerde.
        </p>
      </Seccion>

      <Seccion id="reintentos" titulo="Qué pasa exactamente cuando falla un cobro">
        <p>
          Un pago fallido no significa que la socia no quiera pagar. Significa, casi siempre, que la tarjeta caducó, que el
          banco bloqueó un cargo recurrente o que no había saldo ese día. Tratar los tres casos como un impago es la forma
          más rápida de perder una clienta que iba a seguir.
        </p>
        <CadenciaDeReintentos />
        <p>
          Cuando el recibo llega al final de la cadena sin cobrarse, deja de reintentarse y pasa a estado fallido: a partir
          de ahí es una conversación, no un proceso automático. Y esa conversación aparece en tu panel, no en tu memoria.
        </p>
        <p>
          Hay un detalle que evita un fallo silencioso: si un recibo se crea con un vencimiento ya pasado —por ejemplo al
          renovar una suscripción caducada—, la cadencia se ancla a hoy y no al vencimiento antiguo. Sin eso, los tres
          reintentos se dispararían casi seguidos en un día y la socia recibiría el «primer aviso» y el «impago definitivo»
          casi a la vez.
        </p>
      </Seccion>

      <Seccion id="antes" titulo="Adelantarse al fallo: la tarjeta que va a caducar">
        <p>
          Reintentar bien está bien. Que no haga falta reintentar está mejor. El sistema guarda la fecha de caducidad de la
          tarjeta de cada socia y la revisa por goteo, aprovechando el mismo proceso que ya repasa los cobros pendientes.
        </p>
        <Rejilla
          items={[
            { titulo: 'Se detecta antes', body: 'Una tarjeta que caduca en septiembre vale hasta el último día de septiembre — ni un día menos, ni un mes de más.' },
            { titulo: 'Se avisa a tiempo', body: 'La socia actualiza su tarjeta desde su portal antes de que el cobro llegue a fallar.' },
          ]}
        />
      </Seccion>

      <Seccion id="sepa" titulo="SEPA 19.14: la remesa para el banco de siempre">
        <p>
          Muchos estudios españoles llevan años cobrando por domiciliación bancaria y no quieren cambiar. Tentare genera el
          fichero de adeudos en formato <strong>pain.008.001.02</strong> —lo que tu banco llama cuaderno 19.14— con los
          recibos del periodo, para que lo presentes como siempre.
        </p>
        <p>
          Es una diferencia real frente al software anglosajón: la mayoría asume que todo el mundo cobra con tarjeta y no
          contempla la remesa bancaria, que aquí sigue siendo mayoritaria en cuotas mensuales.
        </p>
        <Limite titulo="La remesa es un fichero, no una pasarela">
          Generarla no cobra el dinero: lo presenta tu banco, con tus plazos y tus devoluciones. Necesitas tu identificador
          de acreedor SEPA y los mandatos firmados de tus socias. Tentare produce el fichero y guarda los mandatos; el
          circuito bancario sigue siendo tuyo.
        </Limite>
      </Seccion>

      <Seccion id="casos" titulo="Tres situaciones que se resuelven solas">
        <div style={{ margin: '24px 0 0' }}>
          <CasoDeUso hora="Día 1" titulo="Cobro del mes">
            Las cuotas del mes se cobran con la tarjeta guardada y cada una genera su{' '}
            <Link href="/funcionalidades/facturacion">factura sellada</Link>. Nadie manda un recordatorio.
          </CasoDeUso>
          <CasoDeUso hora="Día 2" titulo="Una tarjeta rechaza el cargo">
            La socia recibe un aviso amable con el enlace para actualizarla. Al día siguiente se reintenta.
          </CasoDeUso>
          <CasoDeUso hora="Día 4" titulo="El segundo intento entra">
            Cobrado. La socia no ha vuelto a saber nada y tú no has tocado nada. Es el caso más común, y es el que justifica
            no avisar en cada intento.
          </CasoDeUso>
        </div>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
        <p style={{ marginTop: 26 }}>
          Qué vendes exactamente —bonos, cuotas, plazas fijas— se configura en{' '}
          <Link href="/funcionalidades/bonos-y-membresias">bonos y membresías</Link>.
        </p>
      </Seccion>

      <CierreCta
        titulo="Que cobrar deje de ser una tarea"
        body="Conecta tu cuenta, define tus planes y deja que el cobro, el reintento y la factura ocurran sin ti."
      />
    </FeatureShell>
  );
}
