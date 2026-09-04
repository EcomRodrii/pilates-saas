import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado: lib/notifications/catalog.ts (catálogo de avisos) y
// lib/engines/automation-engine.ts (disparadores implementados). El módulo de
// "Marketing" (campañas/segmentos manuales) está apagado por feature flag —
// no se documenta como si estuviera disponible.
export default function Contenido() {
  return (
    <>
      <p>
        Tentare avisa automáticamente por email y, si lo tienes activado, por WhatsApp — sin que tengas que
        configurar plantillas ni redactar nada. Algunos ejemplos de lo que se envía solo:
      </p>

      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li>Confirmación al reservar una clase.</li>
        <li>Recordatorio antes de que empiece.</li>
        <li>Aviso de que un bono está a punto de caducar o casi agotado.</li>
        <li>Aviso a mostrador cuando una sustitución no encuentra candidata a tiempo.</li>
        <li>Confirmación cuando se cubre una clase con sustituta.</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué puedes activar o apagar</h2>
      <p>
        Desde Configuración puedes decidir por qué canal te llegan a ti los avisos internos (email, WhatsApp), y si
        tu estudio tiene el canal de WhatsApp disponible para las alumnas también.
      </p>

      <AyudaResultado>
        Esto no es un sistema de campañas de marketing con segmentos y envíos manuales — es automatización
        operativa: cada aviso responde a algo que ha pasado de verdad, no a una campaña que has programado tú.
        Relacionado:{' '}
        <Link href="/ayuda/problemas/no-llega-un-email" style={{ color: 'inherit', textDecoration: 'underline' }}>no llega un email</Link> y{' '}
        <Link href="/ayuda/problemas/no-llega-un-whatsapp" style={{ color: 'inherit', textDecoration: 'underline' }}>no llega un WhatsApp</Link>.
      </AyudaResultado>
    </>
  );
}
