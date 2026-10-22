import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Desde el 22-oct-2026 el enlace que se da a las alumnas es el de su APP
// (`/portal/<slug>`); la página de reservas (`/reservar/<slug>`) es la que se
// integra en la web del estudio. Este artículo cuenta las dos y cuál es cuál.
// Verificado contra: components/configuracion/tab-estudio-enlaces.tsx (las dos
// filas, la app primero) y app/portal/[slug]/acceso/registro/page.tsx (la
// alumna entra con su email y un código, y ahí se crea su ficha).

export default function Contenido() {
  return (
    <>
      <p>
        Tu estudio tiene dos direcciones en Tentare, y sirven para cosas distintas. El enlace que compartes con tus
        alumnas es el de <strong>su app</strong>; el de la <strong>página de reservas</strong> es para ponerlo en tu web.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>La app de tus alumnas</h2>
      <p>
        Es <code>tentare.app/portal/tu-estudio</code>: la app con el nombre, el logo y los colores de tu estudio. Tus
        alumnas entran con su email y un código que les llega a ese correo —sin contraseña y sin descargarse nada— y
        se puede instalar en el móvil. Es lo que pones en tu bio de Instagram, en tu WhatsApp Business o en el grupo de
        tus alumnas.
      </p>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li>Ver tu horario filtrando por tipo de clase o instructora.</li>
        <li>Reservar una clase, con las reglas de antelación y aforo que hayas configurado.</li>
        <li>Entrar en lista de espera si la clase está completa.</li>
        <li>Crear su cuenta la primera vez (con su email y un código) y, ya dentro, ver su plan, sus créditos y su historial.</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>La página de reservas, para tu web</h2>
      <p>
        Es <code>tentare.app/reservar/tu-estudio</code>: tu horario con salas, instructoras y plazas libres, en una
        página que se integra en tu propia web con un botón o con el{' '}
        <Link href="/ayuda/widget/que-es-el-widget" style={{ color: 'inherit', textDecoration: 'underline' }}>widget</Link>{' '}
        (ese mismo calendario dentro de tu web). No es el enlace que se reparte a las alumnas.
      </p>

      <AyudaCaptura
        src="/help/portal/portal-calendario-publico.png"
        alt="Página de reservas de un estudio, con clases, plazas libres y lista de espera"
        caption="La página de reservas de un estudio, la que se integra en su web — clases, plazas libres y lista de espera."
      />

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo lo comparte tu estudio</h2>
      <p>
        El enlace de la app funciona desde el primer día — puedes ponerlo en tu bio de Instagram, en tu WhatsApp
        Business o enviarlo directamente a una alumna nueva. Lo encuentras en <strong>Configuración</strong> &gt;{' '}
        <strong>«Mi app y mi web»</strong> &gt; <strong>«Dirección y enlaces»</strong>, en la fila{' '}
        <strong>«App de tus alumnas»</strong>. Si prefieres que reserven dentro de tu propia web, la vía es la página de
        reservas con el widget.
      </p>
      <p>
        Para quien pasa por delante del estudio, imprime su código QR. En esa misma pantalla, cada enlace —la app de tus
        alumnas, tu página de reservas y tu web, si la tienes en Contacto— lleva un botón <strong>«Código QR»</strong>.
        Ahí descargas un cartel en A4 con el nombre del estudio, listo para el escaparate (en PDF para imprimir o en
        PNG para redes), o solo el código, en PNG o SVG, para tus folletos o para quien te hace el diseño. Para el
        escaparate, el de la app.
      </p>
      <p>
        El cartel sale con el color de tu marca, y puedes elegir otro fondo y otro color para el código. Los colores
        que elijas se recuerdan para los carteles de tus otros enlaces. Si eliges un color demasiado claro para el
        código, se avisa y no se aplica, porque el móvil podría no leerlo. Y si más adelante cambias la dirección de
        tu estudio, el QR que ya tienes impreso sigue llevando a ella.
      </p>

      <AyudaResultado>
        Tus alumnas entran con su email desde un solo enlace, el de su app, sin que tengas que darlas de alta tú
        antes — y la página de reservas queda para tu web.
      </AyudaResultado>
    </>
  );
}
