import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        Al crear tu estudio empiezan 7 días de prueba, sin pedirte tarjeta en ningún momento. Tienes acceso completo
        al plan que elegiste durante el alta — no es una versión recortada.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Qué pasa al terminar</h2>
      <p>
        Cuando se cumplen los 7 días, tu prueba se cierra sola. Para seguir usando Tentare eliges y pagas un plan
        desde Configuración &gt; Suscripción — nada se cobra automáticamente al terminar la prueba, porque nunca
        diste una tarjeta.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Tus datos se quedan</h2>
      <p>
        Las clases, clientas y configuración que hayas creado durante la prueba no se borran al terminar — siguen
        ahí en cuanto activas un plan de pago.
      </p>

      <AyudaResultado>
        No hay letra pequeña: sin tarjeta durante la prueba significa que nada se cobra si no vuelves a entrar.
        Relacionado: <Link href="/ayuda/empezar/crear-tu-cuenta" style={{ color: 'inherit', textDecoration: 'underline' }}>crear tu cuenta</Link>.
      </AyudaResultado>
    </>
  );
}
