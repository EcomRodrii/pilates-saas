import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Las tres capturas son reales, tomadas en vivo el 28-ago-2026 contra
// tentare.app/crear-estudio en producción (sin llegar a enviar el paso 3, para
// no crear un estudio de verdad).
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        No hace falta tarjeta de crédito ni permanencia. Solo tu email y el nombre de tu estudio — tienes acceso completo
        durante 7 días de prueba (ver <Link href="/ayuda/pagos/prueba-de-7-dias" style={{ color: 'inherit', textDecoration: 'underline' }}>cómo funciona la prueba</Link>).
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Entra en tentare.app/crear-estudio">
        <p style={{ margin: '0 0 12px' }}>
          Escribe el nombre de tu estudio (es el que verán tus alumnas) y, si quieres, tu ciudad y cómo conociste
          Tentare — los dos últimos son opcionales y no bloquean el alta.
        </p>
        <AyudaCaptura
          src="/help/empezar/crear-estudio-paso-1.png"
          alt="Formulario de alta de estudio, paso 1 de 3: nombre del estudio, ciudad y cómo conociste Tentare"
          caption="Paso 1 de 3 — datos de tu estudio."
        />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Elige tu plan de prueba">
        <p>
          Puedes cambiarlo más adelante desde Configuración &gt; Suscripción sin perder nada de lo que hayas
          configurado durante la prueba.
        </p>
        <AyudaCaptura
          src="/help/empezar/crear-estudio-paso-2.png"
          alt="Selector de plan durante el alta: Base 29€, Estudio 59€ y Cadena 149€, los tres con 7 días gratis"
          caption="Paso 2 de 3 — los tres planes, todos con 7 días gratis."
        />
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Crea tu acceso">
        <p>Tu nombre, email y una contraseña. Con esto entras directamente a tu panel — no hace falta confirmar el email antes de empezar a usarlo.</p>
        <AyudaCaptura
          src="/help/empezar/crear-estudio-paso-3.png"
          alt="Formulario de acceso, paso 3 de 3: nombre, email y contraseña"
          caption="Paso 3 de 3 — tu acceso."
        />
      </AyudaPaso>

      <AyudaResultado>
        Entras directo a tu panel, con tu estudio ya creado y el contador de tu prueba de 7 días en marcha. El
        siguiente paso natural es <Link href="/ayuda/empezar/configurar-tu-estudio" style={{ color: 'inherit', textDecoration: 'underline' }}>configurar los datos de tu estudio</Link>.
      </AyudaResultado>
    </>
  );
}
