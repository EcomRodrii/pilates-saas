import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { CicloDeReserva, ReglasQueSeHeredan } from '@/components/funcionalidades/visuales/reservas';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/reservas-online';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Mis alumnas tienen que instalarse una app?',
    a: 'No. Reservan desde el navegador del móvil con el enlace de tu estudio. Si quieren, pueden añadirlo a su pantalla de inicio y se comporta como una app, con notificaciones incluidas — pero no es un requisito para reservar.',
  },
  {
    q: '¿Puedo poner reglas distintas para el reformer y para el mat?',
    a: 'Sí, esa es exactamente la idea. Cada tipo de clase puede sobrescribir las reglas del estudio: antelación, cancelación, si exige bono, si admite lista de espera, si necesita aprobación. Lo que no sobrescribes, lo hereda.',
  },
  {
    q: '¿Se puede reservar sin bono?',
    a: 'Depende de cómo lo configures. Puedes exigir bono o plan activo en general y dejar una excepción para la clase de prueba, o al revés. La regla se aplica al reservar, no al llegar a la sala.',
  },
  {
    q: '¿Qué pasa si dos alumnas reservan la última plaza a la vez?',
    a: 'Entra una sola. La comprobación de aforo y la ocupación de la plaza se hacen en la misma operación en base de datos, con bloqueo, así que no hay ventana entre comprobar y reservar. La segunda ve que ya no hay hueco.',
  },
  {
    q: '¿Puedo revisar las reservas antes de aceptarlas?',
    a: 'Sí, activando la aprobación manual. La reserva entra pendiente y no ocupa plaza ni consume bono hasta que la apruebas; al aprobarla se vuelve a comprobar el aforo en ese momento, porque puede haber cambiado.',
  },
];

export default function ReservasPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Reservas de alumnas"
      h1={<>Reservan solas, a las siete de la mañana.</>}
      intro={<>Tus alumnas reservan y cancelan desde el móvil sin escribirte. Y las reglas de tu estudio —qué se puede reservar, cuándo y con qué— se aplican solas, clase por clase.</>}
      chips={['Sin instalar nada', 'Reglas por tipo de clase', 'Aforo a prueba de carreras']}
      captura={{ src: '/producto/calendario-dia.png', alt: 'Vista de día del calendario de Tentare, con las salas en columnas', pie: 'Un día por salas. Cada bloque lleva su aforo y quien la da.', ancho: 2880, alto: 1624 }}
    >
      <Seccion id="problema" titulo="El coste real de reservar por WhatsApp">
        <Entradilla>
          Un estudio de sesenta alumnas genera unos cuantos mensajes al día solo para reservar y cancelar. Ninguno es
          difícil. Todos interrumpen.
        </Entradilla>
        <p>
          Y lo caro no son los mensajes: es que la información vive en una conversación. Nadie sabe cuántas plazas quedan sin
          contar cabezas hacia atrás, dos personas pueden quedarse con la misma plaza, y si una alumna cancela a las once de
          la noche esa plaza no se recupera hasta que alguien lo lee por la mañana.
        </p>
        <p>
          Una página de reservas propia resuelve las tres cosas de golpe, pero solo si sabe aplicar <em>tus</em> reglas. Un
          formulario que acepta cualquier reserva a cualquier hora crea más trabajo del que quita.
        </p>
      </Seccion>

      <Seccion id="reglas" titulo="Tus reglas, y las excepciones a tus reglas">
        <p>
          Casi todo el software de reservas te deja configurar la política del centro. El problema aparece cuando el
          reformer y el mat no pueden tener la misma: uno se cancela con 24 horas porque encontrar quien lo cubra cuesta, y
          el otro admite gente a última hora sin drama.
        </p>
        <ReglasQueSeHeredan />
        <p>
          Siete reglas, dos niveles. Configuras el estudio una vez y escribes solo las excepciones. Que el valor vacío
          signifique «hereda» y no «desactivado» es importante: sin esa distinción, cada vez que cambias la política general
          tendrías que repasar todos los tipos de clase.
        </p>
      </Seccion>

      <Seccion id="pagina" titulo="La página que ven tus alumnas">
        <Rejilla
          columnas={2}
          items={[
            { titulo: 'Lista, semana o día', body: 'Tres vistas de la misma agenda. En el móvil casi todo el mundo usa la de semana.' },
            { titulo: 'Filtros que se usan', body: 'Por tipo de clase, instructora, nivel y franja horaria. Buscar «reformer de tarde con Marta» no debería ser scroll.' },
            { titulo: 'Tu marca, no la nuestra', body: 'Colores, tipografía, logo y hasta el icono del navegador son de tu estudio.' },
            { titulo: 'Compra si le falta bono', body: 'Si no tiene sesiones, puede comprar ahí mismo y reservar sin salir.' },
          ]}
        />
        <p>
          Esa página es la cara pública de tu estudio y forma parte de la{' '}
          <Link href="/funcionalidades/app-para-alumnas">app de marca</Link>: sus reservas, sus bonos y su progreso viven
          en el mismo sitio, con tus colores y tu logo.
        </p>
        <Limite titulo="Esa página no la indexamos en buscadores">
          Es una decisión deliberada: la página de reservas de tu estudio funciona con normalidad y puedes compartirla donde
          quieras, pero no la abrimos a los buscadores. Si tu prioridad es aparecer en Google por búsquedas locales, eso lo
          resuelve tu ficha de negocio y tu propia web, no esta página.
        </Limite>
      </Seccion>

      <Seccion id="llenas" titulo="Cuando la clase está llena — y cuando se vacía">
        <CicloDeReserva />
        <p>
          Una clase completa no es el final del camino: es donde se decide si esa plaza se recupera cuando alguien cancela.
          Eso lo lleva la <Link href="/funcionalidades/lista-de-espera">lista de espera</Link>, que puede promocionar al
          instante o dar un plazo para aceptar.
        </p>
        <p>
          Y al otro lado está qué pasa cuando alguien se cae: si recupera su sesión, si la plaza se libera igualmente y si
          quieres cobrar por una cancelación a última hora. Eso tiene su propia página en{' '}
          <Link href="/funcionalidades/cancelaciones-y-politicas">cancelaciones y no-shows</Link>.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Que reservar deje de pasar por ti"
        body="Publica tu horario, define tus reglas una vez y recupera las tardes de contestar mensajes."
      />
    </FeatureShell>
  );
}
