// Una señal que aborta un `fetch` pasado un tiempo, también en Safari de iOS 15.
//
// `AbortSignal.timeout()` llegó a Safari en iOS 16: en un iPhone con iOS 15 no
// existe, la llamada lanza un TypeError ANTES del fetch y el `catch` de quien
// llama lo lee como «sin red». Pasaba con el código del segundo paso: en esos
// móviles nunca salía (4-oct-2026). En el navegador se usa esto; en el
// servidor (Node) `AbortSignal.timeout` existe siempre y no hace falta.
// Lo vigila lib/senal-con-limite.test.ts.
export function senalConLimite(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controlador = new AbortController();
  setTimeout(() => controlador.abort(new DOMException('Se ha agotado el tiempo', 'TimeoutError')), ms);
  return controlador.signal;
}
