import type { Bloque } from '@/lib/demo/modelo';

// Lo que se ve en cada paso de la demo. Son componentes SIMULADOS (aislados,
// con datos de ejemplo): se parecen a lo que ve una propietaria, pero no son
// las pantallas reales del panel — esas necesitan un estudio, una sesión y datos
// reales detrás. Lo que sí es real es la regla que decide cada resultado.

const NOMBRE_ESTADO = { vigente: 'Vigente', caducado: 'Caducado', agotado: 'Agotado' } as const;

export function BloqueView({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case 'texto':
      return <p className="dm-lead">{bloque.texto}</p>;
    case 'bono':
      return (
        <div className="dm-bono" role="group" aria-label={`${bloque.nombre}: ${bloque.restantes} de ${bloque.total} sesiones, ${NOMBRE_ESTADO[bloque.estado]}`}>
          <div className="dm-bono-cab">
            <span className="dm-bono-nombre">{bloque.nombre}</span>
            <span className="dm-insignia" data-estado={bloque.estado}>{NOMBRE_ESTADO[bloque.estado]}</span>
          </div>
          <div className="dm-sesiones" aria-hidden="true">
            {Array.from({ length: bloque.total }, (_, i) => <span key={i} className="dm-sesion" data-viva={i < bloque.restantes} />)}
          </div>
          <p className="dm-pequeno">
            {bloque.restantes} de {bloque.total} sesiones{bloque.caducaEtiqueta ? ` · vale hasta el ${bloque.caducaEtiqueta}` : ' · no caduca'}
          </p>
        </div>
      );
    case 'semana':
      return (
        <div className="dm-semana">
          {bloque.dias.map((d) => (
            <div key={d.dia} className="dm-dia">
              <span className="dm-dia-nombre">{d.dia}</span>
              <div style={{ display: 'grid', gap: 4 }}>
                {d.eventos.map((e, i) => <span key={i} className="dm-evento" data-tono={e.tono}>{e.texto}</span>)}
              </div>
            </div>
          ))}
        </div>
      );
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
