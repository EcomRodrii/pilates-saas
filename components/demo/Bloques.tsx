import type { Bloque } from '@/lib/demo/modelo';

// Lo que se ve en cada paso de la demo. Son componentes SIMULADOS (aislados,
// con datos de ejemplo): se parecen a lo que ve una propietaria, pero no son
// las pantallas reales del panel — esas necesitan un estudio, una sesión y datos
// reales detrás. Lo que sí es real es la regla que decide cada resultado.

export function BloqueView({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case 'texto':
      return <p className="dm-lead">{bloque.texto}</p>;
    case 'bono':
    case 'semana':
      // Lo que se VE del producto no se dibuja aquí: se enseña en el panel real (components/demo/DemoExperiencia → lib/demo/panel).
      return null;
    case 'tabla':
      return (
        <dl className="dm-tabla">
          {bloque.filas.map((f, i) => (
            <div key={i} data-tono={f.tono}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      );
    case 'resultado':
      return (
        <div className="dm-resultado" data-tono={bloque.tono} role="status">
          <strong>{bloque.titular}</strong>
          <p>{bloque.detalle}</p>
        </div>
      );
  }
}
