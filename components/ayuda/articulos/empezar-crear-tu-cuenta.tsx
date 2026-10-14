import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import { LIMITES_GRATIS } from '@/lib/landing/founding-gratis';

// Las capturas de los pasos 1 y 3 son reales, tomadas en vivo el 28-ago-2026
// contra tentare.app/crear-estudio en producción (sin llegar a enviar el paso 3,
// para no crear un estudio de verdad). La del paso 2 es la del alta con Founding
// Studio gratis (15-oct-2026, el paso informa en vez de elegir), tomada en un
// build con FOUNDING_GRATIS encendido.
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        No hace falta tarjeta de crédito ni permanencia. Solo tu email y el nombre de tu estudio — empiezas gratis en{' '}
        {PLAN_INFO.BASE.nombre}, con todo menos varias sedes (ver <Link href="/ayuda/pagos/prueba-de-7-dias" style={{ color: 'inherit', textDecoration: 'underline' }}>cómo funciona {PLAN_INFO.BASE.nombre} gratis</Link>).
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

      <AyudaPaso numero={2} titulo="Mira con qué plan empiezas">
        <p>
          Empiezas en {PLAN_INFO.BASE.nombre}, gratis {LIMITES_GRATIS}. Si tu estudio crece, eliges plan más adelante
          desde Suscripción, en el menú, o desde Configuración &gt; Plan de Tentare, sin perder nada de lo que hayas
          configurado.
        </p>
        <AyudaCaptura
          src="/help/empezar/crear-estudio-paso-2.png"
          alt="Paso 2 del alta: Founding Studio, gratis, con lo que incluye, sus límites y qué pasa si el estudio crece"
          caption="Paso 2 de 3 — empiezas gratis, en Founding Studio."
        />
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Crea tu acceso">
        <p>Tu nombre, email y una contraseña. Te llega un código de 6 dígitos a ese email: lo escribes en la misma pantalla y entras a tu panel.</p>
        <AyudaCaptura
          src="/help/empezar/crear-estudio-paso-3.png"
          alt="Formulario de acceso, paso 3 de 3: nombre, email y contraseña"
          caption="Paso 3 de 3 — tu acceso."
        />
      </AyudaPaso>

      <AyudaResultado>
        Entras directo a tu panel, con tu estudio ya creado, en {PLAN_INFO.BASE.nombre} gratis. El
        siguiente paso natural es <Link href="/ayuda/empezar/configurar-tu-estudio" style={{ color: 'inherit', textDecoration: 'underline' }}>configurar los datos de tu estudio</Link>.
      </AyudaResultado>
    </>
  );
}
