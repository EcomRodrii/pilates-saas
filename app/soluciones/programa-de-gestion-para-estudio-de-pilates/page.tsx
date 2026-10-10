import type { Metadata } from 'next';
import Link from 'next/link';
import {
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
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// Página de la búsqueda «programa de gestión para un estudio de pilates en
// España» (11-oct-2026, auditoría SEO): la que no tenía ninguna página propia.
// La home responde a «software para estudios de Pilates»; esta, a quien busca el
// PROGRAMA que lleva el negocio entero y quiere saber qué debe incluir.
//
// ⚠️ Cada afirmación sale de lo que ya dice el producto y sus páginas:
// /funcionalidades/*, /precios y public/llms.txt. En particular, de la
// facturación solo se promete la numeración legal y la huella encadenada; el
// registro y el envío a la AEAT (Veri*Factu) van aparte y se activan por estudio.
// Sin cifras de clientes ni testimonios: no los hay.

const PATH = '/soluciones/programa-de-gestion-para-estudio-de-pilates';
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
    q: '¿Qué es un programa de gestión para un estudio de Pilates?',
    a: 'Es el software con el que se lleva el estudio entero: el calendario de clases y salas, las reservas de las alumnas, los bonos y las cuotas, los cobros, las facturas y el equipo de instructoras. La diferencia con una agenda de citas es que entiende el aforo por sala o por reformer, las listas de espera y los bonos de sesiones.',
  },
  {
    q: '¿Cuánto cuesta un programa de gestión para un estudio de Pilates en España?',
    a: 'Tentare tiene tres planes públicos con IVA incluido y sin permanencia: Founding Studio a 29 €/mes (una sala, una o dos instructoras, hasta 150 alumnas activas y la app con tu marca), Estudio a 59 €/mes y Cadena a 149 €/mes. La prueba dura 7 días del plan que elijas y no pide tarjeta.',
  },
  {
    q: '¿Sirve para cobrar y facturar en España?',
    a: 'Sí. Cobra con tarjeta o domiciliación SEPA a través de tu cuenta de Stripe, sin comisión de Tentare, y reintenta solo los cobros que fallan. Las facturas salen con numeración legal y huella encadenada. El registro y el envío a la AEAT (Veri*Factu) se configuran aparte, por estudio: en la página de facturación está el detalle de en qué punto está.',
  },
  {
    q: '¿Mis alumnas tienen que descargarse una app?',
    a: 'No hace falta. Reservan desde el navegador del móvil con el enlace de tu estudio, y si quieren la añaden a su pantalla de inicio y se comporta como una app, con tu nombre, tu icono y tus colores.',
  },
  {
    q: '¿Puedo pasar mis datos desde otro programa?',
    a: 'Sí. El importador reconoce las exportaciones de bsport, Momence, Eversports, Mindbody, TIMP y Excel; te enseña lo que va a traer antes de guardarlo y puedes deshacerlo con un botón. La migración no se cobra aparte.',
  },
  {
    q: '¿Sirve también para un estudio de yoga o uno que combine las dos cosas?',
    a: 'Sí. Cada disciplina es su propio tipo de clase, con su horario, su sala, su aforo, su precio y sus reglas de reserva, dentro del mismo estudio.',
  },
];

