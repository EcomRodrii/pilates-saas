import { LogoTentare } from '@/components/marca/logo-tentare';
import { FOTOS } from './fotos';
import { FotoLanding } from './FotoLanding';

// "Anoche, mientras tú cerrabas" — el parte de lo que el estudio resolvió sin
// nadie delante.
//
// Estaba en el hero y ahí llegaba demasiado pronto: demostraba automatización
// a alguien que todavía no sabía qué era Tentare. Ahora va DESPUÉS de que se
// haya visto el producto funcionando, que es cuando "esto lo hizo solo"
// significa algo — ya se sabe qué es "esto".
//
// Las cuatro líneas son funciones reales, cada una con su propia página:
// sustituciones, avisos a alumnas, reservas 24/7 y la app.
//
// El parte va encima de una foto de la sala vacía con la luz encendida
// (`FOTOS.anoche`), como avisos de la pantalla de bloqueo: la sala cerrada y el
// móvil trabajando. Los avisos son de muestra, así que van `aria-hidden` y el
// <figcaption> cuenta lo mismo en una frase. Los arcos quedan a la vista arriba;
// los avisos, abajo, sobre los reformers.
//
// ⚠️ El título del parte y su pie van DEBAJO de la foto, no encima: en blanco
// sobre la pared iluminada daban 1,4:1 medido (hace falta 4,5:1). Los avisos sí
// van encima porque su texto va sobre su propio fondo claro.

const LINEAS: { hora: string; texto: React.ReactNode }[] = [
  { hora: '21:04', texto: <>Marta avisa: mañana no puede</> },
  { hora: '21:41', texto: <>Julia acepta — <strong>clase cubierta</strong></> },
  { hora: '21:41', texto: <>8 alumnas avisadas del cambio</> },
  { hora: '23:52', texto: <>2 reservas nuevas desde la app</> },
];

// Por debajo de este ancho, texto arriba y foto debajo. En dos columnas más
// estrechas, los cuatro avisos tapaban la foto entera.
const MEDIA_UNA_COLUMNA = '(max-width: 1024px)';
const proporcion = ({ proporcion: [ancho, alto] }: { proporcion: readonly [number, number] }) => `${ancho} / ${alto}`;

