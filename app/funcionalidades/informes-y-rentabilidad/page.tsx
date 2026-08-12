import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion, Tabla } from '@/components/funcionalidades/bloques';
import { ComoSeCalculaElMargen, LoQueNoEntraEnElMargen } from '@/components/funcionalidades/visuales/informes';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/informes-y-rentabilidad';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Por qué dos alumnas de la misma clase aportan importes distintos?',
    a: 'Porque pagan de forma distinta. Una con bono de 10 por 120 € aporta 12 € por sesión; una con mensualidad de 79 € que viene dos veces por semana aporta unos 9 €, y otra con la misma mensualidad que viene una vez aporta el doble. Repartir el ingreso mensual a partes iguales entre las clases escondería exactamente eso.',
  },
  {
    q: '¿El margen incluye el alquiler del local?',
    a: 'No. Hoy no existe un coste de sala en el sistema, así que el cálculo se queda en el coste de instructora y se etiqueta como tal — nunca como «margen total». Preferimos una cifra que sabes interpretar a una completa que sea mentira a medias.',
  },
  {
    q: '¿Qué pasa si no he puesto la tarifa de una instructora?',
    a: 'El coste y el margen de sus clases aparecen como «—», no como cero. Un cero haría parecer rentabilísima una clase que simplemente no se ha medido, que es el error más caro que puede cometer un informe.',
  },
  {
    q: '¿Puede ver recepción lo que cobra cada instructora?',
    a: 'No. Recepción ve la tabla de margen por clase con el ingreso, pero no el coste ni el margen: la tarifa es dato salarial y tiene permisos más estrictos. Eso lo ven propietaria y gerencia.',
  },
  {
    q: '¿Puedo sacar los datos para mi gestoría?',
    a: 'Sí. La exportación en CSV trae todos los cobros del periodo, no una muestra, y el informe se puede guardar en PDF desde el propio navegador. Para el resumen anual de ingresos e IVA hay una función aparte, el cierre de año.',
  },
  {
    q: '¿Cada cuánto se recalcula?',
    a: 'Al abrir el informe. Nada se guarda como histórico congelado a propósito: las tarifas y los precios de los planes cambian, y un margen calculado hace ocho meses con la tarifa de entonces sería una aproximación disfrazada de dato firme.',
  },
];

