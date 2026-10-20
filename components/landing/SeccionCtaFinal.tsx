import Link from 'next/link';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { ALTA } from './enlaces';
import { FOTOS } from './fotos';
import { FotoLanding } from './FotoLanding';

// Sección 13 ("CTA final") de la landing v5. El pie que iba debajo es ahora el
// de toda la web pública (components/web/PieWeb.tsx, fase 2.1, 19-oct-2026):
// esta banda se queda como sección propia, encima de él.
//
// La foto sale del registro (`FOTOS.cierre`): una sala de reformers apaisada,
// calentada hacia el arena. Sustituye a /disciplinas/pilates.jpg, que era
// vertical y de 900 px y aquí se ampliaba a todo el ancho (esa sigue en
// /funcionalidades y /network).
//
// ⚠️ En escritorio el texto va ENCIMA de la foto, sobre un velo crema que sale
// de la izquierda (donde están las cortinas). Su contraste está MEDIDO sobre los
// píxeles de la foto de detrás, no supuesto: si se cambia la foto, el recorte, el
// velo o el color del texto, hay que volver a medirlo (≥ 4,5:1). En móvil no hay
// texto encima: la foto va arriba y el texto debajo, sobre el fondo.

// Por debajo de este ancho la foto y el texto van uno encima del otro. La misma
// media query para el CSS y para el <picture>: el recorte móvil (4:3) es para la
// caja apilada, el de escritorio (21:9) para la banda.
const MEDIA_APILADO = '(max-width: 860px)';
const [ANCHO_MOVIL, ALTO_MOVIL] = FOTOS.cierre.recortes.movil.proporcion;
const PROPORCION_MOVIL = `${ANCHO_MOVIL} / ${ALTO_MOVIL}`;

export function SeccionCtaFinal() {
  return (
    <>
      {/* `data-cta-final`: PopupEmpezar no interrumpe a quien ya lo tiene a la vista. */}
      <section className="v5-cta" aria-labelledby="v5-cta-h" data-cta-final>
        <div className="v5-cta-foto">
          <FotoLanding
            foto={FOTOS.cierre}
            mediaMovil={MEDIA_APILADO}
            sizes={{ escritorio: '100vw', movil: '100vw' }}
          />
        </div>
        <div className="v5-cta-velo" aria-hidden />
        <div className="v5-cta-cuerpo">
          <h2 id="v5-cta-h" className="v5-cta-h2">Pruébalo con tu estudio de verdad.</h2>
          <p className="v5-cta-lead">
            Empieza gratis, sin tarjeta. Tu horario y tu página de reservas, listos en tu primera sesión.
            Y si no te convence, te llevas tus datos.
          </p>
          <div className="v5-cta-acciones">
            <Link href={ALTA} className="v5-cta-boton">{CTA_ALTA}</Link>
          </div>
        </div>
      </section>

      <style>{`
        /* Escritorio: la foto de fondo a sangre, con alto de banda 21:9 acotado,
           y el texto a la izquierda sobre un velo crema. Colores: tokens de la
           web (components/web/tokens.css); el velo se queda en su valor, medido
           sobre la foto. */
        .v5-cta { position: relative; display: flex; align-items: center; isolation: isolate; overflow: hidden;
          min-height: clamp(460px, 42vw, 640px); background: var(--w-piedra); }
        .v5-cta-foto { position: absolute; inset: 0; z-index: -2; }
        .v5-cta-foto picture, .v5-cta-foto img { display: block; width: 100%; height: 100%; }
        .v5-cta-foto img { object-fit: cover; object-position: left center; }
        .v5-cta-velo { position: absolute; inset: 0; z-index: -1; pointer-events: none;
          background: linear-gradient(90deg, rgba(240,236,227,.9) 0%, rgba(240,236,227,.8) 34%,
            rgba(240,236,227,.42) 50%, rgba(240,236,227,0) 66%); }
        .v5-cta-cuerpo { position: relative; max-width: 1240px; width: 100%; margin: 0 auto; padding: 90px clamp(20px,4vw,48px); }
        .v5-cta-h2 { font-size: clamp(32px,5vw,64px); font-weight: 800; line-height: 1; letter-spacing: -.04em;
          color: var(--w-texto); margin: 0 0 18px; max-width: 13ch; text-wrap: balance; }
        .v5-cta-lead { font-size: 17.5px; font-weight: 500; color: var(--w-texto-2); margin: 0 0 30px; max-width: 36ch; }
        .v5-cta-acciones { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .v5-cta-boton { background: var(--w-olive); color: var(--w-sand); font-weight: 800; font-size: 17px; padding: 18px 36px;
          border-radius: var(--w-r-pildora); box-shadow: 0 18px 36px -16px rgba(52,56,37,.6); transition: transform var(--motion-normal) var(--motion-ease), background var(--motion-normal); }
        .v5-cta-boton:hover { background: var(--w-olive-hondo); transform: translateY(-2px); }
        .v5-cta-boton:focus-visible { outline: 2px solid var(--w-olive); outline-offset: 3px; }

        /* Móvil y tablet: sin texto sobre la foto. Foto arriba (recorte 4:3, que
           deja leer la sala) y el texto debajo, sobre el fondo de la página. */
        @media ${MEDIA_APILADO} {
          .v5-cta { display: block; min-height: 0; }
          .v5-cta-foto { position: relative; inset: auto; z-index: auto; aspect-ratio: ${PROPORCION_MOVIL}; }
          .v5-cta-velo { display: none; }
          .v5-cta-cuerpo { padding: 36px 20px 64px; }
          .v5-cta-h2 { max-width: 16ch; }
          .v5-cta-lead { font-size: 16px; margin-bottom: 24px; }
          .v5-cta-acciones { flex-direction: column; align-items: stretch; }
          .v5-cta-boton { text-align: center; font-size: 16px; padding: 16px 24px; }
        }
      `}</style>
    </>
  );
}
