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
        <li>Ver tu horario filtrando por tipo de clase, instructora o sala.</li>
        <li>Reservar una clase suelta, con las reglas de antelación y aforo que hayas configurado.</li>
        <li>Entrar en lista de espera si la clase está completa.</li>
        <li>Crear su cuenta y, ya con acceso, ver su plan, sus créditos y su historial.</li>
      </ul>

      <AyudaCaptura alt="Calendario público de reservas de un estudio" pendiente="vista del calendario público" />

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo lo comparte tu estudio</h2>
      <p>
        El enlace <code>tentare.app/reservar/tu-estudio</code> funciona desde el primer día — puedes ponerlo en tu bio
        de Instagram, en tu WhatsApp Business o enviarlo directamente a una alumna nueva. Si prefieres que viva dentro
        de tu propia web, la vía es el widget.
      </p>

      <AyudaResultado>
        Cualquier persona con el enlace puede ver tu horario y reservar, sin que tengas que darla de alta tú antes —
        exactamente como te encuentra hoy alguien que llega desde Google o Instagram.
      </AyudaResultado>
    </>
  );
}
