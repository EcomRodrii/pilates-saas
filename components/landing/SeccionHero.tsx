'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NAV_V5 } from './enlaces';

// Secciones 01 (nav flotante + hero) de la landing v5.
//
// El vídeo de fondo reutiliza EXACTAMENTE la técnica ya resuelta en
// components/landing/Hero.tsx (autoplay bloqueado en iOS/Android → arranca
// invisible sobre el póster y se funde cuando confirma 'playing'; reintentos
// enganchados a los mismos gestos, nunca 'touchstart'). Los assets
// (/hero-video.mp4, /hero-video.webm, /hero-video-poster.jpg, /hero-panel.png)
// son los mismos que ya sirve la landing en producción — no hay vídeo ni
// captura nuevos que mantener en paralelo.
//
// El logo va con <LogoTentare>, nunca con un <img>: es la regla de marca del
// repo (docs/marca/), y el SVG en línea del kit ya resuelve modo oscuro y
// tinta sin depender de que una fuente esté instalada.

// El tilt 3D del mockup: existía en el Hero anterior (`useHeroTilt`) y se
// perdió al portar el diseño v5, que traía el panel como imagen estática. Se
// recupera aquí con el mismo criterio — desactivado en touch (`pointer:
// coarse`) y con `prefers-reduced-motion`, escritura directa en el DOM en vez
// de estado de React para que seguir al ratón vaya a 60fps sin re-renderizar
// el árbol entero en cada movimiento.
function useMockupTilt() {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const tilt = tiltRef.current;
    if (!stage || !tilt) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (reduce || coarse) return;

    function onMove(e: MouseEvent) {
      const r = stage!.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tilt!.style.transform = `rotateX(${py * -6}deg) rotateY(${px * 8}deg)`;
    }
    function onLeave() {
      tilt!.style.transform = 'rotateX(0deg) rotateY(0deg)';
    }
    stage.addEventListener('mousemove', onMove);
    stage.addEventListener('mouseleave', onLeave);
    return () => {
      stage.removeEventListener('mousemove', onMove);
      stage.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return { stageRef, tiltRef };
}

function HeroVideo() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nudge = () => {
      const video = wrapRef.current?.querySelector('video');
      if (!video) return;
      video.muted = true;
      if (video.paused) video.play().catch(() => {});
    };
    nudge();
    const GESTOS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
    GESTOS.forEach((ev) => window.addEventListener(ev, nudge, { passive: true }));
    document.addEventListener('visibilitychange', nudge);
    return () => {
      GESTOS.forEach((ev) => window.removeEventListener(ev, nudge));
      document.removeEventListener('visibilitychange', nudge);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0, zIndex: -2, backgroundImage: 'url(/hero-video-poster.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      dangerouslySetInnerHTML={{
        __html: `<video autoplay loop muted playsinline preload="auto" onplaying="this.style.opacity=1" ontimeupdate="if(!this.paused)this.style.opacity=1" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .8s ease;pointer-events:none"><source src="/hero-video.webm" type="video/webm" /><source src="/hero-video.mp4" type="video/mp4" /></video>`,
      }}
    />
  );
}

// Lo que el estudio resolvió sin la propietaria delante. Es la tesis de la
// página ("Sin el caos") contada con las cuatro cosas que el producto hace de
// verdad y que tienen su propia página: sustituciones, avisos a alumnas,
// reservas 24/7 y cobros. La sección de Sustituciones de más abajo cuenta UNA
// de estas líneas en detalle; aquí se ve el conjunto, no el mismo plano.
const PARTE_NOCHE = [
  { hora: '21:04', texto: <>Marta avisa: mañana no puede</> },
  { hora: '21:41', texto: <>Julia acepta — <strong>clase cubierta</strong></> },
  { hora: '21:41', texto: <>8 alumnas avisadas del cambio</> },
  { hora: '23:52', texto: <>2 reservas nuevas desde la app</> },
];

