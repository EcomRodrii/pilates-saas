'use client';

import Link from 'next/link';
import { CalendarCheck, Hourglass, RefreshCw, type LucideIcon } from 'lucide-react';
import { IslaWeb } from '@/components/web/IslaWeb';
import { CTA_ALTA, GRATIS_CON_LIMITES } from '@/lib/landing/founding-gratis';
import { ALTA, HEROE_CAMBIARSE } from './enlaces';
import { FOTOS } from './fotos';
import { FotoLanding } from './FotoLanding';
import { G2_NOTA, G2_URL } from '@/lib/seo/g2';

// El precio de entrada (Founding Studio gratis, con sus dos límites) sale de
// lib/landing/founding-gratis.ts, el mismo sitio que la sección de precios: si
// cambia, no se queda una cifra vieja en el primer pantallazo.

// Nav + primer pantallazo.
//
// El héroe enseña un estudio de verdad: texto a la izquierda y, a la derecha,
// una foto de una clase con tres avisos de Tentare encima (en móvil, la foto
// debajo del texto con dos). Es el gesto de Timp y bsport —personas en un
// estudio y el producto en fragmentos sobre la escena— con la identidad de
// Tentare: claro, crema, oliva y arena. Sin velo oscuro: el texto nunca va
// encima de la foto, así que se lee igual la cambie quien la cambie.
//
// ⚠️ La foto sale del registro (`FOTOS.heroe`, components/landing/fotos.ts).
// Cambiarla es tocar esa entrada y regenerar con scripts/fotos-landing.mjs; las
// proporciones de la caja también salen de ahí. Lo único que depende de la foto
// concreta es DÓNDE van las tarjetas (ver el CSS): tienen que caer sobre pared,
// estanterías o suelo, nunca sobre la persona. Con otra foto, se recolocan.
//
// ⚠️ Las tarjetas son EJEMPLOS y tienen que contar lo que el producto hace de
// verdad, no una versión mejor:
//   · la sustitución la acepta Julia DESPUÉS de tu visto bueno, que es el modo
//     por defecto (asistido): no se escribe a nadie sin él
//     (SeccionSustituciones.tsx lo cuenta entero);
//   · el recibo se cobra en un reintento automático con la tarjeta guardada,
//     lo mismo que promete /funcionalidades/cobros-recurrentes;
//   · sin porcentajes ni cifras: no hay nada que las respalde.
// Van `aria-hidden` dentro de un <figure> con su descripción, para que un lector
// de pantalla no lea datos de muestra como si fueran de su estudio.
//
// ⚠️ El <h1> empieza por TEXTO, sin marcado delante: e2e/landing-h1-texto.spec.ts
// comprueba en el HTML crudo que `<h1 …>` va seguido de letras. La categoría
// («Software de gestión para estudios de Pilates», titular de SEO de #1200) va
// primero y en pequeño; la promesa (Dirección A del rediseño de 23-sep, «Tu
// estudio sigue funcionando aunque sueltes el móvil») va dentro, en grande.
//
// La isla de arriba (la navegación) es la de toda la web pública: vive en
// components/web/IslaWeb.tsx. Aquí solo se coloca, dentro del envoltorio de la
// landing que limita hasta dónde se queda pegada (LandingCliente.tsx).

interface Tarjeta {
  Icono: LucideIcon;
  etiqueta: string;
  estado: string;
  texto: string;
  nota: string;
  arena?: boolean;
  /** En móvil caben dos; esta se queda fuera. */
  soloEscritorio?: boolean;
}

// Por debajo de este ancho el héroe pasa a una columna y la foto al recorte móvil.
// Es la MISMA media query para el CSS y para el <picture>: si divergieran, un
// tablet vería el recorte de móvil metido en la caja de escritorio (o al revés).
// A 900 px, en dos columnas, las tres tarjetas tapaban casi toda la foto.
const MEDIA_UNA_COLUMNA = '(max-width: 980px)';

