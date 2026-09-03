'use client';

// La sesión de la alumna en la Student PWA.
//
// Se REUTILIZA `useSesionWidget` en vez de clonarlo. Fue escrito para el bundle
// embebible, pero hace exactamente lo que hace falta aquí y —lo que importa—
// no llama a `useStudio()`: bootea la sesión leyendo `supabasePortal` y
// resolviendo la socia con `POST /api/public/session`, y se resuscribe a
// `onAuthStateChange`. Su `baseUrl` por defecto es `''`, que en mismo origen es
// justo lo que queremos.
//
// El hermano mayor, `lib/use-socia-session.ts`, NO sirve: depende de
// `useStudio()` y por tanto exige montar el god-context de 4.973 líneas que
// esta app evita a propósito.
//
// Se reexporta desde aquí para que las pantallas no importen de `lib/widget/`:
// el día que los dos caminos diverjan, se cambia este fichero y nada más.
export { useSesionWidget as useSesionStudent } from '@/lib/widget/usar-sesion-widget';
export type { SociaSesion } from '@/lib/use-socia-session';
