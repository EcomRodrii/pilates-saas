'use client';

import { opcionesDe, vaLaPena, type ClaseFiltrable, type OpcionFiltro } from '@/lib/reservar/filtros-clases';

// El rail de filtros de la página pública: tipo de clase, instructora, nivel y
// horario, en una columna a la izquierda del horario.
//
// Antes solo existía el filtro por tipo, en una fila de chips que se salía de
// la pantalla en cuanto un estudio tenía cinco tipos de clase. Y no había forma
// de decir «quiero con Laura» ni «solo por la tarde», que es como se elige de
// verdad cuando ya conoces el estudio.
//
// ⚠️ **Cada desplegable se pinta SOLO si tiene al menos dos opciones**
// (`vaLaPena`). Con una sola, todas las clases la cumplen: no filtra nada, y un
// control inerte hace dudar de si está roto. Un estudio con una instructora no
// ve el filtro de instructora, y está bien así.
//
// «Ubicación» del diseño NO está: solo significa algo en una cadena con varias
// sedes, y esta página sirve una sede. Un desplegable con un único valor sería
// justo el control inerte que se acaba de describir.

export interface EstadoFiltros {
  tipo: string;
  instructor: string;
  nivel: string;
  horario: string;
  sala: string;
}

const HORARIOS: OpcionFiltro[] = [
  { valor: 'manana', etiqueta: 'Mañana', cuantas: 0 },
  { valor: 'mediodia', etiqueta: 'Mediodía', cuantas: 0 },
  { valor: 'tarde', etiqueta: 'Tarde', cuantas: 0 },
];

export function RailFiltros({
  clases, estado, onCambiar, onLimpiar, nCuantos, nResultados,
  etiquetaTipo, etiquetaNivel, horarioDe, fontFamily,
}: {
  clases: readonly ClaseFiltrable[];
  estado: EstadoFiltros;
  onCambiar: (campo: keyof EstadoFiltros, valor: string) => void;
  onLimpiar: () => void;
  /** Cuántos filtros hay puestos (lo calcula `cuantosFiltros`, que cuenta los días). */
  nCuantos: number;
  nResultados: number;
  etiquetaTipo: (id: string) => string;
  etiquetaNivel: (id: string) => string;
  /** Franja horaria de una clase, para contar las opciones de ese filtro. */
  horarioDe: (c: ClaseFiltrable) => string | null;
  fontFamily?: string;
}) {
  const tipos = opcionesDe(clases, (c) => c.tipoClaseId, etiquetaTipo);
  const instructores = opcionesDe(clases, (c) => c.instructorNombre);
  const niveles = opcionesDe(clases, (c) => c.nivel, etiquetaNivel);
  const horarios = opcionesDe(clases, horarioDe, (v) => HORARIOS.find((h) => h.valor === v)?.etiqueta ?? v);
  const salas = opcionesDe(clases, (c) => c.salaNombre);

  const campos = ([
    { campo: 'tipo', label: 'Tipo de clase', opciones: tipos },
    { campo: 'instructor', label: 'Instructora', opciones: instructores },
    { campo: 'nivel', label: 'Nivel', opciones: niveles },
    { campo: 'horario', label: 'Horario', opciones: horarios },
    { campo: 'sala', label: 'Sala', opciones: salas },
  ] as const satisfies readonly { campo: keyof EstadoFiltros; label: string; opciones: OpcionFiltro[] }[])
    .filter(({ opciones }) => vaLaPena(opciones));

  if (campos.length === 0) return null;

  return (
    <div style={{ fontFamily, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', color: 'var(--portal-muted-2)' }}>FILTRAR</span>
        {/* Solo cuando hay algo que limpiar: un «Limpiar» permanente y sin
            efecto es otro control que hace dudar. */}
        {nCuantos > 0 && (
          <button
            type="button"
            onClick={onLimpiar}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--portal-accent)', padding: 0 }}
          >
            Limpiar{nCuantos > 1 ? ` (${nCuantos})` : ''}
          </button>
        )}
      </div>

      {campos.map(({ campo, label, opciones }) => (
        <label key={campo} style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--portal-muted)', marginBottom: 4 }}>{label}</span>
          <select
            value={estado[campo]}
            onChange={(e) => onCambiar(campo, e.target.value)}
            style={{
              width: '100%', fontSize: 13, padding: '9px 10px', borderRadius: 12,
              border: '1px solid var(--portal-line)', background: 'var(--portal-surface)',
              color: 'var(--portal-ink)', cursor: 'pointer',
            }}
          >
            <option value="">Todas</option>
            {opciones.map((o) => (
              // El número al lado no es adorno: dice cuánto vas a ver ANTES de
              // elegir, y es lo que evita el «filtro y no queda nada».
              <option key={o.valor} value={o.valor}>{o.etiqueta} ({o.cuantas})</option>
            ))}
          </select>
        </label>
      ))}

      {/* ⚠️ Con filtros puestos y CERO resultados hay que decirlo aquí, junto a
          los controles que lo han causado. El estado vacío del horario queda
          lejos, y quien filtra de más suele mirar el resultado, no la lista. */}
      {nCuantos > 0 && (
        <p style={{ fontSize: 11.5, color: nResultados === 0 ? 'var(--portal-ink)' : 'var(--portal-muted-2)', margin: 0 }}>
          {nResultados === 0
            ? 'Ninguna clase cumple estos filtros.'
            : `${nResultados} clase${nResultados === 1 ? '' : 's'}`}
        </p>
      )}
    </div>
  );
}
