import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        El widget es el mismo calendario de reservas de tu{' '}
        <Link href="/ayuda/portal/que-es-el-portal" style={{ color: 'inherit', textDecoration: 'underline' }}>portal</Link>, pero incrustado dentro de tu propia web — una alumna reserva sin salir nunca de tu dominio.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Cómo funciona técnicamente</h2>
      <p>
        Es un pequeño script que pintas en tu página: crea el calendario dentro de un contenedor aislado (Shadow
        DOM), así que el CSS de tu web nunca choca con el del widget, ni al revés. No hace falta ningún plugin
        especial ni acceso al servidor de tu web — solo pegar un fragmento de código.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cuándo usar iframe en vez de script</h2>
      <p>
        Si tu web no permite pegar `&lt;script&gt;` (algunos constructores lo bloquean), tienes la alternativa de
        iframe — mismo calendario, otra forma de incrustarlo.
      </p>

      <AyudaResultado>
        Sigue con{' '}
        <Link href="/ayuda/widget/instalar-con-html" style={{ color: 'inherit', textDecoration: 'underline' }}>instalar el widget con HTML o iframe</Link>.
      </AyudaResultado>
    </>
  );
}
