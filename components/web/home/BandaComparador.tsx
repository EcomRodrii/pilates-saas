import { COMPARADOR } from '@/lib/landing/comparador';
import { BotonBloque } from '@/components/landing/BotonBloque';

// «Hoy / con Tentare» en una banda oscura (fase 2.2): el antes y el después de
// Mariana Tek, con el nuevo estilo de la home, y una antítesis por titular (lo que
// mejor funciona en Mindbody y Eversports, sin copiar la suya). Las seis filas son las de la
// ronda 3 (lib/landing/comparador.ts), cada una con su fuente en el repo y SIN
// una sola cifra (lo vigila lib/landing/ronda-3.test.ts). La banda oscura
// rompe la tirada de bloques claros: ritmo claro/oscuro de las tres referencias.
//
// Server Component: no entra en el JavaScript de la home.

export function BandaComparador() {
  return (
    <section id="antes-despues" className="wh-seccion wh-oscura wh-cmp" aria-labelledby="wh-cmp-h">
      <div className="wh-contenedor">
        <div className="wh-cmp-cabecera">
          <h2 id="wh-cmp-h" className="wh-h2">Menos gestión. Más clases.</h2>
          <p className="wh-lead">Lo que haces hoy a mano, y lo que hace Tentare por ti.</p>
        </div>
        <div className="wh-cmp-fila wh-cmp-titulos" aria-hidden="true">
          <span />
          <span>Hoy</span>
          <span>Con Tentare</span>
        </div>
        <ul className="wh-cmp-lista">
          {COMPARADOR.map((f) => (
            <li key={f.tema} className="wh-cmp-fila">
              <h3 className="wh-cmp-tema">{f.tema}</h3>
              <p className="wh-cmp-hoy"><span className="wh-cmp-et">Hoy</span>{f.hoy}</p>
              <p className="wh-cmp-con"><span className="wh-cmp-et">Con Tentare</span>{f.conTentare}</p>
            </li>
          ))}
        </ul>
        <div className="wh-cmp-cierre"><BotonBloque tono="oscuro" /></div>
      </div>
    </section>
  );
}
