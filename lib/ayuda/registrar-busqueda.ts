// Avisar al servidor de una búsqueda del Centro de ayuda / Academy que no dio ningún resultado (app/api/ayuda/busqueda). Solo navegador.
//
// Va DESPUÉS de que la persona deja de teclear (no por letra) y como mucho una vez por término y visita: la tabla cuenta búsquedas,
// no pulsaciones. Falla en silencio a propósito: quien busca no tiene por qué enterarse de que no se pudo apuntar.
// El servidor vuelve a decidir qué guarda y qué descarta (lib/ayuda/busquedas-sin-resultado.ts).

export const ESPERA_MS = 1200;

export function crearRegistroDeBusquedas(enviar: (termino: string) => void = termino => {
  void fetch('/api/ayuda/busqueda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ termino }), keepalive: true }).catch(() => { /* sin red: no se apunta */ });
}) {
  const ya = new Set<string>();
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  return {
    /** Llamar en cada cambio de la búsqueda con el texto y cuántos resultados da. */
    cambio(texto: string, resultados: number) {
      if (temporizador) { clearTimeout(temporizador); temporizador = null; }
      const t = texto.trim().toLowerCase();
      if (resultados > 0 || t.length < 3 || ya.has(t)) return;
      temporizador = setTimeout(() => { ya.add(t); temporizador = null; enviar(t); }, ESPERA_MS);
    },
    cancelar() { if (temporizador) clearTimeout(temporizador); temporizador = null; },
  };
}
