import localFont from 'next/font/local';

// Inter (SIL OFL, app/_fuentes/inter/OFL.txt): la letra de la pantalla que se
// copia usa su propia variante de Inter, que no es nuestra. No se precarga fuera
// de aquí. El formulario de Stripe pide la misma desde public/fuentes-pago/.
const Inter_Reactivar = localFont({
  src: [{ path: '../../../../_fuentes/inter/inter-latin-wght-normal.woff2', weight: '100 900' }],
  declarations: [{ prop: 'font-family', value: "'Inter'" }],
  adjustFontFallback: false,
  variable: '--font-inter-reactivar',
});

export const variableInter = Inter_Reactivar.variable;
