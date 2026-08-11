import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { InstalableVsNativa, MockMovil, PantallasDelPortal } from '@/components/funcionalidades/visuales/app-alumnas';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/app-para-alumnas';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Está en App Store y en Google Play?',
    a: 'No, y es lo primero que decimos porque el sector suele venderlo sin matizar. Tus alumnas la instalan desde el navegador con «Añadir a pantalla de inicio»: queda su icono con tu nombre, se abre a pantalla completa y recibe avisos. Lo único que no puedes hacer es decirle a alguien «búscanos en la tienda».',
  },
  {
    q: '¿Tienen que crearse una cuenta y recordar otra contraseña?',
    a: 'Entran con su email y, si prefieren, con una clave. El acceso está pensado para que nadie se quede fuera: en el segundo paso siempre se ven las dos salidas, entrar y recuperar el acceso.',
  },
  {
    q: '¿Puedo cambiar los colores y las fuentes?',
    a: 'Sí, con un editor propio: cuatro temas de partida, paleta, tipografías, forma de los botones y qué bloques aparecen en su pantalla de inicio. Se previsualiza antes de publicarlo, así que nada cambia para tus alumnas hasta que tú lo publicas.',
  },
  {
    q: '¿Los avisos llegan al móvil de verdad?',
    a: 'Sí, como notificación del sistema. En iPhone hay una condición de Apple: la app tiene que estar instalada en la pantalla de inicio y el móvil ser iOS 16.4 o superior. En Android funciona sin instalar.',
  },
  {
    q: '¿Aparece Tentare por algún lado?',
    a: 'No en lo que ve tu alumna. El nombre de la app instalada, el icono, el color y los correos que recibe son de tu estudio. La app de marca está incluida a partir del plan Estudio.',
  },
];

export default function AppAlumnasPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Lo que ve tu alumna"
      h1={<>Tu estudio, en su pantalla de inicio.</>}
      intro={<>Reservar, comprar su bono, ver cuántas sesiones le quedan y su progreso — en una app con tu nombre y tu logo, instalada en su móvil sin pasar por ninguna tienda.</>}
      chips={['Icono y nombre de tu estudio', 'Avisos al móvil', 'Sin App Store']}
      gradient="linear-gradient(140deg,#13111A 0%,#2E2740 55%,#5A4E7C 100%)"
      visual={<MockMovil />}
    >
      <Seccion id="problema" titulo="El WhatsApp del estudio no escala">
        <Entradilla>
          «¿Me quedan sesiones?» «¿Hay sitio el jueves?» «¿Me apuntas al de las 19:00?». Ninguna de esas preguntas es
          difícil. Todas interrumpen, y todas se responden solas si la alumna puede mirarlo ella.
        </Entradilla>
        <p>
          El salto no es de WhatsApp a un formulario web: es a un sitio donde ella tiene <strong>lo suyo</strong> — sus
          reservas, su bono, su historial— y donde el estudio se llama como se llama tu estudio. Cuando la app que abre
          lleva el logo de un proveedor de software, la relación es con el proveedor.
        </p>
      </Seccion>

      <Seccion id="pantallas" titulo="Qué tiene dentro">
        <PantallasDelPortal />
        <p>
          Además de consultar, puede actuar: cancelar dentro de plazo, apuntarse a la lista de espera de una clase llena,
          comprar un bono cuando se le acaba y aceptar una plaza que se libera. Las reglas que se aplican en cada caso son
          las que tú configuras en <Link href="/funcionalidades/reservas-online">reservas</Link> y en{' '}
          <Link href="/funcionalidades/cancelaciones-y-politicas">cancelaciones</Link>.
        </p>
        <p>
          Y hay una pieza que trabaja sola: cuando tiene sentido, la pantalla de inicio le <strong>propone una clase
          concreta</strong> —no «hay clases con hueco esta semana»— con el motivo detrás, sacado de su propio historial: su
          día, su hora, el tipo de clase que suele hacer. Si no hay ningún hecho que sostenga una propuesta, no propone
          nada. Recomendar al azar es peor que callarse.
        </p>
      </Seccion>

      <Seccion id="marca" titulo="Tu marca, hasta el icono">
        <p>
          El editor de apariencia no es un selector de color primario. Se parte de uno de los cuatro temas base y se
          ajusta lo que haga falta:
        </p>
        <Rejilla
          columnas={2}
          items={[
            { titulo: 'Paleta y tipografía', body: 'Colores y familias tipográficas del estudio, con comprobación de contraste para que el texto se lea de verdad.' },
            { titulo: 'Forma de los elementos', body: 'Cuánto redondeo, cuánto aire — que es lo que distingue una marca sobria de una alegre sin cambiar el color.' },
            { titulo: 'Bloques de la home', body: 'Qué aparece en su pantalla de inicio y en qué orden.' },
            { titulo: 'Icono y ficha para compartir', body: 'El favicon y el texto que sale al pegar el enlace en un chat.' },
          ]}
        />
        <p>
          Se previsualiza antes de publicar, así que puedes probar sin que tus alumnas vean nada a medias. El manifiesto de
          instalación se genera por estudio: el nombre de la app, el color y el logo son los tuyos, y su ámbito está
          anclado a tu dirección.
        </p>
      </Seccion>

      <Seccion id="instalable" titulo="Dicho claro: no es una app de tienda">
        <p>
          Esto es donde la mayoría de comparativas se ponen vagas, así que aquí va la tabla completa.
        </p>
        <InstalableVsNativa />
        <Limite titulo="La diferencia que sí vas a notar">
          No puedes decirle a nadie «búscanos en App Store». La instalación pasa por compartir tu enlace y que ella lo
          añada a su pantalla de inicio — un paso más que hay que explicar la primera vez. A cambio, no hay revisiones de
          tienda, ni versiones antiguas de tus alumnas conviviendo con la nueva, ni actualización que nadie se descarga.
        </Limite>
        <p>
          Es la misma limitación que reconocemos en la{' '}
          <Link href="/comparativa/tentare-vs-bsport">comparativa con bsport</Link>. Si tener presencia en las tiendas es
          un requisito para ti, es honesto que lo sepas antes de contratar y no después.
        </p>
      </Seccion>

      <Seccion id="avisos" titulo="Los avisos que recibe">
        <p>
          La app instalada puede mandar notificaciones al móvil, y ese es el canal que hace que la lista de espera
          funcione: una plaza que se libera a las diez de la noche no sirve de nada por email.
        </p>
        <p>
          Cada alumna ajusta qué quiere recibir desde su propio perfil, por categorías. El detalle de qué se envía y por
          qué vía está en <Link href="/funcionalidades/automatizaciones-y-avisos">automatizaciones y avisos</Link>.
        </p>
        <Limite titulo="En iPhone, los avisos exigen tenerla instalada">
          Es una condición de Apple, no nuestra: Safari solo entrega notificaciones web a apps añadidas a la pantalla de
          inicio, y a partir de iOS 16.4. En Android llegan sin instalar nada. Conviene tenerlo en cuenta al pedirle a tu
          clientela que la instale.
        </Limite>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Deja de ser tú la app de tu estudio"
        body="Publica tu portal con tu marca y recupera las tardes de contestar «¿me quedan sesiones?»."
      />
    </FeatureShell>
  );
}
