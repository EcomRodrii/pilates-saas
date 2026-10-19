import { COMPARADOR } from '@/lib/landing/comparador';
import { BotonBloque } from './BotonBloque';

// «Cómo lo haces hoy, y cómo con Tentare» (ronda 3, 19-oct-2026). La forma es el
// antes/después de Mariana Tek; el contenido, seis filas que contrastan lo que una
// dueña hace a mano con lo que hace el producto, todas con su fuente en el repo
// (lib/landing/comparador.ts) y SIN una sola cifra.
//
// Va sobre fondo oscuro con esquinas redondeadas: rompe la tirada larga de bloques
// claros del medio de la página y deja «lo que ya está resuelto» como un solo
// bloque que se lee de un vistazo (ritmo claro/oscuro de las tres referencias).
//
// Sin texto sobre ilustración (no hay ilustración), en el móvil cada fila pasa a
// dos líneas apiladas.
//
// Server Component: no entra en el JavaScript de la home.

export function SeccionComparador() {
  return (
    <section id="antes-despues" className="v6-cmp" aria-labelledby="v6-cmp-h">
      <div className="v6-cmp-wrap">
        <h2 id="v6-cmp-h" className="v6-cmp-h2 lp-rv">
          <span className="lp-ante">De la hoja de cálculo y el WhatsApp a un solo panel</span>{' '}
          Cómo lo haces hoy, y cómo con Tentare.
        </h2>

        <ul className="v6-cmp-filas">
          {COMPARADOR.map((f, n) => (
            <li key={f.tema} className="v6-cmp-fila lp-rv" style={{ ['--lp-r' as string]: (n % 2) * 4 }}>
              <h3 className="v6-cmp-tema">{f.tema}</h3>
              <p className="v6-cmp-hoy"><span className="v6-cmp-et">Hoy</span>{f.hoy}</p>
              <p className="v6-cmp-con"><span className="v6-cmp-et">Con Tentare</span>{f.conTentare}</p>
            </li>
          ))}
        </ul>

        <div className="v6-cmp-cierre lp-rv">
          <BotonBloque tono="oscuro" />
        </div>
      </div>

      <style>{`
        .v6-cmp { background: #131313; color: #fff; margin: clamp(24px,3vw,48px) clamp(8px,1.6vw,24px);
          padding: clamp(56px,7vw,104px) clamp(20px,4vw,48px); border-radius: clamp(28px,4vw,56px); }
        .v6-cmp-wrap { max-width: 1240px; margin: 0 auto; }
        .v6-cmp-h2 { margin: 0 0 clamp(32px,4vw,56px); max-width: 18ch; font-size: clamp(30px,4.2vw,56px); font-weight: 800;
          line-height: 1.02; letter-spacing: -.04em; color: #fff; text-wrap: balance; }
        .v6-cmp-h2 .lp-ante { max-width: none; color: #A6A69E; opacity: 1; }
        .v6-cmp-filas { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(255,255,255,.12); }
        .v6-cmp-fila { display: grid; grid-template-columns: minmax(0,.7fr) minmax(0,1.2fr) minmax(0,1.5fr); gap: 8px clamp(20px,3vw,48px);
          padding: clamp(20px,2.2vw,28px) 0; border-bottom: 1px solid rgba(255,255,255,.12); align-items: start; }
        .v6-cmp-tema { margin: 0; font-size: clamp(20px,1.9vw,26px); font-weight: 800; line-height: 1.1; letter-spacing: -.03em; color: #D9C29E; }
        .v6-cmp-hoy, .v6-cmp-con { margin: 0; font-size: 16px; line-height: 1.5; text-wrap: pretty; }
        .v6-cmp-hoy { color: #A6A69E; }
        .v6-cmp-con { color: #fff; font-weight: 600; }
        .v6-cmp-et { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #8C8C84; }
        .v6-cmp-con .v6-cmp-et { color: #D9C29E; }
        .v6-cmp-cierre { margin-top: clamp(28px,3.4vw,44px); }

        @media (max-width: 860px) {
          .v6-cmp-fila { grid-template-columns: minmax(0,1fr); gap: 10px; }
          .v6-cmp-tema { margin-bottom: 2px; }
        }
        @media (max-width: 560px) {
          .v6-cmp { margin-inline: 8px; border-radius: 28px; }
          .v6-cmp-hoy, .v6-cmp-con { font-size: 15px; }
        }
      `}</style>
    </section>
  );
}
