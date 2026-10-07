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

// Tentare para estudios de YOGA (rehecha el 7-oct-2026: desde el 6-oct el
// producto se presenta para Pilates y yoga, decisión del fundador). Ya no se
// disculpa de «haber nacido para Pilates»: habla el idioma de un estudio de
// yoga —estilos, mensualidades, bonos, talleres, profesoras— con el mismo motor.
//
// ⚠️ Nada de esto es específico de yoga en el código: es el motor genérico
// (`tipos_clase`, reservas, bonos, cobros). Por eso no se promete nada «solo
// para yoga». En particular: un taller es una clase con su propio precio
// (`sesiones.precio_puntual`), que NO se vende online (se apunta en el estudio,
// lib/reservar/opciones-de-clase.ts), así que aquí no se dice que se venda desde
// la app; y la clase fija semanal va con mensualidad, no con bono.

const PATH = '/soluciones/estudio-de-yoga';
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
    q: '¿Tentare sirve para un estudio de yoga?',
    a: 'Sí. Las reservas, los bonos, las mensualidades, la lista de espera, los cobros y la app con tu marca funcionan igual para el yoga que para el Pilates: cada estilo es un tipo de clase con su nombre, su horario, su aforo y su precio.',
  },
  {
    q: '¿Sirve para un centro que combina yoga y Pilates?',
    a: 'Sí, es de lo más habitual. Cada disciplina es su propio tipo de clase, con su horario, su sala, su aforo y su precio, dentro del mismo estudio y la misma cuenta.',
  },
  {
    q: '¿Puedo tener talleres y clases semanales a la vez?',
    a: 'Sí. Las clases semanales se programan una vez como una serie, y un taller puede ser una clase con su propio precio y su propio aforo, en el mismo calendario.',
  },
  {
    q: '¿Qué pasa si una profesora no puede dar su clase?',
    a: 'Tentare busca quién puede cubrirla según su disponibilidad, la contacta con tu visto bueno y avisa a las alumnas del cambio. En el plan Estudio puede hacerlo sola, sin esperar a que lo apruebes.',
  },
  {
    q: '¿Hay funciones pensadas solo para yoga?',
    a: 'No: es la misma plataforma para yoga y Pilates. Lo que cambia es cómo la configuras tú: los nombres de tus clases, tus bonos, tus mensualidades y tus reglas de reserva.',
  },
  {
    q: '¿Cuánto cuesta Tentare para un estudio de yoga?',
    a: 'Founding Studio cuesta 29 €/mes con IVA, hasta 150 alumnas activas y con la app con tu marca; Estudio, 59 €/mes sin límite de alumnas, y Cadena, 149 €/mes para varias sedes. Sin permanencia y con 7 días de prueba sin tarjeta.',
  },
];

