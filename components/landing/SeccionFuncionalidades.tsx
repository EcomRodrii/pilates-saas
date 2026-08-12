import Link from 'next/link';
import { funcionalidades } from '@/lib/seo/paginas';

// Sección nueva de la home (no del diseño v5 original): un grid con las 15
// páginas de /funcionalidades. Antes de esto, la home solo enlazaba ahí una
// vez, en un texto suelto dentro de la demo de calendario — sin vitrina
// propia, quince páginas escritas y publicadas quedaban invisibles desde la
// página que más tráfico recibe.
//
// Cero contenido nuevo: título y resumen de cada tarjeta salen tal cual del
// registro (`lib/seo/paginas.ts`), la misma fuente que ya usa el hub
// /funcionalidades y el pie de página. Si una página cambia de nombre o
// resumen ahí, esta vitrina se actualiza sola.
//
// Se queda con id="funcionalidades" — el ancla del nav apuntaba antes a la
// demo de calendario (un resto de que esa sección heredó el id del diseño
// original); ahora apunta aquí, que es lo que de verdad responde a "ver las
// funcionalidades".

export function SeccionFuncionalidades() {
  const items = funcionalidades();

  return (
    <section id="funcionalidades" className="v5-func" aria-labelledby="v5-func-h">
      <div className="v5-func-wrap">
        <div className="v5-func-cabecera">
          <p className="v5-func-eyebrow">Funcionalidades</p>
          <h2 id="v5-func-h" className="v5-func-h2">Todo lo que necesita un estudio de Pilates. En un panel.</h2>
          <p className="v5-func-lead">Quince áreas, cada una con su propia página — sin genérico, sin relleno.</p>
        </div>
        <div className="v5-func-grid">
          {items.map((p) => (
            <Link key={p.path} href={p.path} className="v5-func-card">
              <span className="v5-func-tit">{p.etiqueta}</span>
              <span className="v5-func-desc">{p.resumen}</span>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        .v5-func { padding: clamp(72px,11vw,120px) clamp(20px,4vw,48px); }
        .v5-func-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-func-cabecera { max-width: 640px; margin-bottom: 40px; }
        .v5-func-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; color: #8E8E86; margin: 0 0 18px; text-transform: uppercase; }
        .v5-func-h2 { font-size: clamp(28px,4.4vw,48px); font-weight: 800; line-height: 1.03; letter-spacing: -.04em; margin: 0 0 14px; text-wrap: balance; }
        .v5-func-lead { font-size: 16px; line-height: 1.5; color: #5A5A52; margin: 0; }
        .v5-func-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); gap: 14px; }
        .v5-func-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 22px;
          display: flex; flex-direction: column; gap: 6px; transition: transform .2s, box-shadow .2s, border-color .2s; }
        .v5-func-card:hover { transform: translateY(-3px); box-shadow: 0 20px 40px -20px rgba(26,26,26,.22); border-color: #D9D9CE; }
        .v5-func-tit { font-size: 15.5px; font-weight: 800; color: #1A1A1A; }
        .v5-func-desc { font-size: 13.5px; line-height: 1.5; color: #5A5A52; }
      `}</style>
    </section>
  );
}
