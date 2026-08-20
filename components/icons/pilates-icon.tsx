import type { LucideProps } from 'lucide-react';

// Icono "Pilates" — Streamline Guidance (set gratuito), streamlinehq.com.
// Lucide no tiene ningún glifo de pilates/postura y el catálogo de la tab bar
// del portal solo ofrecía `Dumbbell` (una mancuerna de gimnasio) para estudios
// cuyo negocio es literalmente pilates. Exportado del MCP de Streamline a
// 24px con trazo 2 y adaptado a la API de Lucide (currentColor, puntas
// redondeadas) para que conviva con la familia sin distinguirse.
// Licencia del set gratuito de Streamline: uso con atribución — mantener el
// crédito de este comentario y el <title> si se copia a otro sitio.
export function PilatesIcon({ size = 24, strokeWidth = 2, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-1 -1 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <title>Pilates — Streamline Guidance</title>
      <path d="M0 18.792h22m-9.167 -10.084H3.208a1.833 1.833 0 0 0 -1.678 1.096c-0.196 0.444 0.038 0.931 0.382 1.274l4.153 4.153a2.766 2.766 0 0 0 3.912 0L13.75 11.458h1.833s2.783 0.16 5.958 -1.674M9.167 12.833 5.042 8.708m-2.571 -1.833S0.811 6.364 0.513 5.247a1.62 1.62 0 0 1 1.139 -1.983 1.604 1.604 0 0 1 1.967 1.146c0.297 1.117 -0.882 2.392 -0.882 2.392l-0.267 0.073Z" />
    </svg>
  );
}
