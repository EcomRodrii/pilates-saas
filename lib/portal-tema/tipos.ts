// La forma de los datos que consume el portal en React.
//
// Vive en `lib/` y no junto a los componentes por dos motivos: el adaptador que
// los produce (`datos.ts`) es puro y se prueba con `node --test lib/**/*.test.ts`,
// y así la dependencia va en un solo sentido — `components/` tira de `lib/`,
// nunca al revés.
//
// Es DELIBERADAMENTE la forma que entregó diseño, no la del dominio. El portal
// nuevo no debe aprender qué es un `tipoClaseId` ni una `Suscripcion`: eso lo
// traduce el adaptador una vez, y aquí llega ya masticado.

/** Una clase del horario, tal y como la pinta el portal. */
export interface StudioClass {
  id: string;
  name: string;
  /** Clave del filtro superior. Sale del tipo de clase, no de un enum fijo. */
  type: string;
  /** Día del MES (no día de la semana): es lo que casa con la rejilla. */
  day: number;
  time: string;
  end: string;
  duration: string;
  room: string;
  level: string;
  teacher: string;
  initial: string;
  /** Plazas libres. 0 = completa, y entonces la UI ofrece lista de espera. */
  seats: number;
  description: string;
}

export interface DiaPortal {
  key: string;
  label: string;
  /** Día del mes, para casar con `StudioClass.day`. */
  num: number;
}

export interface FiltroPortal {
  key: string;
  label: string;
}

export interface PlanPortal {
  key: string;
  name: string;
  classes: number;
  price: number;
  badge: string;
  perks: string[];
}

export interface BonoPortal {
  name: string;
  /** Sesiones que traía el bono. 0 = no hay bono que enseñar. */
  total: number;
  /** Ya formateada para leerse ("30 de septiembre"), no una fecha ISO. */
  expires: string;
}

export interface SociaPortal {
  name: string;
  short: string;
  initial: string;
}

/**
 * Todo lo que cambia de un estudio a otro.
 *
 * Lo que NO está aquí sigue siendo constante del portal (`TABS`,
 * `QUICK_LINKS`, `NOTIFICATIONS`) o dato de muestra todavía sin origen real
 * (`CHALLENGES`, `WEEK_BARS`, `EXERCISES`, `TEACHERS`, `TESTIMONIALS`, `FAQ`).
 * Se irán moviendo aquí según tengan de dónde salir; meterlos antes solo
 * disfrazaría de real algo que sigue inventado.
 */
/** Una reserva viva de la socia, atada a la clase que ocupa. */
export interface ReservaPortal {
  /** El id de la SESIÓN, que es lo que el portal llama "clase". */
  classId: string;
  /** El id de la RESERVA, que es lo que hay que mandar para cancelarla. */
  reservaId: string;
}

export interface DatosPortal {
  clases: StudioClass[];
  dias: DiaPortal[];
  filtros: FiltroPortal[];
  planes: PlanPortal[];
  bono: BonoPortal;
  socia: SociaPortal;
  /**
   * Las reservas VIVAS de la socia.
   *
   * ⚠️ `undefined` = no hay nadie identificado (la previsualización de temas),
   * y solo entonces el portal usa su lista de demostración. Un array vacío es
   * un dato: "no tiene ninguna reserva". Confundir los dos es lo que hacía que
   * la pantalla de Reservas del kit saliera SIEMPRE vacía en el portal de
   * verdad, con las reservas de la socia perfectamente guardadas en la base de
   * datos.
   */
  reservadas?: ReservaPortal[];
}
