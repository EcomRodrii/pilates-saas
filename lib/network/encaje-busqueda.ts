// Encaje búsqueda↔perfil — matching en el buscador de instructoras del
// PANEL de estudio (`app/(dashboard)/network/buscar/`).
//
// ⚠️ Deliberadamente NO es el mismo modelo que lib/network/encaje-
// candidatura.ts (criterios binarios cumple/no cumple). Ahí tiene sentido
// porque el perfil NO está prefiltrado por la vacante (aplicación abierta,
// hay variación real). Aquí SÍ: todo perfil visible en la lista ya pasó
// `buscarPerfilesPublico` — ciudad (.ilike), tarifaRango/disponibilidad
// (.in), experienciaMinima (.gte) y las tres verificaciones ya son
// filtros duros. Si se reusara el modelo binario contra esos mismos
// campos, TODO resultado visible daría 100 % siempre — un número que no
// distingue nada, el mismo tipo de señal vacía que ya costó corregir una
// vez ("Compatibilidad 87 %" fabricado, lib/sustituciones/encaje.ts).
//
// La única fuente de variación real que queda: especialidades/horarios/
// tipoTrabajo se filtran con `.overlaps` — basta UNA coincidencia para
// pasar el filtro, no todas. Si la propietaria pide 3 especialidades y
// una profesional solo cubre 1, ambas están en la lista pero no cubren lo
// mismo — eso sí es medible. Y solo cuenta cuando se piden 2+ opciones en
// ese campo: con 1 sola, la cobertura es siempre 1/1 para cualquier
// resultado visible (mismo problema trivial de arriba).
//
// Decisión tomada con el fundador: versión "estrecha pero honesta" — no
// aparece en la mayoría de búsquedas (ciudad+tarifa+1 especialidad es lo
// más común), pero cuando aparece mide algo real. La alternativa (todos
// los campos como criterios binarios) se descartó explícitamente por dar
// 100 % siempre que aparece.
import type { FiltroBusquedaNetwork, PerfilNetworkPublico } from './tipos.ts';

export interface CriterioEncajeBusqueda {
  label: string;
  coincidencias: number;
  solicitadas: number;
}

export interface EncajeBusqueda {
  /** Ancho de la barra, 0..100. Vacío (criterios: []) si no hay campo con 2+ opciones pedidas. */
  barra: number;
  criterios: CriterioEncajeBusqueda[];
}

function coberturaDe<T>(pedidas: T[], tiene: T[]): CriterioEncajeBusqueda['coincidencias'] {
  return pedidas.filter(v => tiene.includes(v)).length;
}

export function encajeBusquedaDe(filtro: FiltroBusquedaNetwork, perfil: PerfilNetworkPublico): EncajeBusqueda {
  const criterios: CriterioEncajeBusqueda[] = [];

  if (filtro.especialidades.length > 1) {
    criterios.push({
      label: 'Especialidad',
      coincidencias: coberturaDe(filtro.especialidades, perfil.especialidades),
      solicitadas: filtro.especialidades.length,
    });
  }

  if (filtro.horarios.length > 1) {
    criterios.push({
      label: 'Horario',
      coincidencias: coberturaDe(filtro.horarios, perfil.disponibilidadHorarios),
      solicitadas: filtro.horarios.length,
    });
  }

  if (filtro.tipoTrabajo.length > 1) {
    criterios.push({
      label: 'Tipo de trabajo',
      coincidencias: coberturaDe(filtro.tipoTrabajo, perfil.tipoTrabajo),
      solicitadas: filtro.tipoTrabajo.length,
    });
  }

  if (criterios.length === 0) return { barra: 0, criterios: [] };

  const media = criterios.reduce((acc, c) => acc + c.coincidencias / c.solicitadas, 0) / criterios.length;
  return { barra: Math.round(media * 100), criterios };
}