export default function EstudioDeYogaPage() {
  return (
    <SolucionShell path={PATH}>
      <HeroSolucion
        miga="Estudio de yoga"
        busqueda="Software para estudios de yoga"
        titular={<>Tu estudio de yoga, sin perseguir reservas ni cuotas.</>}
        entrada={<>Tus alumnas reservan desde una app con el nombre de tu estudio, los bonos y las mensualidades se cobran solos y la lista de espera llena el hueco de quien cancela. Hatha, vinyasa, yin o prenatal: cada estilo con su horario, su aforo y su precio.</>}
        foto={{
          src: '/landing/fotos-aportadas/alumna-con-movil-y-esterilla-de-yoga-864.webp',
          srcAvif: '/landing/fotos-aportadas/alumna-con-movil-y-esterilla-de-yoga-864.avif',
          alt: 'Alumna sonriendo con el móvil y una esterilla de yoga',
          ancho: 864,
          alto: 1080,
          encuadre: '50% 20%',
        }}
        avisos={[
          { etiqueta: 'Reserva · Vinyasa 19:30', estado: 'Confirmada', texto: 'Ana reservó desde la app' },
          { etiqueta: 'Mensualidad de octubre', estado: 'Cobrada', texto: 'Con su tarjeta guardada' },
        ]}
        pieFoto="Alumna con el móvil y una esterilla de yoga, con dos avisos de ejemplo de Tentare: una reserva confirmada en una clase de vinyasa y una mensualidad cobrada."
      />

      <ResumenSolucion
        pregunta="¿Qué software necesita un estudio de yoga?"
        datos={[
          { cifra: '24/7', texto: 'Reservas y cancelaciones desde el móvil, con tus reglas' },
          { cifra: '0 %', texto: 'Comisión de Tentare sobre lo que cobras' },
          { cifra: '29 €/mes', texto: 'Founding Studio, con la app con tu marca e IVA incluido' },
        ]}
      >
        Uno que te quite el trabajo de mostrador: reservas online con lista de espera, bonos y mensualidades que se
        cobran y se renuevan solos, una app con la marca de tu estudio para tus alumnas y un sitio donde ver quién viene
        y cuánto deja cada clase. Tentare hace todo eso para estudios de yoga y de Pilates, desde 29 €/mes con IVA y sin
        permanencia.
      </ResumenSolucion>

      <Situaciones
        titulo="Una semana normal en un estudio de yoga"
        items={[
          { hora: 'Domingo · 22:10', titulo: 'Reservan sin escribirte', texto: 'La alumna abre la app de tu estudio, ve la clase de vinyasa del lunes con plazas libres y reserva. Tú no contestas ningún mensaje.' },
          { hora: 'Día 1 del mes', titulo: 'Las mensualidades se cobran solas', texto: 'La cuota se cobra con la tarjeta guardada y, si una falla, Tentare vuelve a intentarlo antes de avisarte.' },
          { hora: 'Sábado', titulo: 'Un taller con su propio precio', texto: 'El taller de inversiones va en el mismo calendario que tus clases semanales, con su aforo y su precio.' },
        ]}
      />

      <FilaProducto
        eyebrow="Horario por estilos"
        titulo="Cada estilo con su horario, su aforo y sus reglas"
        captura={{ src: '/producto/calendario-semana.png', alt: 'Calendario semanal de Tentare con las clases de la semana por salas, su ocupación y las que necesitan una decisión', ancho: 2880, alto: 1624, pie: 'La semana entera, con la ocupación de cada clase.' }}
        puntos={[
          'Series semanales que programas una vez',
          'Talleres y clases especiales con su propio precio',
          'Lista de espera automática cuando una clase se llena',
        ]}
        enlace={{ href: '/funcionalidades/clases-recurrentes', texto: 'Clases recurrentes' }}
      >
        <p>Hatha, vinyasa, yin o prenatal son tipos de clase: les pones nombre, sala, aforo y precio, y cada uno puede tener sus propias reglas de reserva y cancelación. Si tu estudio también da Pilates, conviven en el mismo calendario.</p>
      </FilaProducto>

      <FilaProducto
        invertida
        eyebrow="Bonos y mensualidades"
        titulo="Clase suelta, bono y mensualidad, a la vez"
        captura={{ src: '/producto/cobros.png', alt: 'Pantalla de cobros de Tentare con lo cobrado este mes, lo pendiente y los recibos de cada alumna', ancho: 2880, alto: 1624, pie: 'Lo cobrado, lo pendiente y quién te debe, en una pantalla.' }}
        puntos={[
          'Mensualidades con o sin límite de clases a la semana',
          'Bonos con caducidad, que puedes ampliar en lote si cierras en agosto',
          'Cobro con tarjeta o domiciliación SEPA, con reintentos cuando falla',
        ]}
        enlace={{ href: '/funcionalidades/bonos-y-membresias', texto: 'Bonos y cuotas' }}
      >
        <p>Un estudio de yoga vende de todo: la clase suelta para quien viene de paso, el bono para quien viene a ratos y la mensualidad para las de siempre. En Tentare conviven en la misma alumna, cada uno con su caducidad, y se cobran sin que tengas que perseguir a nadie.</p>
      </FilaProducto>

      <TablaSolucion
        titulo="Cómo vende un estudio de yoga, y cómo se monta en Tentare"
        cabeceras={['Lo que vendes', 'Para quién', 'En Tentare']}
        filas={[
          ['Clase suelta', 'Quien viene de paso o a probar', 'Una tarifa puntual que gasta una sesión'],
          ['Bono de 10 clases', 'Quien viene a ratos', 'Bono con caducidad, de un estilo o de todos'],
          ['Mensualidad', 'Las alumnas de siempre', 'Cuota mensual con o sin límite semanal'],
          ['Clase fija semanal', 'Quien quiere su sitio de los martes', 'Plaza fija que se reserva sola, con mensualidad'],
          ['Taller', 'Un sábado con un tema propio', 'Una clase con su propio precio y aforo'],
        ]}
      />

      <FilaProducto
        eyebrow="App con tu marca"
        titulo="Tu estudio, en la pantalla de inicio de tus alumnas"
        captura={{ src: '/producto/portal-alumna.png', alt: 'App de reservas de un estudio en el móvil de una alumna, con las clases del día, las plazas libres y el botón de reservar', ancho: 920, alto: 2000, movil: true }}
        puntos={[
          'En todos los planes, también en el de 29 €',
          'Avisos de sus reservas y de la lista de espera',
          'Sin comisión de Tentare sobre lo que venden',
        ]}
        enlace={{ href: '/funcionalidades/app-para-alumnas', texto: 'Cómo es la app de tus alumnas' }}
      >
        <p>Tus alumnas instalan la app de tu estudio desde el navegador, sin pasar por ninguna tienda: tu nombre, tu icono y tus colores. Desde ahí reservan, compran su bono y ven sus próximas clases.</p>
      </FilaProducto>

      <FilaProducto
        invertida
        eyebrow="Tus alumnas"
        titulo="Saber quién viene y qué necesita"
        captura={{ src: '/producto/clientas.png', alt: 'Lista de clientas de Tentare con el plan de cada una, sus sesiones restantes y su estado', ancho: 2880, alto: 1624 }}
        puntos={[
          'Asistencia, bono e historial de cada alumna',
          'Ficha de salud con lesiones y adaptaciones, visible solo para quien debe verla',
          'Una regla, si la enciendes, que pregunta por quien lleva tiempo sin venir',
        ]}
        enlace={{ href: '/funcionalidades/ficha-de-clienta', texto: 'La ficha de cada alumna' }}
      >
        <p>En una clase prenatal o con alumnas que vienen de una lesión, saber lo que cada una necesita importa. La ficha lo reúne, y la parte de salud solo la ve quien la tiene que ver. Si una profesora no puede dar su clase, Tentare <Link href="/funcionalidades/sustituciones">busca quién la cubre</Link> y avisa a las alumnas.</p>
      </FilaProducto>

      <PlanesSolucion titulo="Lo que cuesta Tentare para un estudio de yoga" />

      <FaqSolucion titulo="Preguntas sobre Tentare para estudios de yoga" items={FAQ} />

      <CierreSolucion
        titulo="Pruébalo con tu estudio de yoga."
        texto="Monta tu horario, tus bonos y tu app en tu primera sesión. 7 días gratis, sin tarjeta y sin permanencia."
      />
    </SolucionShell>
  );
}
