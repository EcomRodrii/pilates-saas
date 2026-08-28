import Link from 'next/link';
import { QueEstaPasando, CausasComunes, ComoSolucionarlo } from '@/components/ayuda/TroubleshootShell';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <QueEstaPasando>
        Una alumna intenta pagar un plan o bono y algo falla en el checkout: la tarjeta se rechaza, el formulario no
        avanza, o se queda colgado en &ldquo;Procesando el pago…&rdquo;.
      </QueEstaPasando>

      <CausasComunes items={[
        'La tarjeta ha sido rechazada por el banco (fondos, límite, antifraude) — no es un fallo de Tentare, es la respuesta del banco.',
        'Se ha quedado colgado en "Procesando el pago…" por una conexión inestable justo en el momento de confirmar.',
        'El navegador tiene bloqueadas cookies de terceros o extensiones que interfieren con el formulario de pago.',
      ]} />

      <ComoSolucionarlo>
        <p style={{ margin: '0 0 12px' }}>Si la tarjeta se rechaza, pide que pruebe otra o que contacte con su banco — el motivo exacto lo decide el banco, no Tentare.</p>
        <p style={{ margin: '0 0 12px' }}>Si se queda colgado en &ldquo;Procesando el pago…&rdquo;, que recargue la página e intente de nuevo: el checkout no duplica un cobro que ya se ha completado.</p>
        <p style={{ margin: 0 }}>Si pasa siempre, en el mismo dispositivo, prueba en una pestaña nueva o en otro navegador para descartar una extensión que bloquee el formulario.</p>
      </ComoSolucionarlo>

      <AyudaResultado>
        Un pago que falla nunca deja a la alumna con un plan activo a medias — si el cobro no se confirma, no se
        activa nada. Relacionado:{' '}
        <Link href="/ayuda/pagos/cobros-fallidos" style={{ color: 'inherit', textDecoration: 'underline' }}>cobros fallidos</Link>.
      </AyudaResultado>
    </>
  );
}
