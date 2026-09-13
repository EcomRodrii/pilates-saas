import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

// El disco de «hecho» (o de aviso / error) que abre una pantalla de resultado.
//
// ⚠️ Estaba copiado en SEIS sitios, cada uno con su tamaño (60, 64, 68) y el
// icono escrito como carácter —«✓», «!», «×»—, que dibuja la fuente del
// sistema: cada móvil uno distinto y ninguno del set de la app. Ahora es uno,
// con los iconos del set.
export type TonoSello = 'ok' | 'warn' | 'error';

const FONDO: Record<TonoSello, string> = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  error: 'var(--destructive)',
};

const ICONO: Record<TonoSello, NombreIcono> = { ok: 'hecho', warn: 'aviso', error: 'cerrar' };

export function Sello({ tono = 'ok', style }: { tono?: TonoSello; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        width: 64, height: 64, margin: '0 auto', borderRadius: 999,
        // Sobre los tres sólidos semánticos va blanco; `--success-foreground`
        // es ese blanco con nombre.
        background: FONDO[tono], color: 'var(--success-foreground)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'apCheck .55s var(--ease-spring) both',
        ...style,
      }}
    >
      <Icono nombre={ICONO[tono]} tamano={34} />
    </span>
  );
}
