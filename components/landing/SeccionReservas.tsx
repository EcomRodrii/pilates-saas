'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Lock, RotateCcw } from 'lucide-react';
import { SALIDAS } from './enlaces';

// «Tu estudio, en el móvil de cada alumna» — bloque 04 del rediseño (23-sep).
//
// Es el ÚNICO momento «ajá» que una propietaria vive en su semana de prueba:
// monta su horario, comparte el enlace y ve a una alumna reservar sola. Por eso
// es el bloque con más peso visual, y por eso enseña CAPTURAS REALES, no
// maquetas: la app de un estudio de verdad en un iPhone, su icono en la
// pantalla de inicio y su página de reservas en el ordenador.
//
// Antes eran un móvil 3D de 236 px dentro de una caja de 1240×680 (ilegible) y
// un widget simulado con una web inventada. Ahora las dos cosas se ven a la vez:
// el selector «En su app / En tu web» ya no hace falta.
//
// El iPhone empieza en la PANTALLA DE INICIO real de una alumna, con el icono y
// el nombre del estudio entre sus apps (el fundador: «que vean que es verdad»,
// nada recortado), el icono se pulsa y la app se abre desde él, con el mismo
// gesto que iOS. Se reproduce al entrar en pantalla; con
// `prefers-reduced-motion` no se mueve solo (el botón cambia de una a otra).
// Sin JavaScript se queda la pantalla de inicio, que es la prueba.
//
// Capturas: originales en docs/marca/capturas (fuera de /public). La barra de
// estado del iPhone se limpió (9:41, batería llena); en la pantalla de inicio,
// además, el fondo de pantalla (una foto personal difuminada) se cambió por un
// degradado neutro — el icono, su nombre, los puntos y el dock son los de la
// captura. Se sacaron AVIF/WebP a
// 1x/2x en public/landing/capturas. Si se cambian, regenerar las parejas y
// medir otra vez dónde cae el icono (ICONO_X/ICONO_Y).
//
// ⚠️ Afirmaciones cruzadas con el código: la app se instala en la pantalla de
// inicio con el nombre y el icono del estudio en TODOS los planes (manifest por
// estudio); colores y estilo propios, desde el plan Estudio. La alumna reserva
// y cancela sola; NO hay «cambiar de clase» (cancela y reserva otra). Comprar
// bonos online exige tener Stripe conectado.

interface Captura {
  base: string;
  anchos: readonly [number, number];
  ancho: number;
  alto: number;
  alt: string;
}

const APP: Captura = {
  base: '/landing/capturas/alumna-app-inicio',
  anchos: [440, 880],
  ancho: 1206,
  alto: 2622,
  alt: 'La app de un estudio de Pilates en el iPhone de una alumna: saludo, botón de reservar clase, su próxima clase y su semana.',
};
const INICIO: Captura = {
  base: '/landing/capturas/alumna-pantalla-inicio',
  anchos: [440, 880],
  ancho: 1206,
  alto: 2622,
  alt: 'La pantalla de inicio del iPhone de una alumna, con el icono y el nombre de su estudio, «Pilates Boutique», entre sus apps.',
};

/** Centro del icono del estudio en la captura de la pantalla de inicio (medido: 188×366 de 1206×2622). */
const ICONO_X = '15.6%';
const ICONO_Y = '14%';

type Fase = 'inicio' | 'toque' | 'abierta';

function TelefonoAlumna() {
  const ref = useRef<HTMLElement>(null);
  const [fase, setFase] = useState<Fase>('inicio');
  const tiempos = useRef<number[]>([]);

  const limpiar = useCallback(() => { tiempos.current.forEach((t) => window.clearTimeout(t)); tiempos.current = []; }, []);
  // Pantalla de inicio → toque en el icono (0,65 s) → la app se abre (1 s).
  const reproducir = useCallback(() => {
    limpiar();
    setFase('inicio');
    tiempos.current.push(window.setTimeout(() => setFase('toque'), 650));
    tiempos.current.push(window.setTimeout(() => setFase('abierta'), 1000));
  }, [limpiar]);

  // Se reproduce cada vez que el teléfono entra en pantalla, y vuelve a la
  // pantalla de inicio al salir, para que la siguiente vez se vea desde el
  // principio. Con movimiento reducido no arranca solo.
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) reproducir();
      else { limpiar(); setFase('inicio'); }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); limpiar(); };
  }, [reproducir, limpiar]);

  const reducido = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alPulsar = () => {
    if (reducido()) setFase(fase === 'abierta' ? 'inicio' : 'abierta');
    else reproducir();
  };

  return (
    <figure ref={ref} className="v5-res-telefono" data-fase={fase}>
      <div className="v5-res-pantalla" style={{ ['--ix' as string]: ICONO_X, ['--iy' as string]: ICONO_Y }}>
        <div className="v5-res-capa-inicio"><Imagen c={INICIO} sizes="(max-width: 860px) 230px, 280px" className="v5-res-app" /></div>
        <span className="v5-res-toque" aria-hidden="true" />
        <div className="v5-res-capa-app" aria-hidden={fase === 'inicio'}><Imagen c={APP} sizes="(max-width: 860px) 230px, 280px" className="v5-res-app" /></div>
        <span className="v5-res-isla" aria-hidden="true" />
      </div>
      <button type="button" className="v5-res-repetir" onClick={alPulsar}>
        {fase === 'abierta' ? <><RotateCcw size={13} strokeWidth={2.4} aria-hidden /> Ver cómo se abre</> : 'Abrir la app'}
      </button>
    </figure>
  );
}
const WEB: Captura = {
  base: '/landing/capturas/reservas-web',
  anchos: [960, 1600],
  ancho: 2760,
  alto: 1302,
  alt: 'La página de reservas de un estudio en el ordenador: los próximos días, los tipos de clase y las clases de hoy con sus plazas libres y el botón Reservar.',
};

