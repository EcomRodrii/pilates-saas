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
//
// Qué cierra el SERVIDOR y qué no. El login y el registro los hace el navegador
// contra el servicio de autenticación (`signIn`/`signUp`/Google de
// `lib/auth-context.tsx`), no una ruta de la app: desde aquí no se pueden cerrar,
// y el cierre de esas dos pantallas es solo de interfaz. Lo que sí es de servidor
// es CREAR un perfil nuevo (`PUT /api/network/perfil` sin perfil previo), que
// devuelve 503 con el mismo aviso: sin eso, cualquiera con una cuenta podía saltarse
// la pantalla y crearlo llamando a la ruta. Editar el perfil que ya existe
// (borrador o publicado) sigue funcionando: cerrarlo dejaría perfiles a medias sin
// forma de completarse.
//
// ⚠️ Lo que NO cierra: el INSERT directo contra la base de datos con la clave
// pública y una sesión (la política `red_perfiles_insert_propio` y los grants por
// columna siguen abiertos). Esta constante es de aplicación y la RLS no la lee.
// Ninguna pantalla de la app inserta así, pero quien sepa hacerlo puede. Cerrarlo
// del todo es una migración (y reabrir, otra): decisión aparte, no incluida aquí.
export const ACCESO_NETWORK_EN_MANTENIMIENTO = true;

// Los avisos, en un solo sitio: los enseñan las dos pantallas y el servidor.
export const MENSAJE_ACCESO_NETWORK_CERRADO =
  'El acceso a Tentare Network está temporalmente cerrado. Vuelve a intentarlo más tarde.';
export const MENSAJE_ALTA_NETWORK_CERRADA =
  'La creación de perfiles nuevos en Tentare Network está temporalmente cerrada. Vuelve a intentarlo más tarde.';
