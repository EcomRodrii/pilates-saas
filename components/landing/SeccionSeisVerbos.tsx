import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SEIS_VERBOS } from '@/lib/landing/seis-verbos';
import { BotonBloque } from './BotonBloque';

// «Seis cosas que Tentare hace por ti» (ronda 3, 19-oct-2026). La forma es la de
// las seis tarjetas «verbo + punto» de Momence, justo detrás del bloque oscuro del
// héroe: un resumen que se lee en diez segundos, donde cada tarjeta lleva a SU
// página de función (nunca todas a la demo, que es lo que esa web hace mal).
//
// Texto y destinos salen de lib/landing/seis-verbos.ts, y su test comprueba que
// cada frase consta en la página que enlaza. Sin cifras.
//
// Sin ilustración debajo del texto: en Momence, en el móvil, el texto de las
// tarjetas se pisaba con la captura de detrás. Aquí la tarjeta es tipografía sola.
//
// Server Component: no entra en el JavaScript de la home (llega como hueco desde
// app/page.tsx, igual que el bento).

export function SeccionSeisVerbos() {
  return (
    <section id="verbos" className="v6-vb" aria-labelledby="v6-vb-h">
      <div className="v6-vb-wrap">
        <h2 id="v6-vb-h" className="v6-vb-h2 lp-rv">
          <span className="lp-ante">Reservas, cobros, avisos, sustituciones, facturas e informes</span>{' '}
          Seis cosas que Tentare hace por ti.
        </h2>

        <ul className="v6-vb-rejilla">
          {SEIS_VERBOS.map((v, n) => (
            <li key={v.href} className="lp-rv" style={{ ['--lp-r' as string]: (n % 3) * 5 }}>
              <Link href={v.href} className="v6-vb-card">
                <h3 className="v6-vb-verbo">{v.verbo}<span aria-hidden="true">.</span></h3>
                <p className="v6-vb-texto">{v.texto}</p>
                <span className="v6-vb-ir lp-flecha">{v.funcion} <ArrowRight size={15} aria-hidden="true" /></span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="v6-vb-cierre lp-rv">
          <BotonBloque />
        </div>
      </div>

      <style>{`
        .v6-vb { padding: clamp(64px,7vw,112px) clamp(20px,4vw,48px) clamp(24px,3vw,40px); }
        .v6-vb-wrap { max-width: 1240px; margin: 0 auto; }
        .v6-vb-h2 { margin: 0 0 clamp(28px,3.4vw,48px); max-width: 16ch; font-size: clamp(30px,4.2vw,56px); font-weight: 800;
          line-height: 1.02; letter-spacing: -.04em; color: #1F2216; text-wrap: balance; }
        .v6-vb-h2 .lp-ante { max-width: none; color: #5A5E48; opacity: 1; }
        .v6-vb-rejilla { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px; }
        .v6-vb-card { height: 100%; display: flex; flex-direction: column; gap: 10px; padding: clamp(22px,2.2vw,30px); border-radius: 24px;
          background: #fff; border: 1px solid #E4E4DC; text-decoration: none; color: inherit;
          transition: border-color var(--motion-normal) var(--motion-ease), box-shadow var(--motion-normal) var(--motion-ease); }
        /* Sin transform en :hover: el <li> ya lleva la entrada al hacer scroll. */
        .v6-vb-card:hover { border-color: #343825; box-shadow: 0 32px 60px -40px rgba(26,26,26,.45); }
        .v6-vb-card:focus-visible { outline: 2px solid #343825; outline-offset: 3px; }
        .v6-vb-verbo { margin: 0; font-size: clamp(30px,3vw,44px); font-weight: 800; line-height: 1; letter-spacing: -.045em; color: #1A1A1A; }
        .v6-vb-verbo span { color: #6E7650; }
        .v6-vb-texto { margin: 0; font-size: 15.5px; line-height: 1.5; color: #4A4A43; text-wrap: pretty; }
        .v6-vb-ir { margin-top: auto; padding-top: 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: #343825; }
        .v6-vb-card:hover .lp-flecha svg, .v6-vb-card:focus-visible .lp-flecha svg { transform: translateX(3px); }
        .v6-vb-cierre { margin-top: clamp(28px,3.4vw,44px); display: flex; justify-content: flex-start; }

        @media (max-width: 960px) { .v6-vb-rejilla { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        /* En el móvil, una por fila: dos por fila partían las frases en columnas
           de diez letras. El botón sigue a un desplazamiento corto de la última. */
        @media (max-width: 560px) {
          .v6-vb-rejilla { grid-template-columns: minmax(0,1fr); gap: 10px; }
          .v6-vb-card { gap: 6px; padding: 18px 20px; border-radius: 20px; }
          .v6-vb-verbo { font-size: 30px; }
          .v6-vb-texto { font-size: 15px; }
          .v6-vb-ir { padding-top: 4px; }
          .v6-vb-cierre { display: block; }
        }
        @media (prefers-reduced-motion: reduce) { .v6-vb-card { transition: none; } }
      `}</style>
    </section>
  );
}
