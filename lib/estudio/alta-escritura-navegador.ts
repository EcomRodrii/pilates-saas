// ─────────────────────────────────────────────────────────────────────────────
// Qué columnas de `studios` puede fijar el NAVEGADOR al crear un estudio.
//
// El alta (`dbCreateStudio`, desde /crear-estudio y desde /login) inserta con la
// sesión de la nueva propietaria (rol `authenticated`). Todo lo demás de la fila
// —el plan de pago, la prueba, si es una demo, cuándo nació, la suspensión, la
// cadena— lo decide el servidor o un trigger. La migración
// `20261016115000_studios_alta_y_borrado_solo_lo_necesario` quita a
// `authenticated` el INSERT y el DELETE de tabla y le da solo estas columnas:
// borrar un estudio no se hace desde el navegador, nunca.
//
// ⚠️ Esta lista y esa migración dicen LO MISMO, y la que manda es la migración (la
// base de datos es la cerradura). `alta-escritura-navegador.test.ts` las cruza con
// el INSERT de `dbCreateStudio`: una columna nueva en el alta sin su GRANT sale
// como un 42501 en producción y deja a la persona sin estudio.
//
// Una columna NUEVA de `studios` nace NO insertable desde el navegador: añadirla
// aquí es una decisión, no un descuido.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que el navegador fija al CREAR un estudio (el resto, valores por defecto y triggers). */
export const COLUMNAS_ESTUDIO_INSERTABLES = [
  'id',
  'nombre',
  'ciudad',
  'telefono',
  // El plan elegido en el alta; los valores los acota el CHECK `studios_plan_valido`.
  'plan',
  'owner_auth_user_id',
  'slug',
  'como_nos_conocio',
  'tipo_cuenta',
] as const;

export type ColumnaEstudioInsertable = (typeof COLUMNAS_ESTUDIO_INSERTABLES)[number];
