'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Pantallas de VALOR — lo primero que ve la propietaria al entrar, antes de
// que le pidamos un solo dato.
//
// Qué problema resuelve: el asistente de bienvenida empezaba preguntando
// («¿cuántos centros tienes?») a alguien que acaba de registrarse y todavía no
// sabe qué gana con esto. Preguntar antes de demostrar es pedir un favor.
// Estas cuatro pantallas enseñan primero, y solo después preguntan.
//
// Reglas de la baraja:
//   · CUATRO pantallas, no diez. Es una promesa corta que se puede leer de pie
//     con el móvil en la mano; si hace falta un scroll, ya es un folleto.
//   · Cada una es UN problema real de su semana → LA pantalla de Tentare que
//     lo resuelve. Nada de «potencia tu negocio»: el jueves a las 23:47, una
//     alumna te escribe.
//   · Se puede saltar entera, siempre, desde la primera. Quien ya se ha
//     decidido no necesita que le vendan nada.
//   · Nada de esto escribe en la base de datos. Es una lectura; el asistente
//     que viene después es el que configura.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Tenti, type TentiPose } from '@/components/marca/tenti';
import { PasoLogo } from './paso-logo';
import { LogoTentare } from '@/components/marca/logo-tentare';
import {
  EscenaReservas, EscenaCobros, EscenaSustituciones, EscenaInformes,
} from './escenas-valor';

type Pantalla = {
  id: string;
  /** Lo que ella diría, en sus palabras. Va entre comillas porque es una cita,
   *  no un eslogan: quien lo lee tiene que reconocerse, no admirarnos. */
  problema: string;
  titular: string;
  /** Una o dos líneas, planas: qué hace el software, sin eslogan. */
  apoyo: string;
  /** Tres cosas concretas. Rellenan con INFORMACIÓN el hueco que antes era
   *  aire, y se leen de un vistazo sin tener que leerse el párrafo. */
  puntos: string[];
  pose: TentiPose;
  /** `null` en la pantalla del logo: ahí no hay antes/después que enseñar,
   *  hay algo que hacer. */
  Escena: ((p: { activa: boolean }) => React.ReactElement) | null;
};

const PANTALLAS: Pantalla[] = [
  {
    id: 'reservas',
    problema: '«Me escriben a las once de la noche para apuntarse»',
    titular: 'Tus alumnas reservan solas, a cualquier hora',
    apoyo: 'Tienes una página de reservas propia. Se apuntan ellas, y Tentare respeta tu aforo y tus normas de cancelación.',
    puntos: ['Aforo por sala', 'Lista de espera', 'Cancelan según tus normas'],
    pose: 'hola',
    Escena: EscenaReservas,
  },
  {
    id: 'cobros',
    problema: '«Cada mes persigo a las mismas cinco personas»',
    titular: 'Cobras las cuotas y los bonos automáticamente',
    apoyo: 'El día que toca, Tentare cobra la tarjeta guardada y envía el recibo. Si un pago falla, lo reintenta y te avisa.',
    puntos: ['Cobro el día 1', 'Recibo y factura', 'Reintento si falla'],
    pose: 'lo-lograste',
    Escena: EscenaCobros,
  },
  {
    id: 'sustituciones',
    problema: '«Si una instructora se cae, se me va la mañana en llamadas»',
    titular: 'Cuando una instructora no puede, buscamos sustituta',
    apoyo: 'Tentare avisa a las que encajan con esa clase, de una en una, hasta que alguna acepta. Y avisa a las alumnas.',
    puntos: ['Por orden de encaje', 'Avisa a las alumnas', 'Sin llamar a nadie'],
    pose: 'pensando',
    Escena: EscenaSustituciones,
  },
  {
    id: 'informes',
    problema: '«No sé qué clases me salen a cuenta»',
    titular: 'Ves qué clases se llenan y cuáles no',
    apoyo: 'Ocupación y margen de cada clase, con sus números. Y te avisa de la que lleva semanas sin llenarse.',
    puntos: ['Ocupación por clase', 'Margen real', 'Aviso si una se vacía'],
    pose: 'celebracion',
    Escena: EscenaInformes,
  },
  {
    // La única que PIDE algo en vez de enseñar. Va la última a propósito: se
    // pide después de haber demostrado, no antes.
    id: 'logo',
    problema: '«Quiero que mis alumnas vean mi estudio, no una plantilla»',
    titular: 'Ponle tu logo y ya es tuyo',
    apoyo: 'Es lo único que te pedimos ahora. El resto —colores, textos, tu página— lo afinas cuando quieras.',
    puntos: ['Tu página de reservas', 'La app de tus alumnas', 'Sus correos'],
    pose: 'con-amor',
    Escena: null,
  },
];

/** Cuánto tarda la escena en pasar de «antes» a «después» al entrar. Deja leer
 *  el titular primero: si la transformación ocurre a la vez, no se ve. */
const MS_ANTES_DE_TRANSFORMAR = 900;

