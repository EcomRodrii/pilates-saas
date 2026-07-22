// Kisi — control de acceso. Cada estudio pega su PROPIA clave API de Kisi
// (su propia cuenta, sus propias cerraduras) en Configuración → Integraciones
// — no hay cuenta compartida de plataforma. Kisi no ofrece OAuth de
// aplicación de terceros para esto, solo claves API generadas a mano desde
// el panel del propio negocio, así que el flujo de pegar-y-guardar es el
// correcto (mismo mecanismo que Resend hoy: tabla `integraciones` por
// estudio, ver dbUpsertIntegracion).

const BASE = 'https://api.kisi.io';

export interface KisiCredenciales {
  apiKey: string;
}

function headers(creds: KisiCredenciales): HeadersInit {
  return { Authorization: `KISI-LOGIN ${creds.apiKey}`, 'Content-Type': 'application/json' };
}

/** Abre (desbloquea) una cerradura por su id, con la clave del estudio dueño de esa cerradura. */
export async function abrirPuertaKisi(creds: KisiCredenciales, lockId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE}/locks/${encodeURIComponent(lockId)}/unlock`, { method: 'POST', headers: headers(creds) });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: data?.error ?? `Kisi API ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function probarKisi(creds: KisiCredenciales): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE}/locks?limit=1`, { headers: headers(creds) });
    return res.ok ? { ok: true } : { ok: false, error: `Kisi API ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
