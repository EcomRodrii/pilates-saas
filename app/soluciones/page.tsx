import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, CircleHelp, CircleDollarSign, Layers, Percent, Store } from 'lucide-react';
import { FOTOS, rutaFoto } from '@/components/landing/fotos';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { CierreHub, Etiqueta, FaqHub, HeroHub, HubShell } from '@/components/web/hub/Hub';
import { EscenaCambio, EscenaPilates } from '@/components/web/hub/fragmentos';
import { GRATIS_CON_LIMITES, LIMITES_GRATIS } from '@/lib/landing/founding-gratis';
import { paginaDe, relacionadasDe, urlDe } from '@/lib/seo/paginas';
import { FAQ_SOLUCIONES } from '@/lib/seo/faq-hubs';

// Índice de /soluciones (fase 5 del rediseño, 23-sep). Hasta entonces la URL daba 404 aunque colgaran de ella tres páginas: un hueco
// en las migas de pan y en el árbol que Google recorre. Las tarjetas salen del registro (`relacionadas` de esta página en
// lib/seo/paginas.ts), no de una lista aquí.
//
// 7-oct-2026: la primera tarjeta es el estudio de Pilates, que vive en la home (es la página de «software para estudios de Pilates»: no
// se duplica aquí), y cada tarjeta lleva la foto de su tipo de estudio cuando la hay.
// 16-nov-2026: al idioma de la home nueva (components/web/hub/Hub.tsx). Cada tarjeta dice PARA QUIÉN es («Si tienes…») con tres cosas
// concretas de esa solución, y la que no tiene foto (cambiarse de programa) enseña lo que se revisa antes de tocar nada.
//
// ⚠️ Las frases de «Si…» y las pastillas salen de lo que ya dicen las páginas de cada solución y el registro; no añaden funciones. Y la
// sección «Lo que no cambia» repite solo lo que ya consta en /precios (sin comisión de Tentare, el mismo precio público) y en las
// páginas de solución (es la misma plataforma para yoga y Pilates).

