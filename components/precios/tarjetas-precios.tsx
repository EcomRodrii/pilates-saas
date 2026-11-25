'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PLANES, PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { novedadesFrenteAlAnterior, resumenCorto } from '@/lib/billing/catalogo-planes';
import { euros, importeDe, textoAhorro, type IntervaloUi } from '@/lib/billing/intervalo-ui';
import { CTA_ALTA, FRASE_FOUNDING, SI_PASAS_CON_COMPLEMENTOS, TOPE_GRATIS } from '@/lib/landing/founding-gratis';
import { NombrePlan } from '@/components/planes/nombre-plan';
import { SelectorIntervalo } from '@/components/planes/selector-intervalo';

// Las tres tarjetas de /precios con el selector Mensual / Anual. Es cliente solo
// por el selector: los precios, lo que añade cada plan y el ahorro salen de las
// mismas fuentes que lo que el producto cobra (entitlements y catálogo), nunca
// escritos aquí. El selector SOLO se pinta si el pago anual está disponible de
// verdad (los tres Price anuales en Stripe): ofrecer un precio que luego no se
// puede contratar sería peor que no ofrecerlo.

const RESUMEN: Record<Plan, { gancho: string; para: string; cta: string }> = {
  BASE: { gancho: 'Para empezar', para: 'Para estudios pequeños que quieren tener todo organizado.', cta: CTA_ALTA },
  ESTUDIO: { gancho: 'Recomendado', para: 'Para estudios que quieren crecer y automatizar su operación.', cta: CTA_ALTA },
  CADENA: { gancho: 'Varias sedes', para: 'Para negocios con varios centros que necesitan control centralizado.', cta: 'Hablar con nosotros' },
};

// Lo que cada plan añade, DERIVADO del catálogo (que a su vez sale de
// PLAN_ENTITLEMENTS): nada escrito a mano que pueda prometer lo que el
// servidor no deja hacer. Base enseña lo esencial; Estudio y Cadena, solo lo
// que suman frente al plan de al lado.
/** Lo más vendible primero: las filas del catálogo salen en su orden de categorías, no en el de venta. */
function ordenar(items: string[], prioridad: RegExp[]): string[] {
  const peso = (t: string) => { const i = prioridad.findIndex((r) => r.test(t)); return i === -1 ? prioridad.length : i; };
  return [...items].sort((a, b) => peso(a) - peso(b));
}

const INCLUYE: Record<Plan, { intro: string | null; items: string[] }> = {
  BASE: {
    intro: null,
    items: [...resumenCorto('BASE', null), 'Sustituciones con tu visto bueno'],
  },
  ESTUDIO: { intro: `Todo lo de ${PLAN_INFO.BASE.nombre}, y además:`, items: ordenar(novedadesFrenteAlAnterior('ESTUDIO', 'BASE'), [/Centro de Control/, /Piloto/, /Riesgo/, /autónomo/, /IA/, /Pregúntale/]) },
  CADENA: { intro: `Todo lo de ${PLAN_INFO.ESTUDIO.nombre}, y además:`, items: ordenar(novedadesFrenteAlAnterior('CADENA', 'ESTUDIO'), [/Varias sedes/, /suscripción/, /Menú/, /instructora/, /Pregúntale/]) },
};


export function TarjetasPrecios({ anualDisponible }: { anualDisponible: boolean }) {
  const [elegido, setElegido] = useState<IntervaloUi>('mensual');
  const intervalo: IntervaloUi = anualDisponible ? elegido : 'mensual';
  const anual = intervalo === 'anual';
  return (
    <>
      <div className="psh-barra">
        {anualDisponible
          ? <SelectorIntervalo valor={elegido} onCambio={setElegido} etiquetaAnual="Anual · 2 meses gratis" oscuro />
          : <span />}
        <a className="psh-enlace" href="#comparar">Comparar todas las características</a>
      </div>
      <div className="pre-grid">
        {PLANES.map((p) => {
          const inc = INCLUYE[p];
          return (
            <section key={p} className="psh-plan" aria-label={PLAN_INFO[p].nombre}>
              <div className="psh-plan-cabeza">
                <h2>{p === 'BASE' ? <NombrePlan plan={p} tamano={22} /> : PLAN_INFO[p].nombre}</h2>
                <p className="psh-precio">
                  {p === 'BASE' ? 'Gratis' : <>{euros(importeDe(PLAN_INFO[p].precioMes, intervalo))} €<span>/{anual ? 'año' : 'mes'}</span></>}
                </p>
              </div>
              {/* Para quién es: lo primero que se lee tras el precio. */}
              <p className="psh-para">{p === 'ESTUDIO' ? `${RESUMEN[p].gancho} · ${RESUMEN[p].para}` : RESUMEN[p].para}</p>
              {/* Alto fijo en escritorio: los tres botones quedan a la misma altura. */}
              <div className="psh-notas">
                {/* «IVA incluido» pegado a la cifra, no en una nota al pie: el precio de un SaaS español se lee para
                    compararlo con otro, y «29 €» sin decir nada admite dos lecturas que se llevan un 21 %. */}
                {p === 'BASE' ? (
                  <>
                    {/* Lo gratis tiene un límite; pasado, el mismo plan a su precio. */}
                    <p className="psh-nota">{TOPE_GRATIS} · {SI_PASAS_CON_COMPLEMENTOS}</p>
                    {anual && (
                      <p className="psh-nota psh-nota--fuerte">
                        Pagando el año: {euros(importeDe(PLAN_INFO.BASE.precioMes, 'anual'))} € en vez de {euros(PLAN_INFO.BASE.precioMes * 12)} €. {textoAhorro(PLAN_INFO.BASE.precioMes)}.
                      </p>
                    )}
                    <p className="psh-frase nombre-plan-founding">{FRASE_FOUNDING}</p>
                  </>
                ) : (
                  <>
                    <p className="psh-nota">{anual ? `Facturado ${euros(importeDe(PLAN_INFO[p].precioMes, 'anual'))} € al año · IVA incluido` : 'IVA incluido'}</p>
                    {anual && <p className="psh-nota psh-nota--fuerte">{textoAhorro(PLAN_INFO[p].precioMes)} · 2 meses gratis</p>}
                  </>
                )}
              </div>
              <Link href={p === 'CADENA' ? 'mailto:hola@tentare.app?subject=Plan%20Cadena' : '/crear-estudio'} className="psh-boton">
                {RESUMEN[p].cta}
              </Link>
              <p className="psh-bajo">
                Sin permanencia · Cancela cuando quieras
                {anual && p !== 'CADENA' && <><br />Empiezas gratis; el pago anual lo eliges al contratar.</>}
              </p>
              <ul className="psh-lista">
                {inc.intro && <li className="psh-lista-intro">{inc.intro}</li>}
                {inc.items.map((texto) => <li key={texto}>{texto}</li>)}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="psh-pie-planes">Pagos seguros con Stripe · Configuración guiada · Precios con IVA incluido</p>
    </>
  );
}
