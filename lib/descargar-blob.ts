// Descarga en el navegador de un archivo que ya ha llegado entero. La comparten
// la app de la alumna y el panel.
//
// ⚠️ El `revoke` va diferido: en Safari, revocar en la misma vuelta del bucle de
// eventos cancela la descarga que acaba de empezar (mismo criterio que
// `lib/student/enlaces-clase.ts`).
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** El nombre que propone el servidor en `Content-Disposition`, o el de reserva. */
export function nombreDeDescarga(res: Response, reserva: string): string {
  const m = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '');
  return m?.[1] ?? reserva;
}
