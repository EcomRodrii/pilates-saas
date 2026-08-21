// Los estilos de botón del flujo público de reserva, en un solo sitio.
//
// ⚠️ Antes cada botón se escribía a mano donde hiciera falta, y el inventario
// del flujo daba esto: seis con `py-3` y tres con `py-3.5`; `font-bold` mezclado
// con `font-semibold`; CUATRO tratamientos distintos del estado deshabilitado
// (`opacity-40`, `opacity-60 + cursor-not-allowed`, y dos sin nada); y solo 2 de
// 10 con respuesta al pulsar. Ninguno de esos botones estaba «mal» por su
// cuenta — el problema es que juntos no parecían el mismo producto.
//
// ⚠️ Y un defecto que solo se ve leyendo la clase entera: los secundarios
// llevaban `bg-[var(--portal-surface-2)] hover:bg-[var(--portal-surface-2)]`.
// El hover pintaba EXACTAMENTE el mismo color que el reposo, así que el botón
// no respondía al ratón: parecía pulsable y no daba ninguna señal. Es el caso
// literal de «botones que parecen clicables pero no responden».
//
// Esto son cadenas de clases, no un componente: los pasos del modal ya tienen
// su propio JSX y meter un componente nuevo obligaría a tocarlos todos para
// nada. Lo que hacía falta era que el ESTILO dejara de estar duplicado.

/** Lo común a todos: mismo alto, mismo radio, misma respuesta al pulsar. */
const BASE =
  'w-full py-3.5 rounded-2xl text-sm font-bold transition-all ' +
  // `active:scale` es la única señal táctil que queda en móvil, donde no hay
  // hover: sin ella, pulsar no confirma nada hasta que la pantalla cambia.
  'active:scale-[.99] ' +
  // Un deshabilitado que además NO deja pulsar ni cambia el cursor: la opacidad
  // sola se lee como «cargando», no como «te falta algo».
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';

/**
 * La acción que hace avanzar el flujo. El color de fondo va aparte, en línea:
 * es el de la marca del estudio y no puede vivir en una clase estática.
 */
export const BOTON_PRIMARIO = `${BASE} text-white`;

/**
 * La alternativa a la acción principal (descargar, volver, otra vía). Ahora el
 * hover SÍ cambia algo: se oscurece el borde hasta la tinta.
 */
export const BOTON_SECUNDARIO =
  `${BASE} text-[var(--portal-ink)] bg-[var(--portal-surface-2)] ` +
  'border border-[var(--portal-line)] hover:border-[var(--portal-ink)]';

/** Salir sin hacer nada. Sin caja: no compite con las dos de arriba. */
export const BOTON_TERCIARIO =
  'text-[var(--portal-muted)] text-sm transition-colors hover:text-[var(--portal-ink)] ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';
