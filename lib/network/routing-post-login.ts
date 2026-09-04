// Decisión de "a dónde mando a esta cuenta tras iniciar sesión" — pura, sin
// imports de Next.js, para poder probarla con node --test sin mockear
// NextRequest/Supabase (ver routing-post-login.test.ts). El único caller
// real es app/api/auth/destino-post-login/route.ts, que resuelve los datos
// que hacen falta (verificarSesionStaff, red_perfiles.estado) y le pasa el
// resultado — la lógica de "a quién le pregunto" vive ahí, la de "qué hago
// con la respuesta" vive aquí.

/** Lo que hay realmente detrás de una auth_user_id, sin mirar por dónde entró. */
export interface CuentaInfo {
  tieneEstudio: boolean;
  estadoPerfilNetwork: string | null;
  /** F0: tercera vía, perfil de alumna en `red_perfiles_alumna` — independiente
   *  del de instructora, una identidad puede tener los dos a la vez. */
  estadoPerfilNetworkAlumna: string | null;
}

/**
 * Resolución SIN GATE por producto: "esta identidad, ¿a dónde pertenece de
 * verdad?" — para el ÚNICO caso donde eso es lo correcto: recuperación de
 * contraseña (/clave-nueva). Ahí no se está "entrando en Software" ni "en
 * Network", se está demostrando que se controla el correo; una vez hecho eso,
 * lo honesto es mandar a la persona a donde de verdad tiene algo, sea cual sea
 * el producto — no bloquearla con el mensaje de "esta cuenta es de otro
 * producto", que aquí no aplica.
 */
export function resolverDestinoPostLogin(
  tieneEstudio: boolean,
  estadoPerfilNetwork: string | null,
  estadoPerfilNetworkAlumna: string | null = null,
): string {
  if (tieneEstudio) return '/dashboard';
  // 'hidden' es un perfil que en algún momento estuvo completo y publicado
  // (único origen real: el botón "Ocultar perfil" de /network/mi-perfil, que
  // solo aparece con estado 'published') — mandarlo al wizard "Hola de
  // nuevo, sigamos donde lo dejaste" hace que una instructora con el perfil
  // ya hecho sienta que tiene que rellenarlo todo otra vez. Va a inicio,
  // igual que published/en_revision; desde ahí llega a mi-perfil, que ya
  // sabe pintar el aviso de "oculto" con su botón de reactivar.
  if (estadoPerfilNetwork === 'published' || estadoPerfilNetwork === 'en_revision' || estadoPerfilNetwork === 'hidden') return '/network/inicio';
  if (estadoPerfilNetwork !== null) return '/network/reanudar';
  // Sin nada de instructora: mira alumna antes de asumir "reanudar" (que es
  // destino de instructora) — mismo criterio que la rama de instructora.
  if (estadoPerfilNetworkAlumna === 'published') return '/network/alumna/inicio';
  if (estadoPerfilNetworkAlumna !== null) return '/network/alumna/reanudar';
  return '/network/reanudar';
}

export type Producto = 'software' | 'network' | 'network-alumna';

export type ResultadoAcceso =
  | { tipo: 'entra'; destino: string }
  /** Autenticó bien, pero esta identidad no tiene NADA en el producto por el
   *  que está entrando — sí tiene algo en el otro. Nunca se le concede acceso
   *  ni se le redirige en silencio al otro producto: se le dice la verdad. */
  | { tipo: 'cuenta-de-otro-producto' }
  /** No tiene nada en NINGÚN producto — cuenta recién creada de verdad, o el
   *  alta pendiente de este mismo intento todavía no se ha materializado. La
   *  página que llama decide qué hacer (seguir el onboarding propio). */
  | { tipo: 'cuenta-nueva' };

/**
 * Resolución CON GATE por producto — la que usan /login y /network/acceso.
 * El contexto (qué página se está usando) es un dato de ENTRADA, no algo que
 * se adivina de la cuenta: es la regla central de todo este cambio ("el
 * contexto determina el producto, no la identidad").
 *
 * Una identidad con VARIAS cosas a la vez (self-claim instructora+estudio, o
 * instructora+alumna, o las tres) entra a cada una sin bloqueo — eso es justo
 * lo que el self-claim existe para permitir. Lo que se bloquea es la cuenta
 * que NO tiene nada en el producto por el que intenta entrar.
 */
export function resolverAccesoPorProducto(producto: Producto, cuenta: CuentaInfo): ResultadoAcceso {
  const tieneSoftware = cuenta.tieneEstudio;
  const tieneNetwork = cuenta.estadoPerfilNetwork !== null;
  const tieneNetworkAlumna = cuenta.estadoPerfilNetworkAlumna !== null;

  if (producto === 'software') {
    if (tieneSoftware) return { tipo: 'entra', destino: '/dashboard' };
    if (tieneNetwork || tieneNetworkAlumna) return { tipo: 'cuenta-de-otro-producto' };
    return { tipo: 'cuenta-nueva' };
  }

  if (producto === 'network') {
    if (tieneNetwork) {
      return {
        tipo: 'entra',
        // Mismo criterio que resolverDestinoPostLogin: 'en_revision' es
        // wizard TERMINADO esperando aprobación, y 'hidden' es un perfil que
        // ya estuvo completo y se ocultó a mano — las dos van a inicio, no
        // al wizard de reanudar.
        destino: cuenta.estadoPerfilNetwork === 'published' || cuenta.estadoPerfilNetwork === 'en_revision' || cuenta.estadoPerfilNetwork === 'hidden'
          ? '/network/inicio' : '/network/reanudar',
      };
    }
    if (tieneSoftware || tieneNetworkAlumna) return { tipo: 'cuenta-de-otro-producto' };
    return { tipo: 'cuenta-nueva' };
  }

  // producto === 'network-alumna'
  if (tieneNetworkAlumna) {
    return {
      tipo: 'entra',
      destino: cuenta.estadoPerfilNetworkAlumna === 'published'
        ? '/network/alumna/inicio' : '/network/alumna/reanudar',
    };
  }
  if (tieneSoftware || tieneNetwork) return { tipo: 'cuenta-de-otro-producto' };
  return { tipo: 'cuenta-nueva' };
}
