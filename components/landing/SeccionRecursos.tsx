import Link from 'next/link';
import { porGrupo } from '@/lib/seo/paginas';

// Sección nueva de la home (no del diseño v5 original): vitrina de las guías
// más recientes de /recursos. Mismo motivo que SeccionFuncionalidades — la
// home no enlazaba ni una sola guía por su nombre, solo un "Recursos" suelto
// en el nav y el pie.
//
// Las 4 más recientes por `actualizado`, no una lista fija a mano: cuando se
// publique una guía nueva, entra sola y la más antigua de las cuatro sale.
// Contenido (título, fecha) sale del registro, no se escribe aquí.

export function SeccionRecursos() {
  const guias = porGrupo('recursos')
    .filter((p) => p.actualizado && p.path !== '/recursos')
    .sort((a, b) => (b.actualizado! > a.actualizado! ? 1 : -1))
    .slice(0, 4);

  if (guias.length === 0) return null;

  return (
    <section className="v5-rec" aria-labelledby="v5-rec-h">
      <div className="v5-rec-wrap">
        <div className="v5-rec-cabecera">
          <div>
            <p className="v5-rec-eyebrow">Recursos</p>
            <h2 id="v5-rec-h" className="v5-rec-h2">Para cuando quieras profundizar</h2>
          </div>
          <Link href="/recursos" className="v5-rec-ver-todas">Ver todas las guías →</Link>
        </div>
        <div className="v5-rec-grid">
          {guias.map((g) => (
            <Link key={g.path} href={g.path} className="v5-rec-card">
              <span className="v5-rec-tit">{g.etiqueta}</span>
              <span className="v5-rec-flecha">Leer →</span>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        .v5-rec { background: #F3F3EF; border-top: 1px solid #E7E7E0; border-bottom: 1px solid #E7E7E0;
          padding: clamp(64px,10vw,100px) clamp(20px,4vw,48px); }
        .v5-rec-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-rec-cabecera { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; margin-bottom: 32px; }
        .v5-rec-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; color: #8E8E86; margin: 0 0 12px; text-transform: uppercase; }
        .v5-rec-h2 { font-size: clamp(24px,3.4vw,36px); font-weight: 800; line-height: 1.05; letter-spacing: -.03em; margin: 0; }
        .v5-rec-ver-todas { font-size: 14.5px; font-weight: 700; color: #55622C; white-space: nowrap; }
        .v5-rec-ver-todas:hover { text-decoration: underline; text-underline-offset: 4px; }
        .v5-rec-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 14px; }
        .v5-rec-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 22px;
          display: flex; flex-direction: column; justify-content: space-between; gap: 24px; min-height: 108px;
          transition: transform .2s, box-shadow .2s; }
        .v5-rec-card:hover { transform: translateY(-3px); box-shadow: 0 20px 40px -20px rgba(26,26,26,.22); }
        .v5-rec-tit { font-size: 15px; font-weight: 800; line-height: 1.35; color: #1A1A1A; }
        .v5-rec-flecha { font-size: 13px; font-weight: 700; color: #55622C; }
      `}</style>
    </section>
  );
}
