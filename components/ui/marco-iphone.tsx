'use client';

import { useSyncExternalStore, type HTMLAttributes, type ReactNode } from 'react';

// Un iPhone 17 para enseñar la app de la alumna en el panel: la pantalla de 402 × 874
// puntos (la lógica del dispositivo), con su Dynamic Island, la barra de estado, el
// indicador de inicio y los botones del lateral.
//
// Todo va a TAMAÑO REAL y se reduce con `escala`: así la app de dentro (un iframe, o la
// pieza de verdad) se pinta a 402 px, como en un iPhone, y no hay que repartir medidas
// entre quien lo usa. `children` ocupa la pantalla entera; la barra de estado, la isla y el
// indicador van ENCIMA, como en el teléfono (la app corre por debajo).
//
// Las medidas son las de Apple (pantalla 402 × 874, isla 126 × 37 a 11 pt del borde, esquina de
// la pantalla ~56 pt, indicador 134 × 5 a 8 pt del borde). El bisel y el canto van algo más gruesos
// que los reales (el 17 ronda los 4–5 pt), lo justo para que se lean a 0,75.

export const PANTALLA_IPHONE = { ancho: 402, alto: 874 } as const;

const BISEL = 6;
const MARCO = 3;
const RADIO_PANTALLA = 56;
const EXTERIOR = {
  ancho: PANTALLA_IPHONE.ancho + 2 * (BISEL + MARCO),
  alto: PANTALLA_IPHONE.alto + 2 * (BISEL + MARCO),
};
const RADIO_EXTERIOR = RADIO_PANTALLA + BISEL + MARCO;

// Aluminio mate (el 17 base no es titanio): sin brillos duros en las esquinas.
const METAL = 'linear-gradient(135deg, #6c6e73 0%, #3d3e42 30%, #25262a 55%, #4a4b50 80%, #74767b 100%)';
const FUENTE = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif";

const suscribirAlto = (avisar: () => void) => {
  window.addEventListener('resize', avisar);
  return () => window.removeEventListener('resize', avisar);
};

/**
 * La escala a la que cabe el teléfono en la altura de la ventana: el máximo que se pida, y menos
 * si la pantalla es baja. En un portátil (~780 pt de ventana) un iPhone a 0,75 mide 670 y pierde
 * por abajo las pestañas y el indicador de inicio, que es justo lo que lo hace parecer un iPhone.
 * `reservado` es lo que ocupan alrededor (cabeceras, pie de la vista previa, márgenes).
 */
export function useEscalaIphone(max = 0.75, reservado = 260): number {
  const alto = useSyncExternalStore(suscribirAlto, () => window.innerHeight, () => 0);
  if (!alto) return max;
  const cabe = Math.round(((alto - reservado) / EXTERIOR.alto) * 100) / 100;
  return Math.min(max, Math.max(0.55, cabe));
}

/** Lo que mide el teléfono entero (marco incluido) a una escala, para reservar su sitio. */
export function medidaIphone(escala: number) {
  return { ancho: Math.round(EXTERIOR.ancho * escala), alto: Math.round(EXTERIOR.alto * escala) };
}

// Botones del lateral, en coordenadas del teléfono entero. A la izquierda el de acción y los de
// volumen; a la derecha el de encendido y el control de la cámara (el 17 los trae los dos).
const BOTONES: { lado: 'izq' | 'der'; y: number; alto: number; hundido?: boolean }[] = [
  { lado: 'izq', y: 138, alto: 36 },
  { lado: 'izq', y: 200, alto: 64 },
  { lado: 'izq', y: 276, alto: 64 },
  { lado: 'der', y: 232, alto: 104 },
  { lado: 'der', y: 640, alto: 76, hundido: true },
];

export interface MarcoIphoneProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Tamaño de la pantalla respecto al real (1 = 402 px de ancho). */
  escala?: number;
  /**
   * Color de la barra de estado y del indicador: `clara` sobre una foto o un fondo oscuro,
   * `oscura` sobre uno claro. La app de dentro es quien manda; el marco no puede leerla, salvo con
   * `auto`: blanco que se invierte con lo que hay debajo (`mix-blend-mode: difference`), para cuando
   * dentro va una app real que cambia de fondo al desplazarse o al cambiar de pantalla.
   */
  tinta?: 'clara' | 'oscura' | 'auto';
  /** Con `clara`, un velo suave arriba para que la hora se lea aunque lo de debajo sea blanco. */
  velo?: boolean;
  /**
   * Color del indicador de inicio (la barrita de abajo). Va aparte de `tinta` porque arriba suele
   * haber una foto y abajo una barra clara: no tienen por qué leerse con el mismo color.
   */
  indicador?: 'clara' | 'oscura' | 'auto';
  /** Fondo de la barra de estado, para cuando lo de debajo ha subido hasta ella (p. ej. `rgba(250,249,245,.92)`). */
  fondoBarra?: string;
  children: ReactNode;
}

function Senal() {
  return (
    <svg width="19" height="12" viewBox="0 0 19 12" aria-hidden="true" fill="currentColor">
      <rect x="0" y="8" width="3.2" height="4" rx="1" />
      <rect x="5" y="5.5" width="3.2" height="6.5" rx="1" />
      <rect x="10" y="3" width="3.2" height="9" rx="1" />
      <rect x="15" y="0" width="3.2" height="12" rx="1" />
    </svg>
  );
}