export default function InformesPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Números que se pueden usar"
      h1={<>¿Qué clases te dan dinero?</>}
      intro={<>Piensas en meses porque tu software te da informes mensuales. Pero tu negocio ocurre por clases — y hay franjas que llevan un año costándote dinero sin que nadie lo haya mirado.</>}
      chips={['Margen por clase concreta', 'Ocupación por tipo', 'Retención por cohorte']}
      captura={{ src: '/producto/informes.png', alt: 'Pantalla de informes de Tentare con ingresos, evolución y ventas por tipo', pie: 'Ingresos del periodo, evolución diaria y ventas por tipo — el panel real, no una maqueta.', ancho: 2880, alto: 1624 }}
    >
      <Seccion id="problema" titulo="El mes cuadra. La clase de las 10:00 no">
        <Entradilla>
          Un informe mensual te dice que has facturado bien. Lo que no te dice es que el mat de los martes a las 10:00 lleva
          catorce semanas con tres personas, y que cada una de esas sesiones te cuesta dinero.
        </Entradilla>
        <p>
          Es el punto ciego de casi todo el software de gestión: agrega por periodo porque es lo fácil, y la unidad
          económica real de un estudio de Pilates no es el mes — es <strong>la clase</strong>. Una sala, una hora, una
          instructora pagada y entre tres y diez personas que han llegado ahí por caminos de pago distintos.
        </p>
        <p>
          Y hasta que no separas esa unidad, las decisiones se toman a ojo: se sube el precio general en vez de mover una
          franja, o se quita la clase equivocada porque «esa parece que va floja».
        </p>
      </Seccion>

      <Seccion id="margen" titulo="Cómo se calcula el margen de una clase">
        <p>
          Aquí está el detalle que hace que la cifra sirva. El ingreso de una clase <strong>no</strong> es el precio de la
          clase por el número de asistentes: cada persona aporta lo que de verdad está pagando por estar ahí, según su
          plan.
        </p>
        <ComoSeCalculaElMargen />
        <Tabla
          cabeceras={['Cómo paga', 'Lo que aporta a esa clase']}
          filas={[
            ['Bono de sesiones', 'Precio del bono dividido entre sus sesiones'],
            ['Cuota mensual', 'Precio mensual repartido según las veces que viene de verdad al mes'],
            ['Clase suelta', 'El precio de la clase suelta'],
            ['Sin plan que cubra esa clase', 'El precio puntual de la sesión, si lo tiene'],
          ]}
        />
        <p>
          El reparto de la cuota mensual es la parte interesante. Una alumna de mensualidad que viene cuatro veces al mes
          aporta el doble por clase que otra, con la misma cuota, que viene ocho. Es la razón por la que las clases más
          llenas de un estudio no siempre son las más rentables.
        </p>
        <p>
          Al otro lado está el coste: la <Link href="/funcionalidades/gestion-de-instructoras">tarifa por hora</Link> de
          quien dio esa clase, multiplicada por su duración real. No una media del equipo.
        </p>
      </Seccion>

      <Seccion id="limites" titulo="Y lo que la cifra no incluye">
        <p>
          Un informe de rentabilidad que no dice dónde termina es peor que no tenerlo, porque invita a decisiones caras.
          Estos cuatro huecos están escritos dentro del propio cálculo, no en una nota al pie:
        </p>
        <LoQueNoEntraEnElMargen />
        <Limite titulo="Se llama «margen sobre coste de instructora» en todas partes">
          Y no «margen» a secas ni «beneficio». Mientras no exista un coste de sala en el sistema, ampliar el nombre sería
          prometer una foto completa que no es. La cifra sirve para comparar clases entre sí y detectar las que están por
          debajo del punto de equilibrio — no para calcular tu beneficio real.
        </Limite>
      </Seccion>

      <Seccion id="informes" titulo="El resto del informe">
        <p>
          Alrededor del margen hay lo que se mira cada semana, con cuatro periodos: semana, mes, últimos tres meses y año.
        </p>
        <Rejilla
          columnas={2}
          items={[
            { titulo: 'Ingresos del periodo', body: 'Total cobrado, número de cobros y cuántas alumnas distintas han pagado, con la evolución por día.' },
            { titulo: 'Ventas por tipo', body: 'Planes, bonos, clases sueltas y otros — con la variación frente al periodo anterior de igual duración.' },
            { titulo: 'Ocupación por tipo de clase', body: 'Plazas ocupadas sobre aforo. Donde se ven las franjas que salen medio vacías todas las semanas.' },
            { titulo: 'Retención por cohorte', body: 'Qué porcentaje de las que entraron cada mes sigue viniendo. La métrica que anticipa el problema antes de que se vea en la caja.' },
            { titulo: 'Estado de tus clientas', body: 'Cuántas activas, cuántas con bono en curso y cuántas llevan más de 30 días sin aparecer.' },
            { titulo: 'Margen por clase', body: 'La tabla completa del periodo, ordenada por peor margen primero — que es por donde querrías empezar a mirar.' },
          ]}
        />
        <p>
          Cuando la variación no se puede calcular porque el periodo anterior estaba a cero, se dice «sin datos previos» en
          vez de enseñar un cien por cien que no significa nada.
        </p>
      </Seccion>

      <Seccion id="permisos" titulo="Quién ve cada cifra">
        <p>
          El informe no es un bloque único con un interruptor. Hay dos niveles, porque hay dos tipos de dato:
        </p>
        <Tabla
          cabeceras={['', 'Ingresos y ocupación', 'Coste y margen por clase']}
          filas={[
            ['Propietaria', 'Sí', 'Sí'],
            ['Gerencia', 'Sí', 'Sí'],
            ['Recepción', 'Sí', 'No — solo el ingreso'],
            ['Instructora', 'No', 'No'],
          ]}
        />
        <p>
          La distinción está en que el coste sale de la tarifa de una compañera. Recepción gestiona cobros y por eso ve
          ingresos, pero no tiene por qué poder deducir lo que cobra cada instructora.
        </p>
      </Seccion>

      <Seccion id="exportar" titulo="Sacar los datos">
        <p>
          Dos vías, pensadas para lo que se hace de verdad con esto: <strong>CSV</strong> con todos los cobros del periodo
          —todos, paginando en el servidor, no los primeros mil— para trabajarlo en una hoja de cálculo o mandárselo a tu
          asesoría, y <strong>PDF</strong> guardando el informe desde el propio navegador.
        </p>
        <p>
          Si lo que necesitas es el resumen anual de ingresos e IVA para la gestoría, eso vive en el cierre de año, dentro
          de <Link href="/funcionalidades/facturacion">facturación</Link>.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
        <p style={{ marginTop: 26 }}>
          Si lo que buscas es qué hacer con una franja que va floja, la guía{' '}
          <Link href="/recursos/ocupacion-clases-valle">cómo subir la ocupación de tus clases valle</Link> entra en las
          tácticas concretas.
        </p>
      </Seccion>

      <CierreCta
        titulo="Deja de decidir a ojo"
        body="Pon las tarifas de tu equipo y mira la tabla de margen ordenada por la peor. Las dos o tres primeras suelen sorprender."
      />
    </FeatureShell>
  );
}
