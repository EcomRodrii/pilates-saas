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
const INCLUYE: Record<Plan, { intro: string | null; items: string[] }> = {
  BASE: {
    intro: null,
    items: [...resumenCorto('BASE', null), 'Sustituciones con tu visto bueno'],
  },
  ESTUDIO: { intro: `Todo lo de ${PLAN_INFO.BASE.nombre}, y además:`, items: novedadesFrenteAlAnterior('ESTUDIO', 'BASE') },
  CADENA: { intro: `Todo lo de ${PLAN_INFO.ESTUDIO.nombre}, y además:`, items: novedadesFrenteAlAnterior('CADENA', 'ESTUDIO') },
};


export function TarjetasPrecios({ anualDisponible }: { anualDisponible: boolean }) {
  const [elegido, setElegido] = useState<IntervaloUi>('mensual');
  const intervalo: IntervaloUi = anualDisponible ? elegido : 'mensual';
  const anual = intervalo === 'anual';
  return (
    <>
      {anualDisponible && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 28px' }}>
          <SelectorIntervalo valor={elegido} onCambio={setElegido} etiquetaAnual="Anual · 2 meses gratis" />
        </div>
      )}
      <div className="pre-grid">
          {PLANES.map((p) => {
            const destacado = p === 'ESTUDIO';
            const inc = INCLUYE[p];
            return (
              <div
                key={p}
                className={destacado ? 'pre-card pre-card-rec' : 'pre-card'}
                style={{
                  background: destacado ? 'var(--w-noche)' : 'var(--w-papel)',
                  color: destacado ? 'var(--w-sobre-noche)' : undefined,
                  border: destacado ? 'none' : '1px solid var(--w-linea)',
                  borderRadius: 'var(--w-r-tarjeta)', padding: destacado ? 'clamp(30px,3.4vw,40px) clamp(26px,3vw,34px)' : 'clamp(26px,3vw,34px)', position: 'relative',
                  boxShadow: destacado ? 'var(--w-sombra-flotante)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, minHeight: 26 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: destacado ? 'var(--w-sand)' : 'var(--w-texto)' }}>{p === 'BASE' ? <NombrePlan plan={p} tamano={26} /> : PLAN_INFO[p].nombre}</div>
                  {destacado && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--w-olive)', background: 'var(--w-sand)', borderRadius: 999, padding: '4px 10px' }}>
                      {RESUMEN[p].gancho}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: '-.035em', color: destacado ? 'var(--w-sobre-noche)' : 'var(--w-texto)', lineHeight: 1 }}>
                  {p === 'BASE' ? 'Gratis' : <>{euros(importeDe(PLAN_INFO[p].precioMes, intervalo))}€<span style={{ fontSize: 15, fontWeight: 500, color: destacado ? 'var(--w-sobre-noche-3)' : 'var(--w-texto-3)' }}>/{anual ? 'año' : 'mes'}</span></>}
                </div>
                {/* «IVA incluido» pegado a la cifra, no en una nota al pie de la
                    página: el precio de un SaaS español se lee para compararlo
                    con otro, y "29 €" sin decir nada admite dos lecturas que se
                    llevan un 21%. Misma frase que ya se ve en /suscripcion, que
                    la pidió una clienta con estas palabras (P2-20). */}
                {p === 'BASE' ? (
                  <>
                    {/* Lo gratis tiene un límite de cobros; pasado, el mismo plan a su precio. */}
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--w-texto-3)', marginTop: 9, lineHeight: 1.45 }}>
                      {TOPE_GRATIS} · {SI_PASAS_CON_COMPLEMENTOS}
                    </div>
                    {anual && (
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--w-texto-2)', marginTop: 6, lineHeight: 1.45 }}>
                        Pagando el año: {euros(importeDe(PLAN_INFO.BASE.precioMes, 'anual'))} € en vez de {euros(PLAN_INFO.BASE.precioMes * 12)} €. {textoAhorro(PLAN_INFO.BASE.precioMes)}.
                      </div>
                    )}
                    {/* La frase del fundador, junto a Founding Studio. En la
                        cursiva de su nombre (NombrePlan): es una promesa, no un dato. */}
                    <p className="nombre-plan-founding" style={{ fontSize: 19, lineHeight: 1.3, color: 'var(--w-texto)', margin: '12px 0 0' }}>{FRASE_FOUNDING}</p>
                  </>
                ) : (
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: destacado ? 'var(--w-sobre-noche-3)' : 'var(--w-texto-3)', marginTop: 9 }}>
                    {anual ? `Facturado ${euros(importeDe(PLAN_INFO[p].precioMes, 'anual'))} € al año · IVA incluido` : 'IVA incluido'}
                    {anual && (
                      <div style={{ marginTop: 4, fontWeight: 600, color: destacado ? 'var(--w-sand)' : 'var(--w-exito)' }}>
                        {textoAhorro(PLAN_INFO[p].precioMes)} · 2 meses gratis
                      </div>
                    )}
                  </div>
                )}
                {/* Para quién es: lo primero que se lee tras el precio. */}
                <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.45, color: destacado ? 'var(--w-sobre-noche)' : 'var(--w-texto)', margin: '14px 0 0' }}>{RESUMEN[p].para}</p>
                <Link
                  href={p === 'CADENA' ? 'mailto:hola@tentare.app?subject=Plan%20Cadena' : '/crear-estudio'}
                  className="block hover:brightness-110 transition-all"
                  style={{ textAlign: 'center', display: 'block', background: destacado ? 'var(--w-sand)' : 'var(--w-olive)', color: destacado ? 'var(--w-olive)' : 'var(--w-sand)', fontWeight: 600, fontSize: destacado ? 16 : 15, padding: destacado ? '15px 18px' : '13px 18px', borderRadius: 999, textDecoration: 'none', marginTop: 20 }}
                >
                  {RESUMEN[p].cta}
                </Link>
                <p style={{ fontSize: 12.5, lineHeight: 1.4, textAlign: 'center', color: destacado ? 'var(--w-sobre-noche-3)' : 'var(--w-texto-3)', margin: '10px 0 0' }}>
                  Sin permanencia · Cancela cuando quieras
                </p>
                {anual && p !== 'CADENA' && (
                  <p style={{ fontSize: 12.5, lineHeight: 1.4, textAlign: 'center', color: destacado ? 'var(--w-sobre-noche-3)' : 'var(--w-texto-3)', margin: '4px 0 0' }}>
                    Empiezas gratis; el pago anual lo eliges al contratar.
                  </p>
                )}
                <div style={{ height: 1, background: destacado ? 'rgba(255,255,255,.14)' : 'var(--w-linea)', margin: '20px 0 16px' }} />
                {inc.intro && <p style={{ fontSize: 13.5, fontWeight: 600, margin: '0 0 10px', color: destacado ? 'var(--w-sand)' : 'var(--w-texto)' }}>{inc.intro}</p>}
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
                  {inc.items.map((t) => (
                    <li key={t} style={{ display: 'flex', gap: 9, fontSize: 14, lineHeight: 1.45, color: destacado ? 'var(--w-sobre-noche-2)' : 'var(--w-texto-2)' }}>
                      <span aria-hidden="true" style={{ color: destacado ? 'var(--w-sand)' : 'var(--w-exito)', flexShrink: 0 }}>✓</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--w-texto-3)', margin: '22px 0 0' }}>
          Pagos seguros con Stripe · Configuración guiada · Precios con IVA incluido
        </p>
    </>
  );
}
