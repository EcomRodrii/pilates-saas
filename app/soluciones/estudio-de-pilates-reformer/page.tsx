import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BandaOscura,
  CierreSolucion,
  FaqSolucion,
  FilaProducto,
  HeroSolucion,
  PlanesSolucion,
  ResumenSolucion,
  Situaciones,
  SolucionShell,
  TablaSolucion,
} from '@/components/soluciones/LandingSolucion';
import { CalculadoraPlazasVacias } from '@/components/soluciones/CalculadoraPlazasVacias';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// Página pilar del estudio de Pilates REFORMER (fase 5 del rediseño, 23-sep;
// rehecha el 7-oct-2026 como página de producto, no como artículo).
//
// No compite con la home —que se queda la búsqueda genérica «software para
// estudios de Pilates»—: responde a quien busca cómo gestionar un estudio de
// máquinas, donde lo que se vende es un reformer a una hora.
//
// ⚠️ Cada frase está cruzada con el código (registro de afirmaciones de la
// fase 1 del rediseño y páginas de funcionalidad). En particular: elegir
// reformer funciona cuando la sala tiene sus puestos definidos; la plaza fija la
// PIDE la alumna y el estudio la aprueba; la penalización por cancelación tardía
// o no-show es opcional y exige tarjeta guardada y consentimiento; los bonos
// online, Stripe conectado. La calculadora NO promete cuántas plazas recupera
// Tentare: solo pone precio a las que se quedan vacías. No prometer más de lo que hay.

const PATH = '/soluciones/estudio-de-pilates-reformer';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    title: pagina.titulo,
    description: pagina.descripcion,
    url: urlDe(PATH),
  },
};

const FAQ = [
  {
    q: '¿Puedo limitar cada clase al número de reformers de la sala?',
    a: 'Sí. Cada sala tiene su capacidad y cada clase respeta ese aforo. Si además defines los puestos de la sala, la alumna ve qué reformers quedan libres al reservar y elige el suyo, como en el cine. Si no los defines, funciona con el aforo de la sala.',
  },
  {
    q: '¿Puedo cobrar distinto el reformer y el mat?',
    a: 'Sí. Los bonos y las cuotas pueden ser de un tipo de clase concreto, así que el reformer y el mat tienen cada uno su precio. Una alumna puede tener a la vez un bono de reformer y una cuota de mat. Para venderlos online hace falta conectar tu cuenta de Stripe; también puedes apuntar pagos en efectivo o por transferencia.',
  },
  {
    q: '¿Cómo funcionan las plazas fijas?',
    a: 'La alumna pide desde la app su hueco de cada semana (por ejemplo, el reformer de los martes a las 19:00) y tú lo apruebas. A partir de ahí se le reserva sola cada semana, y desde el panel puedes pausarla o quitarla.',
  },
  {
    q: '¿Qué pasa con una plaza cuando alguien cancela?',
    a: 'Si hay lista de espera, la plaza pasa sola a la primera de la cola, al instante o con el plazo que tú decidas para que la acepte. Y si quieres, puedes activar una penalización por cancelación tardía o por no presentarse, que se cobra a la tarjeta guardada de la alumna con su consentimiento.',
  },
  {
    q: '¿Y si mi estudio combina reformer con mat o con yoga?',
    a: 'Es lo más habitual. Cada disciplina es su propio tipo de clase, con su horario, su sala, su aforo y su precio, dentro del mismo estudio.',
  },
  {
    q: '¿Mis alumnas tienen que descargarse una app?',
    a: 'No hace falta. Reservan desde el navegador del móvil con el enlace de tu estudio. Si quieren, lo añaden a su pantalla de inicio y se comporta como una app, con tu nombre, tu icono y tus colores.',
  },
  {
    q: '¿Puedo cambiarme a Tentare desde otro programa?',
    a: 'Sí. El importador reconoce las exportaciones de bsport, Momence, Eversports, Mindbody, TIMP y Excel: te enseña lo que va a traer antes de guardarlo y lo puedes deshacer con un botón. Si prefieres, lo hacemos nosotros.',
  },
];