export function SeccionHero() {
  const { stageRef, tiltRef } = useMockupTilt();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Con el menú a pantalla completa abierto, la página de detrás no debe
  // desplazarse (en iOS el scroll "atraviesa" el overlay si no se bloquea).
  useEffect(() => {
    if (!menuAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [menuAbierto]);

  return (
    <>
      <nav className="v5-nav" aria-label="Principal">
        <a href="#top" className="v5-nav-logo" aria-label="Tentare — inicio">
          <LogoTentare formato="horizontal" tinta="tinta" alto={26} decorativo />
        </a>
        <div className="v5-nav-links">
          {NAV_V5.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
          <Link href="/recursos">Recursos</Link>
        </div>
        <div className="v5-nav-acciones">
          {/* El diseño original no traía este enlace — sin él, una socia ya
              dada de alta no tiene forma de entrar desde la home. */}
          <Link href="/login" className="v5-nav-entrar">Entrar</Link>
          <Link href="/crear-estudio" className="v5-nav-cta">Probar Tentare</Link>
        </div>
        {/* El port de la v5 se dejó por el camino la navegación móvil: los
            enlaces se ocultaban bajo 760px y no había nada que los
            sustituyera, así que desde un móvil no se podía llegar a ninguna
            sección ni a /login. Esto lo devuelve. */}
        <button
          type="button"
          className="v5-nav-burger"
          aria-label="Abrir el menú"
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto(true)}
        >
          <span aria-hidden />
          <span aria-hidden />
        </button>
      </nav>

      {menuAbierto && (
        <div className="v5-menu" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="v5-menu-top">
            <span className="v5-menu-etiqueta">Menú</span>
            <button type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar el menú" className="v5-menu-cerrar">✕</button>
          </div>
          <nav className="v5-menu-links">
            {NAV_V5.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuAbierto(false)}>{l.label}</a>
            ))}
            <Link href="/recursos" onClick={() => setMenuAbierto(false)}>Recursos</Link>
          </nav>
          <div className="v5-menu-pie">
            <Link href="/login" onClick={() => setMenuAbierto(false)} className="v5-menu-entrar">Entrar</Link>
            <Link href="/crear-estudio" onClick={() => setMenuAbierto(false)} className="v5-menu-cta">Probar Tentare</Link>
          </div>
        </div>
      )}

      <header id="top" className="v5-hero">
        <HeroVideo />
        <div className="v5-hero-velo" aria-hidden />
        <div className="v5-hero-wrap">
          <p className="v5-hero-eyebrow">Software para estudios de Pilates</p>
          <h1 className="v5-hero-h1">Todo lo que necesitas para dirigir tu estudio. Sin el caos.</h1>
          <div className="v5-hero-chips">
            {['Reservas', 'Pagos', 'Clientas', 'Equipo', 'App propia', 'Automatizaciones'].map((c) => (
              <span key={c}>{c}</span>
            ))}
            {/* Un sustantivo más de la lista, no una frase publicitaria. Antes
              ponía "Sustituciones que se cubren solas": el único elemento con
              forma de eslogan entre seis nombres sueltos, y justo el tipo de
              frase que escribe cualquier landing generada. Lo que diferencia
              se demuestra en el parte de abajo; aquí basta con nombrarlo, y
              el énfasis lo pone el color. */}
          <span className="v5-hero-chip-oro">Sustituciones</span>
          </div>
          <div className="v5-hero-acciones">
            <a href="#sustituciones" className="v5-hero-cta">Ver Tentare en acción ↓</a>
            <Link href="/crear-estudio" className="v5-hero-cta-2">Probar Tentare</Link>
          </div>
          <p className="v5-hero-nota">Sin permanencia · Migración incluida · Sin comisión sobre tus cobros · Hecho en España</p>

          <div className="v5-hero-mockup-stage" ref={stageRef}>
            <div className="v5-hero-mockup" ref={tiltRef}>
              <div className="v5-hero-mockup-barra">
                <span className="v5-hero-dot v5-hero-dot-on" />
                <span className="v5-hero-dot" />
                <span className="v5-hero-dot" />
                <span className="v5-hero-mockup-url">tentare.app · el producto real</span>
              </div>
              <div className="v5-hero-mockup-cuerpo">
                <Image src="/hero-panel.png" alt="Panel real de Tentare" width={2862} height={1360} sizes="(max-width: 1120px) 96vw, 1080px" priority style={{ width: '100%', height: 'auto', display: 'block' }} />
                <div className="v5-hero-mockup-fade" aria-hidden />
                <div className="v5-hero-badge">
                  <span className="v5-hero-badge-tit">✓ Baja de las 18:00 cubierta</span>
                  <span className="v5-hero-badge-sub">sin una llamada tuya</span>
                </div>
              </div>
            </div>
          </div>

          {/* La prueba, en móvil. La captura del panel es de un escritorio de
              1431 pt: a 348 px de ancho queda a escala 0,24 y su texto se va a
              3 px — ilegible, y lo único que se llega a leer son las cifras
              sembradas del estudio de pruebas ("0 reservas", "6 %"), que leen
              como un negocio parado. La captura del móvil (/hero-app.png) sí
              es legible pero enseña "−54 %" e "ingresos por detrás", con el
              mismo problema. Así que aquí la prueba se construye en CSS, como
              en TODAS las demás secciones de esta página — que es justo por
              lo que ninguna de ellas se rompe a este ancho. */}
          <div className="v5-parte">
            <p className="v5-parte-tit">Anoche, mientras tú cerrabas</p>
            <ul className="v5-parte-lista">
              {PARTE_NOCHE.map((l) => (
                <li key={l.hora + String(l.texto)}>
                  <span className="v5-parte-hora">{l.hora}</span>
                  <span className="v5-parte-txt">{l.texto}</span>
                </li>
              ))}
            </ul>
            <p className="v5-parte-pie">Ni una llamada tuya.</p>
          </div>
        </div>
      </header>

      <style>{`
        .v5-nav { position: sticky; top: 14px; z-index: 60; display: flex; align-items: center; gap: clamp(10px,1.6vw,22px);
          width: fit-content; max-width: calc(100vw - 28px); margin: 0 auto; padding: 8px 8px 8px 18px;
          border-radius: 999px; background: rgba(255,255,255,.72); backdrop-filter: blur(20px) saturate(1.6);
          border: 1px solid rgba(255,255,255,.6); box-shadow: 0 14px 44px rgba(26,26,26,.16); white-space: nowrap; }
        .v5-nav-logo { display: flex; align-items: center; flex-shrink: 0; }
        .v5-nav-links { display: flex; gap: clamp(10px,1.6vw,20px); }
        .v5-nav-links a { font-size: 14px; font-weight: 600; color: #3B3B34; }
        .v5-nav-links a:hover { color: #1A1A1A; }
        .v5-nav-acciones { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .v5-nav-entrar { font-size: 14px; font-weight: 600; color: #1A1A1A; padding: 9px 8px; }
        .v5-nav-cta { flex-shrink: 0; background: #343825; color: #D9C29E; padding: 9px 18px; border-radius: 999px;
          font-weight: 700; font-size: 14px; transition: background .2s; }
        .v5-nav-cta:hover { background: #22251A; }

        /* Hamburguesa: solo existe cuando los enlaces se esconden. */
        .v5-nav-burger { display: none; width: 40px; height: 40px; flex-shrink: 0; border-radius: 999px;
          border: 1px solid rgba(26,26,26,.12); background: rgba(255,255,255,.6); cursor: pointer;
          flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
        .v5-nav-burger span { display: block; width: 16px; height: 2px; border-radius: 2px; background: #1A1A1A; }
        .v5-nav-burger:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }
        @media (max-width: 760px) {
          .v5-nav-links { display: none; }
          .v5-nav-burger { display: flex; }
        }
        @media (max-width: 420px) { .v5-nav-entrar { display: none; } }

        .v5-menu { position: fixed; inset: 0; z-index: 120; background: #0F0F0F; color: #fff;
          display: flex; flex-direction: column; overflow-y: auto;
          padding: 18px 24px calc(28px + env(safe-area-inset-bottom, 0px)); }
        .v5-menu-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: clamp(24px,6vh,52px); }
        .v5-menu-etiqueta { font-size: 11.5px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.4); }
        .v5-menu-cerrar { width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.06); color: #fff; font-size: 16px; cursor: pointer; }
        .v5-menu-links { display: flex; flex-direction: column; }
        .v5-menu-links a { padding: 15px 0; font-size: clamp(26px,7vw,32px); font-weight: 800; letter-spacing: -.03em;
          color: #fff; border-bottom: 1px solid rgba(255,255,255,.08); }
        .v5-menu-pie { margin-top: auto; padding-top: 32px; display: flex; flex-direction: column; gap: 10px; }
        .v5-menu-entrar { text-align: center; padding: 16px; font-size: 16px; font-weight: 600; color: #fff;
          background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); border-radius: 999px; }
        .v5-menu-cta { text-align: center; padding: 16px; font-size: 16px; font-weight: 700; color: #D9C29E;
          background: #343825; border-radius: 999px; }

        /* --alto-barra: 8+8 de padding, 40 de contenido y 1+1 de borde. El
           hero se sube exactamente eso y lo recupera como padding: así el
           vídeo llega hasta el borde de arriba y la barra flota encima, en
           vez de quedar una banda del fondo de página (crema) por encima del
           vídeo — que es la franja clara que se veía. */
        .v5-hero { --alto-barra: 58px; position: relative; isolation: isolate; overflow: hidden;
          margin-top: calc(-1 * var(--alto-barra));
          padding: calc(var(--alto-barra) + clamp(60px,10vh,100px)) clamp(20px,4vw,48px) clamp(60px,8vw,100px); }
        .v5-hero-velo { position: absolute; inset: 0; z-index: -1; pointer-events: none;
          background: linear-gradient(178deg,rgba(12,11,8,.78) 0%,rgba(12,11,8,.6) 42%,rgba(12,11,8,.72) 78%,rgba(12,11,8,.9) 100%); }
        .v5-hero-wrap { max-width: 1180px; margin: 0 auto; text-align: center; }
        .v5-hero-eyebrow { font-size: 13px; font-weight: 800; letter-spacing: .2em; color: #D9C29E; margin: 0 0 22px; }
        .v5-hero-h1 { font-size: clamp(38px,6vw,84px); font-weight: 800; line-height: .99; letter-spacing: -.045em;
          margin: 0 auto; max-width: 16ch; text-wrap: balance; color: #FCFBF6; }
        .v5-hero-chips { display: flex; justify-content: center; gap: 8px 14px; flex-wrap: wrap;
          margin: 26px auto 0; max-width: 760px; font-size: 14px; font-weight: 700; color: #EAE8DE; }
        .v5-hero-chips span:not(:last-child)::after { content: '·'; margin-left: 14px; color: rgba(252,251,246,.45); font-weight: 400; }
        .v5-hero-chip-oro { color: #D9C29E; }
        .v5-hero-acciones { display: flex; justify-content: center; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 34px; }
        .v5-hero-cta { background: #D9C29E; color: #23271A; font-weight: 800; font-size: 17px; padding: 18px 36px;
          border-radius: 999px; white-space: nowrap; transition: transform .2s, background .2s; box-shadow: 0 18px 44px rgba(0,0,0,.35); }
        .v5-hero-cta:hover { background: #E3CFAF; transform: translateY(-2px); }
        .v5-hero-cta-2 { font-weight: 700; font-size: 16px; color: #FCFBF6; padding: 17px 10px; border-bottom: 2px solid rgba(252,251,246,.6); }
        .v5-hero-nota { font-size: 12.5px; font-weight: 600; color: rgba(234,232,222,.75); margin: 22px 0 0; }

        .v5-hero-mockup-stage { max-width: 1080px; margin: 56px auto 0; perspective: 1900px; }
        .v5-hero-mockup { position: relative; border-radius: 18px; overflow: hidden; transform-style: preserve-3d;
          transition: transform .3s ease-out; will-change: transform;
          background: #0F0F0F; border: 1px solid rgba(255,255,255,.14); box-shadow: 0 60px 140px rgba(0,0,0,.55); }
        .v5-hero-mockup-barra { display: flex; align-items: center; gap: 8px; padding: 13px 18px; }
        .v5-hero-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,.16); }
        .v5-hero-dot-on { background: #343825; }
        .v5-hero-mockup-url { flex: 1; text-align: center; font-size: 12px; font-weight: 600; color: rgba(255,255,255,.45); }
        .v5-hero-mockup-cuerpo { position: relative; max-height: 470px; overflow: hidden; }
        .v5-hero-mockup-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 110px;
          background: linear-gradient(180deg,rgba(15,15,15,0),rgba(15,15,15,.92)); }
        .v5-hero-badge { position: absolute; top: 18px; right: 18px; background: #fff; border: 1px solid #E7E7E0;
          border-radius: 12px; padding: 10px 14px; box-shadow: 0 14px 34px rgba(26,26,26,.14); text-align: left; }
        .v5-hero-badge-tit { display: block; font-size: 12.5px; font-weight: 800; color: #2F6B4F; }
        .v5-hero-badge-sub { display: block; font-size: 11px; color: #8E8E86; }

        /* El parte de la noche: la prueba en móvil. Fuera de móvil no se
           pinta — ahí manda la captura del panel, que a ese tamaño sí se lee. */
        .v5-parte { display: none; }

        @media (max-width: 760px) {
          /* Alineado a la izquierda: en una columna estrecha, el texto
             centrado obliga al ojo a buscar el inicio de cada línea. */
          .v5-hero { padding: calc(var(--alto-barra) + 28px) 20px 56px; }
          .v5-hero-wrap { text-align: left; }
          /* La foto tiene un ventanal muy claro justo a la altura de los
             botones; el velo del escritorio (0,6 en el centro) no daba para
             que el texto blanco aguantara ahí. */
          .v5-hero-velo { background: linear-gradient(178deg,rgba(12,11,8,.84) 0%,rgba(12,11,8,.78) 45%,rgba(12,11,8,.92) 100%); }
          .v5-hero-eyebrow { font-size: 11.5px; letter-spacing: .16em; margin-bottom: 14px; }
          .v5-hero-h1 { font-size: 34px; line-height: 1.04; letter-spacing: -.035em; margin: 0; max-width: none; }

          /* La lista de capacidades no se enseña a este ancho: ocupaba tres
             filas, empujaba la prueba fuera de pantalla y no dice nada que
             "Todo lo que necesitas" no diga ya. Sigue en el DOM (la lee un
             buscador, y está entera en la rejilla de Funcionalidades más
             abajo); en pantalla, el sitio lo ocupa el parte de la noche, que
             enseña en vez de enumerar. */
          .v5-hero-chips { display: none; }

          .v5-hero-acciones { flex-direction: column; align-items: stretch; gap: 10px; margin-top: 24px; }
          .v5-hero-cta { text-align: center; font-size: 16px; padding: 16px 24px; }
          .v5-hero-cta-2 { text-align: center; border-bottom: none; border: 1px solid rgba(252,251,246,.35);
            border-radius: 999px; padding: 15px 24px; font-size: 15px; }
          .v5-hero-nota { font-size: 11.5px; line-height: 1.5; margin-top: 16px; }

          /* La captura de escritorio no se enseña a este ancho. */
          .v5-hero-mockup-stage { display: none; }

          .v5-parte { display: block; margin-top: 28px; border-radius: 16px; padding: 16px 16px 14px;
            background: rgba(10,9,6,.58); border: 1px solid rgba(252,251,246,.18);
            backdrop-filter: blur(14px) saturate(1.1); }
          .v5-parte-tit { margin: 0 0 12px; font-size: 11.5px; font-weight: 700; letter-spacing: .12em;
            text-transform: uppercase; color: #D9C29E; }
          .v5-parte-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
          .v5-parte-lista li { display: flex; gap: 10px; align-items: baseline; }
          .v5-parte-hora { flex: none; width: 42px; font-size: 12px; font-weight: 700; color: rgba(234,232,222,.55);
            font-variant-numeric: tabular-nums; }
          .v5-parte-txt { font-size: 13.5px; line-height: 1.4; color: #EAE8DE; }
          .v5-parte-txt strong { color: #fff; font-weight: 800; }
          .v5-parte-pie { margin: 12px 0 0; padding-top: 11px; border-top: 1px solid rgba(252,251,246,.14);
            font-size: 13.5px; font-weight: 800; color: #D9C29E; }
        }
      `}</style>
    </>
  );
}
