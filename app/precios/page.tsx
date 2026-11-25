import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { PildoraBusqueda } from '@/components/recursos/PildoraBusqueda';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { FeatureFaq } from '@/components/funcionalidades/bloques';
import { ComparativaPlanes } from '@/components/planes/comparativa-planes';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import { anualDisponible } from '@/lib/billing/billing';
import { TarjetasPrecios } from '@/components/precios/tarjetas-precios';
import { COMPLEMENTOS_DE_PAGO, GRATIS_MARGEN_DIAS, GRATIS_RESERVAS_MES, LIMITES_GRATIS, PRECIO_FOUNDING_PAGO, SI_PASAS, CTA_ALTA } from '@/lib/landing/founding-gratis';
import { funcionalidades, paginaDe, urlDe } from '@/lib/seo/paginas';
import { softwareApplicationLd } from '@/lib/seo/software-application';
import { ADDONS, LISTA_ADDONS, type Addon, type Plan } from '@/lib/billing/entitlements';
import Image from 'next/image';
import { variablesInter } from '../_fuentes/fuentes-inter';
import './precios.css';

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
    a: 'No. Puedes pagar mes a mes o por años, y cancelar cuando quieras. Tus datos son tuyos: puedes exportar alumnas, historial y facturas en cualquier momento, también al irte.',
  },
  {
    q: '¿Os lleváis una comisión de lo que cobro a mis alumnas?',
    a: 'No. Tentare no añade ninguna comisión sobre tus cobros ni tiene un marketplace donde competir por tus clientas. Lo que sí pagas es la comisión de Stripe por procesar cada pago, que es de Stripe y la ves en su propio panel.',
  },
  {
    q: `¿Qué pasa si supero las ${GRATIS_RESERVAS_MES} reservas al mes del plan Founding Studio?`,
    a: `Sigues en ${PLAN_INFO.BASE.nombre} por ${PRECIO_FOUNDING_PAGO} € al mes, con IVA incluido y sin tope de alumnas ni de reservas; con ese plan, ${COMPLEMENTOS_DE_PAGO} van aparte, como complementos. Tienes ${GRATIS_MARGEN_DIAS} días para pasarte; si no, se cierra el panel y la app de tus alumnas sigue funcionando. Las reservas se cuentan sobre los últimos 30 días, y si tienes varios estudios en el plan gratis, se suman. En el plan gratis, la redacción con IA tiene además un tope de 40 usos al día.`,
  },
  {
    q: '¿Y si un mes falla el cobro de mi suscripción?',
    a: 'No se corta el servicio a la primera. Mientras el pago está en reintento el estudio sigue funcionando, para que un problema puntual de tarjeta no deje a tus alumnas sin poder reservar.',
  },
  {
    q: '¿La migración desde otra plataforma cuesta aparte?',
    a: 'No se cobra aparte. Traes tus datos con los asistentes de importación; tu sistema actual puede seguir funcionando mientras tanto.',
  },
  {
    q: '¿Puedo cambiar de plan más adelante?',
    a: 'Sí, en los dos sentidos. Si bajas de plan, las funciones exclusivas del plan superior dejan de estar disponibles — por ejemplo, las varias sedes al dejar el plan Cadena.',
  },
];

// Lo que va en todos los planes, enseñado con capturas del propio producto.
const SIEMPRE = [
  { img: '/landing-nueva/panel-resumen-1600.webp', w: 1600, h: 1000, titulo: 'Tu estudio en un panel', texto: 'Calendario por semana, día y sala, con control de asistencia y check-in.', grande: true },
  { img: '/landing/capturas/app-alumna-inicio-v2-estudio-pilates-780.webp', w: 780, h: 1696, titulo: 'La app de tus alumnas, con tu marca', texto: 'Reserva, bonos, facturas y pase de acceso, desde el móvil.', grande: true },
  { img: '/landing/capturas/app-alumna-reservar-manana-780.webp', w: 780, h: 1696, titulo: 'Reservas y lista de espera', texto: 'Cuando alguien cancela, la plaza se ofrece sola a la siguiente.', grande: false },
  { img: '/landing/capturas/app-alumna-mi-plan-780.webp', w: 780, h: 1696, titulo: 'Bonos y cuotas', texto: 'Cuotas mensuales, bonos de sesiones y renovación automática.', grande: false },
  { img: '/producto/v2/panel-clientas-1110.webp', w: 1110, h: 489, titulo: 'Fichas de tus alumnas', texto: 'Historial, ficha de salud con permisos aparte e importación desde tu plataforma actual.', grande: false },
];

