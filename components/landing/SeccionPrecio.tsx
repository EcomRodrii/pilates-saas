import Link from 'next/link';
import { PLANS } from '@/components/landing/data';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { ALTA, SALIDAS, WHATSAPP_SOPORTE } from './enlaces';

// Sección 11 de la landing v5 — "Precio". Los tres planes se importan de
// PLANS (components/landing/data.ts), la misma fuente que usa la landing en
// producción: los importes del diseño coincidían con los reales al portarlo,
// pero importar en vez de retipear evita que un cambio de precio futuro deje
// esta vista previa con una cifra vieja.
//
// Rediseño 23-sep: sin «EL MÁS ELEGIDO» (con 0 estudios de pago no es verdad),
// los dos primeros planes llevan al alta con el mismo texto que el resto de la
// página y Cadena lleva a WhatsApp — antes «Hablar con ventas» iba al alta.

export function SeccionPrecio() {
  const whatsappCadena = enlaceWhatsApp(WHATSAPP_SOPORTE, 'Hola, tengo varios centros y quiero saber más de Tentare:') ?? '#';

  return (
    <section id="precio" className="v5-pre" aria-labelledby="v5-pre-h">
      <div className="v5-pre-wrap">
        <div className="v5-pre-cabecera lp-rv">
          <h2 id="v5-pre-h" className="v5-pre-h2">Precio público. Sin permanencia. Sin sorpresas.</h2>
          <p className="v5-pre-lead">Sustituciones incluidas desde el primer plan. Sin comisión sobre tus cobros.</p>
          {/* La promesa que quita el freno, justo encima de los importes: es
              donde se decide si se sigue leyendo o se cierra la pestaña. */}
          <p className="v5-pre-prueba">{TRIAL_DIAS} días gratis · Sin tarjeta de crédito</p>
        </div>
        <div className="v5-pre-grid">
          {PLANS.map((plan, n) => (
            <div key={plan.name} className={plan.dark ? 'v5-pre-card v5-pre-card-dark lp-rv' : 'v5-pre-card lp-rv'} style={{ ['--lp-r' as string]: n * 6 }}>
              <div className="v5-pre-nombre" style={{ color: plan.dark ? '#D9C29E' : '#8E8E86' }}>{plan.name.toUpperCase()}</div>
              <div className="v5-pre-precio" style={{ color: plan.dark ? '#fff' : '#1A1A1A' }}>
                {plan.price}<span className="v5-pre-mes">/mes</span>
              </div>
              <p className="v5-pre-desc" style={{ color: plan.dark ? '#A6A69E' : '#5A5A52' }}>{plan.desc}</p>
              <div className="v5-pre-features" style={{ borderTopColor: plan.dark ? 'rgba(255,255,255,.12)' : '#E7E7E0', color: plan.dark ? '#E8E8E4' : '#3B3B34' }}>
                {plan.features.map((f) => <span key={f}>{f}<br /></span>)}
              </div>
              {plan.contacto ? (
                <a href={whatsappCadena} target="_blank" rel="noopener noreferrer" className="v5-pre-cta">{plan.cta}</a>
              ) : (
                <Link href={ALTA} className={plan.popular ? 'v5-pre-cta v5-pre-cta-on' : 'v5-pre-cta'}>{plan.cta}</Link>
              )}
            </div>
          ))}
        </div>
        <p className="v5-pre-nota">IVA incluido · Sin permanencia · Te ayudamos a traer tus datos · Pagos con Stripe, sin comisión de Tentare</p>
        <Link href={SALIDAS.precio.href} className="v5-pre-salida">{SALIDAS.precio.label} →</Link>
      </div>

      <style>{`
        .v5-pre { background: #F3F3EF; border-top: 1px solid #E7E7E0; border-bottom: 1px solid #E7E7E0;
          padding: clamp(72px,11vw,110px) clamp(20px,4vw,48px); }
        .v5-pre-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-pre-cabecera { text-align: center; margin-bottom: 44px; }
        .v5-pre-h2 { font-size: clamp(28px,4.6vw,50px); font-weight: 800; line-height: 1; letter-spacing: -.04em; margin: 0 0 14px; }
        .v5-pre-lead { font-size: 16px; font-weight: 500; color: #5A5A52; margin: 0; }
        .v5-pre-prueba { display: inline-block; margin: 16px 0 0; padding: 7px 15px; border-radius: 999px;
          background: #343825; color: #D9C29E; font-size: 13px; font-weight: 700; letter-spacing: .01em; }
        .v5-pre-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(280px,1fr)); gap: 16px; align-items: stretch; }
        .v5-pre-card { position: relative; background: #fff; border: 1px solid #E7E7E0; border-radius: 20px; padding: 32px; display: flex; flex-direction: column;
          transition: box-shadow var(--motion-medium) var(--motion-ease), border-color var(--motion-medium); }
        /* Sombra y borde, no transform: la tarjeta ya lleva la entrada al hacer scroll. */
        .v5-pre-card:hover { box-shadow: 0 30px 60px -36px rgba(26,26,26,.28); border-color: #D9D9CE; }
        .v5-pre-card-dark { background: #131313; border: none; box-shadow: 0 40px 90px rgba(26,26,26,.3); }
        .v5-pre-destacado { position: absolute; top: -13px; left: 32px; background: #D9C29E; color: #22251A;
          font-size: 11px; font-weight: 800; letter-spacing: .1em; padding: 7px 14px; border-radius: 999px; }
        .v5-pre-nombre { font-size: 12.5px; font-weight: 800; letter-spacing: .12em; margin-bottom: 14px; }
        .v5-pre-precio { font-size: 48px; font-weight: 800; letter-spacing: -.03em; line-height: 1; }
        .v5-pre-mes { font-size: 16px; font-weight: 600; color: #8E8E86; }
        .v5-pre-desc { font-size: 14.5px; margin: 8px 0 22px; }
        .v5-pre-features { border-top: 1px solid; padding-top: 16px; font-size: 15px; font-weight: 500; line-height: 2.05; flex: 1; }
        .v5-pre-cta { display: block; text-align: center; margin-top: 24px; border: 1.5px solid #343825; color: #343825;
          font-weight: 800; padding: 14px; border-radius: 999px; transition: background var(--motion-normal), color var(--motion-normal), transform var(--motion-fast) var(--motion-ease); }
        .v5-pre-cta:hover { background: #343825; color: #D9C29E; }
        .v5-pre-cta:active { transform: scale(.98); }
        .v5-pre-cta-on { border: none; background: #D9C29E; color: #22251A; padding: 15px; }
        .v5-pre-cta-on:hover { color: #22251A; filter: brightness(1.05); }
        .v5-pre-nota { text-align: center; font-size: 13px; font-weight: 600; color: #8E8E86; margin: 28px 0 10px; }
        .v5-pre-salida { display: block; text-align: center; font-size: 15px; font-weight: 700; color: #55622C; }
        .v5-pre-salida:hover { text-decoration: underline; text-underline-offset: 4px; }
      `}</style>
    </section>
  );
}
