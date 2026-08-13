import { Camera } from 'lucide-react';
import { NW_SAGE, NW_GRIS_VERDOSO } from './tokens';

// Foto rectangular protagonista (marketplace/perfil) — a diferencia de
// ProfileAvatar (círculo pequeño, memoji/iniciales para listas del panel),
// aquí es la pieza visual principal. README: "fotografía real como
// protagonista... nunca ilustraciones IA" — sin fotoUrl, placeholder
// rayado explícito, nunca un memoji ni un color de fondo que finja ser foto.
export function FotoInstructora({
  fotoUrl, nombre, aspectRatio = '4 / 4.4', className, radius = 15,
}: {
  fotoUrl: string | null | undefined;
  nombre: string;
  aspectRatio?: string;
  className?: string;
  radius?: number;
}) {
  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto subida por la instructora, no un asset estático conocido en build
      <img
        src={fotoUrl}
        alt={nombre}
        className={className}
        style={{ aspectRatio, borderRadius: radius, objectFit: 'cover', width: '100%', display: 'block' }}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div
      className={className}
      style={{
        aspectRatio, borderRadius: radius, width: '100%',
        background: NW_SAGE,
        backgroundImage: 'repeating-linear-gradient(135deg, rgba(152,160,147,.18) 0 2px, transparent 2px 10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      aria-hidden
    >
      <Camera size={28} color={NW_GRIS_VERDOSO} strokeWidth={1.6} />
    </div>
  );
}
