import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import { COMPLEMENTOS_DE_PAGO, GRATIS_ALUMNAS, GRATIS_MARGEN_DIAS, GRATIS_RESERVAS_MES, PRECIO_FOUNDING_PAGO } from '@/lib/landing/founding-gratis';

// Desde el 15-oct-2026 no hay prueba de 7 días: Founding Studio es gratis
// (decisión del fundador; reglas en lib/billing/plan-gratis.ts). El artículo
// conserva su dirección (`pagos/prueba-de-7-dias`) porque lo enlazan el panel
// (lib/ayuda/pantallas.ts) y otros artículos. Las cifras salen de la misma
// fuente que /precios (lib/landing/founding-gratis.ts).
export default function Contenido() {
  return (
    <>
      <p>
        Al crear tu estudio empiezas en {PLAN_INFO.BASE.nombre}, gratis y con todas las funcionalidades de Tentare
        menos varias sedes y la app propia en la App Store, sin pedirte tarjeta en ningún momento. Es gratis mientras tu estudio no pase de{' '}
        {GRATIS_ALUMNAS} alumnas activas ni de {GRATIS_RESERVAS_MES} reservas al mes.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Qué pasa si te pasas</h2>
      <p>
        Si pasas de cualquiera de los dos, sigues en {PLAN_INFO.BASE.nombre} por {PRECIO_FOUNDING_PAGO} € al mes, con
        IVA incluido y sin tope de alumnas ni de reservas. En ese plan de pago, {COMPLEMENTOS_DE_PAGO} van aparte,
        como complementos. Te avisamos cuando llegas al 80 % y, si te pasas, tienes{' '}
        {GRATIS_MARGEN_DIAS} días para contratarlo desde Suscripción, en el menú. Si no lo contratas, el panel se cierra
        hasta que lo hagas; la app de tus alumnas sigue funcionando todo el tiempo.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo se cuentan</h2>
      <p>
        Las alumnas, por el estado «Activa» de su ficha: el mismo número que «Clientas activas» en el Resumen. Las
        reservas, las de las clases de los últimos 30 días, sin contar las canceladas ni las que están en lista de
        espera o pendientes de aprobar. Las de clase fija también cuentan.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Tus datos se quedan</h2>
      <p>
        Si el panel se cierra, no se borra nada: tus clases, clientas y configuración siguen ahí en cuanto eliges
        plan.
      </p>

      <AyudaResultado>
        No hay letra pequeña: sin tarjeta, nada se cobra hasta que eliges un plan.
        Relacionado: <Link href="/ayuda/empezar/crear-tu-cuenta" style={{ color: 'inherit', textDecoration: 'underline' }}>crear tu cuenta</Link>.
      </AyudaResultado>
    </>
  );
}
