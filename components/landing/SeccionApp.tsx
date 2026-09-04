import Image from 'next/image';
import Link from 'next/link';
import { SALIDAS } from './enlaces';

// Sección 05 de la landing v5 — "DEMO 3 · Tu app de alumnas".
//
// Captura real de la pantalla "Hoy" del portal de la alumna, sin selector de
// temas ni mockup en CSS.

export function SeccionApp() {
  return (
    <section id="app" className="v5-app" aria-labelledby="v5-app-h">
      <div className="v5-app-wrap">
        <div className="v5-app-texto">
          <p className="v5-app-eyebrow">Tu app de alumnas</p>
          <h2 id="v5-app-h" className="v5-app-h2">Tu app debería parecerse a tu estudio.</h2>
          <p className="v5-app-lead">
            Con Tentare la experiencia de tus alumnas la diseñas tú, sin diseñador: eliges tema, y cambian
            los colores, los bloques del inicio y hasta la navegación.
          </p>

          <ul className="v5-app-lista">
            <li><strong>Reserva, bonos, retos y progreso</strong> — con su reformer favorito guardado.</li>
            <li><strong>Avisos por su canal</strong>: app, email o WhatsApp. Sin que tú escribas.</li>
            <li><strong>White-label completo</strong> en el plan Cadena — ni rastro de Tentare.</li>
          </ul>

          <Link href={SALIDAS.app.href} className="v5-salida">{SALIDAS.app.label} →</Link>
        </div>

        <div className="v5-telefono-zona">
          <Image
            src="/landing/app-mockup.png"
            alt="Pantalla de inicio de la app de alumnas de Tentare, con saludo, buscador, bono de sesiones, racha semanal y horario del estudio"
            width={452}
            height={1111}
            className="v5-telefono-img"
            sizes="(max-width: 860px) 55vw, 280px"
            priority
          />
        </div>
      </div>

      <style>{`
        .v5-app { background: #131313; padding: clamp(72px,11vw,150px) clamp(20px,4vw,48px); }
        .v5-app-wrap { max-width: 1160px; margin: 0 auto; display: grid;
          grid-template-columns: 1.05fr .95fr; gap: clamp(32px,5vw,64px); align-items: center; }
        .v5-app-eyebrow { margin: 0 0 18px; font-size: 12px; font-weight: 700; letter-spacing: .18em;
          text-transform: uppercase; color: #D9C29E; }
        .v5-app-h2 { margin: 0 0 24px; font-size: clamp(28px,4.6vw,66px); font-weight: 800; line-height: 1.01;
          letter-spacing: -.04em; color: #fff; text-wrap: balance; }
        .v5-app-lead { margin: 0 0 26px; max-width: 46ch; font-size: 17px; line-height: 1.6; color: #A6A69E; }

        .v5-app-lista { margin: 0 0 26px; padding: 0; list-style: none; display: flex; flex-direction: column;
          gap: 10px; font-size: 14.5px; color: #A6A69E; line-height: 1.5; }
        .v5-app-lista strong { color: #E8E8E4; }
        .v5-salida { font-size: 15px; font-weight: 700; color: #D9C29E; }
        .v5-salida:hover { text-decoration: underline; text-underline-offset: 4px; }

        .v5-telefono-zona { display: flex; justify-content: center; }
        .v5-telefono-img { width: 100%; max-width: 280px; height: auto; }

        @media (max-width: 860px) {
          .v5-app-wrap { grid-template-columns: 1fr; }
          .v5-telefono-zona { order: -1; margin-bottom: 8px; }
          .v5-telefono-img { max-width: 220px; }
        }
      `}</style>
    </section>
  );
}