export default function EstudioDePilatesReformerPage() {
  return (
    <SolucionShell path={PATH}>
      <HeroSolucion
        miga="Pilates reformer"
        busqueda="Software para estudios de Pilates reformer"
        titular={<>Vendes reformers a una hora. Tentare los gestiona así.</>}
        entrada={<>Cada sala con su aforo, cada máquina con su plaza, las alumnas de siempre con su sitio fijo y una lista de espera que ofrece sola la plaza que se libera. Para estudios de Pilates reformer en España.</>}
        foto={{
          src: '/landing/fotos/reformers-madera-tapizado-negro-plazas-movil-1170.webp',
          srcAvif: '/landing/fotos/reformers-madera-tapizado-negro-plazas-movil-1170.avif',
          alt: 'Fila de reformers con tapizado negro delante de una pared crema con columnas iluminadas',
          ancho: 1170,
          alto: 1463,
        }}
        avisos={[
          { etiqueta: 'Reserva · Reformer 4', estado: 'Confirmada', texto: 'Lucía reservó el martes a las 19:00' },
          { etiqueta: 'Lista de espera', estado: 'Plaza ocupada', texto: 'Carmen entra en el Reformer 2' },
        ]}
        pieFoto="Sala de reformers con dos avisos de ejemplo de Tentare: una reserva confirmada en el reformer 4 y una plaza de la lista de espera ocupada."
      />

      <ResumenSolucion
        pregunta="¿Qué software necesita un estudio de Pilates reformer?"
        datos={[
          { cifra: '25 €', texto: 'Precio mediano de una clase suelta de reformer en 32 estudios españoles' },
          { cifra: '18,75 €', texto: 'Lo que sale cada sesión con una cuota de una clase a la semana' },
          { cifra: '29 €/mes', texto: 'Tentare Founding Studio, IVA incluido y sin permanencia' },
        ]}
      >
        Uno que trate cada reformer como una plaza: que la alumna reserve su máquina desde el móvil, que el aforo de
        cada sala se respete solo, que la plaza que se libera pase a la lista de espera sin escribir un WhatsApp y que
        el reformer y el mat puedan tener reglas y precios distintos. Tentare hace todo eso, junto con los cobros, los
        bonos y las sustituciones de instructoras, desde 29 €/mes con IVA y sin permanencia.
      </ResumenSolucion>

      <Situaciones
        titulo="Tres momentos que se repiten en cualquier estudio de reformer"
        items={[
          { hora: 'Martes · 18:40', titulo: 'Una cancelación a última hora', texto: 'Una alumna cancela su reformer de las 19:00. La plaza pasa a la primera de la lista de espera, que recibe el aviso en el móvil. Tú no haces nada.' },
          { hora: 'Lunes · 9:00', titulo: 'El reformer 6 no funciona', texto: 'Lo marcas como averiado y la capacidad de esa clase baja sola: nadie puede reservar una máquina que no está.' },
          { hora: 'Septiembre', titulo: 'Las de siempre vuelven', texto: 'Cada alumna con plaza fija tiene su reformer de los martes reservado cada semana, sin pedirlo cada vez.' },
        ]}
      />

      <FilaProducto
        eyebrow="Reservas por máquina"
        titulo="Reservas por reformer y aforo por sala"
        captura={{ src: '/producto/calendario-dia.png', alt: 'Calendario de Tentare en vista de día, con la sala de reformer y la de mat en columnas, sus plazas y la ocupación del día', ancho: 2880, alto: 1624, pie: 'Un día por salas: cada clase con sus plazas y la ocupación del día arriba.' }}
        puntos={[
          'La ocupación del día, sala por sala, en el propio calendario',
          'Reglas distintas para el reformer y para el mat',
          'Dos alumnas nunca se quedan la misma plaza: el aforo se comprueba al reservar, con bloqueo',
        ]}
        enlace={{ href: '/funcionalidades/calendario-y-salas', texto: 'Cómo funcionan el calendario y las salas' }}
      >
        <p>En Tentare el aforo no es un número que escribes en cada clase: sale de la sala. Si defines los puestos, la alumna ve qué reformers quedan libres al reservar y elige el suyo; si no, reserva por aforo.</p>
        <p>Cada tipo de clase tiene sus reglas: con cuánta antelación se reserva, hasta cuándo se cancela, si exige bono y si admite lista de espera.</p>
      </FilaProducto>

      <FilaProducto
        invertida
        eyebrow="Lista de espera"
        titulo="La plaza que se libera no se pierde"
        captura={{ src: '/producto/portal-alumna.png', alt: 'App de reservas de un estudio en el móvil de una alumna, con las clases del día, las plazas libres y el botón de reservar', ancho: 920, alto: 2000, movil: true }}
        puntos={[
          'Avisos en el móvil de la alumna, desde la app con tu marca',
          'Plazo para aceptar la plaza, si lo quieres, por tipo de clase',
          'Penalización opcional por cancelar tarde o no venir, con tarjeta guardada y consentimiento',
        ]}
        enlace={{ href: '/funcionalidades/lista-de-espera', texto: 'Cómo funciona la lista de espera' }}
      >
        <p>Cuando alguien cancela, la plaza pasa sola a la primera de la cola: al instante o con un plazo para aceptarla que eliges tú. Si no la acepta a tiempo, se ofrece a la siguiente.</p>
      </FilaProducto>

      <FilaProducto
        eyebrow="Bonos, cuotas y plazas fijas"
        titulo="El reformer y el mat, cada uno con su precio"
        captura={{ src: '/producto/clientas.png', alt: 'Lista de clientas de Tentare con el plan de cada una, sus sesiones restantes y su estado', ancho: 2880, alto: 1624, pie: 'Cada alumna con su plan, sus sesiones y su última visita.' }}
        puntos={[
          'Bonos con caducidad y recuperaciones',
          'Cuotas mensuales, con o sin límite de clases a la semana',
          'Cobro automático con tarjeta o domiciliación SEPA',
        ]}
        enlace={{ href: '/funcionalidades/bonos-y-membresias', texto: 'Bonos y cuotas' }}
      >
        <p>Los bonos y las cuotas pueden ser de un tipo de clase concreto, así que un bono de reformer y una cuota de mat conviven en la misma alumna. Las <Link href="/funcionalidades/plazas-fijas">plazas fijas</Link> reservan solas el sitio semanal de quien viene siempre, y se pausan cuando se va de vacaciones.</p>
      </FilaProducto>

      <BandaOscura
        eyebrow="Calculadora"
        titulo="¿Cuánto te cuestan las plazas de reformer vacías?"
        lado={<CalculadoraPlazasVacias />}
      >
        <p>Un reformer que sale a la venta y no se reserva no vuelve: la clase de las 19:00 de este martes no se puede vender el miércoles. Pon los números de tu estudio y mira cuánto vale lo que se queda sin vender cada mes.</p>
        <p>El precio de partida, 18,75 €, es la mediana de una sesión de reformer con cuota de una clase semanal en nuestro <Link href="/recursos/precio-clase-de-pilates">estudio de precios de 32 estudios españoles</Link>. Para las cuentas completas, con costes, usa la <Link href="/recursos/rentabilidad-estudio-de-pilates">calculadora de rentabilidad</Link>.</p>
      </BandaOscura>

      <TablaSolucion
        titulo="Reformer y mat en el mismo estudio, con reglas distintas"
        intro={<p>Cada tipo de clase puede cambiar las reglas del estudio; lo que no cambias, lo hereda. Así lo configuraría un estudio que tiene las dos:</p>}
        cabeceras={['Regla', 'Reformer (ejemplo)', 'Mat (ejemplo)']}
        filas={[
          ['Cancelar sin perder la sesión', 'Hasta 24 h antes', 'Hasta 2 h antes'],
          ['Reservar con antelación', 'Hasta 14 días', 'Hasta 7 días'],
          ['Exige bono o cuota', 'Sí', 'No: admite clase suelta'],
          ['Lista de espera', 'Con 30 minutos para aceptar', 'Plaza al instante'],
          ['Mínimo para dar la clase', '3 alumnas', 'Sin mínimo'],
        ]}
      />

      <FilaProducto
        eyebrow="Ocupación y rentabilidad"
        titulo="Qué clases te dan dinero, clase por clase"
        captura={{ src: '/producto/informes.png', alt: 'Informes de Tentare con los ingresos del periodo, el ticket medio, la retención y la evolución de ingresos por día', ancho: 2880, alto: 1624 }}
        puntos={[
          'Ocupación por tipo de clase',
          'Retención de tus alumnas mes a mes',
          'El margen de cada clase, con la tarifa real de la instructora',
        ]}
        enlace={{ href: '/funcionalidades/informes-y-rentabilidad', texto: 'Informes y rentabilidad' }}
      >
        <p>El informe cruza lo que pagó cada asistente con la tarifa de la instructora que dio la clase y te dice cuánto deja cada una. Así sabes qué franjas merece la pena abrir y cuáles no.</p>
      </FilaProducto>

      <FilaProducto
        invertida
        eyebrow="Instructoras"
        titulo="Si una instructora no puede, la clase no se cae"
        captura={{ src: '/landing/fotos-aportadas/instructora-y-alumna-reformers-estudio-pilates.webp', alt: 'Una instructora y una alumna charlando sobre sus reformers en un estudio de Pilates con cortinas de luz', ancho: 434, alto: 600, foto: true }}
        enlace={{ href: '/funcionalidades/sustituciones', texto: 'Cómo funcionan las sustituciones' }}
      >
        <p>Tentare busca quién puede cubrirla según su disponibilidad y su costumbre, la contacta con tu visto bueno y avisa a las alumnas del cambio. En el plan Estudio puede hacerlo sola, sin esperar a que lo apruebes.</p>
      </FilaProducto>

      <PlanesSolucion titulo="Lo que cuesta Tentare para un estudio de reformer" />

      <FaqSolucion titulo="Preguntas sobre Tentare para estudios de reformer" items={FAQ} />

      <CierreSolucion
        titulo="Tu estudio de reformer, funcionando solo."
        texto="Monta tu horario y tu página de reservas en tu primera sesión. 7 días gratis, sin tarjeta y sin permanencia."
      />
    </SolucionShell>
  );
}
