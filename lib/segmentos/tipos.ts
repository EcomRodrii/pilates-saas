// Segmentos de clientes guardables (auditoría vs Momence, §9 informe:
// constructor de condiciones combinables + audiencia reutilizable — Tentare
// solo tenía una etiqueta única + 4 presets fijos hardcodeados).
//
// v1 es deliberadamente UN SOLO NIVEL: un grupo con un operador (AND u OR)
// y una lista plana de condiciones, todas unidas por ese mismo operador.
// Anidar grupos dentro de grupos (lo que sí hace Momence) es la complejidad
// que no aporta valor real a un estudio de Pilates con ~10 condiciones
// posibles — y multiplica la superficie de bug del evaluador sin necesidad.

export type Comparador = 'igual' | 'distinto' | 'mayor_que' | 'menor_que' | 'es_verdadero' | 'es_falso';

// Campos fijos + `campo_extra:<campoId>` para los campos personalizados que
// cada estudio ya define en Configuración → Clientes. Enum cerrado (no texto
// libre): añadir un tipo de condición nuevo es añadir un caso al evaluador,
// nunca tocar el esquema.
export type CampoFijoSegmento =
  | 'dias_desde_ultima_visita'
  | 'tiene_reserva_futura'
  | 'dias_desde_alta'
  | 'cumpleanos_en_proximos_dias'
  | 'etiqueta'
  | 'bono_caduca_en_dias'
  | 'sin_bono_activo'
  | 'lead_stage';

export type CampoSegmento = CampoFijoSegmento | `campo_extra:${string}`;

export interface CondicionSegmento {
  campo: CampoSegmento;
  comparador: Comparador;
  valor: string | number | boolean | null;
}

export interface DefinicionSegmento {
  operador: 'AND' | 'OR';
  condiciones: CondicionSegmento[];
}

export interface SegmentoCliente {
  id: string;
  studioId: string;
  nombre: string;
  condiciones: DefinicionSegmento;
  creadoPor: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

// Metadatos para pintar el builder (etiqueta, tipo de valor, comparadores
// válidos) — vive aquí y no en el componente para que evaluador.ts y la UI
// nunca diverjan sobre qué comparadores tiene sentido ofrecer por campo.
export const CAMPOS_FIJOS_META: Record<CampoFijoSegmento, { etiqueta: string; tipo: 'numero' | 'booleano' | 'texto'; comparadores: Comparador[] }> = {
  dias_desde_ultima_visita: { etiqueta: 'Días desde la última visita', tipo: 'numero', comparadores: ['mayor_que', 'menor_que'] },
  tiene_reserva_futura: { etiqueta: 'Tiene una reserva futura', tipo: 'booleano', comparadores: ['es_verdadero', 'es_falso'] },
  dias_desde_alta: { etiqueta: 'Días desde el alta', tipo: 'numero', comparadores: ['mayor_que', 'menor_que'] },
  cumpleanos_en_proximos_dias: { etiqueta: 'Cumpleaños en los próximos N días', tipo: 'numero', comparadores: ['menor_que'] },
  etiqueta: { etiqueta: 'Tiene la etiqueta', tipo: 'texto', comparadores: ['igual', 'distinto'] },
  bono_caduca_en_dias: { etiqueta: 'Su bono caduca en menos de N días', tipo: 'numero', comparadores: ['menor_que'] },
  sin_bono_activo: { etiqueta: 'Sin bono ni suscripción activa', tipo: 'booleano', comparadores: ['es_verdadero', 'es_falso'] },
  lead_stage: { etiqueta: 'Etapa del embudo', tipo: 'texto', comparadores: ['igual', 'distinto'] },
};
