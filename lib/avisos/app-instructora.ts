// La instructora ya no trabaja en el panel: su sitio es la app del estudio.
//
// Decisión del fundador (14-sep-2026): la app de la alumna es también la de la
// instructora y Tentare Core se retira. El paso 1 fue un aviso en el panel; el
// paso 2 (esto) es una puerta: quien entra al panel con rol INSTRUCTOR en la
// sede activa acaba en «Hoy» de la app de su estudio.
//
// Reglas PURAS, sin imports: las prueba el runner de Node.

/** «Hoy» de la instructora en la app de su estudio. */
export function urlAppInstructora(slug: string): string {
  return `/portal/${encodeURIComponent(slug)}/equipo`;
}

export type DestinoInstructoraEnPanel = 'app' | 'elegir' | 'sin-confirmar';

/**
 * Qué hacer con alguien a quien el panel resuelve como INSTRUCTOR en la sede ACTIVA.
 *
 * ⚠️ Ese rol del cliente NO basta para sacarla del panel: si falla la lectura de
 * `instructores`, el rol cae al mínimo (INSTRUCTOR) también para gerencia y
 * recepción. Solo se redirige si `mis_estudios()` —que resuelve en la BD— lo
 * CONFIRMA para esta sede; si no, 'sin-confirmar' (se le pide recargar).
 *
 * Si en otra sede gestiona (propietaria, gerencia o recepción), no se la saca
 * del panel sin más: el selector de sede vive aquí y es la única forma de llegar
 * a la sede que sí lleva. Entonces elige. Si no, directa a la app.
 */
export function destinoInstructoraEnPanel(
  sedes: ReadonlyArray<{ id: string; rol?: string | null }>,
  sedeActivaId: string,
): DestinoInstructoraEnPanel {
  const activa = sedes.find((s) => s.id === sedeActivaId);
  if (!activa || activa.rol !== 'INSTRUCTOR') return 'sin-confirmar';
  return sedes.some((s) => s.id !== sedeActivaId && !!s.rol && s.rol !== 'INSTRUCTOR') ? 'elegir' : 'app';
}
