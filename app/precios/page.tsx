import type { Metadata } from 'next';
import Link from 'next/link';
import { PildoraBusqueda } from '@/components/recursos/PildoraBusqueda';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { FeatureFaq } from '@/components/funcionalidades/bloques';
import { ComparativaPlanes } from '@/components/planes/comparativa-planes';
import { PLANES, PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { PLANS } from '@/components/landing/data';
import { COMPLEMENTOS_DE_PAGO, CTA_ALTA, FRASE_FOUNDING, GRATIS_ALUMNAS, GRATIS_MARGEN_DIAS, GRATIS_RESERVAS_MES, LIMITES_GRATIS, PRECIO_FOUNDING_PAGO, SI_PASAS, TOPE_GRATIS } from '@/lib/landing/founding-gratis';
import { funcionalidades, paginaDe, urlDe } from '@/lib/seo/paginas';
import { softwareApplicationLd } from '@/lib/seo/software-application';
import { NombrePlan } from '@/components/planes/nombre-plan';

const PATH = '/precios';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { siteName: 'Tentare', type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH), images: [{ url: '/precios/opengraph-image' }] },
};

// Precios, topes y features salen de lib/billing/entitlements.ts — la MISMA
// fuente que gobierna lo que el producto deja hacer de verdad. Escribirlos a
// mano aquí sería la vía rápida a una página de precios que promete un límite
// distinto del que aplica el servidor.
//
// ⚠️ Nada de «el más elegido» ni de «más popular» sin datos que lo respalden
// (retirado el 23-sep con OK del fundador: no había ningún estudio de pago). El
// texto del botón es el mismo que en la home (`CTA_ALTA`): desde el 15-oct-2026
// no hay prueba de 7 días, se empieza en Founding Studio gratis, con todo.
const RESUMEN: Record<Plan, { gancho: string; para: string; cta: string }> = {
  BASE: { gancho: 'Para empezar', para: 'Un estudio con una sala y una o dos instructoras.', cta: CTA_ALTA },
  // Estudio ya no se vende por el equipo ni por las alumnas: Founding Studio
  // también los tiene, sin tope (15-oct-2026). El mismo texto que la home.
  ESTUDIO: { gancho: 'Más consultas al asistente', para: PLANS.find((x) => x.id === 'ESTUDIO')!.desc, cta: CTA_ALTA },
  CADENA: { gancho: 'Varias sedes', para: 'Dos o más centros bajo la misma marca.', cta: 'Hablar con nosotros' },
};

// La comparativa por categorías vive en lib/billing/catalogo-planes.ts y la
// pinta <ComparativaPlanes>. Esta página tenía su propia lista de 11 filas
// escrita a mano, y /suscripcion otra distinta de 4 bullets por plan: dos
// promesas del mismo producto que ya habían empezado a separarse. Qué entra y
// qué no (p. ej. marketing, apagado otra vez desde el 2026-08-19) se decide
// allí, no aquí.

// Las dos preguntas de la prueba de 7 días se fueron con ella (15-oct-2026):
// ya no hay prueba, se empieza en Founding Studio gratis.
const FAQ = [
  {
    q: '¿Hay permanencia?',
    a: 'No. Se paga mes a mes y se cancela cuando quieras. Tus datos son tuyos: puedes exportar alumnas, historial y facturas en cualquier momento, también al irte.',
  },
  {
    q: '¿Os lleváis una comisión de lo que cobro a mis alumnas?',
    a: 'No. Tentare no añade ninguna comisión sobre tus cobros ni tiene un marketplace donde competir por tus clientas. Lo que sí pagas es la comisión de Stripe por procesar cada pago, que es de Stripe y la ves en su propio panel.',
  },
  {
    q: `¿Qué pasa si supero las ${GRATIS_ALUMNAS} alumnas activas o las ${GRATIS_RESERVAS_MES} reservas al mes del plan Founding Studio?`,
    a: `Sigues en ${PLAN_INFO.BASE.nombre} por ${PRECIO_FOUNDING_PAGO} € al mes, con IVA incluido y sin tope de alumnas ni de reservas. Tienes ${GRATIS_MARGEN_DIAS} días para pasarte; si no, se cierra el panel y la app de tus alumnas sigue funcionando.`,
  },
  {
    q: '¿Y si un mes falla el cobro de mi suscripción?',
    a: 'No se corta el servicio a la primera. Mientras el pago está en reintento el estudio sigue funcionando, para que un problema puntual de tarjeta no deje a tus alumnas sin poder reservar.',
  },
  {
    q: '¿La migración desde otra plataforma cuesta aparte?',
    a: 'No se cobra aparte. Traes tus datos con los asistentes de importación y te acompañamos en la puesta en marcha; tu sistema actual puede seguir funcionando mientras tanto.',
  },
  {
    q: '¿Puedo cambiar de plan más adelante?',
    a: 'Sí, en los dos sentidos. Si bajas de plan, las funciones exclusivas del plan superior dejan de estar disponibles — por ejemplo, las varias sedes al dejar el plan Cadena.',
  },
];

