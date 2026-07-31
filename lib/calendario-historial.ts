// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — punto 5, pestaña "Historial" del panel lateral.
// Puro: transforma filas de `sustituciones` de ESTA sesión en una lista
// cronológica legible. Ámbito deliberadamente acotado a cobertura/instructora
// — es el único evento de esta sesión con timestamps reales de principio y
// fin (creado_en/resuelto_en). Las reservas canceladas no tienen columna de
// "cancelado_en" en el esquema, así que no se inventa una entrada para ellas.
// ─────────────────────────────────────────────────────────────────────────────

export interface SustitucionHistorial {
  id: string;
  estado: string;
  motivo: string | null;
  sustitutaFinalId: string | null;
  creadoEn: string | null;
  resueltoEn: string | null;
}

export interface EventoHistorial {
  id: string;
  /** Momento a mostrar/ordenar: resueltoEn si ya está resuelta, si no creadoEn. */
  fecha: string;
  texto: string;
}

// `nombrePorInstructorId` resuelve el nombre para mostrar — pura, sin fetch:
// quien llama ya tiene el array de instructores de la sesión cargado.
export function historialSustituciones(
  sustituciones: SustitucionHistorial[],
  nombrePorInstructorId: (id: string) => string | null,
): EventoHistorial[] {
  const eventos: EventoHistorial[] = [];

  for (const s of sustituciones) {
    if (s.creadoEn) {
      eventos.push({
        id: `${s.id}-abierta`,
        fecha: s.creadoEn,
        texto: s.motivo ? `Sin instructora — ${s.motivo}` : 'Sin instructora',
      });
    }
    if (s.resueltoEn) {
      const texto = s.estado === 'confirmada'
        ? (() => {
            const nombre = s.sustitutaFinalId ? nombrePorInstructorId(s.sustitutaFinalId) : null;
            return nombre ? `Cubierta con ${nombre}` : 'Cubierta';
          })()
        : s.estado === 'resuelta_fuera'
        ? 'Resuelta moviendo la clase a otro horario'
        : s.estado === 'sin_sustituta'
        ? 'Sin sustituta encontrada'
        : s.estado === 'cancelada'
        ? 'Sustitución cancelada'
        : `Sustitución resuelta (${s.estado})`;
      eventos.push({ id: `${s.id}-resuelta`, fecha: s.resueltoEn, texto });
    }
  }

  return eventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}
