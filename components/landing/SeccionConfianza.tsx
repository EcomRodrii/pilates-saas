import Link from 'next/link';
import { ArrowRight, FileCheck2, LifeBuoy, Unlock, type LucideIcon } from 'lucide-react';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { SALIDAS, WHATSAPP_SOPORTE } from './enlaces';

// «Detrás de Tentare hay personas» — bloque 07 del rediseño (23-sep).
//
// La landing no tenía NINGUNA prueba de confianza: ni testimonios, ni logos,
// ni cifras. No se inventan (regla del fundador), así que este bloque se apoya
// en lo que sí es verdad y se puede comprobar: cómo se cambia uno de programa,
// quién contesta al otro lado y que nadie se queda atado. (El vídeo estuvo aquí
// un rato el 23-sep; el fundador lo quiere justo debajo del héroe.)
//
// Absorbe la antigua SeccionCambiarse («Cambiarse no debería dar miedo»), que
// citaba quejas de reseñas sin fuente y prometía «migración en 48 h» — algo que
// el código no garantiza. Lo que queda está cruzado con el código:
//  · el importador (/migracion) reconoce Excel, Timp, Momence, bsport,
//    Eversports y Mindbody, deja un acta y se deshace con un botón;
//  · soporte por WhatsApp y email (no hay SLA en el código: nada de «en 5 min»);
//  · la exportación de datos son CSV de alumnas, reservas, suscripciones,
//    recibos y pagos (la ficha de salud y los adjuntos no van).
//
// Hueco para testimonios: cuando haya clientas con permiso firmado, van aquí,
// encima de los tres puntos. Hoy no hay ninguno y no se pinta nada vacío.

const PUNTOS: { Icono: LucideIcon; titulo: string; texto: string }[] = [
  {
    Icono: FileCheck2,
    titulo: 'Te ayudamos a cambiarte',
    texto:
      'Importas tus alumnas, tus bonos y tu horario desde tu programa o desde Excel, con un acta para comprobar que todo cuadra y un botón para deshacerlo. Y si lo prefieres, lo hacemos contigo.',
  },
  {
    Icono: LifeBuoy,
    titulo: 'Te responde una persona',
    texto: 'Por WhatsApp o por email, en español, alguien que sabe cómo funciona un estudio. Sin bots.',
  },
  {
    Icono: Unlock,
    titulo: 'Sin atarte',
    texto:
      'Precio público y sin permanencia. Si un día te vas, exportas tus alumnas, tus reservas y tus cobros cuando quieras.',
  },
];

export function SeccionConfianza() {
  const whatsapp = enlaceWhatsApp(WHATSAPP_SOPORTE, 'Hola, tengo una duda sobre Tentare:') ?? '#';

  return (
    <section id="confianza" className="v5-conf" aria-labelledby="v5-conf-h">
      <div className="v5-conf-wrap">
        <header className="v5-conf-head lp-rv">
          <h2 id="v5-conf-h" className="v5-conf-h2">Detrás de Tentare hay personas.</h2>
          <p className="v5-conf-lead">
            Hecho en España para estudios de Pilates y Yoga, por un equipo que contesta cuando escribes.
          </p>
        </header>

        <ul className="v5-conf-puntos">
          {PUNTOS.map(({ Icono, titulo, texto }, n) => (
            <li key={titulo} className="v5-conf-punto lp-rv" style={{ ['--lp-r' as string]: n * 7 }}>
              <span className="v5-conf-icono" aria-hidden><Icono size={20} strokeWidth={2} /></span>
              <h3 className="v5-conf-h3">{titulo}</h3>
              <p className="v5-conf-texto">{texto}</p>
            </li>
          ))}
        </ul>

        <div className="v5-conf-salidas">
          <Link href={SALIDAS.cambiarse.href} className="v5-conf-salida lp-flecha">
            {SALIDAS.cambiarse.label} <ArrowRight size={15} aria-hidden />
          </Link>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="v5-conf-salida lp-flecha">
            Escríbenos por WhatsApp <ArrowRight size={15} aria-hidden />
          </a>
          <Link href="/seguridad" className="v5-conf-salida lp-flecha">
            Cómo cuidamos tus datos <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </div>

      <style>{`
        .v5-conf { background: #131313; color: #fff; padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); }
        .v5-conf-wrap { max-width: 1180px; margin: 0 auto; }
        .v5-conf-head { max-width: 760px; margin-bottom: clamp(32px,4vw,48px); }
        .v5-conf-h2 { margin: 0 0 16px; font-size: clamp(30px,4.4vw,58px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; text-wrap: balance; color: #fff; }
        .v5-conf-lead { margin: 0; max-width: 52ch; font-size: 17px; line-height: 1.6; color: #A6A69E; }

        .v5-conf-puntos { list-style: none; margin: 0; padding: 0; display: grid;
          grid-template-columns: repeat(3,minmax(0,1fr)); gap: clamp(20px,3vw,40px); }
        .v5-conf-punto { display: flex; flex-direction: column; gap: 10px; }
        .v5-conf-icono { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px;
          background: rgba(217,194,158,.12); color: #D9C29E; }
        .v5-conf-h3 { margin: 6px 0 0; font-size: 19px; font-weight: 800; letter-spacing: -.02em; color: #fff; }
        .v5-conf-texto { margin: 0; font-size: 15.5px; line-height: 1.6; color: #A6A69E; }

        .v5-conf-salidas { display: flex; flex-wrap: wrap; gap: 12px 32px; margin-top: clamp(32px,4vw,48px);
          padding-top: 28px; border-top: 1px solid rgba(255,255,255,.1); }
        .v5-conf-salida { display: inline-flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 700;
          color: #D9C29E; }
        .v5-conf-salida:hover { text-decoration: underline; text-underline-offset: 4px; }
        .v5-conf-salida:focus-visible { outline: 2px solid #D9C29E; outline-offset: 3px; border-radius: 4px; }

        @media (max-width: 860px) {
          .v5-conf-puntos { grid-template-columns: minmax(0,1fr); gap: 28px; }
        }
      `}</style>
    </section>
  );
}
