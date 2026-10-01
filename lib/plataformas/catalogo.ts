// Las plataformas que venden plazas de un estudio fuera de Tentare.
//
// Una reserva de estas ocupa plaza en la clase, pero la persona no es socia del
// estudio: va en `reservas` con `socio_id = null`, su `origen` y el nombre que
// da la plataforma (migr 20261001200000). Las vías propias son todas 'TENTARE'.
//
// Sin alias `@/`: lo leen `node --test` y los módulos de servidor.

export const PLATAFORMAS = ['CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB'] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];
export type OrigenReserva = 'TENTARE' | Plataforma;

/** Cómo se escribe cada plataforma en pantalla. */
export const NOMBRE_PLATAFORMA: Record<Plataforma, string> = {
  CLASSPASS: 'ClassPass',
  URBAN_SPORTS_CLUB: 'Urban Sports Club',
  WELLHUB: 'Wellhub',
};

/** Para la etiqueta corta de la lista de la clase. */
export const SIGLA_PLATAFORMA: Record<Plataforma, string> = {
  CLASSPASS: 'ClassPass',
  URBAN_SPORTS_CLUB: 'USC',
  WELLHUB: 'Wellhub',
};

export function esPlataforma(v: unknown): v is Plataforma {
  return typeof v === 'string' && (PLATAFORMAS as readonly string[]).includes(v);
}

/** Lo que llega de la base de datos, con lo desconocido tratado como propio. */
export function origenDe(v: unknown): OrigenReserva {
  return esPlataforma(v) ? v : 'TENTARE';
}

export function esReservaExterna(r: { origen?: OrigenReserva | null }): boolean {
  return !!r.origen && r.origen !== 'TENTARE';
}
