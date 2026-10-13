import type { Tablas } from './backend.ts';

// El estudio de la demo: «Estudio Aurora», ficticio de arriba abajo (correo
// @example.com, teléfono de relleno, sin ninguna alumna real). Arranca como lo
// haría uno recién creado —con el nombre y poco más— para que el vídeo vaya
// rellenándolo sección a sección.
//
// ⚠️ NUNCA el estudio real ni el de ningún cliente: el id es el del andamiaje de
// e2e (`studio-test`), que no existe en ninguna base de datos.

const ID = 'studio-test';

export const TABLAS_DEMO: Tablas = {
  studios: [{
    id: ID,
    nombre: 'Estudio Aurora',
    slug: 'estudio-aurora',
    owner_auth_user_id: 'auth-e2e-duena',
    email: 'hola@example.com',
    moneda: 'EUR',
    iva_por_defecto: 21,
    nif: null,
    plan: 'ESTUDIO',
    subscription_status: 'active',
    direccion: null,
    ciudad: null,
    codigo_postal: null,
    telefono: null,
    sitio_web: null,
    visible_en_network: false,
    avisar_alumnas: false,
  }],
  // Sin horario ni cierres ni tipos: lo que el vídeo va a dar de alta.
  studio_horario: [],
  cierres_estudio: [],
  salas: [],
  tipos_clase: [],
};