const proporcion = ({ proporcion: [ancho, alto] }: { proporcion: readonly [number, number] }) => `${ancho} / ${alto}`;
const PROPORCION_ESCRITORIO = proporcion(FOTOS.heroe.recortes.escritorio);
const PROPORCION_MOVIL = proporcion(FOTOS.heroe.recortes.movil);

const TARJETAS: Tarjeta[] = [
  { Icono: Hourglass, etiqueta: 'Lista de espera', estado: 'Plaza ocupada', texto: 'Carmen entra en Reformer 19:00', nota: 'Se liberó una plaza y pasó sola' },
  { Icono: CalendarCheck, etiqueta: 'Reserva nueva', estado: 'Confirmada', texto: 'Reformer 3 · mar 09:00', nota: 'Lucía reservó desde la app', arena: true, soloEscritorio: true },
  { Icono: RefreshCw, etiqueta: 'Recibo reintentado', estado: 'Cobrado', texto: 'Cuota mensual de Ana', nota: 'Con su tarjeta guardada' },
];

export function SeccionHero() {
  return (
    <>
      <IslaWeb enHome />

      <header id="top" className="v5-hero">
        <div className="v5-hero-wrap">
          <div className="v5-hero-texto">
            {/* Un solo <h1> con dos voces: la categoría (lo que se busca) en
                pequeño y la promesa en grande. Empieza por TEXTO —ver el aviso
                de arriba— y la promesa va en un <span> dentro, así Google lee
                «Software de gestión para estudios de Pilates» primero y la
                propietaria lee la promesa primero. */}
            <h1 className="v5-hero-h1">Software de gestión para estudios de Pilates y yoga{' '}
              <span className="v5-hero-promesa">Tu estudio sigue funcionando aunque sueltes el móvil.</span>
            </h1>
            <p className="v5-hero-lead">
              Tus alumnas reservan desde tu app, la lista de espera llena las plazas que se liberan y los cobros
              se reintentan solos. Tú solo decides lo que necesita tu criterio.
            </p>
            <div className="v5-hero-acciones">
              <Link href={ALTA} className="v5-hero-cta">{CTA_ALTA}</Link>
              {/* Secundario: de contorno, para quien ya paga otro programa. El que
                  empuja sigue siendo UNO (el relleno). La frase promete lo que
                  promete /soluciones/cambiar-de-software: traer los datos, no «todo». */}
              <Link href={HEROE_CAMBIARSE.href} className="v5-hero-secundario">{HEROE_CAMBIARSE.label}</Link>
              <a href="#producto" className="v5-hero-enlace">Ver cómo funciona <span aria-hidden>↓</span></a>
            </div>
            {/* La nota pública de G2 (lib/seo/g2.ts), la misma que enseñan las
                comparativas: es comprobable con un clic, no un sello inventado. */}
            <p className="v5-hero-nota">
              <a href={G2_URL} target="_blank" rel="noopener noreferrer" className="v5-hero-g2">
                <span className="v5-hero-estrellas" aria-hidden>★★★★★</span> {G2_NOTA} en G2
              </a>
              <span aria-hidden> · </span>Sin tarjeta · Sin permanencia · {GRATIS_CON_LIMITES}
            </p>
          </div>

          <figure className="v5-hero-escena">
            <div className="v5-hero-foto">
              <FotoLanding
                foto={FOTOS.heroe}
                prioritaria
                mediaMovil={MEDIA_UNA_COLUMNA}
                sizes={{
                  escritorio: '(max-width: 1280px) 46vw, 590px',
                  movil: '(max-width: 600px) calc(100vw - 40px), 560px',
                }}
              />
            </div>
            <div className="v5-hero-tarjetas" aria-hidden="true">
              {TARJETAS.map(({ Icono, etiqueta, estado, texto, nota, arena, soloEscritorio }, i) => (
                <div
                  key={etiqueta}
                  className={`v5-hero-tarjeta v5-hero-tarjeta-${i + 1}${arena ? ' v5-hero-tarjeta-arena' : ''}${soloEscritorio ? ' v5-hero-solo-escritorio' : ''}`}
                  style={{ ['--orden' as string]: i }}
                >
                  <span className="v5-hero-tarjeta-icono"><Icono size={16} strokeWidth={2.2} /></span>
                  <span className="v5-hero-tarjeta-cuerpo">
                    <span className="v5-hero-tarjeta-fila">
                      <span className="v5-hero-tarjeta-etiqueta">{etiqueta}</span>
                      <span className="v5-hero-tarjeta-estado">{estado}</span>
                    </span>
                    <span className="v5-hero-tarjeta-texto">{texto}</span>
                    <span className="v5-hero-tarjeta-nota">{nota}</span>
                  </span>
                </div>
              ))}
            </div>
            <figcaption className="v5-hero-oculto">
              Ejemplos de avisos de Tentare sobre una clase de Pilates: una plaza de la lista de espera ocupada,
              una reserva confirmada y un recibo cobrado al reintentarlo.
            </figcaption>
          </figure>
        </div>
      </header>

      <style>{`
        /* Los enlaces de la barra saltan a secciones de esta misma página. La
           barra flota (sticky, top:14, alto 58), así que sin esto el título de
           la sección aterriza justo DEBAJO de ella y queda tapado — se ve al
           pulsar "Sustituciones", "Precios" o "FAQ". Medido: la sección
           llegaba a top:0 con la barra ocupando hasta 72. */
        #producto, #te-suena, #tu-estudio, #sustituciones, #calendario, #app,
        #funcionalidades, #precio, #faq { scroll-margin-top: 88px; }

        /* --alto-barra: la barra mide 58px y va en el flujo; el héroe sube por
           debajo de ella para que el halo arena empiece arriba del todo.
           El relleno de abajo deja sitio a dos cosas que se meten en él: la
           tarjeta que desborda la foto y el vídeo de producto, que sube 72 px
           (24 en móvil) sobre el héroe (VideoProducto.tsx) — menos que antes,
           porque el vídeo pasó de un bucle 4:5 muy alto a un 16:9 con
           controles, mucho más bajo, y el mismo solape de antes lo habría
           montado sobre las tarjetas flotantes de la foto. */
        .v5-hero { --alto-barra: 58px; position: relative;
          margin-top: calc(-1 * var(--alto-barra));
          padding: calc(var(--alto-barra) + clamp(48px,8vh,96px)) clamp(20px,4vw,48px) clamp(150px,13vw,180px);
          background: radial-gradient(60% 70% at 80% 36%, rgba(217,194,158,.34), rgba(217,194,158,0) 70%); }
        .v5-hero-wrap { max-width: 1240px; margin: 0 auto; display: grid;
          grid-template-columns: minmax(0,.94fr) minmax(0,1.06fr); gap: clamp(32px,5vw,72px); align-items: center; }

        /* El h1 pinta la categoría como antetítulo; la promesa, dentro, es
           el titular grande. */
        .v5-hero-h1 { margin: 0; font-size: 13px; font-weight: 700; line-height: 1.4; letter-spacing: .14em;
          text-transform: uppercase; color: #5A5E48; }
        .v5-hero-promesa { display: block; margin-top: 18px; font-size: clamp(40px,4.5vw,62px); font-weight: 800;
          line-height: .98; letter-spacing: -.045em; text-transform: none; color: #1F2216; text-wrap: balance; }
        .v5-hero-lead { margin: 22px 0 0; max-width: 46ch; font-size: clamp(16px,1.35vw,18.5px); line-height: 1.55;
          color: #5A5A52; text-wrap: pretty; }
        .v5-hero-acciones { display: flex; align-items: center; flex-wrap: wrap; gap: 14px 26px; margin-top: 32px; }
        .v5-hero-cta { display: inline-block; background: #343825; color: #D9C29E; font-weight: 800; font-size: 16.5px;
          padding: 17px 30px; border-radius: 999px; white-space: nowrap;
          box-shadow: 0 18px 36px -16px rgba(52,56,37,.6); transition: transform var(--motion-normal) var(--motion-ease), background var(--motion-normal); }
        .v5-hero-cta:hover { background: #22251A; transform: translateY(-2px); }
        .v5-hero-cta:active { transform: translateY(0) scale(.98); }
        /* Secundario de contorno: sin relleno ni sombra, para que el relleno siga siendo el único que empuja. */
        .v5-hero-secundario { display: inline-block; background: transparent; color: #343825; font-weight: 700; font-size: 15.5px;
          padding: 15px 26px; border: 1.5px solid #343825; border-radius: 999px; white-space: nowrap;
          transition: background var(--motion-normal), color var(--motion-normal); }
        .v5-hero-secundario:hover { background: rgba(52,56,37,.08); }
        .v5-hero-secundario:focus-visible { outline: 2px solid #343825; outline-offset: 3px; }
        .v5-hero-enlace { font-size: 15.5px; font-weight: 700; color: #343825; white-space: nowrap; }
        .v5-hero-enlace:hover { text-decoration: underline; text-underline-offset: 4px; }
        .v5-hero-cta:focus-visible, .v5-hero-enlace:focus-visible { outline: 2px solid #343825; outline-offset: 3px; }
        .v5-hero-nota { margin: 16px 0 0; font-size: 13.5px; font-weight: 600; color: #5A5E48; }
        .v5-hero-g2 { color: #1F2216; font-weight: 700; text-decoration: none; white-space: nowrap; }
        .v5-hero-g2:hover { text-decoration: underline; text-underline-offset: 3px; }
        .v5-hero-estrellas { color: #C9961E; letter-spacing: 1px; }

        /* La foto sube un poco por encima del bloque de texto (el gesto de la
           página de Pilates de Timp) y las tarjetas se salen de su marco. */
        .v5-hero-escena { position: relative; margin: calc(-1 * clamp(12px,2.4vw,36px)) 0 0; }
        .v5-hero-foto { position: relative; aspect-ratio: ${PROPORCION_ESCRITORIO}; border-radius: 28px; overflow: hidden;
          background: #E4D8C2; box-shadow: 0 50px 90px -48px rgba(34,37,26,.55); }
        .v5-hero-foto picture, .v5-hero-foto img { display: block; width: 100%; height: 100%; }
        .v5-hero-foto img { object-fit: cover; }

        .v5-hero-tarjeta { position: absolute; z-index: 2; display: flex; align-items: flex-start; gap: 11px;
          width: 282px; padding: 12px 14px 13px 12px; border-radius: 16px; text-align: left;
          background: #fff; color: #1F2216; border: 1px solid rgba(52,56,37,.08);
          box-shadow: 0 24px 48px -22px rgba(34,37,26,.42), 0 2px 6px rgba(34,37,26,.06); }
        /* Colocadas sobre lo que NO es ella en la foto del héroe (medido en el
           recorte 5:4, de 1100 a 1440 px): la 1 sobre las estanterías de arriba a
           la derecha, la 2 por debajo de su mano, sobre el reformer, y la 3 sobre
           el bastidor y el suelo, a la izquierda de sus pies. */
        .v5-hero-tarjeta-1 { top: -2%; right: -5%; }
        .v5-hero-tarjeta-2 { top: 53%; left: -9%; width: 262px; }
        .v5-hero-tarjeta-3 { bottom: -7%; left: 20%; }
        .v5-hero-tarjeta-icono { flex-shrink: 0; display: grid; place-items: center; width: 32px; height: 32px;
          border-radius: 10px; background: #F1F2EA; color: #343825; }
        .v5-hero-tarjeta-cuerpo { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .v5-hero-tarjeta-fila { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .v5-hero-tarjeta-etiqueta { font-size: 12px; font-weight: 600; color: #5A5E48; white-space: nowrap; }
        .v5-hero-tarjeta-estado { flex-shrink: 0; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700;
          background: rgba(47,107,79,.12); color: #2F6B4F; }
        .v5-hero-tarjeta-texto { font-size: 14.5px; font-weight: 700; letter-spacing: -.01em; line-height: 1.3; text-wrap: balance; }
        .v5-hero-tarjeta-nota { font-size: 12.5px; font-weight: 500; color: #5A5E48; line-height: 1.35; }
        .v5-hero-tarjeta-arena { background: #D9C29E; border-color: rgba(52,56,37,.12); }
        .v5-hero-tarjeta-arena .v5-hero-tarjeta-icono { background: #343825; color: #D9C29E; }
        .v5-hero-tarjeta-arena .v5-hero-tarjeta-estado { background: rgba(52,56,37,.14); color: #2B2F1E; }
        .v5-hero-tarjeta-arena .v5-hero-tarjeta-etiqueta,
        .v5-hero-tarjeta-arena .v5-hero-tarjeta-nota { color: #3F4330; }

        .v5-hero-oculto { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
          clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

        /* Entrada suave de las tarjetas, solo para quien no pidió menos
           movimiento. Entran nada más pintar la página: la cortina del logo
           se retiró (11-oct, auditoría SEO: retrasaba el primer pintado y el
           LCP móvil rondaba los 4 s). */
        @keyframes v5-hero-tarjeta-entra {
          from { opacity: 0; transform: translateY(16px) scale(.97); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .v5-hero-tarjeta { animation: v5-hero-tarjeta-entra .8s var(--motion-ease) both;
            animation-delay: calc(.1s + var(--orden) * .14s); }
        }

        /* Portátil pequeño y tablet apaisada: la foto encoge y las tarjetas con ella. */
        @media (max-width: 1180px) {
          .v5-hero-tarjeta { width: 246px; padding: 10px 12px 11px 10px; gap: 9px; }
          .v5-hero-tarjeta-2 { width: 232px; }
          .v5-hero-tarjeta-icono { width: 28px; height: 28px; border-radius: 9px; }
          .v5-hero-tarjeta-texto { font-size: 13.5px; }
          .v5-hero-tarjeta-nota { font-size: 12px; }
        }

        @media ${MEDIA_UNA_COLUMNA} {
          .v5-hero { padding: calc(var(--alto-barra) + 30px) 20px 128px;
            background: radial-gradient(90% 50% at 70% 72%, rgba(217,194,158,.34), rgba(217,194,158,0) 70%); }
          .v5-hero-wrap { grid-template-columns: minmax(0,1fr); gap: 36px; }
          .v5-hero-texto { width: 100%; max-width: 560px; margin: 0 auto; }
          .v5-hero-h1 { margin-top: 0; font-size: 11.5px; letter-spacing: .12em; }
          .v5-hero-promesa { margin-top: 14px; font-size: clamp(36px,10vw,50px); }
          .v5-hero-lead { margin-top: 16px; font-size: 15.5px; max-width: none; }
          .v5-hero-acciones { margin-top: 24px; flex-direction: column; align-items: stretch; gap: 14px; }
          .v5-hero-cta { display: block; text-align: center; font-size: 16px; padding: 16px 24px; }
          .v5-hero-secundario { display: block; text-align: center; font-size: 15.5px; padding: 14px 20px; }
          .v5-hero-enlace { align-self: center; }
          .v5-hero-nota { margin-top: 12px; text-align: center; }

          .v5-hero-escena { width: 100%; max-width: 560px; margin: 0 auto; }
          .v5-hero-foto { aspect-ratio: ${PROPORCION_MOVIL}; border-radius: 22px; }
          .v5-hero-solo-escritorio { display: none; }
          .v5-hero-tarjeta { width: min(250px, 74%); border-radius: 14px; }
          /* En el recorte móvil ella ocupa casi todo el ancho: las dos van abajo,
             una sobre el carro a la izquierda de sus pies y la otra colgando por
             debajo de la foto, escalonadas. */
          .v5-hero-tarjeta-1 { top: auto; bottom: 6px; left: -8px; }
          .v5-hero-tarjeta-3 { bottom: -68px; left: auto; right: -8px; }
        }
      `}</style>
    </>
  );
}