export function PantallasValor({
  onContinuar, studioId, studioNombre, logoActual, onGuardarLogo,
}: {
  onContinuar: () => void;
  studioId: string;
  studioNombre: string;
  logoActual: string | null;
  onGuardarLogo: (url: string) => Promise<void>;
}) {
  const [i, setI] = useState(0);
  const [transformada, setTransformada] = useState(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const p = PANTALLAS[i];
  const ultima = i === PANTALLAS.length - 1;

  // Volver a «antes» al cambiar de pantalla se hace DURANTE el render y no en
  // un efecto: así no hay un primer pintado con la escena anterior ya
  // transformada, y además `react-hooks/set-state-in-effect` prohíbe lo otro.
  // Mismo patrón que ya usa tab-estudio-general al recargar su formulario.
  const [iAnterior, setIAnterior] = useState(i);
  if (i !== iAnterior) { setIAnterior(i); setTransformada(false); }

  // La transformación arranca sola. Aquí NO se consulta «reducir movimiento»:
  // el estado final es la información, así que siempre se llega a él. Quien
  // pide menos movimiento no ve la transición porque el CSS de abajo la apaga
  // —declarativo y en un solo sitio— en vez de tener el componente decidiendo
  // dos veces lo mismo.
  useEffect(() => {
    timer.current = setTimeout(() => setTransformada(true), MS_ANTES_DE_TRANSFORMAR);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [i]);

  // El foco viaja al titular al cambiar de pantalla. Sin esto, quien navega con
  // teclado pulsa «Siguiente» y el foco se queda en un botón que ya no existe:
  // se cae al principio del documento y el cambio no se anuncia. Mismo arreglo
  // que ya lleva el alta de /crear-estudio.
  useEffect(() => { tituloRef.current?.focus(); }, [i]);

  const siguiente = useCallback(() => {
    if (ultima) { onContinuar(); return; }
    setI((n) => n + 1);
  }, [ultima, onContinuar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') siguiente();
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
      if (e.key === 'Escape') onContinuar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [siguiente, onContinuar]);

  const { Escena } = p;

  return (
    <div
      style={{
        // Lienzo CLARO y con los tokens reales del panel, no una paleta propia.
        // La primera versión era un oliva muy oscuro a pantalla completa: se
        // veía imponente en una captura y se sentía frío y pesado siendo quien
        // acaba de registrarse. Y encima era un salto: entrabas al producto y
        // el producto es claro. Al mapear `--valor-*` a los tokens del sistema,
        // esto sigue al tema (claro/oscuro) solo, y es literalmente el mismo
        // material que el panel al que va a entrar.
        '--valor-fondo': 'var(--background)',
        '--valor-superficie': 'var(--card)',
        '--valor-linea': 'var(--border)',
        '--valor-neutro': 'var(--muted)',
        '--valor-tinta': 'var(--foreground)',
        '--valor-tenue': 'var(--muted-foreground)',
        // El oliva MEDIO y no `--brand`: a tamaño pequeño —un icono de 16 px,
        // el borde de un panel— el #343825 se lee como negro y la pantalla se
        // apaga. Es la razón por la que `--brand-medio` existe.
        '--valor-marca': 'var(--brand-medio)',
        '--valor-sobre-marca': '#FFFFFF',
        '--valor-aviso': 'var(--destructive)',
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'var(--valor-fondo)',
        color: 'var(--valor-tinta)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      } as React.CSSProperties}
    >
      {/* Cabecera: marca a la izquierda, salida a la derecha. La salida está
          desde la PRIMERA pantalla — esconderla hasta el final para forzar que
          se lo lean es exactamente lo que hace que se lo salten con desprecio. */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', flexShrink: 0 }}>
        {/* `tinta="auto"` y no la de por defecto: `color` pinta el disco en
            magenta (#B4537E), que no es lo que ve en el panel — y esta pantalla
            es su primer contacto con la marca. `auto` es la que usa el sidebar
            y además sigue al modo claro/oscuro desde globals.css. */}
        <LogoTentare alto={24} tinta="auto" decorativo />
        <button
          type="button"
          onClick={onContinuar}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--valor-tenue)', fontSize: 13, fontWeight: 600,
            padding: '8px 4px', fontFamily: 'inherit',
          }}
        >
          Saltar
        </button>
      </header>

      <div
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px 24px 24px',
        }}
      >
        <div
          key={p.id}
          style={{
            width: '100%', maxWidth: 1000,
            display: 'grid', gap: 'clamp(20px, 3vw, 30px) clamp(28px, 5vw, 56px)',
            alignItems: 'center',
            animation: 'valor-entra 520ms cubic-bezier(0.22,1,0.36,1) both',
          }}
          className="valor-rejilla"
        >
          <div style={{ gridArea: 'texto' }}>
            <p
              style={{
                margin: 0, fontSize: 'clamp(13px, 1.6vw, 14.5px)', lineHeight: 1.45,
                color: 'var(--valor-tenue)', fontStyle: 'italic', maxWidth: 430,
              }}
            >
              {p.problema}
            </p>
            <h1
              ref={tituloRef}
              tabIndex={-1}
              style={{
                // La MISMA tipografía que todo el panel, no una serif de
                // display solo aquí: introducir una voz distinta en la primera
                // pantalla hace que el producto de detrás parezca otro. Grande
                // y en negrita para que pese sin necesitar otra familia.
                margin: '10px 0 0', outline: 'none',
                fontSize: 'clamp(26px, 3.6vw, 38px)',
                lineHeight: 1.12, letterSpacing: '-0.025em', fontWeight: 800,
                color: 'var(--valor-tinta)', maxWidth: 480,
              }}
            >
              {p.titular}
            </h1>
            <p
              style={{
                margin: '12px 0 0', maxWidth: 460,
                fontSize: 'clamp(13.5px, 1.7vw, 15px)', lineHeight: 1.55,
                color: 'var(--valor-tenue)',
              }}
            >
              {p.apoyo}
            </p>

            {/* Tres cosas concretas. Antes aquí solo había aire — y «demasiado
                vacío» se lee como «falta algo», no como calma. */}
            <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
              {p.puntos.map((punto) => (
                <li
                  key={punto}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--valor-neutro)', border: '1px solid var(--valor-linea)',
                    borderRadius: 999, padding: '5px 11px 5px 8px',
                    fontSize: 12.5, fontWeight: 600, color: 'var(--valor-tinta)',
                  }}
                >
                  <Check size={13} strokeWidth={3} style={{ color: 'var(--valor-marca)', flexShrink: 0 }} aria-hidden />
                  {punto}
                </li>
              ))}
            </ul>
          </div>

          {/* Acciones en su propia zona de la rejilla, no dentro del texto.
              En móvil tienen que ir DESPUÉS de la escena: el botón se pulsa
              con la prueba ya vista, no antes. Con todo en una columna, la
              escena quedaba debajo del botón y nadie llegaba a ella. */}
          <div style={{ gridArea: 'acciones' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={siguiente}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'var(--valor-marca)', color: 'var(--valor-sobre-marca)',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  padding: '13px 24px', fontSize: 14.5, fontWeight: 700,
                  fontFamily: 'inherit',
                }}
              >
                {ultima ? 'Montar mi estudio' : 'Siguiente'}
                <ArrowRight size={16} strokeWidth={2.5} />
              </button>

              {/* Riel de avance: dice cuánto queda, que es información real —
                  no un adorno de «01 / 02 / 03». */}
              <div style={{ display: 'flex', gap: 5 }} aria-hidden>
                {PANTALLAS.map((q, n) => (
                  <span
                    key={q.id}
                    style={{
                      width: n === i ? 22 : 7, height: 7, borderRadius: 999,
                      background: n <= i ? 'var(--valor-marca)' : 'var(--valor-linea)',
                      transition: 'width 380ms cubic-bezier(0.22,1,0.36,1), background 380ms linear',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--valor-tenue)' }}>
                {i + 1} de {PANTALLAS.length}
              </span>
            </div>
          </div>

          {/* La escena, con Tenti debajo. Va en FLUJO y no posicionada encima:
              en absoluto se montaba sobre la última tarjeta y le tapaba el
              check —visto en el navegador—, y además cualquier cambio de alto
              de una escena volvería a romperlo. Decorativa: el titular de al
              lado ya dice lo que ella celebra. */}
          <div style={{ gridArea: 'escena', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {Escena ? (
              <Escena activa={transformada} />
            ) : (
              <PasoLogo
                studioId={studioId}
                studioNombre={studioNombre}
                logoActual={logoActual}
                onGuardar={onGuardarLogo}
              />
            )}
            <div
              style={{
                alignSelf: 'flex-end', marginRight: 4,
                opacity: transformada ? 1 : 0,
                transform: transformada ? 'translateY(0)' : 'translateY(12px)',
                transition: 'opacity 420ms linear 620ms, transform 560ms cubic-bezier(0.22,1,0.36,1) 620ms',
                pointerEvents: 'none',
              }}
            >
              <Tenti pose={p.pose} alto={104} />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes valor-entra {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }
        .valor-rejilla {
          grid-template-columns: minmax(0, 1fr);
          grid-template-areas: 'texto' 'escena' 'acciones';
        }
        @media (min-width: 860px) {
          .valor-rejilla {
            grid-template-columns: 1fr minmax(0, 420px);
            /* La escena ocupa la columna derecha entera; texto y acciones se
               apilan a su izquierda. */
            grid-template-areas: 'texto escena' 'acciones escena';
            align-items: start;
          }
          .valor-rejilla > [style*='grid-area: texto'] { align-self: end; }
        }
        @media (prefers-reduced-motion: reduce) {
          /* Una sola regla para toda la baraja, escenas incluidas: el contenido
             aparece en su estado final sin recorrido. */
          .valor-rejilla, .valor-rejilla * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