const PATH = '/soluciones';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { siteName: 'Tentare', type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

/** La foto de cada tarjeta, si su tipo de estudio tiene una real (fotos.ts / fotos aportadas). */
const FOTO: Record<string, { src: string; alt: string; pos?: string }> = {
  '/soluciones/estudio-de-pilates-reformer': { src: '/landing/fotos/reformers-madera-tapizado-negro-plazas-640.webp', alt: 'Fila de reformers con tapizado negro en un estudio de Pilates' },
  '/soluciones/programa-de-gestion-para-estudio-de-pilates': { src: '/landing/fotos/sala-pilates-espejos-arco-anoche-560.webp', alt: 'Sala de un estudio de Pilates con espejos y un arco iluminado por la noche' },
  '/soluciones/estudio-de-yoga': { src: '/landing/fotos-aportadas/alumna-con-movil-y-esterilla-de-yoga-432.webp', alt: 'Alumna sonriendo con el móvil y una esterilla de yoga', pos: '50% 22%' },
  '/soluciones/abrir-un-estudio': { src: rutaFoto(FOTOS.selfie, 'movil', 480, 'webp'), alt: FOTOS.selfie.alt },
  '/funcionalidades/multi-centro': { src: '/landing/fotos/sala-pilates-reformers-madera-cierre-768.webp', alt: 'Sala de un estudio de Pilates con una fila de reformers de madera clara' },
};

/** Para quién es cada una y qué trae de concreto. */
const PARA: Record<string, { si: string; trae: string[] }> = {
  '/soluciones/programa-de-gestion-para-estudio-de-pilates': { si: 'Quieres un solo programa para reservas, bonos, cobros, facturas y equipo.', trae: ['Calendario con salas', 'Cobro con tarjeta o SEPA', 'Facturas'] },
  '/soluciones/estudio-de-pilates-reformer': { si: 'Tus reformers son las plazas y cada una se reserva por separado.', trae: ['Aforo por sala', 'Plazas fijas', 'Lista de espera'] },
  '/soluciones/estudio-de-yoga': { si: 'Das yoga, solo o junto al Pilates, y vendes clase suelta, bono y mensualidad.', trae: ['Cada estilo, un tipo de clase', 'Talleres con precio propio', 'Mensualidades'] },
  '/soluciones/abrir-un-estudio': { si: 'Estás montando tu estudio y quieres empezar con todo listo.', trae: ['Tu horario', 'Tu página de reservas', 'Tu app'] },
  '/funcionalidades/multi-centro': { si: 'Tienes dos o más centros y no quieres mezclar sus datos.', trae: ['Un solo acceso', 'Datos separados', 'Instructoras en varios centros'] },
  '/soluciones/cambiar-de-software': { si: 'Vienes de otro programa y no quieres perder tus datos.', trae: ['Clientas y bonos', 'Reservas y pagos', 'Reversible con un clic'] },
};

const IGUAL = [
  { titulo: 'El mismo producto', texto: 'Reservas, bonos, cobros, app y equipo son los mismos en todos los tipos de estudio. Cambia cómo los configuras: tus clases, tus bonos y tus reglas.' },
  { titulo: 'El mismo precio público', texto: `Empiezas gratis, con ${LIMITES_GRATIS}, y los planes de pago están en `, enlace: { href: '/precios', texto: 'Precios' }, cola: '. Sin permanencia.' },
  { titulo: 'Sin comisión sobre tus cobros', texto: 'Tentare no añade ninguna comisión a lo que cobras a tus alumnas. Solo pagas la de Stripe por procesar cada pago.' },
] as const;

export default function SolucionesPage() {
  const soluciones = relacionadasDe(PATH);
  return (
    <HubShell fija="soluciones">
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Soluciones" />

      <HeroHub
        etiqueta={<Etiqueta icono={<Store size={16} strokeWidth={1.6} />}>Soluciones</Etiqueta>}
        categoria="Software para cada tipo de estudio"
        titulo={<>Tentare, según tu estudio.</>}
        texto="Es el mismo producto y el mismo precio para todos. Lo que cambia es por dónde empezar: un estudio de Pilates, uno de reformer, uno de yoga, varias sedes o venir de otro programa."
      />

      <div className="hx-sol">
        <section className="hx-sol-destacada" aria-labelledby="hx-sol-pilates-t">
          <div className="hx-area-texto">
            <Etiqueta oscuro icono={<Layers size={15} strokeWidth={1.6} />}>La más buscada</Etiqueta>
            <h2 id="hx-sol-pilates-t">Estudio de Pilates</h2>
            <p>Reservas y lista de espera, app con tu marca, bonos, cuotas y cobros automáticos: todo lo que necesita un estudio de Pilates, en un solo programa.</p>
            <Link href="/" className="lf-boton lf-boton--claro">
              <span>Software para estudios de Pilates</span>
              <span className="lf-boton-flecha" aria-hidden="true"><ArrowRight size={18} strokeWidth={1.8} /></span>
            </Link>
          </div>
          <div className="hx-area-escena"><EscenaPilates /></div>
        </section>

        <div className="hx-sol-malla">
          {soluciones.map(s => {
            const f = FOTO[s.path];
            const para = PARA[s.path];
            return (
              <Link key={s.path} href={s.path} className="hx-sol-card">
                <div className="hx-sol-visual">
                  {f ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.src} alt={f.alt} loading="lazy" decoding="async" style={{ objectPosition: f.pos ?? 'center' }} />
                  ) : (
                    <EscenaCambio />
                  )}
                </div>
                <div className="hx-sol-cuerpo">
                  <h3>{s.etiqueta}</h3>
                  <p>{para?.si ?? s.resumen ?? s.descripcion}</p>
                  {para && <ul className="lf-chips">{para.trae.map(t => <li key={t}>{t}</li>)}</ul>}
                  <span className="hx-sol-ir">Ver la solución <ArrowRight size={16} strokeWidth={1.8} aria-hidden /></span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <section className="hx-igual" aria-labelledby="hx-igual-t">
        <div className="hx-igual-izq">
          <Etiqueta icono={<CircleDollarSign size={15} strokeWidth={1.6} />}>Lo que no cambia</Etiqueta>
          <h2 id="hx-igual-t">Elijas la que elijas, esto es igual.</h2>
          <p>No hay una versión «para yoga» ni otra «para reformer»: hay una plataforma, y estas son las tres cosas que no dependen de tu tipo de estudio.</p>
        </div>
        <ul>
          {IGUAL.map(i => (
            <li key={i.titulo}>
              <span className="hx-igual-check" aria-hidden="true">{i.titulo.includes('comisión') ? <Percent size={16} strokeWidth={1.8} /> : <Check size={16} strokeWidth={2} />}</span>
              <div>
                <h3>{i.titulo}</h3>
                <p>
                  {i.texto}
                  {'enlace' in i && <><Link href={i.enlace.href}>{i.enlace.texto}</Link>{i.cola}</>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Las preguntas del índice (Ronda 1, 19-oct-2026): las soluciones tienen las suyas; esta es la de quien aún no sabe cuál es la suya. Marcado y texto, del mismo array. */}
      <FaqHub
        id="preguntas"
        icono={<CircleHelp size={15} strokeWidth={1.6} />}
        etiqueta="Preguntas"
        titulo="Antes de elegir tu caso."
        texto="Si no sabes cuál es el tuyo, casi seguro es una de estas."
        items={FAQ_SOLUCIONES}
      />

      <CierreHub titulo="Pruébalo con tu estudio de verdad." texto={`${GRATIS_CON_LIMITES}, sin tarjeta y sin permanencia.`} />
    </HubShell>
  );
}