function Imagen({ c, sizes, className }: { c: Captura; sizes: string; className?: string }) {
  const srcset = (ext: string) => c.anchos.map((w) => `${c.base}-${w}.${ext} ${w}w`).join(', ');
  return (
    <picture>
      <source type="image/avif" srcSet={srcset('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcset('webp')} sizes={sizes} />
      {/* <picture> con AVIF/WebP propios, mismo criterio que FotoLanding. */}
      <img
        src={`${c.base}-${c.anchos[1]}.webp`}
        alt={c.alt}
        width={c.ancho}
        height={c.alto}
        loading="lazy"
        decoding="async"
        className={className}
      />
    </picture>
  );
}

export function SeccionReservas() {
  return (
    <section id="app" className="v5-res" aria-labelledby="v5-res-h">
      <div className="v5-res-wrap">
        <header className="v5-res-head lp-rv">
          <h2 id="v5-res-h" className="v5-res-h2">Tu estudio, en el móvil de cada alumna.</h2>
          <p className="v5-res-lead">
            Con tu nombre y tu icono en su pantalla de inicio, sin pasar por la App Store. Reservan, cancelan y
            compran su bono solas: cada cambio que antes era un mensaje, ahora lo hace ella.
          </p>
        </header>

        <div className="v5-res-escena lp-rv" style={{ ['--lp-r' as string]: 6 }}>
          <figure className="v5-res-navegador">
            <div className="v5-res-barra" aria-hidden="true">
              <span className="v5-res-puntos"><i /><i /><i /></span>
              <span className="v5-res-direccion"><Lock size={11} strokeWidth={2.4} /> Tu página de reservas</span>
            </div>
            <Imagen c={WEB} sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1280px) 76vw, 960px" className="v5-res-web" />
          </figure>

          <TelefonoAlumna />
        </div>

        <div className="v5-res-columnas lp-rv">
          <div className="v5-res-col">
            <h3 className="v5-res-h3">En su móvil</h3>
            <p>La app de tu estudio: sus clases, sus bonos y el aviso de cada cambio. Con tus colores y tu estilo desde el plan Estudio.</p>
            <Link href={SALIDAS.app.href} className="v5-res-salida">{SALIDAS.app.label} →</Link>
          </div>
          <div className="v5-res-col">
            <h3 className="v5-res-h3">En tu web</h3>
            <p>Tu página de reservas, o el widget dentro de la web que ya tienes. Sin mandarlas a otra plataforma.</p>
            <Link href={SALIDAS.widget.href} className="v5-res-salida">{SALIDAS.widget.label} →</Link>
          </div>
        </div>
      </div>

      <style>{`
        .v5-res { background: #F3F3EF; border-top: 1px solid #E7E7E0; border-bottom: 1px solid #E7E7E0;
          padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); overflow: hidden; }
        .v5-res-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-res-head { max-width: 760px; }
        .v5-res-h2 { margin: 0 0 18px; font-size: clamp(30px,4.4vw,60px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; text-wrap: balance; color: #1A1A1A; }
        .v5-res-lead { margin: 0; max-width: 58ch; font-size: 17px; line-height: 1.6; color: #5A5A52; }

        /* La escena: el navegador al fondo a la izquierda y el iPhone delante a
           la derecha, montado sobre él. --tel es el ancho del teléfono; su alto
           sale de la proporción real de la captura (2622/1206) más el bisel. */
        .v5-res-escena { --tel: clamp(200px,21vw,280px); position: relative; margin-top: clamp(40px,5vw,64px);
          min-height: calc(40px + var(--tel) * 2.174 + 20px); }
        .v5-res-navegador { margin: 0; width: 90%; border-radius: 16px; overflow: hidden; background: #fff;
          border: 1px solid #DEDED6; box-shadow: 0 50px 100px -50px rgba(34,37,26,.45), 0 2px 8px rgba(34,37,26,.05); }
        .v5-res-barra { display: flex; align-items: center; gap: 16px; height: 38px; padding: 0 14px;
          background: #F1F1EB; border-bottom: 1px solid #E4E4DC; }
        .v5-res-puntos { display: flex; gap: 6px; }
        .v5-res-puntos i { width: 10px; height: 10px; border-radius: 50%; background: #D8D6CC; }
        .v5-res-direccion { display: inline-flex; align-items: center; gap: 6px; margin: 0 auto; padding: 4px 14px;
          border-radius: 8px; background: #fff; font-size: 12px; font-weight: 600; color: #6B6F58; }
        .v5-res-navegador picture, .v5-res-web { display: block; width: 100%; height: auto; }

        .v5-res-telefono { position: absolute; top: 40px; right: 1%; margin: 0; width: var(--tel); padding: 10px;
          border-radius: calc(var(--tel) * .19); background: #1B1B19;
          box-shadow: 0 60px 90px -40px rgba(20,20,16,.55), inset 0 0 0 1.5px #3A3A36; }
        .v5-res-pantalla { position: relative; border-radius: calc(var(--tel) * .155); overflow: hidden; background: #2A2926; }
        .v5-res-pantalla picture, .v5-res-app { display: block; width: 100%; height: auto; }
        .v5-res-isla { position: absolute; z-index: 3; top: 2.1%; left: 50%; width: 31%; height: 3.4%;
          transform: translateX(-50%); border-radius: 999px; background: #0B0B0A; }

        /* La app se abre DESDE el icono, como en iOS: la capa de la app parte
           del tamaño y el sitio del icono (escala .158 con origen en su centro)
           y crece hasta ocupar la pantalla, mientras el inicio se aleja un poco
           detrás. Solo transform, opacity y filter: nada que recalcule layout. */
        .v5-res-capa-inicio { transition: transform var(--motion-ventana) var(--motion-ease-ventana), filter var(--motion-ventana) ease; transform-origin: var(--ix) var(--iy); }
        .v5-res-capa-app { position: absolute; inset: 0; z-index: 2; transform-origin: var(--ix) var(--iy);
          transform: scale(.158); opacity: 0; border-radius: 26%; overflow: hidden;
          transition: transform var(--motion-ventana) var(--motion-ease-ventana), opacity var(--motion-normal) linear, border-radius var(--motion-ventana) var(--motion-ease-ventana); }
        .v5-res-telefono[data-fase="abierta"] .v5-res-capa-app { transform: none; opacity: 1; border-radius: 0; }
        .v5-res-telefono[data-fase="abierta"] .v5-res-capa-inicio { transform: scale(1.08); filter: blur(2px) brightness(.9); }
        .v5-res-toque { position: absolute; z-index: 1; left: var(--ix); top: var(--iy); width: 17%; aspect-ratio: 1;
          border-radius: 24%; background: rgba(255,255,255,.55); transform: translate(-50%,-50%) scale(.6); opacity: 0;
          pointer-events: none; }
        .v5-res-telefono[data-fase="toque"] .v5-res-toque { animation: v5-res-toque .38s ease-out both; }
        @keyframes v5-res-toque {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.7); }
          35% { opacity: .9; transform: translate(-50%,-50%) scale(.92); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(1.25); }
        }
        .v5-res-repetir { position: absolute; left: 50%; bottom: -20px; transform: translateX(-50%); z-index: 4;
          display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 999px; border: 1px solid #E4E4DC;
          background: #fff; color: #343825; font: inherit; font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer;
          box-shadow: 0 14px 30px -16px rgba(34,37,26,.45); transition: transform var(--motion-normal) var(--motion-ease), box-shadow var(--motion-normal); }
        .v5-res-repetir:hover { transform: translateX(-50%) translateY(-2px); box-shadow: 0 18px 34px -16px rgba(34,37,26,.5); }
        .v5-res-repetir:active { transform: translateX(-50%) scale(.97); }
        .v5-res-repetir:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .v5-res-capa-inicio, .v5-res-capa-app { transition: none; }
          .v5-res-telefono[data-fase="toque"] .v5-res-toque { animation: none; }
        }

        .v5-res-columnas { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px 56px;
          margin-top: clamp(40px,4vw,56px); max-width: 980px; }
        .v5-res-h3 { margin: 0 0 8px; font-size: 18px; font-weight: 800; letter-spacing: -.01em; color: #1F2216; }
        .v5-res-col p { margin: 0; font-size: 15.5px; line-height: 1.6; color: #5A5A52; }
        .v5-res-salida { display: inline-block; margin-top: 10px; font-size: 15px; font-weight: 700; color: #343825; }
        .v5-res-salida:hover { text-decoration: underline; text-underline-offset: 4px; }

        /* Tablet y móvil: el navegador a todo lo ancho y el teléfono debajo,
           montado sobre su borde inferior; el icono, a su izquierda. */
        @media (max-width: 860px) {
          .v5-res-escena { --tel: min(46vw, 230px); min-height: 0; display: flex; flex-direction: column; align-items: center; }
          .v5-res-navegador { width: 100%; border-radius: 12px; }
          .v5-res-barra { height: 30px; }
          .v5-res-direccion { font-size: 11px; padding: 3px 10px; }
          .v5-res-telefono { position: relative; top: auto; right: auto; margin-top: -40px; padding: 8px; }
          .v5-res-columnas { grid-template-columns: minmax(0,1fr); gap: 24px; }
        }
      `}</style>
    </section>
  );
}
