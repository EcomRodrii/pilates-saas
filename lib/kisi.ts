// Kisi — control de acceso (integración de plataforma).
// ENV del operador: KISI_API_KEY. Opcional KISI_LOCK_ID por defecto.
// Nota: mapear puertas a estudios/salas concretas es un paso posterior; aquí
// queda el cliente listo (abrir puerta, listar cerraduras) y la comprobación.

const API_KEY = process.env.KISI_API_KEY;
const BASE = 'https://api.kisi.io';

export function isKisiConfigurado(): boolean {
  return !!API_KEY;
}

function headers(): HeadersInit {
  return { Authorization: `KISI-LOGIN ${API_KEY}`, 'Content-Type': 'application/json' };
}

/** Abre (desbloquea) una cerradura por su id. */
export async function abrirPuertaKisi(lockId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isKisiConfigurado()) return { ok: false, error: 'Kisi no configurado (falta KISI_API_KEY)' };
  try {
    const res = await fetch(`${BASE}/locks/${encodeURIComponent(lockId)}/unlock`, { method: 'POST', headers: headers() });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: data?.error ?? `Kisi API ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function probarKisi(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isKisiConfigurado()) return { ok: false, error: 'Falta KISI_API_KEY' };
  try {
    const res = await fetch(`${BASE}/locks?limit=1`, { headers: headers() });
    return res.ok ? { ok: true } : { ok: false, error: `Kisi API ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