export function SeccionParteNoche() {
  return (
    <section className="v5-noche" aria-labelledby="v5-noche-h">
      <div className="v5-noche-wrap">
        <div className="v5-noche-texto">
          <h2 id="v5-noche-h" className="v5-noche-h2">Tentare sigue trabajando.</h2>
          <p className="v5-noche-lead">
            No es una bandeja de avisos esperando a que los leas. Cuando una instructora falla, busca quién la
            cubre y avisa a las alumnas — y, en modo autónomo, tú te enteras cuando ya está hecho.
          </p>
        </div>

        <figure className="v5-noche-escena">
          <div className="v5-noche-foto">
            <FotoLanding
              foto={FOTOS.anoche}
              mediaMovil={MEDIA_UNA_COLUMNA}
              sizes={{ escritorio: '(max-width: 1276px) 45vw, 554px', movil: 'min(560px, calc(100vw - 40px))' }}
            />
            <div className="v5-noche-velo" />
            <div className="v5-noche-parte" aria-hidden="true">
              <ul className="v5-noche-avisos">
                {LINEAS.map((l) => (
                  <li key={l.hora + String(l.texto)} className="v5-noche-aviso">
                    <span className="v5-noche-app"><LogoTentare formato="isotipo" tinta="color" alto={15} decorativo /></span>
                    <span className="v5-noche-aviso-cuerpo">
                      <span className="v5-noche-aviso-cab">
                        <span>Tentare</span>
                        <span className="v5-noche-hora">{l.hora}</span>
                      </span>
                      <span className="v5-noche-txt">{l.texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="v5-noche-leyenda" aria-hidden="true">
            <p className="v5-noche-tit">Anoche, mientras tú cerrabas</p>
            <p className="v5-noche-pie">Ni una llamada tuya.</p>
          </div>
          <figcaption className="v5-noche-oculto">
            Ejemplo del parte de una noche, sobre una foto de la sala vacía: a las 21:04 una instructora avisa de que
            mañana no puede dar su clase, a las 21:41 otra la acepta y se avisa del cambio a las 8 alumnas, y a las
            23:52 entran 2 reservas nuevas desde la app. Ni una llamada tuya.
          </figcaption>
        </figure>
      </div>

      <style>{`
        .v5-noche { background: #131313; padding: clamp(80px,9vw,128px) clamp(20px,4vw,48px); }
        .v5-noche-wrap { max-width: 1180px; margin: 0 auto; display: grid;
          grid-template-columns: 1fr 1fr; gap: clamp(32px,5vw,72px); align-items: center; }
        .v5-noche-h2 { margin: 0 0 18px; font-size: clamp(30px,4.6vw,56px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; color: #fff; text-wrap: balance; }
        .v5-noche-lead { margin: 0; font-size: 16.5px; line-height: 1.6; color: #A6A69E; max-width: 46ch; }

        .v5-noche-escena { position: relative; margin: 0; }
        .v5-noche-foto { position: relative; aspect-ratio: ${proporcion(FOTOS.anoche.recortes.escritorio)};
          border-radius: 22px; overflow: hidden; background: #3A342B; }
        .v5-noche-foto picture, .v5-noche-foto img { display: block; width: 100%; height: 100%; }
        .v5-noche-foto img { object-fit: cover; }
        /* Solo abajo, y suave: la sala se apaga hacia los reformers y los arcos
           iluminados siguen a la vista. */
        .v5-noche-velo { position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg, rgba(19,19,19,0) 40%, rgba(19,19,19,.45) 100%); }

        .v5-noche-parte { position: absolute; left: 5%; right: 5%; bottom: 5%; }
        .v5-noche-avisos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
        .v5-noche-aviso { display: flex; align-items: center; gap: 10px; padding: 9px 12px 9px 9px; border-radius: 16px;
          background: rgba(250,248,242,.88); backdrop-filter: blur(14px) saturate(1.2);
          -webkit-backdrop-filter: blur(14px) saturate(1.2); box-shadow: 0 12px 30px -16px rgba(0,0,0,.55); }
        .v5-noche-app { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px;
          background: #fff; box-shadow: 0 0 0 1px rgba(52,56,37,.08); }
        .v5-noche-aviso-cuerpo { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
        .v5-noche-aviso-cab { display: flex; justify-content: space-between; gap: 8px; font-size: 11.5px;
          font-weight: 700; color: #5A5E48; }
        .v5-noche-hora { font-weight: 600; font-variant-numeric: tabular-nums; }
        .v5-noche-txt { font-size: 14px; font-weight: 600; line-height: 1.3; color: #1F2216; }
        .v5-noche-txt strong { font-weight: 800; }
        .v5-noche-leyenda { display: flex; justify-content: space-between; align-items: baseline; gap: 6px 16px;
          flex-wrap: wrap; margin-top: 14px; padding: 0 4px; }
        .v5-noche-tit { margin: 0; font-size: 14px; font-weight: 700; color: #EAE8DE; }
        .v5-noche-pie { margin: 0; font-size: 15px; font-weight: 800; color: #D9C29E; }

        .v5-noche-oculto { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
          clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

        @media ${MEDIA_UNA_COLUMNA} {
          .v5-noche-wrap { grid-template-columns: minmax(0,1fr); gap: 32px; }
          .v5-noche-texto, .v5-noche-escena { width: 100%; max-width: 560px; margin: 0 auto; }
          .v5-noche-foto { aspect-ratio: ${proporcion(FOTOS.anoche.recortes.movil)}; border-radius: 20px; }
          .v5-noche-parte { left: 4%; right: 4%; bottom: 4%; }
        }
        @media (max-width: 420px) {
          .v5-noche-aviso { padding: 8px 10px 8px 8px; gap: 9px; border-radius: 14px; }
          .v5-noche-app { width: 26px; height: 26px; border-radius: 7px; }
          .v5-noche-txt { font-size: 13.5px; }
        }
      `}</style>
    </section>
  );
}
