// El regalo plateado con monedas de oro de la maqueta del fundador: es la imagen
// de la propia maqueta, recortada (public/guia/regalo-monedas.webp), no un dibujo.
export function RegaloMonedas({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- asset estático diminuto, ya optimizado
    <img src="/guia/regalo-monedas.webp" alt="" aria-hidden draggable={false} className={className} />
  );
}
