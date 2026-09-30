// Interruptor único del cierre de Tentare Network (29-sep-2026, decisión del
// fundador): con `true`, /network/acceso y el paso «Tu cuenta» de
// /network/crear-perfil (quien llega sin sesión) enseñan el aviso de
// mantenimiento en vez del login y del alta. El resto de Network —
// marketplace público, perfiles publicados, el asistente de quien ya tiene
// sesión— no depende de esto.
//
// Es temporal y reversible: la lógica de las dos puertas sigue compilando
// detrás del interruptor (app/network/acceso/formulario-acceso.tsx y
// <PasoCuenta> en crear-perfil), así que reabrir es poner `false` aquí.
// Las dos van juntas a propósito: el alta con Google vuelve a
// /network/acceso para resolver la cuenta, así que abrir solo una deja la
// otra a medias.
//
// Los tests e2e del formulario de acceso
// (e2e/network-software-separacion.spec.ts) se saltan mientras esto sea
// `true` y vuelven a correr solos al reabrir.
export const ACCESO_NETWORK_EN_MANTENIMIENTO = true;
