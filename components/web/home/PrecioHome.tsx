import Link from 'next/link';
import { PLANS } from '@/components/landing/data';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { FRASE_FOUNDING } from '@/lib/landing/founding-gratis';
import { ALTA, SALIDAS, WHATSAPP_SOPORTE } from '@/components/landing/enlaces';
import { NombrePlan } from '@/components/planes/nombre-plan';
import { Icono } from '@/components/student/ui/Icono';
import { G2_NOTA, G2_RESENAS, G2_URL } from '@/lib/seo/g2';

// Precio (fase 2.2). NINGUNA cifra ni condición se escribe aquí: todo sale de
// PLANS (components/landing/data.ts) y de lib/landing/founding-gratis.ts, la
// misma fuente que /precios, llms.txt y el JSON-LD (lo cruza
// e2e/precios-founding-gratis.spec.ts). Cambia solo la forma: la tarjeta que el
// propio dato marca como `dark` va invertida en Ink, como la «popular» de bsport,
// sin sello de «el más elegido» (con cero estudios de pago no sería verdad).
//
// `id="precio"`: lo observa MedicionLanding para `landing_precio_visto` y es el
// destino del enlace «Precios» de la isla.

export function PrecioHome() {
  const whatsappCadena = enlaceWhatsApp(WHATSAPP_SOPORTE, 'Hola, tengo varios centros y quiero saber más de Tentare:') ?? '#';

  return (
    <section id="precio" className="wh-seccion wh-precio" aria-labelledby="wh-precio-h">
      <div className="wh-contenedor">
        <div className="wh-cabecera wh-cabecera-centro lp-rv">
          <h2 id="wh-precio-h" className="wh-h2">Precio a la vista. Sin sorpresas.</h2>
          <p className="wh-lead">Empieza gratis. Sin tarjeta, sin permanencia y sin comisión sobre lo que cobras.</p>
        </div>
        <div className="wh-precio-rejilla">
          {PLANS.map((plan) => (
            <div key={plan.name} className={plan.dark ? 'wh-plan wh-plan-oscuro lp-rv' : 'wh-plan lp-rv'}>
              <p className="wh-plan-nombre">{plan.id === 'BASE' ? <NombrePlan plan="BASE" tamano={26} /> : plan.name}</p>
              <p className="wh-plan-precio">{plan.price}{plan.id !== 'BASE' && <span>/mes</span>}</p>
              {plan.id === 'BASE' && <p className="wh-plan-frase">{FRASE_FOUNDING}</p>}
              <p className="wh-plan-desc">{plan.desc}</p>
              <ul className="wh-plan-lista">
                {plan.features.map((f) => <li key={f}><Icono nombre="hecho" tamano={16} grosor={2} />{f}</li>)}
              </ul>
              {plan.contacto ? (
                <a href={whatsappCadena} target="_blank" rel="noopener noreferrer" className="wh-boton wh-boton-secundario wh-plan-cta">{plan.cta}</a>
              ) : (
                <Link href={ALTA} className={plan.dark ? 'wh-boton wh-boton-arena wh-plan-cta' : 'wh-boton wh-boton-primario wh-plan-cta'}>{plan.cta}</Link>
              )}
            </div>
          ))}
        </div>
        <p className="wh-precio-nota">IVA incluido · Sin permanencia · Pagos con Stripe, sin comisión de Tentare</p>
        {/* La segunda prueba social (lo hacen las cinco referencias): la nota pública de
            G2 (lib/seo/g2.ts), la misma del héroe, comprobable con un clic. Ninguna cifra inventada. */}
        <p className="wh-precio-g2">
          <a href={G2_URL} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">★★★★★</span> {G2_NOTA} en G2</a> ({G2_RESENAS} reseñas), la valoración pública de quienes ya lo usan
        </p>
        <p className="wh-precio-salida"><Link href={SALIDAS.precio.href} className="wh-enlace-flecha">{SALIDAS.precio.label} <span aria-hidden="true">→</span></Link></p>
      </div>
    </section>
  );
}
