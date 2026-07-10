// ─────────────────────────────────────────────────────────────────────────────
// Ejecuta una tarea asíncrona sobre cada elemento con un LÍMITE de concurrencia
// (P0-24/25/33). Sin esto, `Promise.all(items.map(...))` con miles de elementos
// lanza miles de fetches simultáneos desde el navegador: satura la memoria de la
// pestaña y es un DoS accidental contra el propio backend de envío.
//
// Devuelve los resultados en el orden de entrada. Las tareas NO deben lanzar (si
// pueden fallar, envuélvelas en try/catch y devuelve un valor de resultado).
// ─────────────────────────────────────────────────────────────────────────────

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  tarea: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await tarea(items[i], i);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