function Wifi() {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" aria-hidden="true" fill="currentColor">
      <path d="M8.5 2.3c2.2 0 4.2.9 5.7 2.3.1.1.3.1.4 0l1-1c.1-.1.1-.3 0-.4C13.7.9 11.2 0 8.5 0S3.3.9 1.4 3.2c-.1.1-.1.3 0 .4l1 1c.1.1.3.1.4 0 1.5-1.4 3.5-2.3 5.7-2.3Z" />
      <path d="M8.5 6.1c1.2 0 2.3.5 3.1 1.2.1.1.3.1.4 0l1-1c.1-.1.1-.3 0-.4a6.8 6.8 0 0 0-9 0c-.1.1-.1.3 0 .4l1 1c.1.1.3.1.4 0 .8-.7 1.9-1.2 3.1-1.2Z" />
      <path d="M8.5 9.8c.6 0 1.1.2 1.5.6.1.1.1.3 0 .4L8.7 12c-.1.1-.3.1-.4 0L7 10.8c-.1-.1-.1-.3 0-.4.4-.4.9-.6 1.5-.6Z" />
    </svg>
  );
}

function Bateria() {
  return (
    <svg width="28" height="13" viewBox="0 0 28 13" aria-hidden="true" fill="currentColor">
      <rect x="0.5" y="0.5" width="24" height="12" rx="3.6" fill="none" stroke="currentColor" opacity="0.4" />
      <rect x="2" y="2" width="21" height="9" rx="2.4" />
      <rect x="25.6" y="4.3" width="1.8" height="4.4" rx="0.9" opacity="0.45" />
    </svg>
  );
}

export function MarcoIphone({ escala = 0.75, tinta = 'oscura', velo = true, indicador = 'oscura', fondoBarra, children, style, ...resto }: MarcoIphoneProps) {
  const tintaCss = tinta === 'oscura' ? '#0B0B0C' : '#FFFFFF';
  const indicadorCss = indicador === 'oscura' ? '#0B0B0C' : '#FFFFFF';
  const mezcla = (t: 'clara' | 'oscura' | 'auto') => (t === 'auto' ? { mixBlendMode: 'difference' as const } : null);
  const m = medidaIphone(escala);
  return (
    <div {...resto} style={{ ...style, position: 'relative', width: m.ancho, height: m.alto, flexShrink: 0 }}>
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: EXTERIOR.ancho, height: EXTERIOR.alto,
          transform: `scale(${escala})`, transformOrigin: 'top left',
        }}
      >
        {BOTONES.map((b) => (
          <span
            key={`${b.lado}-${b.y}`}
            aria-hidden="true"
            style={{
              position: 'absolute', top: b.y, height: b.alto, width: 5, borderRadius: 3,
              [b.lado === 'izq' ? 'left' : 'right']: -3,
              background: b.hundido ? 'linear-gradient(90deg, #17181a, #2c2d31)' : METAL,
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute', inset: 0, borderRadius: RADIO_EXTERIOR, background: METAL,
            boxShadow: '0 38px 70px -22px rgba(0,0,0,.5), 0 14px 26px rgba(0,0,0,.22), inset 0 0 0 1px rgba(255,255,255,.16)',
          }}
        >
          <div style={{ position: 'absolute', inset: MARCO, borderRadius: RADIO_EXTERIOR - MARCO, background: '#050506', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.07)' }}>
            <div
              data-testid="iphone-pantalla"
              style={{
                position: 'absolute', inset: BISEL, borderRadius: RADIO_PANTALLA, overflow: 'hidden', background: '#FFFFFF',
                width: PANTALLA_IPHONE.ancho, height: PANTALLA_IPHONE.alto, isolation: 'isolate',
              }}
            >
              <div style={{ position: 'absolute', inset: 0 }}>{children}</div>

              {fondoBarra && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', left: 0, right: 0, top: 0, height: 78, pointerEvents: 'none', background: fondoBarra,
                    backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                    // Se funde hacia abajo: un filo duro a 54 pt parte en dos lo que pasa por debajo.
                    maskImage: 'linear-gradient(to bottom, #000 62%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
                  }}
                />
              )}

              {tinta === 'clara' && velo && !fondoBarra && (
                <span
                  aria-hidden="true"
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 96, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(0,0,0,.34), rgba(0,0,0,0))' }}
                />
              )}

              <div
                aria-hidden="true"
                data-testid="iphone-estado"
                style={{
                  position: 'absolute', left: 0, right: 0, top: 0, height: 54, pointerEvents: 'none', color: tintaCss,
                  fontFamily: FUENTE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 34px 0 48px',
                  ...mezcla(tinta),
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.02em', width: 54, textAlign: 'center' }}>9:41</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Senal /><Wifi /><Bateria />
                </span>
              </div>

              <span
                aria-hidden="true"
                data-testid="iphone-isla"
                style={{
                  position: 'absolute', top: 11, left: '50%', width: 126, height: 37, marginLeft: -63, borderRadius: 20,
                  background: '#000', pointerEvents: 'none', boxShadow: '0 0 0 .5px rgba(255,255,255,.05)',
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: 12, right: 17, width: 13, height: 13, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 35%, #34476e 0%, #10172b 45%, #05060b 100%)',
                    boxShadow: '0 0 0 1.5px #0b0c10',
                  }}
                />
              </span>

              <span
                aria-hidden="true"
                data-testid="iphone-indicador"
                style={{
                  position: 'absolute', bottom: 8, left: '50%', width: 134, height: 5, marginLeft: -67, borderRadius: 3,
                  background: indicadorCss, opacity: 0.88, pointerEvents: 'none', ...mezcla(indicador),
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
