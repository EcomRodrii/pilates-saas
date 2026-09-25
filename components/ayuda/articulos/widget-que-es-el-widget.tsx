import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 25-sep-2026 con «Tentare Widgets»: los widgets son piezas de la
// web del estudio organizadas por lo que hacen (reservas, venta, estudio), y
// CÓMO se meten en la web (incrustado, nativo, popup, botón, enlace) es una
// elección aparte de cada widget — antes el «Calendario embebido» figuraba como
// un widget más cuando era el horario metido de otra forma.
// Fuente de verdad de la lista: lib/widgets/catalogo.ts.
export default function Contenido() {
  return (
    <>
      <p>
        Desde Configuración &gt; Mi app y mi web &gt; Widgets para tu web eliges qué parte de Tentare quieres en tu
        propia web, la ajustas viendo el resultado real y copias el código. Tu web sigue siendo tuya: Tentare no la
        cambia, solo le pone piezas que funcionan de verdad —se reserva, se paga y se entra a la cuenta sin salir de ella.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Los widgets</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Horario y reservas</strong> — tu horario en vivo; reservan y pagan sin salir de tu web. Eliges qué clases, instructoras y salas enseña, y si se ve el precio o el nivel.</li>
        <li><strong>Citas</strong> — para servicios con hora concreta (valoraciones, sesiones 1 a 1…).</li>
        <li><strong>Mi cuenta</strong> — sus reservas, sus bonos y su perfil, sin descargar nada.</li>
        <li><strong>Reserva una clase</strong> — directo a una clase concreta, para un post, una story o un newsletter.</li>
        <li><strong>Planes y precios</strong> y <strong>Bonos y packs</strong> — tus cuotas y bonos, con pago seguro.</li>
        <li><strong>El estudio</strong> e <strong>Instructoras</strong> — para tu página «Sobre nosotras».</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo meterlo en tu web</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Incrustado</strong> — dentro de una página de tu web, ajustándose solo a su contenido. Funciona en cualquier web.</li>
        <li><strong>Integración nativa</strong> (solo el horario) — sin marco: toma el espacio de tu web como si fuera suyo. Requiere autorizar tu dominio primero.</li>
        <li><strong>Popup</strong> — un botón de tu web que abre el widget en una ventana encima.</li>
        <li><strong>Botón</strong> — lleva a tu página de reservas. No necesita ningún script.</li>
        <li><strong>Enlace</strong> — la dirección tal cual, para la bio de Instagram, un newsletter o WhatsApp.</li>
      </ul>
      <p>
        Para cada método el panel te da el código de HTML, WordPress, Webflow o React, con los pasos para pegarlo.
      </p>

      <AyudaResultado>
        Todo funciona pegando el código tal cual, sin ningún paso previo —ver{' '}
        <Link href="/ayuda/widget/instalar-con-html" style={{ color: 'inherit', textDecoration: 'underline' }}>instalar el widget con HTML</Link>—.
        Solo la integración nativa exige autorizar tu dominio antes.
      </AyudaResultado>
    </>
  );
}
