// Catálogo de permisos (scopes) de la API pública de Tentare.
//
// Es el MISMO catálogo para las dos credenciales que abren la API: los tokens
// OAuth de una app (Zapier) y las claves de API de un estudio. Vive aparte de
// `lib/oauth-crypto.ts` (que lo reexporta) porque aquel importa `crypto` de
// Node y este lo necesita también el panel, para pintar qué puede leer cada
// clave.
//
// `pagos:escribir` no existe a propósito: el dinero nunca se mueve desde fuera
// (docs/oauth-arquitectura.md).

export const SCOPES_VALIDOS = [
  'clientas:leer',
  'clientas:escribir',
  'clientas:datos_fiscales',
  'reservas:leer',
  'reservas:escribir',
  'pagos:leer',
  'facturas:leer',
  'planes:leer',
  'instructores:leer',
  'notas:leer',
  'notas:escribir',
  'tareas:leer',
  'tareas:escribir',
  'leads:leer',
  'leads:escribir',
] as const;
export type ScopeOAuth = (typeof SCOPES_VALIDOS)[number];

export function scopesValidos(scopes: string[]): scopes is ScopeOAuth[] {
  return scopes.length > 0 && scopes.every(s => (SCOPES_VALIDOS as readonly string[]).includes(s));
}

// Descripción en español para la pantalla de consentimiento y para el panel.
export const DESCRIPCION_SCOPE: Record<ScopeOAuth, string> = {
  'clientas:leer': 'Leer tus clientas (nombre y contacto)',
  'clientas:escribir': 'Crear y editar clientas',
  'clientas:datos_fiscales': 'Leer el NIF y la dirección de tus clientas',
  'reservas:leer': 'Leer tus reservas',
  'reservas:escribir': 'Crear y cancelar reservas',
  'pagos:leer': 'Leer tus cobros, devoluciones y ventas de la caja',
  'facturas:leer': 'Leer tus facturas (con el nombre y el NIF de quien las recibe)',
  'planes:leer': 'Leer los planes y bonos de tus clientas y tu catálogo de tarifas',
  'instructores:leer': 'Leer tu equipo de instructoras',
  'notas:leer': 'Leer notas operativas',
  'notas:escribir': 'Crear notas operativas',
  'tareas:leer': 'Leer tareas',
  'tareas:escribir': 'Crear tareas',
  'leads:leer': 'Leer tus leads',
  'leads:escribir': 'Crear leads',
};

/**
 * Los scopes que dan acceso a dinero. Solo los concede quien puede VER las
 * finanzas del estudio (`puedeVerFinanzas`).
 */
export const SCOPES_FINANCIEROS: readonly ScopeOAuth[] = ['pagos:leer', 'facturas:leer'];

/**
 * Los scopes con datos PRIVADOS de la clienta (NIF, dirección). Solo los
 * concede quien puede verlos en el panel (`puedeVerDatosPrivadosSocia`).
 */
export const SCOPES_DATOS_PRIVADOS: readonly ScopeOAuth[] = ['clientas:datos_fiscales'];

/**
 * Lo que necesita un programa de contabilidad. Es el conjunto que el panel
 * propone por defecto al crear una clave «para tu contabilidad».
 */
export const SCOPES_CONTABILIDAD: readonly ScopeOAuth[] = [
  'clientas:leer', 'clientas:datos_fiscales', 'pagos:leer', 'facturas:leer', 'planes:leer',
];