export default function ProgramaDeGestionPage() {
  return (
    <SolucionShell path={PATH}>
      <HeroSolucion
        miga="Programa de gestión"
        busqueda="Programa de gestión para un estudio de Pilates en España"
        titular={<>El programa que lleva tu estudio entero, no solo las reservas.</>}
        entrada={<>Calendario con salas, reservas de las alumnas, bonos y cuotas, cobros, facturas y sustituciones de instructoras, en un solo panel y en español. Para estudios de Pilates en España.</>}
        foto={{
          src: '/landing/fotos/sala-pilates-espejos-arco-anoche-movil-1170.webp',
          srcAvif: '/landing/fotos/sala-pilates-espejos-arco-anoche-movil-1170.avif',
          alt: 'Sala de un estudio de Pilates con espejos y un arco iluminado por la noche',
          ancho: 1170,
          alto: 1463,
        }}
        avisos={[
          { etiqueta: 'Reserva · Sala 1', estado: 'Confirmada', texto: 'Lucía reservó el jueves a las 10:00' },
          { etiqueta: 'Cuota mensual', estado: 'Cobrada', texto: 'Carmen · tarjeta guardada' },
        ]}
        pieFoto="Sala de un estudio de Pilates con dos avisos de ejemplo de Tentare: una reserva confirmada en la sala 1 y una cuota mensual cobrada con tarjeta guardada."
      />

      <ResumenSolucion
        pregunta="¿Qué debe hacer un programa de gestión para un estudio de Pilates en España?"
        datos={[
          { cifra: '29 €/mes', texto: 'Tentare Founding Studio, IVA incluido y sin permanencia' },
          { cifra: '7 días', texto: 'De prueba del plan que elijas, sin tarjeta' },
          { cifra: 'UE', texto: 'Datos alojados en la Unión Europea, con soporte en español' },
        ]}
      >
        Cuatro cosas en un mismo sitio: el calendario con sus salas y su aforo, las reservas de las alumnas con lista de
        espera y bonos, los cobros con tarjeta o domiciliación SEPA con facturas de numeración legal, y el equipo de
        instructoras con sus sustituciones. Un programa que solo reserva te deja el resto en hojas de cálculo; uno que
        sirve para cualquier negocio de citas no entiende un bono de sesiones ni un reformer. Tentare está hecho para
        estudios de Pilates y yoga en España, desde 29 €/mes con IVA y sin permanencia.
      </ResumenSolucion>

      <Situaciones
        titulo="Lo que hace el programa en un día normal del estudio"
        items={[
          { hora: 'Lunes · 7:30', titulo: 'Las alumnas reservan solas', texto: 'Desde el móvil, con el enlace de tu estudio. El aforo de la sala se respeta solo y la clase llena abre una lista de espera.' },
          { hora: 'Miércoles · 9:00', titulo: 'Una instructora no puede venir', texto: 'Tentare busca quién puede cubrirla según su disponibilidad, la contacta con tu visto bueno y avisa a las alumnas del cambio.' },
          { hora: 'Día 1 · 8:00', titulo: 'Se cobra la cuota del mes', texto: 'Se cobra con la tarjeta guardada o por domiciliación SEPA, y si un cobro falla se reintenta solo en vez de dejarte una lista de impagos.' },
        ]}
      />

      <FilaProducto
        eyebrow="Calendario y reservas"
        titulo="El calendario, las salas y las reservas en un mismo sitio"
        captura={{ src: '/producto/calendario-dia.png', alt: 'Calendario de Tentare en vista de día, con las salas en columnas, sus plazas y la ocupación del día', ancho: 2880, alto: 1624, pie: 'Un día por salas. Cada bloque lleva su aforo y quien la da.' }}
        puntos={[
          'Series de clases recurrentes y varias salas, cada una con su aforo',
          'Reservas y cancelaciones desde el móvil, con las reglas que pongas por tipo de clase',
          'Lista de espera que ofrece sola la plaza que se libera',
        ]}
        enlace={{ href: '/funcionalidades/reservas-online', texto: 'Reservas y pagos online' }}
      >
        <p>Es lo primero que se nota: dejas de contestar mensajes para reservar y cancelar. Las <Link href="/funcionalidades/plazas-fijas">plazas fijas</Link> reservan solas cada semana el sitio de tus alumnas de siempre.</p>
      </FilaProducto>

      <FilaProducto
        invertida
        eyebrow="Bonos, cuotas y cobros"
        titulo="Cobros que no dependen de que alguien se acuerde"
        captura={{ src: '/producto/cobros.png', alt: 'Pantalla de cobros de Tentare con lo cobrado, lo pendiente y quién debe', ancho: 2880, alto: 1624, pie: 'Lo cobrado este mes, lo que falta y quién lo debe, en la misma pantalla.' }}
        puntos={[
          'Bonos de sesiones con caducidad y cuotas mensuales con renovación automática',
          'Cobro con tarjeta o domiciliación SEPA, directo a tu cuenta de Stripe',
          'Tentare no añade comisión sobre lo que cobras',
        ]}
        enlace={{ href: '/funcionalidades/cobros-recurrentes', texto: 'Cobros automáticos y SEPA' }}
      >
        <p>Los <Link href="/funcionalidades/bonos-y-membresias">bonos y las cuotas</Link> pueden ser de un tipo de clase concreto, así que el reformer y el mat tienen cada uno su precio. Las facturas se pueden emitir automáticamente, con <Link href="/funcionalidades/facturacion">numeración legal y huella encadenada</Link>.</p>
      </FilaProducto>

      <FilaProducto
        eyebrow="Equipo e informes"
        titulo="Instructoras, sustituciones y números del estudio"
        captura={{ src: '/producto/informes.png', alt: 'Informes de Tentare con los ingresos del periodo, el ticket medio, la retención y la evolución de ingresos por día', ancho: 2880, alto: 1624 }}
        puntos={[
          'Disponibilidad, vacaciones y tarifa por hora de cada instructora',
          'Ocupación por tipo de clase y retención de tus alumnas',
          'Sustituciones con tu visto bueno, o solas en el plan Estudio',
        ]}
        enlace={{ href: '/funcionalidades/gestion-de-instructoras', texto: 'Gestión de instructoras' }}
      >
        <p>El informe te dice qué clases te dan dinero y cuáles no, con el coste real de la instructora que las da. Así decides qué franjas merece la pena mantener.</p>
      </FilaProducto>

      <TablaSolucion
        titulo="Qué mirar al elegir un programa para tu estudio"
        intro={<p>Diez minutos con esta lista evitan el error más caro: contratar algo pensado para otro tipo de negocio. Hay una versión más larga en la <Link href="/recursos/checklist-elegir-software-estudio">checklist para elegir software</Link>.</p>}
        cabeceras={['Qué comprobar', 'Por qué importa', 'En Tentare']}
        filas={[
          ['Aforo por sala o por reformer', 'Un estudio vende plazas, no citas sueltas', 'Aforo propio por sala y plazas por reformer'],
          ['Bonos, cuotas y lista de espera', 'Es como se vende y se llena una clase', 'Los tres, con reglas por tipo de clase'],
          ['Cobro con tarjeta y SEPA', 'La mayoría de cuotas se cobran así en España', 'Ambos, sin comisión de Tentare'],
          ['Facturas con numeración legal', 'Se exige a quien emite facturas', 'Numeración legal y huella encadenada'],
          ['Sustitución de instructoras', 'Una baja no debería cancelar la clase', 'Propone candidatas, contacta y avisa'],
          ['Precio público y permanencia', 'Para comparar sin pedir demo', 'Desde 29 €/mes con IVA, sin permanencia'],
          ['Importar tus datos', 'Cambiar de programa no debe costar el histórico', 'Importador con acta y botón de deshacer'],
        ]}
      />

      <PlanesSolucion titulo="Lo que cuesta el programa" />

      <FaqSolucion titulo="Preguntas sobre el programa de gestión" items={FAQ} />

      <CierreSolucion
        titulo="Tu estudio, funcionando solo."
        texto="Monta tu horario y tu página de reservas en tu primera sesión. 7 días gratis, sin tarjeta y sin permanencia."
      />
    </SolucionShell>
  );
}
