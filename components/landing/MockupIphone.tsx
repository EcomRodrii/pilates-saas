// Mockup de iPhone en CSS/SVG puro (sin imágenes): cuerpo de metal con bisel
// negro fino, esquinas grandes, botones laterales, Dynamic Island, barra de
// estado de iOS (9:41, señal, wifi, batería) e indicador de inicio. La pantalla
// es lo que se le pase (una captura real de la app), y el conjunto se coloca
// «asomando» por el borde de una tarjeta: quien lo usa lo corta con
// `overflow: hidden`.
//
// Todo se dimensiona desde `--iw` (el ancho del móvil) con `em`, así que el
// mismo componente sirve a 128 px y a 220 px sin tocar nada. Es decorativo: la
// captura lleva su propio alt y el marco va `aria-hidden`.
//
// Estilos en un <style> con prefijo `iph-` (la landing los lleva dentro de cada
// sección): SeccionBento.tsx los incluye una sola vez con `estilosMockupIphone`.

export type TonoPantalla = 'claro' | 'oscuro';

export function MockupIphone({ children, tono = 'claro', completo = false, className = '', style }: {
  children: React.ReactNode;
  /**
   * El iPhone 17 Pro ENTERO, de frente: 402×874 pt, marco de aluminio «deep
   * blue», esquinas de ~55 pt, Dynamic Island, barra de estado transparente
   * sobre lo que haya dentro y el indicador de inicio. Sin esto, el de siempre:
   * el que asoma por el borde de una tarjeta de la landing (que no cambia).
   * El hijo debe llenar la pantalla (`.iph-pantalla` ya tiene la proporción).
   */
  completo?: boolean;
  /** Color de la barra de estado según lo que haya justo debajo en la pantalla. */
  tono?: TonoPantalla;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`iph${completo ? ' iph-c' : ''} ${className}`} style={style}>
      <span className="iph-btn iph-b-accion" aria-hidden="true" />
      <span className="iph-btn iph-b-sube" aria-hidden="true" />
      <span className="iph-btn iph-b-baja" aria-hidden="true" />
      <span className="iph-btn iph-b-power" aria-hidden="true" />
      <div className="iph-cuerpo">
        <div className="iph-pantalla">
          <div className={`iph-estado iph-estado-${tono}`} aria-hidden="true">
            <span className="iph-hora">9:41</span>
            <span className="iph-iconos">
              <svg viewBox="0 0 18 11" className="iph-ic" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx=".8" /><rect x="5" y="5" width="3" height="6" rx=".8" /><rect x="10" y="2.5" width="3" height="8.5" rx=".8" /><rect x="15" y="0" width="3" height="11" rx=".8" /></svg>
              <svg viewBox="0 0 16 11" className="iph-ic" fill="currentColor"><path d="M8 2.2c2.2 0 4.2.9 5.7 2.3l1-1.1A9.6 9.6 0 0 0 8 .6a9.6 9.6 0 0 0-6.7 2.8l1 1.1A8 8 0 0 1 8 2.2Zm0 3.2c1.3 0 2.5.5 3.4 1.4l1-1.1A6.5 6.5 0 0 0 8 3.8c-1.7 0-3.3.7-4.4 1.9l1 1.1c.9-.9 2.1-1.4 3.4-1.4Zm0 3.2c-.6 0-1.2.2-1.6.7L8 11l1.6-1.7c-.4-.5-1-.7-1.6-.7Z" /></svg>
              <svg viewBox="0 0 27 12" className="iph-ic iph-bat"><rect x=".5" y=".5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".45" /><rect x="2" y="2" width="19" height="8" rx="2" fill="currentColor" /><path d="M24.5 4.2v3.6c.9-.3 1.5-1 1.5-1.8s-.6-1.5-1.5-1.8Z" fill="currentColor" opacity=".5" /></svg>
            </span>
          </div>
          <span className="iph-isla" aria-hidden="true" />
          {children}
          <span className="iph-home" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export const estilosMockupIphone = `
  .iph { position: relative; width: var(--iw, 158px); font-size: calc(var(--iw, 158px) / 22); }
  .iph-cuerpo { padding: .26em; border-radius: 2.5em 2.5em 0 0;
    background: linear-gradient(145deg,#4B4C45 0%,#16170F 28%,#2A2B24 55%,#0F100A 78%,#4A4B44 100%);
    box-shadow: 0 0 0 .07em #7C7D74 inset, 0 0 0 .05em rgba(0,0,0,.5), 0 2.2em 3.4em -2em rgba(34,37,26,.45); }
  .iph-pantalla { position: relative; overflow: hidden; border-radius: 2.25em 2.25em 0 0; background: #0B0C07; }
  .iph-pantalla img { display: block; width: 100%; height: auto; }
  .iph-estado { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; height: 2em; padding: .35em 1.5em 0 1.6em;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-ui), system-ui, sans-serif; font-weight: 600; font-size: .78em; letter-spacing: -.01em; }
  .iph-estado-claro { background: #F7F5EE; color: #111; } .iph-estado-oscuro { background: #151610; color: #fff; }
  .iph-iconos { display: flex; align-items: center; gap: .3em; } .iph-ic { height: .78em; width: auto; } .iph-bat { height: .82em; }
  .iph-isla { position: absolute; z-index: 3; top: .5em; left: 50%; width: 6.4em; height: 1.45em; border-radius: 99px; background: #050505; transform: translateX(-50%); }
  .iph-home { position: absolute; z-index: 3; bottom: .5em; left: 50%; width: 6em; height: .3em; border-radius: 99px; background: rgba(0,0,0,.85); transform: translateX(-50%); }
  /* iPhone 17 Pro entero. 1em = 402/22 pt: 55 pt de esquina = 3em, 59 pt de barra = 3.2em. */
  .iph-c .iph-cuerpo { padding: .2em; border-radius: 3.2em;
    background: linear-gradient(145deg,#4A5A7A 0%,#1F2A44 30%,#2E3C5E 55%,#18203A 80%,#4F5F80 100%);
    box-shadow: 0 0 0 .06em #7F8EAD inset, 0 0 0 .04em rgba(0,0,0,.55), 0 2.6em 4em -1.6em rgba(20,28,50,.5); }
  .iph-c .iph-pantalla { aspect-ratio: 402 / 874; border-radius: 3em; background: #fff; }
  .iph-c .iph-estado { position: absolute; inset: 0 0 auto 0; height: 3.2em; padding: 1.15em 2.1em 0 2.7em; background: transparent !important; color: #fff !important; text-shadow: 0 0 .35em rgba(0,0,0,.5); font-size: .95em; pointer-events: none; }
  .iph-c .iph-isla { top: .6em; width: 6.9em; height: 2em; }
  .iph-c .iph-home { bottom: .45em; width: 7.3em; height: .27em; }
  .iph-c .iph-b-accion { top: 5.6em; height: 1.1em; } .iph-c .iph-b-sube { top: 7.6em; height: 2.1em; } .iph-c .iph-b-baja { top: 10.2em; height: 2.1em; }
  .iph-c .iph-b-power { top: 8.6em; height: 3.4em; background: #2A3556; }
  .iph-c .iph-btn { background: #2A3556; }
  .iph-btn { position: absolute; z-index: 0; width: .18em; border-radius: .1em; background: #3A3B34; }
  .iph-b-accion { left: -.14em; top: 4.6em; height: 1.1em; } .iph-b-sube { left: -.14em; top: 6.4em; height: 2em; } .iph-b-baja { left: -.14em; top: 8.8em; height: 2em; }
  .iph-b-power { right: -.14em; top: 7em; height: 3.2em; }
`;
