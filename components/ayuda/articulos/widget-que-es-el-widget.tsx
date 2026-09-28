import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 25-sep-2026 con «Tentare Widgets»: los widgets son piezas de la
// web del estudio, y DÓNDE se meten en la web es una elección aparte de cada
// widget — antes el «Calendario embebido» figuraba como un widget más cuando
// era el horario metido de otra forma. El 28-sep, con los nombres llanos del
// constructor (`respuesta` y `METODOS`).
// Fuente de verdad de la lista: lib/widgets/catalogo.ts.
export default function Contenido() {
  return (
    <>
      <p>
        Desde Configuración &gt; Mi app y mi web &gt; Widgets para tu web eliges qué parte de Tentare quieres en tu
        propia web y dónde, ves cómo queda con el resultado real y copias el código. Tu web sigue siendo tuya: Tentare no la
        cambia, solo le pone piezas que funcionan de verdad —se reserva, se paga y se entra a la cuenta sin salir de ella.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué puedes poner</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Tu horario, para que reserven</strong> — reservan y pagan sin salir de tu web. Eliges qué clases, instructoras y salas enseña, y si se ve el precio o el nivel.</li>
        <li><strong>Tus precios</strong> y <strong>Bonos y packs</strong> — tus cuotas y bonos, con pago seguro.</li>
        <li><strong>Tu clase de prueba</strong> y <strong>Un formulario de contacto</strong> — para quien todavía no te conoce.</li>
        <li><strong>Citas</strong> — para servicios con hora concreta (valoraciones, sesiones 1 a 1…).</li>
        <li><strong>La cuenta de tus alumnas</strong> — sus reservas, sus bonos y su perfil, sin descargar nada.</li>
        <li><strong>Una clase concreta</strong> — directo a ella, para un post, una story o un newsletter.</li>
        <li><strong>Tu estudio</strong> y <strong>Tu equipo</strong> — para tu página «Sobre nosotras».</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Dónde ponerlo</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Dentro de una página</strong> — ajustándose solo a su contenido. Funciona en casi cualquier web.</li>
        <li><strong>Un botón que se abre encima</strong> — tu alumna no sale de tu web.</li>
        <li><strong>Un botón que lleva a tu página de reservas</strong> — no necesita ningún script. En WordPress, Wix, Squarespace y Webflow lo haces con el botón de tu propia web y tu enlace.</li>
        <li><strong>Un enlace</strong> — la dirección tal cual, para la bio de Instagram, un newsletter o WhatsApp.</li>
        <li><strong>Sin marco</strong> (solo el horario, para quien te hace la web) — toma el espacio de tu web como si fuera suyo. Requiere autorizar tu web primero.</li>
      </ul>
      <p>
        La primera vez te pregunta con qué está hecha tu web y, con eso, te recomienda dónde ponerlo y te da los pasos
        de la tuya. Si te la lleva otra persona, se lo mandas desde ahí con el código y los pasos.
      </p>

      <AyudaResultado>
        Todo funciona pegando el código tal cual, sin ningún paso previo —ver{' '}
        <Link href="/ayuda/widget/instalar-con-html" style={{ color: 'inherit', textDecoration: 'underline' }}>instalar el widget con HTML</Link>—.
        Solo el horario sin marco exige autorizar tu web antes.
      </AyudaResultado>
    </>
  );
}
