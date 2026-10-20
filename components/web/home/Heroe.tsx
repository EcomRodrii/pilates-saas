import Link from 'next/link';
import type { ReactNode } from 'react';
import { CTA_ALTA, GRATIS_CON_LIMITES } from '@/lib/landing/founding-gratis';
import { ALTA, HEROE_CAMBIARSE } from '@/components/landing/enlaces';
import { FOTOS } from '@/components/landing/fotos';
import { FotoLanding } from '@/components/landing/FotoLanding';
import { G2_NOTA, G2_URL } from '@/lib/seo/g2';
import { MarcoIphone } from '@/components/ui/marco-iphone';
import { CAPTURAS_APP, Escena, Ficha, Pastilla } from './piezas';

// ─────────────────────────────────────────────────────────────────────────────
// Héroe de la home nueva (fase 2.2, 19-oct-2026). Lo que hacen a la vez Mariana
// Tek, bsport y Momence en su primer pantallazo: una BANDA a todo el ancho y casi
// todo el alto, en un campo oscuro de la marca (Ink, con la foto teñida de oliva
// encima), el titular grande y fino en blanco, dos botones y, al pie de la misma
// banda, la franja de logos de los estudios (bsport). Sobre la foto, el móvil de
// la alumna en perspectiva y dos fragmentos blancos del tamaño de una
// notificación (Mariana Tek), nunca la pantalla entera.
//
// La foto (`FOTOS.heroe`, la que eligió el fundador el 20-oct: una alumna en la caja
// del reformer) se tiñe de oliva muy suave; la capa de Ink que se desvanece de
// izquierda a derecha es la que hace legible el texto (contraste medido, ver home.css).
// La alumna queda en el centro-derecha: el móvil va al borde derecho para no taparla.
//
// En el móvil (lección de Mariana Tek y fallo de bsport): la banda sigue, con la
// foto recortada en vertical de fondo; titular, frase y botón principal a todo el
// ancho SOBRE EL PLIEGUE; el móvil de la app, debajo. Nada de texto sobre una cara.
//
// ⚠️ Los fragmentos son EJEMPLOS de interfaz, no logros: cuentan lo que el
// producto hace hoy (lista de espera; reintento con la tarjeta guardada de
// lib/billing/dunning.ts) y el móvil es una captura REAL de la app de la alumna
// sobre el estudio de muestra de los e2e.
//
// ⚠️ El <h1> empieza por TEXTO (e2e/landing-h1-texto.spec.ts): la categoría que
// se busca («Software de gestión para estudios de Pilates y yoga») va primero y
// en pequeño; la promesa del fundador va dentro, en grande.
//
// `logos`: la franja de estudios (FranjaLogos), que llega pintada desde
// app/page.tsx y no pinta nada si no hay ningún estudio con consentimiento.
//
// Las clases `v5-hero-*` se conservan como anclas de los e2e (botón principal,
// secundario, promesa y caja del texto); el estilo es el de `wh-heroe-*`.
// ─────────────────────────────────────────────────────────────────────────────

/** Por debajo de este ancho, una columna: el texto arriba y el móvil debajo, con la foto vertical de fondo. */
export const MEDIA_HEROE_MOVIL = '(max-width: 900px)';

export function Heroe({ logos }: { logos?: ReactNode }) {
  return (
    <header id="top" className="wh-heroe">
      <div className="wh-heroe-foto">
        <FotoLanding
          foto={FOTOS.heroe}
          prioritaria
          mediaMovil={MEDIA_HEROE_MOVIL}
          sizes={{ escritorio: '100vw', movil: '100vw' }}
        />
        {/* Solo en el móvil (como Mariana Tek): la foto deja de ser el fondo del texto y pasa a una
            tarjeta debajo, con un dato de la app en cristal encima. */}
        <div className="wh-ficha wh-heroe-movil-dato" aria-hidden="true">
          <span className="wh-ficha-fila"><span className="wh-ficha-etiqueta">Reformer · 19:00</span><Pastilla tono="arena">Llena</Pastilla></span>
          <span className="wh-cristal-dato">12/12</span>
          <span className="wh-cristal-pie"><span className="wh-punto" />3 en lista de espera</span>
        </div>
      </div>

      <div className="wh-heroe-wrap">
        <div className="wh-heroe-texto v5-hero-texto">
          <h1 className="wh-heroe-h1">Software de gestión para estudios de Pilates y yoga{' '}
            <span className="wh-heroe-promesa v5-hero-promesa">Todo tu estudio. Bajo control.</span>
          </h1>
          <p className="wh-heroe-lead">
            Reservas con lista de espera, cobros que se reintentan solos y una app con tu marca para tus alumnas.
          </p>
          <div className="wh-heroe-acciones v5-hero-acciones">
            <Link href={ALTA} className="wh-boton wh-boton-arena v5-hero-cta">{CTA_ALTA}</Link>
            <Link href={HEROE_CAMBIARSE.href} className="wh-boton wh-boton-contorno-claro v5-hero-secundario">{HEROE_CAMBIARSE.label}</Link>
          </div>
          <p className="wh-heroe-nota">
            <a href={G2_URL} target="_blank" rel="noopener noreferrer" className="wh-heroe-g2">
              <span aria-hidden="true">★★★★★</span> {G2_NOTA} en G2
            </a>
            <span aria-hidden="true"> · </span>Sin tarjeta · Sin permanencia · {GRATIS_CON_LIMITES}
          </p>
        </div>

        <Escena
          className="wh-heroe-escena"
          descripcion="Ejemplos de Tentare sobre una clase de Pilates: la app de una alumna con su próxima clase, el estado de la clase de reformer de las 19:00, llena y con tres alumnas en lista de espera, y una cuota cobrada al reintentarla con la tarjeta guardada."
        >
          <div className="wh-heroe-tel-marco">
            {/* iPhone 17 Pro con Dynamic Island (el marco compartido de components/ui), con la captura REAL de la app dentro. */}
            <MarcoIphone className="wh-heroe-tel" modelo="17-pro" escala={0.58} tinta="clara" indicador="oscura">
              <div className="wh-heroe-pantalla"><picture>
                <source type="image/avif" srcSet={`/landing/capturas/${CAPTURAS_APP.inicio.n}-390.avif 390w, /landing/capturas/${CAPTURAS_APP.inicio.n}-780.avif 780w`} sizes="240px" />
                <img
                  src={`/landing/capturas/${CAPTURAS_APP.inicio.n}-390.webp`}
                  srcSet={`/landing/capturas/${CAPTURAS_APP.inicio.n}-390.webp 390w, /landing/capturas/${CAPTURAS_APP.inicio.n}-780.webp 780w`}
                  sizes="240px"
                  width={780}
                  height={1696}
                  alt={CAPTURAS_APP.inicio.alt}
                  loading="eager"
                  decoding="async"
                />
              </picture></div>
            </MarcoIphone>
          </div>
          <div className="wh-ficha wh-heroe-clase">
            <span className="wh-ficha-fila"><span className="wh-ficha-etiqueta">Reformer · 19:00</span><Pastilla tono="arena">Llena</Pastilla></span>
            <span className="wh-cristal-dato">12/12</span>
            <span className="wh-cristal-pie"><span className="wh-punto" />3 en lista de espera</span>
          </div>
          <Ficha
            className="wh-heroe-ficha"
            etiqueta="Cuota mensual"
            estado="Cobrado"
            titulo="Laura Martín · 75 €"
            nota="En el reintento, con su tarjeta guardada"
          />
        </Escena>
      </div>

      {logos && <div className="wh-heroe-logos">{logos}</div>}
    </header>
  );
}
