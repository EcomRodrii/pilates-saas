// Lo que queda de la integración con Gmail: desconectarla.
//
// Gmail servía solo para traer los contactos de la dueña como clientas nuevas
// (ningún correo a una alumna salía por Gmail). Se retiró el 1-oct-2026: volcar
// la agenda personal en la base de clientas choca con «las interesadas viven en
// consultas, no en fichas» y es difícil de justificar por minimización de datos.
// Nadie puede conectarla ya; quien la tenía conectada la ve en Configuración
// para desconectarla, y eso borra la credencial (`integracion_credenciales`,
// provider='gmail') y revoca el permiso en Google salvo que Calendar esté en la
// misma cuenta (lib/integraciones/desconectar-gmail.ts).

import { fetchExterno } from '@/lib/fetch-externo';

const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// Al desconectar, no basta con borrar la fila local — mismo motivo que
// lib/google-calendar.ts. Best-effort: no bloquea la desconexión local.
export async function revocarToken(token: string): Promise<void> {
  try {
    await fetchExterno(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  } catch (e) {
    console.error('[gmail] revocarToken:', e instanceof Error ? e.message : e);
  }
}
