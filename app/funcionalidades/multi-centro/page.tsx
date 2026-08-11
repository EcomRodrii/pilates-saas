import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { InstructoraEnDosSedes, QueSeCompartYQueNo, SelectorDeSede } from '@/components/funcionalidades/visuales/multicentro';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/multi-centro';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Veo las dos sedes a la vez en una misma pantalla?',
    a: 'No. Trabajas en una sede cada vez y cambias con el selector, que lleva el nombre siempre a la vista. No hay hoy un panel agregado que sume las cifras de todos los centros; si eso es lo que necesitas, conviene saberlo antes de contratar.',
  },
  {
    q: '¿Una alumna de una sede puede reservar en la otra?',
    a: 'No con la misma ficha: los datos de alumnas no cruzan de centro. Cada sede tiene su propia base y su propio portal. Es la contrapartida del aislamiento, que es lo que impide que un fallo en una sede exponga los datos de la otra.',
  },
  {
    q: '¿Puedo tener a la misma instructora en dos centros?',
    a: 'Sí, y con condiciones distintas en cada uno: rol, tarifa por hora y disponibilidad propias. Entra una sola vez con su cuenta y cambia de sede desde su selector.',
  },
  {
    q: '¿Pago una suscripción por cada centro?',
    a: 'No: el plan Cadena cubre varios centros bajo la misma suscripción. Puedes ver el precio en la página de precios, que es público como el resto.',
  },
  {
    q: '¿Y si abro una tercera sede más adelante?',
    a: 'Se añade sin tocar las existentes. Lo que ya esté configurado a nivel de cadena —el menú, la pantalla de inicio— lo hereda; lo que es de sede se configura desde cero, que es lo esperable en un centro nuevo.',
  },
];

export default function MultiCentroPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Dos centros o más"
      h1={<>Varias sedes, un solo acceso.</>}
      intro={<>Cada centro con sus alumnas, su horario y su facturación separados — y tu equipo entrando una sola vez, con el rol que le toca en cada sitio.</>}
      chips={['Datos aislados por sede', 'Rol distinto en cada centro', 'Una sola suscripción']}
      visual={<SelectorDeSede />}
    >
      <Seccion id="problema" titulo="Dos centros no son dos negocios, ni son uno solo">
        <Entradilla>
          Abrir una segunda sede rompe el software que te funcionaba. Con dos cuentas separadas, tu equipo tiene dos
          contraseñas y tú configuras todo dos veces. Con una cuenta compartida, cualquiera ve los datos de las alumnas del
          otro centro.
        </Entradilla>
        <p>
          Lo que hace falta es una línea bien puesta: lo que es de cada sede se queda en su sede, y lo que es de la marca se
          configura una vez. Y sobre todo, que en ningún momento tengas dudas de en qué centro estás actuando — cancelar
          una clase o cobrar creyendo que estabas en el otro es el error caro de una cadena.
        </p>
      </Seccion>

      <Seccion id="linea" titulo="Dónde está la línea">
        <QueSeCompartYQueNo />
        <p>
          El aislamiento no es una preferencia de interfaz: está en la base de datos. Cada sede solo puede leer sus propios
          datos, y eso se cumple igual desde el panel, desde el portal de las alumnas o desde cualquier otra vía. Es el
          mismo mecanismo que separa a un estudio de otro, aplicado dentro de tu propia cadena.
        </p>
        <p>
          Y a la vista: el nombre de la sede activa aparece siempre en el panel. Con un solo centro no se pinta nada —no
          hay ambigüedad que resolver— pero en cuanto hay dos, está permanentemente delante.
        </p>
      </Seccion>

      <Seccion id="equipo" titulo="La instructora que trabaja en dos sitios">
        <p>
          Es el caso que más se complica en el software genérico, y el que decide si una cadena funciona. Tu instructora de
          los martes en Gràcia también da clase en Sant Cugat los jueves, con otra tarifa y otro nivel de responsabilidad.
        </p>
        <InstructoraEnDosSedes />
        <p>
          Cada sede tiene su propia ficha de esa persona, con su rol, su tarifa y su disponibilidad. Lo único que las une es
          su cuenta, para que entre una sola vez y cambie de centro desde su propio selector —viendo el rol que tiene en
          cada uno, para que no le sorprenda un cambio de permisos.
        </p>
        <p>
          Y hay una consecuencia práctica: <strong>las sustituciones no cruzan de sede</strong>. Cuando alguien no puede dar
          una clase en Gràcia, se buscan candidatas de Gràcia. Es lo correcto —la disponibilidad y los desplazamientos son
          reales— y sale gratis: el motor de <Link href="/funcionalidades/sustituciones">sustituciones</Link> trabaja con la
          ficha de esa sede.
        </p>
      </Seccion>

      <Seccion id="marca" titulo="Lo que sí se comparte">
        <Rejilla
          items={[
            { titulo: 'El menú del panel', body: 'Qué módulos aparecen y en qué orden se configura una vez para toda la cadena, no centro por centro.' },
            { titulo: 'La pantalla de inicio', body: 'Igual: se decide para la cadena, y las sedes nuevas la heredan al abrirse.' },
            { titulo: 'La suscripción', body: 'Un plan Cadena en lugar de una cuota por centro.' },
            { titulo: 'El alta de tu equipo', body: 'Si alguien ya trabaja en otra sede de tu cadena, darla de alta en una nueva la vincula directamente.' },
          ]}
        />
      </Seccion>

      <Seccion id="limites" titulo="Lo que todavía no hace">
        <Limite titulo="No hay panel agregado de toda la cadena">
          Trabajas en una sede cada vez. No existe hoy una pantalla que sume los ingresos, la ocupación o las alumnas de
          todos tus centros a la vez: para comparar, cambias de sede y miras. Si tu decisión de compra depende de tener esa
          vista consolidada, es honesto que lo sepas ahora.
        </Limite>
        <p>
          Tampoco hay traspaso de alumnas entre centros ni bonos que sirvan en varias sedes: cada centro es una base
          independiente. Y las recomendaciones del Centro de Control se calculan por sede, con los datos de esa sede — no
          hay un análisis de cadena que compare unos centros con otros.
        </p>
        <p>
          Nada de esto es un impedimento para operar dos o tres centros; es la diferencia entre gestionar varias sedes con
          un solo acceso y tener una consola de cadena. Lo primero está; lo segundo, no.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
        <p style={{ marginTop: 26 }}>
          Cómo se protegen los datos de cada sede está en <Link href="/seguridad">seguridad</Link>, y el precio del plan
          Cadena, en <Link href="/precios">precios</Link>.
        </p>
      </Seccion>

      <CierreCta
        titulo="Abre la segunda sin duplicar el trabajo"
        body="Datos separados donde importan, configuración compartida donde no, y tu equipo entrando una sola vez."
      />
    </FeatureShell>
  );
}
