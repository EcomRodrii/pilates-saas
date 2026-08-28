import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Contenido verificado en vivo el 28-ago-2026 navegando /crear-estudio en
// producción (tres pasos reales, sin cuenta de prueba: tarjeta o alta de
// estudio de verdad no hacía falta para el paso 1). Las capturas de los pasos
// 2 y 3 quedan pendientes — no se han podido tomar en esta sesión (sin
// capacidad de guardar el PNG del panel de vista previa a disco); el paso 1 sí
// está descrito sobre lo que se vio en pantalla.
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
        <AyudaCaptura alt="Selector de plan durante el alta" pendiente="paso 2 del alta" />
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Crea tu acceso">
        <p>Tu email y una contraseña. Con esto entras directamente a tu panel — no hace falta confirmar el email antes de empezar a usarlo.</p>
        <AyudaCaptura alt="Formulario de acceso, paso 3 de 3" pendiente="paso 3 del alta" />
      </AyudaPaso>

      <AyudaResultado>
        Entras directo a tu panel, con tu estudio ya creado y el contador de tu prueba de 7 días en marcha. El
        siguiente paso natural es <Link href="/ayuda/empezar/configurar-tu-estudio" style={{ color: 'inherit', textDecoration: 'underline' }}>configurar los datos de tu estudio</Link>.
      </AyudaResultado>
    </>
  );
}
