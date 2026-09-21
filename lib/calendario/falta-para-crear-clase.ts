// Qué le falta al formulario de clase del calendario para poder guardarse, y
// dónde se crea lo que todavía no existe.
//
// Cada cosa sin crear lleva SU enlace al sitio donde se crea: una instructora se
// da de alta en Equipo, no en Configuración (el aviso antiguo mandaba todo a
// Configuración → Clases, y decía «lo tienes creado» también de una instructora).

export interface PorCrear { texto: string; enlace: string; href: string }

export function faltaParaCrearClase(p: {
  tipoClaseId: string; salaId: string; instructorId: string;
  hayTipos: boolean; haySalas: boolean; hayInstructoras: boolean;
  exigeInstructora: boolean;
}): { faltan: string[]; porCrear: PorCrear[] } | null {
  const faltan: string[] = [];
  const porCrear: PorCrear[] = [];
  if (!p.tipoClaseId) {
    faltan.push(p.hayTipos ? 'elegir el tipo de clase' : 'un tipo de clase');
    if (!p.hayTipos) porCrear.push({ texto: 'Todavía no tienes ningún tipo de clase.', enlace: 'Créalo en Configuración', href: '/configuracion?tab=clases&abrir=tipos-de-clase' });
  }
  if (!p.salaId) {
    faltan.push(p.haySalas ? 'elegir la sala' : 'una sala');
    if (!p.haySalas) porCrear.push({ texto: 'Todavía no tienes ninguna sala.', enlace: 'Créala en Configuración', href: '/configuracion?tab=estudio&abrir=salas' });
  }
  if (!p.instructorId && p.exigeInstructora) {
    faltan.push(p.hayInstructoras ? 'elegir la instructora' : 'una instructora');
    if (!p.hayInstructoras) porCrear.push({ texto: 'Todavía no tienes ninguna instructora en tu equipo.', enlace: 'Añádela en Equipo', href: '/equipo?nuevo=1' });
  }
  return faltan.length === 0 ? null : { faltan, porCrear };
}
