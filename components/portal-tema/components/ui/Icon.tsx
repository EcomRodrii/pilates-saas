/**
 * Set de iconos del tema. Trazo, 24×24, uno o dos trazados por icono.
 * Un icono solo entra aquí si aporta información: no hay decorativos.
 */

export const ICON_PATHS = {
  calendar: ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M8 2v4M16 2v4M3 10h18"],
  bookmark: ["M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z", ""],
  card: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M2 10h20"],
  gift: ["M4 12h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z", "M2 8h20v4H2zM12 8v14M8.5 8a2.5 2.5 0 0 1 0-5C10.5 3 12 8 12 8s1.5-5 3.5-5a2.5 2.5 0 0 1 0 5"],
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5"],
  user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
  clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 6v6l4 2"],
  pin: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  person: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6.4 19a6 6 0 0 1 11.2 0"],
  heart: ["M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z", ""],
  // La estrella de la nota de una instructora. Va rellena (`fill`), no de
  // contorno: media estrella de contorno no se distingue de una vacía a 13 px.
  star: ["M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z", ""],
  compass: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "m16.2 7.8-2.1 6.4-6.4 2.1z"],
  pass: ["M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "M7 10h4M7 14h8"],
  bolt: ["m13 2-8 12h6l-1 8 8-12h-6z", ""],
  bell: ["M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  back: ["m15 18-6-6 6-6", ""],
  forward: ["m9 6 6 6-6 6", ""],
  check: ["M20 6 9 17l-5-5", ""],
  close: ["M18 6 6 18", "M6 6l12 12"],
  leaf: ["M12 21c-4-2-6-5.5-6-9 0-3 2-6 6-9 4 3 6 6 6 9 0 3.5-2 7-6 9z", "M12 21V7"],
  music: ["M9 18V5l12-2v13", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "m16.5 16.5 4 4"],
  filter: ["M4 6h16", "M7 12h10M10 18h4"],
  chevron: ["m6 9 6 6 6-6", ""],
  info: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 11v6M12 7.6v.1"],
  warning: ["M12 3 2.5 20h19z", "M12 9v5M12 17.4v.1"],
  trend: ["m3 17 6-6 4 4 8-8", "M15 7h6v6"],
  // Teléfono y correo entran con «Mi centro». Se añaden en vez de reusar
  // `clock`/`card`, que es lo primero que probé: un icono que no dice lo que
  // hay al lado es peor que ninguno.
  phone: ["M5.5 3.8h3.2l1.6 3.9-2.1 1.6a11.4 11.4 0 0 0 5.5 5.5l1.6-2.1 3.9 1.6v3.2a1.7 1.7 0 0 1-1.8 1.7C10.2 18.8 5.2 13.8 4.8 5.6a1.7 1.7 0 0 1 1.7-1.8z", ""],
  mail: ["M3.5 5.5h17a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17V7a1.5 1.5 0 0 1 1.5-1.5z", "m2.6 7 9.4 6.4L21.4 7"],
} as const;

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  fill?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 21, stroke = 1.7, fill = "none", className = "", style }: IconProps) {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.info;
  return (
    <svg
      className={("icon " + className).trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={paths[0]}></path>
      {paths[1] ? <path d={paths[1]}></path> : null}
    </svg>
  );
}
