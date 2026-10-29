import './marco-tarjeta.css';

/** La tarjeta blanca sobre el fondo difuminado de la demo, para el alta. Sin estado: se pinta en servidor y en cliente. */
export function MarcoTarjeta({ children, ancho = 'normal' }: { children: React.ReactNode; ancho?: 'estrecho' | 'normal' | 'amplio' }) {
  return (
    <div className="mt-raiz">
      <div className="mt-fondo" aria-hidden="true" />
      <div className="mt-tarjeta" data-ancho={ancho}>{children}</div>
    </div>
  );
}
