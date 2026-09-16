import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        El portal de reservas es la página pública de tu estudio en Tentare: <code>tentare.app/reservar/tu-estudio</code>.
        Ahí tus alumnas ven tu horario real, con salas, instructoras y plazas libres, y reservan sin necesidad de
        llamarte ni escribirte.
      </p>
      <p>
        Es distinto del <Link href="/ayuda/widget/que-es-el-widget" style={{ color: 'inherit', textDecoration: 'underline' }}>widget</Link>: el
        portal es la página que ya existe sola, con tu URL de Tentare; el widget es ese mismo calendario incrustado
        dentro de tu propia web.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué puede hacer una alumna desde el portal</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li>Ver tu horario filtrando por tipo de clase o instructora.</li>
        <li>Reservar una clase suelta, con las reglas de antelación y aforo que hayas configurado.</li>
        <li>Entrar en lista de espera si la clase está completa.</li>
        <li>Crear su cuenta y, ya con acceso, ver su plan, sus créditos y su historial.</li>
      </ul>

      <AyudaCaptura
        src="/help/portal/portal-calendario-publico.png"
        alt="Calendario público de reservas de un estudio, con clases, plazas libres y lista de espera"
        caption="El portal real de un estudio — clases, plazas libres y lista de espera, sin necesidad de cuenta para verlas."
      />

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo lo comparte tu estudio</h2>
      <p>
        El enlace <code>tentare.app/reservar/tu-estudio</code> funciona desde el primer día — puedes ponerlo en tu bio
        de Instagram, en tu WhatsApp Business o enviarlo directamente a una alumna nueva. Si prefieres que viva dentro
        de tu propia web, la vía es el widget.
      </p>
      <p>
        Para quien pasa por delante del estudio, imprime su código QR. En <strong>Configuración</strong> &gt;{' '}
        <strong>«Mi app y mi web»</strong> &gt; <strong>«Dirección y enlaces»</strong>, cada enlace —tu página de
        reservas, la app de tus alumnas y tu web, si la tienes en Contacto— lleva un botón <strong>«Código QR»</strong>.
        Ahí descargas un cartel en A4 con el nombre del estudio, listo para el escaparate (en PDF para imprimir o en
        PNG para redes), o solo el código, en PNG o SVG, para tus folletos o para quien te hace el diseño.
      </p>
      <p>
        El cartel sale con el color de tu marca, y puedes elegir otro fondo y otro color para el código. Los colores
        que elijas se recuerdan para los carteles de tus otros enlaces. Si eliges un color demasiado claro para el
        código, se avisa y no se aplica, porque el móvil podría no leerlo. Y si más adelante cambias la dirección de
        tu página, el QR que ya tienes impreso sigue llevando a ella.
      </p>

      <AyudaResultado>
        Cualquier persona con el enlace puede ver tu horario y reservar, sin que tengas que darla de alta tú antes —
        exactamente como te encuentra hoy alguien que llega desde Google o Instagram.
      </AyudaResultado>
    </>
  );
}
