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
import { ArrowRight } from 'lucide-react';
import { Tenti, type TentiPose } from '@/components/marca/tenti';
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
  /** Una sola línea. Si necesita dos, es que el titular no está claro. */
  apoyo: string;
  pose: TentiPose;
  Escena: (p: { activa: boolean }) => React.ReactElement;
};

const PANTALLAS: Pantalla[] = [
  {
    id: 'reservas',
    problema: '«Me escriben a las once de la noche para apuntarse»',
    titular: 'Tus alumnas se apuntan solas',
    apoyo: 'Tu página de reservas está abierta cuando tú no lo estás. Con su aforo, sus normas y su lista de espera.',
    pose: 'hola',
    Escena: EscenaReservas,
  },
  {
    id: 'cobros',
    problema: '«Cada mes persigo a las mismas cinco personas»',
    titular: 'El bono se cobra solo',
    apoyo: 'Cuotas y bonos se cobran el día que toca, con su recibo y su factura. Tú te enteras de que ha entrado el dinero.',
    pose: 'lo-lograste',
    Escena: EscenaCobros,
  },
  {
    id: 'sustituciones',
    problema: '«Si una instructora se cae, se me va la mañana en llamadas»',
    titular: 'La sustituta la buscamos nosotros',
    apoyo: 'Tentare avisa por orden de quien mejor encaja con esa clase, y para cuando alguien acepta. Sin que llames a nadie.',
    pose: 'pensando',
    Escena: EscenaSustituciones,
  },
  {
    id: 'informes',
    problema: '«No sé qué clases me salen a cuenta»',
    titular: 'Sabes qué clase sostiene el estudio',
    apoyo: 'Ocupación y margen de cada clase, con sus números y no con una sensación. También la que lleva semanas vacía.',
    pose: 'celebracion',
    Escena: EscenaInformes,
  },
];

/** Cuánto tarda la escena en pasar de «antes» a «después» al entrar. Deja leer
 *  el titular primero: si la transformación ocurre a la vez, no se ve. */
const MS_ANTES_DE_TRANSFORMAR = 900;

export function PantallasValor({ onContinuar }: { onContinuar: () => void }) {
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
        // ⚠️ Lienzo de un solo look, con los valores fijos y no con
        // `var(--background)`: esta baraja es un momento a pantalla completa
        // con la marca en grande, y en modo oscuro `--brand` se INVIERTE a
        // oliva claro (#8A9165) — el fondo se volvería verde pálido y el texto
        // arena desaparecería. Aquí el oliva profundo es el mismo en los dos
        // modos a propósito. Los tokens `--valor-*` los consumen las escenas.
        '--valor-fondo': '#2A2E1E',
        '--valor-superficie': '#FBFAF6',
        '--valor-linea': '#E3E1D6',
        '--valor-neutro': '#EDEBE2',
        '--valor-tinta': '#22261A',
        '--valor-tenue': '#767366',
        '--valor-marca': '#4A5330',
        '--valor-marca-suave': '#E4E8D4',
        '--valor-aviso': '#A8622A',
        '--valor-arena': '#D9C29E',
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'var(--valor-fondo)',
        color: '#F2F0E6',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
      } as React.CSSProperties}
    >
      {/* Cabecera: marca a la izquierda, salida a la derecha. La salida está
          desde la PRIMERA pantalla — esconderla hasta el final para forzar que
          se lo lean es exactamente lo que hace que se lo salten con desprecio. */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', flexShrink: 0 }}>
        <LogoTentare alto={22} tinta="blanco" decorativo />
        <button
          type="button"
          onClick={onContinuar}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(242,240,230,.62)', fontSize: 13, fontWeight: 600,
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
            width: '100%', maxWidth: 980,
            display: 'grid', gap: 'clamp(22px, 4vw, 40px) clamp(28px, 5vw, 64px)',
            alignItems: 'center',
            animation: 'valor-entra 520ms cubic-bezier(0.22,1,0.36,1) both',
          }}
          className="valor-rejilla"
        >
          <div style={{ gridArea: 'texto' }}>
            <p
              style={{
                margin: 0, fontSize: 'clamp(13px, 1.6vw, 15px)', lineHeight: 1.45,
                color: 'var(--valor-arena)', fontStyle: 'italic', maxWidth: 420,
              }}
            >
              {p.problema}
            </p>
            <h1
              ref={tituloRef}
              tabIndex={-1}
              style={{
                margin: '12px 0 0', outline: 'none',
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: 'clamp(32px, 5.4vw, 54px)',
                lineHeight: 1.02, letterSpacing: '-0.015em', fontWeight: 400,
                color: '#F7F5EC', maxWidth: 460,
              }}
            >
              {p.titular}
            </h1>
            <p
              style={{
                margin: '16px 0 0', maxWidth: 430,
                fontSize: 'clamp(13.5px, 1.7vw, 15.5px)', lineHeight: 1.55,
                color: 'rgba(242,240,230,.74)',
              }}
            >
              {p.apoyo}
            </p>

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
                  background: 'var(--valor-arena)', color: '#22261A',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  padding: '13px 24px', fontSize: 14.5, fontWeight: 700,
                  fontFamily: 'inherit',
                }}
              >
                {ultima ? 'Montamos tu estudio' : 'Siguiente'}
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
                      background: n <= i ? 'var(--valor-arena)' : 'rgba(242,240,230,.22)',
                      transition: 'width 380ms cubic-bezier(0.22,1,0.36,1), background 380ms linear',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'rgba(242,240,230,.5)' }}>
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
            <Escena activa={transformada} />
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