const COMPLEMENTOS: Record<Addon, { img: string; w: number; h: number; href: string }> = {
  decisiones: { img: '/landing-nueva/meditacion-1400.webp', w: 1400, h: 788, href: '/funcionalidades/informes' },
  sustituciones: { img: '/landing/fotos/reformers-madera-tapizado-negro-plazas-1440.webp', w: 1440, h: 900, href: '/funcionalidades/sustituciones' },
  ia: { img: '/landing-nueva/retrato-1600.webp', w: 1600, h: 900, href: '/funcionalidades/ficha-de-clienta' },
};

const botonDeTabla = (href: string, texto: string) => <Link href={href} className="psh-boton psh-boton--tabla">{texto}</Link>;
const BOTONES_TABLA: Record<Plan, ReactNode> = {
  BASE: botonDeTabla('/crear-estudio', CTA_ALTA),
  ESTUDIO: botonDeTabla('/crear-estudio', CTA_ALTA),
  CADENA: botonDeTabla('mailto:hola@tentare.app?subject=Plan%20Cadena', 'Hablar con nosotros'),
};

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
      <div className={`psh ${variablesInter}`}>
        <IslaWeb />

        <header className="psh-heroe">
          <h1>
            <PildoraBusqueda centrada>Precios del software para estudios de Pilates</PildoraBusqueda>
            Precio público. Sin permanencia.
          </h1>
          <p>
            Tres planes, publicados. Sin «solicita una demo para saber el precio», sin comisión sobre tus cobros y sin
            permanencia (también si pagas por años).
          </p>
          <p className="psh-gratis">Empieza gratis · Sin tarjeta de crédito</p>
        </header>

        <div className="psh-ancho psh-planes">
          <TarjetasPrecios anualDisponible={anualDisponible()} />
        </div>

        <div className="psh-banda">
          <div className="psh-ancho">
            <h2>Siempre incluido</h2>
            <div className="psh-incluidos">
              {SIEMPRE.map((s) => (
                <article key={s.titulo} className={s.grande ? 'psh-incluido psh-incluido--grande' : 'psh-incluido'}>
                  <div className="psh-marco"><Image src={s.img} alt="" width={s.w} height={s.h} sizes={s.grande ? '(max-width: 900px) 100vw, 620px' : '(max-width: 900px) 100vw, 400px'} /></div>
                  <h3>{s.titulo}</h3>
                  <p>{s.texto}</p>
                </article>
              ))}
            </div>

            <h2 className="psh-sep">Complementos para {PLAN_INFO.BASE.nombre} de pago</h2>
            <div className="psh-extras">
              {LISTA_ADDONS.map((a) => (
                <article key={a} className="psh-extra">
                  <Image src={COMPLEMENTOS[a].img} alt="" width={COMPLEMENTOS[a].w} height={COMPLEMENTOS[a].h} sizes="(max-width: 900px) 100vw, 400px" />
                  <div className="psh-extra-cabeza">
                    <h3>{ADDONS[a].nombre}</h3>
                    <span className="psh-etiqueta">Complemento</span>
                    <p className="psh-precio">+{ADDONS[a].precioMes} €<span>/mes</span></p>
                  </div>
                  <p>{ADDONS[a].resumen}</p>
                  <Link href={COMPLEMENTOS[a].href} className="psh-boton">Más información</Link>
                </article>
              ))}
            </div>

            {/* Respuesta directa a la pregunta que se hace quien compara: pasaje
                autocontenido, con las cifras de entitlements.ts (nunca escritas a
                mano). Lo lee igual una persona que un buscador. */}
            <section className="psh-caja psh-sep">
              <h2>¿Cuánto cuesta un software de gestión para un estudio de Pilates?</h2>
              <p>
                Tentare es gratis en el plan {PLAN_INFO.BASE.nombre} (todas las funcionalidades menos varias sedes,{' '}
                {LIMITES_GRATIS}; {SI_PASAS}, y con ese plan {COMPLEMENTOS_DE_PAGO} van aparte), cuesta {PLAN_INFO.ESTUDIO.precioMes} € al mes en el plan{' '}
                {PLAN_INFO.ESTUDIO.nombre}, que los incluye, y{' '}
                {PLAN_INFO.CADENA.precioMes} € en el plan {PLAN_INFO.CADENA.nombre} (dos o más centros bajo la misma marca).
                Los precios son públicos, con IVA incluido y sin permanencia. Tentare no añade ninguna comisión sobre lo que
                cobras a tus alumnas: solo pagas la de Stripe por procesar cada cobro con tarjeta, que es de Stripe. Traer
                tus datos desde otra plataforma no se cobra aparte.
              </p>
            </section>

            <h2 className="psh-sep">Qué se paga aparte y qué no</h2>
            <p className="psh-entradilla">Dicho antes de que lo preguntes, porque es donde el sector suele esconder cosas.</p>
            <div className="pre-dos">
              <div className="psh-caja">
                <h3>Incluido en la cuota</h3>
                <ul>
                  {['Todas las funcionalidades de tu plan', 'Actualizaciones y funciones nuevas', 'Importación de tus datos desde otra plataforma', 'Soporte en español', 'Facturas con numeración legal correlativa', 'Exportación de tus datos cuando quieras'].map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <div className="psh-caja">
                <h3>No lo cobramos nosotros</h3>
                <ul>
                  <li><strong>La comisión de Stripe</strong> por procesar cada cobro con tarjeta. Es de Stripe, la ves en su panel y Tentare no añade nada encima.</li>
                  <li><strong>Tu número de WhatsApp Business</strong>, si quieres enviar por ese canal: se conecta tu propia cuenta de Meta, no una compartida.</li>
                  <li><strong>Lo que te cobre tu banco</strong> por presentar remesas SEPA, si cobras por domiciliación.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <section id="comparar" className="psh-comparar">
          <div className="psh-ancho">
            <h2>Todo lo que incluye Tentare</h2>
            <p className="psh-entradilla">
              Lo esencial —reservas, cobros, facturación y fichas— está en los tres. Lo que cambia es cuánto se automatiza y se
              controla —Centro de Control, sustituciones autónomas, IA— y las sedes; y en {PLAN_INFO.BASE.nombre} de pago, {COMPLEMENTOS_DE_PAGO} van aparte.
            </p>
            {/* La isla de navegación va pegada arriba: la cabecera de la tabla se queda justo debajo. */}
            <div style={{ '--cmp-tope': '80px' } as CSSProperties}>
              <ComparativaPlanes todoAbierto foundingGratis acciones={BOTONES_TABLA} />
            </div>
            <p className="psh-entradilla">
              Cada funcionalidad tiene su página con el detalle: <Link href="/funcionalidades">ver todas</Link>
            </p>
          </div>
        </section>

        <div className="psh-cierre">
          <div className="psh-ancho">
            <h2>Preguntas sobre el precio</h2>
            <FeatureFaq items={FAQ} />

            <h2 className="psh-sep">Antes de decidir</h2>
            <p className="psh-entradilla">Mira en detalle lo que vas a usar cada día.</p>
            <div className="psh-enlaces">
              {funcionalidades().slice(0, 6).map((f) => <Link key={f.path} href={f.path} className="psh-boton">{f.etiqueta}</Link>)}
            </div>
            <p className="psh-entradilla">
              Y si vienes de otra plataforma, la <Link href="/comparativa">comparativa</Link> va punto por punto.
            </p>
          </div>
        </div>
      </div>

      <PieWeb />
    </PageShell>
  );
}
