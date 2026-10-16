// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio» (panel nuevo, 14-oct-2026): la lista corta de
// Bonsai («Mis primeros pasos», cinco tareas con progreso) hecha con lo que ya
// sabe el panel. Puro, sin `@/`.
//
// NO decide qué está hecho: lo dice `calcularOnboarding` (lib/onboarding.ts),
// con datos reales, igual que la lista de arranque y /primeros-pasos. Aquí solo
// se elige QUÉ seis cosas se enseñan, en qué orden y con qué palabras: cada
// tarea es un verbo y una línea de para qué sirve, como en Bonsai.
//
// El orden es el del camino a la primera reserva (medido en producción el
// 12-sep: donde se cae la mitad es en programar clases). El NIF no está: no
// hace falta para que alguien reserve, y ya lo pide la bandeja. Stripe va
// aparte y marcado como opcional: un estudio que cobra en el mostrador no debe
// ver su lista «a medias» para siempre.
// ─────────────────────────────────────────────────────────────────────────────

export interface TareaPrimerosPasos {
  /** Id del paso en `calcularOnboarding`, que es quien dice si está hecho. */
  id: string;
  titulo: string;
  /** Para qué sirve, en una línea. */
  para: string;
  href: string;
  /** Un segundo camino, cuando lo hay («Importar»). */
  otro?: { label: string; href: string };
  opcional?: boolean;
}

export const TAREAS: readonly TareaPrimerosPasos[] = [
  {
    id: 'instructor',
    titulo: 'Añade a quien da las clases',
    para: 'Toda clase necesita a alguien asignado, aunque seas tú.',
    href: '/equipo?nuevo=1',
  },
  {
    id: 'clase',
    titulo: 'Crea tu primer tipo de clase',
    para: 'Reformer, Mat…: se define una vez y sirve para todo tu horario.',
    href: '/configuracion?tab=clases&abrir=tipos-de-clase',
  },
  {
    id: 'horario',
    titulo: 'Programa tus clases',
    para: 'Sin clases en el calendario, nadie puede reservar.',
    href: '/calendario?nueva=1',
  },
  {
    id: 'bonos',
    titulo: 'Pon a la venta una cuota o un bono',
    para: 'Para que tus alumnas paguen por adelantado y no clase a clase.',
    href: '/productos',
  },
  {
    id: 'clientes',
    titulo: 'Trae a tus alumnas',
    para: 'Dalas de alta o tráelas de tu programa anterior.',
    href: '/clientas?nuevo=1',
    otro: { label: 'Importar', href: '/migracion' },
  },
  {
    id: 'primera-reserva',
    titulo: 'Recibe tu primera reserva',
    para: 'Comparte tu página de reservas: ahí empieza Tentare a trabajar por ti.',
    href: '/configuracion?tab=web#direccion-y-enlaces',
  },
];

export const OPCIONAL: TareaPrimerosPasos = {
  id: 'stripe',
  titulo: 'Cobra online',
  para: 'Con tarjeta o domiciliación. Si cobras en el mostrador, no te hace falta.',
  href: '/configuracion?tab=conexiones#integracion-stripe',
  opcional: true,
};

export interface TareaConEstado extends TareaPrimerosPasos {
  hecha: boolean;
}

export interface PrimerosPasos {
  tareas: TareaConEstado[];
  opcional: TareaConEstado;
  hechas: number;
  total: number;
  /** La primera tarea sin hacer; `null` = las seis hechas. */
  siguiente: TareaConEstado | null;
}

/**
 * Las seis tareas con su estado. Un paso que `calcularOnboarding` no conozca
 * cuenta como NO hecho: mejor una tarea de más que dar por hecha una que no lo
 * está (lo vigila el test contra el catálogo real).
 */
export function primerosPasos(categorias: readonly { pasos: readonly { id: string; done: boolean }[] }[]): PrimerosPasos {
  const hecho = new Map<string, boolean>();
  for (const c of categorias) for (const p of c.pasos) hecho.set(p.id, p.done);
  const tareas = TAREAS.map(t => ({ ...t, hecha: hecho.get(t.id) === true }));
  const hechas = tareas.filter(t => t.hecha).length;
  return {
    tareas,
    opcional: { ...OPCIONAL, hecha: hecho.get(OPCIONAL.id) === true },
    hechas,
    total: tareas.length,
    siguiente: tareas.find(t => !t.hecha) ?? null,
  };
}
