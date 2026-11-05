// El nombre de «Iniciar sesión con Apple», y cómo se reutiliza sin volver a pedirlo.
//
// Apple da el nombre SOLO la primera vez que una cuenta autoriza la app, y lo
// da por el mismo canal que el token (`ASAuthorizationAppleIDCredential.fullName`).
// La revisión de Apple (4.0 Design, Sign in with Apple) rechaza una app que lo
// vuelve a pedir después: el nombre se guarda en la cuenta al entrar
// (`components/nativo/BotonApple.tsx`) y las pantallas de alta lo leen de ahí.
//
// Funciones puras y sin imports, para que el test (`nombre-apple.test.ts`) las
// ejecute sin cargar el cliente de Supabase.

interface NombreApple {
  pila: string | null;
  apellidos: string | null;
}

/** Nombre completo que trae Apple, o `null` si no trae nada útil. */
export function nombreDeApple(nombre: NombreApple | undefined): string | null {
  const texto = [nombre?.pila, nombre?.apellidos]
    .map((parte) => (parte ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return texto || null;
}

/** El `nombre` guardado en la cuenta (`user_metadata.nombre`), si es un texto con contenido. */
export function nombreGuardado(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio || null;
}