export default function PreciosPage() {
  // SoftwareApplication + Offer: el MISMO nodo (`/#software`) que pinta la home,
  // construido en lib/seo/software-application.ts (con las ofertas de Founding
  // Studio gratis). Una sola entidad, un solo objeto: repetirlo con datos
  // distintos en cada página la hace contradecirse.
  const ofertaLd = softwareApplicationLd();

  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Precios" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ofertaLd).replace(/</g, '\\u003c') }} />
      <IslaWeb />

      <header style={{ position: 'relative', padding: 'clamp(44px,6.5vw,84px) clamp(20px,4vw,44px) clamp(26px,3.5vw,38px)', textAlign: 'center' }}>
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ fontWeight: 600, fontSize: 'clamp(36px,5.2vw,60px)', lineHeight: 1.04, letterSpacing: 'var(--w-track-display)', margin: '0 0 18px', color: 'var(--w-texto)' }}>
            <PildoraBusqueda centrada>Precios del software para estudios de Pilates</PildoraBusqueda>
            Precio público.<br />Sin permanencia.
          </h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: 'var(--w-texto-2)', margin: '0 auto', maxWidth: 560 }}>
            Tres planes, publicados. Sin «solicita una demo para saber el precio», sin comisión sobre tus cobros y sin
            contrato anual.
          </p>
          <p style={{ display: 'inline-block', marginTop: 20, padding: '8px 16px', borderRadius: 999, background: 'var(--w-olive)', color: 'var(--w-sand)', fontSize: 14, fontWeight: 600 }}>
            Empieza gratis · Sin tarjeta de crédito
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 clamp(20px,4vw,44px) clamp(52px,7vw,84px)' }}>
        <div className="pre-grid">
          {PLANES.map((p) => {
            const destacado = p === 'ESTUDIO';
            return (
              <div
                key={p}
                style={{
                  background: destacado ? 'var(--w-noche)' : 'var(--w-papel)',
                  color: destacado ? 'var(--w-sobre-noche)' : undefined,
                  border: destacado ? 'none' : '1px solid var(--w-linea)',
                  borderRadius: 'var(--w-r-tarjeta)', padding: 'clamp(26px,3vw,34px)', position: 'relative',
                  boxShadow: destacado ? 'var(--w-sombra-flotante)' : undefined,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 600, color: destacado ? 'var(--w-sand)' : 'var(--w-texto)', marginBottom: 12 }}>{p === 'BASE' ? <NombrePlan plan={p} tamano={26} /> : PLAN_INFO[p].nombre}</div>
                <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: '-.035em', color: destacado ? 'var(--w-sobre-noche)' : 'var(--w-texto)', lineHeight: 1 }}>
                  {p === 'BASE' ? 'Gratis' : <>{PLAN_INFO[p].precioMes}€<span style={{ fontSize: 15, fontWeight: 500, color: destacado ? 'var(--w-sobre-noche-3)' : 'var(--w-texto-3)' }}>/mes</span></>}
                </div>
                {/* «IVA incluido» pegado a la cifra, no en una nota al pie de la
                    página: el precio de un SaaS español se lee para compararlo
                    con otro, y "29 €" sin decir nada admite dos lecturas que se
                    llevan un 21%. Misma frase que ya se ve en /suscripcion, que
                    la pidió una clienta con estas palabras (P2-20) — no una
                    redacción nueva para decir lo mismo. */}
                {p === 'BASE' ? (
                  <>
                    {/* Lo gratis tiene un límite de cobros; pasado, el mismo plan a su precio. */}
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--w-texto-3)', marginTop: 9, lineHeight: 1.45 }}>
                      {TOPE_GRATIS} · {SI_PASAS}
                    </div>
                    {/* La frase del fundador, junto a Founding Studio. En la
                        cursiva de su nombre (NombrePlan): es una promesa, no un dato. */}
                    <p className="nombre-plan-founding" style={{ fontSize: 19, lineHeight: 1.3, color: 'var(--w-texto)', margin: '12px 0 0' }}>{FRASE_FOUNDING}</p>
                  </>
                ) : (
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: destacado ? 'var(--w-sobre-noche-3)' : 'var(--w-texto-3)', marginTop: 9 }}>
                    IVA incluido
                  </div>
                )}
                <p style={{ fontSize: 14.5, lineHeight: 1.5, color: destacado ? 'var(--w-sobre-noche-2)' : 'var(--w-texto-2)', margin: '10px 0 6px' }}>{RESUMEN[p].para}</p>
                <div style={{ height: 14 }} />
                <Link
                  href={p === 'CADENA' ? 'mailto:hola@tentare.app?subject=Plan%20Cadena' : '/crear-estudio'}
                  className="block hover:brightness-110 transition-all"
                  style={{ textAlign: 'center', display: 'block', background: destacado ? 'var(--w-sand)' : 'var(--w-olive)', color: destacado ? 'var(--w-olive)' : 'var(--w-sand)', fontWeight: 600, fontSize: 15, padding: 14, borderRadius: 999, textDecoration: 'none' }}
                >
                  {RESUMEN[p].cta}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Respuesta directa a la pregunta que se hace quien compara: pasaje
            autocontenido de ~130 palabras, con las cifras de entitlements.ts
            (nunca escritas a mano). Lo lee igual una persona que un buscador. */}
        <section style={{ marginTop: 'clamp(48px,6vw,72px)' }}>
          <h2 style={{ fontWeight: 600, fontSize: 'clamp(24px,2.8vw,34px)', letterSpacing: 'var(--w-track-h2)', color: 'var(--w-texto)', margin: '0 0 12px' }}>¿Cuánto cuesta un software de gestión para un estudio de Pilates?</h2>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--w-texto-2)', margin: 0, maxWidth: 820 }}>
            Tentare es gratis en el plan {PLAN_INFO.BASE.nombre} (todas las funcionalidades menos varias sedes,{' '}
            {LIMITES_GRATIS}; {SI_PASAS}, y con ese plan {COMPLEMENTOS_DE_PAGO} van aparte), cuesta {PLAN_INFO.ESTUDIO.precioMes} € al mes en el plan{' '}
            {PLAN_INFO.ESTUDIO.nombre}, que los incluye, y{' '}
            {PLAN_INFO.CADENA.precioMes} € en el plan {PLAN_INFO.CADENA.nombre} (dos o más centros bajo la misma marca).
            Los precios son públicos, con IVA incluido y sin permanencia. Tentare no añade ninguna comisión sobre lo que
            cobras a tus alumnas: solo pagas la de Stripe por procesar cada cobro con tarjeta, que es de Stripe. Traer
            tus datos desde otra plataforma no se cobra aparte.
          </p>
        </section>

        <section style={{ marginTop: 'clamp(44px,5.5vw,68px)' }}>
          <h2 style={{ fontWeight: 600, fontSize: 'clamp(24px,2.8vw,34px)', letterSpacing: 'var(--w-track-h2)', color: 'var(--w-texto)', margin: '0 0 8px' }}>Qué incluye cada plan</h2>
          <p style={{ fontSize: 16, color: 'var(--w-texto-2)', margin: '0 0 22px' }}>
            Lo esencial —reservas, cobros, facturación y fichas— está en los tres. Lo que cambia es el tamaño: alumnas,
            reservas al mes y sedes.
          </p>
          <ComparativaPlanes todoAbierto destacado="ESTUDIO" foundingGratis />
          <p style={{ fontSize: 14, color: 'var(--w-texto-3)', margin: '14px 0 0' }}>
            Cada funcionalidad tiene su página con el detalle: <Link href="/funcionalidades" style={{ color: 'var(--w-olive)', textDecoration: 'underline', textUnderlineOffset: 3 }}>ver todas</Link>
          </p>
        </section>

        <section style={{ marginTop: 'clamp(44px,5.5vw,68px)' }}>
          <h2 style={{ fontWeight: 600, fontSize: 'clamp(24px,2.8vw,34px)', letterSpacing: 'var(--w-track-h2)', color: 'var(--w-texto)', margin: '0 0 8px' }}>Qué se paga aparte y qué no</h2>
          <p style={{ fontSize: 16, color: 'var(--w-texto-2)', margin: '0 0 22px' }}>Dicho antes de que lo preguntes, porque es donde el sector suele esconder cosas.</p>
          <div className="pre-dos">
            <div style={{ background: 'var(--w-papel)', border: '1px solid var(--w-linea)', borderRadius: 'var(--w-r-tarjeta)', padding: '24px 26px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--w-exito)', marginBottom: 14 }}>Incluido en la cuota</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                {['Todas las funcionalidades de tu plan', 'Actualizaciones y funciones nuevas', 'Importación de tus datos desde otra plataforma', 'Soporte en español', 'Facturas con numeración legal y huella encadenada', 'Exportación de tus datos cuando quieras'].map((t) => (
                  <li key={t} style={{ display: 'flex', gap: 9, fontSize: 14.5, lineHeight: 1.5, color: 'var(--w-texto)' }}>
                    <span style={{ color: 'var(--w-exito)', flexShrink: 0 }}>✓</span>{t}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ background: 'var(--w-papel)', border: '1px solid var(--w-linea)', borderRadius: 'var(--w-r-tarjeta)', padding: '24px 26px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--w-aviso)', marginBottom: 14 }}>No lo cobramos nosotros</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                <li style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--w-texto)' }}>
                  <strong>La comisión de Stripe</strong> por procesar cada cobro con tarjeta. Es de Stripe, la ves en su
                  panel y Tentare no añade nada encima.
                </li>
                <li style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--w-texto)' }}>
                  <strong>Tu número de WhatsApp Business</strong>, si quieres enviar por ese canal: se conecta tu propia
                  cuenta de Meta, no una compartida.
                </li>
                <li style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--w-texto)' }}>
                  <strong>Lo que te cobre tu banco</strong> por presentar remesas SEPA, si cobras por domiciliación.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 'clamp(44px,5.5vw,68px)' }}>
          <h2 style={{ fontWeight: 600, fontSize: 'clamp(24px,2.8vw,34px)', letterSpacing: 'var(--w-track-h2)', color: 'var(--w-texto)', margin: '0 0 18px' }}>Preguntas sobre el precio</h2>
          <FeatureFaq items={FAQ} />
        </section>

        <section style={{ marginTop: 'clamp(44px,5.5vw,68px)' }}>
          <h2 style={{ fontWeight: 600, fontSize: 'clamp(24px,2.8vw,34px)', letterSpacing: 'var(--w-track-h2)', color: 'var(--w-texto)', margin: '0 0 8px' }}>Antes de decidir</h2>
          <p style={{ fontSize: 16, color: 'var(--w-texto-2)', margin: '0 0 20px' }}>Mira en detalle lo que vas a usar cada día.</p>
          <div className="pre-links">
            {funcionalidades().slice(0, 6).map((f) => (
              <Link key={f.path} href={f.path} style={{ display: 'block', background: 'var(--w-papel)', border: '1px solid var(--w-linea)', borderRadius: 16, padding: '15px 17px', textDecoration: 'none', color: 'inherit', fontSize: 14.5, fontWeight: 600 }}>
                {f.etiqueta}
              </Link>
            ))}
          </div>
          <p style={{ fontSize: 15, color: 'var(--w-texto-2)', margin: '18px 0 0' }}>
            Y si vienes de otra plataforma, la <Link href="/comparativa" style={{ color: 'var(--w-olive)', textDecoration: 'underline', textUnderlineOffset: 3 }}>comparativa</Link> va punto
            por punto — incluido lo que ellos hacen mejor.
          </p>
        </section>
      </div>

      <PieWeb />

      <style>{`
        .pre-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; align-items: start; }
        .pre-dos { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .pre-links { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
        @media (max-width: 900px) {
          .pre-grid { grid-template-columns: 1fr; max-width: 440px; margin: 0 auto; }
          .pre-dos { grid-template-columns: 1fr; }
          .pre-links { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 560px) { .pre-links { grid-template-columns: 1fr; } }
      `}</style>
    </PageShell>
  );
}
