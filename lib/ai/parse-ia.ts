// Parseo robusto de respuestas JSON de la IA. Los modelos a veces envuelven el
// JSON en fences de markdown (```json … ```) o añaden texto alrededor; esto
// extrae el objeto JSON antes de parsear para evitar 502 por JSON.parse estricto.

export function extraerJsonIA(raw: string): string {
  let s = (raw ?? '').trim();
  // 1) Quitar fences de markdown ```json … ``` o ``` … ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  // 2) Recortar a la porción entre la primera { y la última } (o [ … ]).
  const firstObj = s.indexOf('{');
  const lastObj = s.lastIndexOf('}');
  const firstArr = s.indexOf('[');
  const lastArr = s.lastIndexOf(']');
  // Preferir objeto si empieza antes; si no, array.
  if (firstObj !== -1 && lastObj > firstObj && (firstArr === -1 || firstObj < firstArr)) {
    s = s.slice(firstObj, lastObj + 1);
  } else if (firstArr !== -1 && lastArr > firstArr) {
    s = s.slice(firstArr, lastArr + 1);
  }
  return s.trim();
}

// Parsea o lanza. Devuelve el objeto tipado por el llamante.
export function parseJsonIA<T = unknown>(raw: string): T {
  return JSON.parse(extraerJsonIA(raw)) as T;
}
