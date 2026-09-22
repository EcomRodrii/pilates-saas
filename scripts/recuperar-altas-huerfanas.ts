/**
 * Recupera altas que se quedaron a medias: la cuenta existe (email
 * confirmado o no), pero `dbCreateStudio` nunca llegó a crear el estudio.
 *
 * Contexto (auditoría de embudo, 22-sep-2026): de 38 cuentas en `auth.users`,
 * 26 no tienen NINGÚN estudio/ficha. De esas, 13 ni siquiera confirmaron el
 * email (abandono normal), pero las otras 13 SÍ lo confirmaron (hueco real de
 * 15-30 s entre el envío y la confirmación) y aun así no tienen estudio — ese
 * es el fallo real: `dbCreateStudio` falló justo después de verificar, y la
 * única recuperación dependía de que la persona leyera el aviso y volviera a
 * entrar sola. `app/crear-estudio/page.tsx` ya tiene un botón «Reintentar»
 * para que esto no vuelva a pasar hacia delante; este script es la
 * recuperación hacia atrás, para las cuentas que ya se quedaron así.
 *
 * Encuentra cuentas con `user_metadata.pending_studio` (los datos que
 * `/crear-estudio` guarda ANTES de confirmar el email — ver el comentario de
 * cabecera de esa pantalla) que no tengan ya un estudio con
 * `owner_auth_user_id` = su id, y les crea el estudio con el MISMO id
 * determinista que usaría `dbCreateStudio` (`idEstudioDe`) — así que si por
 * lo que sea el usuario ya lo hubiera completado por otra vía justo antes de
 * correr esto, choca por clave primaria y no se duplica nada.
 *
 * Por defecto es UN VOLCADO, no escribe nada. Con `--ejecutar` sí crea los
 * estudios de verdad y limpia `pending_studio` de la cuenta (mismo paso final
 * que hace `app/login/page.tsx` tras una alta que sí se completó sola).
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/recuperar-altas-huerfanas.ts
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/recuperar-altas-huerfanas.ts --ejecutar
 *
 * No hace falta pasar nada más: recorre TODAS las cuentas huérfanas que
 * encuentre. Para probarlo contra una sola persona, usa `--email=` (opcional).
 */
import { createClient } from '@supabase/supabase-js';
import { idEstudioDe } from '../lib/id-estudio.ts';
import { RESERVADAS as SLUGS_RESERVADOS } from '../lib/slug.ts';

// `slugify` vive en supabase-data.ts (junto a `generateUniqueSlug`, que este
// script no puede reusar tal cual: está atado al cliente de navegador de
// `lib/db/supabase.ts`, con RLS de `authenticated` — aquí hace falta el
// cliente admin). La función en sí es pura, sin más dependencia que esta.
function slugify(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'estudio';
}

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const EJECUTAR = process.argv.includes('--ejecutar');
const soloEmailArg = process.argv.find((a) => a.startsWith('--email='));
const soloEmail = soloEmailArg ? soloEmailArg.slice('--email='.length).toLowerCase() : null;

const admin = createClient(URL, KEY, { auth: { persistSession: false } });

interface PendingStudio {
  nombre: string;
  ciudad?: string;
  telefono?: string;
  comoNosConocio?: string;
  plan?: 'BASE' | 'ESTUDIO' | 'CADENA';
}

// Mismo candidato + reintento por sufijo que `generateUniqueSlug` en
// lib/supabase-data.ts, pero contra la RPC vía cliente admin (SECURITY
// DEFINER: da igual el rol que la llame).
async function slugUnico(nombre: string): Promise<string> {
  const base = slugify(nombre);
  let candidate = base;
  let n = 2;
  for (let intentos = 0; intentos < 60; intentos++) {
    const reservado = SLUGS_RESERVADOS.has(candidate);
    const { data, error } = reservado
      ? { data: false, error: null }
      : await admin.rpc('slug_estudio_disponible', { p_slug: candidate });
    if (error) break;
    if (data === true) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

async function crearEstudioComoAdmin(userId: string, pending: PendingStudio) {
  const id = idEstudioDe(userId, pending.nombre);
  for (let intento = 0; intento < 8; intento++) {
    const slug = await slugUnico(pending.nombre);
    const { error } = await admin.from('studios').insert({
      id,
      nombre: pending.nombre,
      ciudad: pending.ciudad ?? null,
      telefono: pending.telefono ?? null,
      plan: pending.plan ?? 'BASE',
      owner_auth_user_id: userId,
      slug,
      como_nos_conocio: pending.comoNosConocio || null,
    });
    if (!error) return { id, slug };
    if (error.code === '23505' && error.message.includes('studios_pkey')) {
      // Ya existe (alguien lo completó por otra vía justo antes de correr
      // esto). No es un fallo — se trata como éxito, nada que crear.
      return { id, slug: null, yaExistia: true };
    }
    if (error.code === '23505' && error.message.includes('studios_slug_key')) continue;
    if (error.code === '23503' && error.message.includes('studios_owner_auth_user_id_fkey')) {
      await new Promise((r) => setTimeout(r, Math.min(1000, 250 * 2 ** intento)));
      continue;
    }
    throw error;
  }
  throw new Error('No se pudo crear tras varios intentos (probablemente un fallo real de la BD, no una carrera esperada).');
}

async function main() {
  console.log(EJECUTAR ? '⚠️  MODO EJECUCIÓN: esto va a escribir en la base de datos.' : 'Modo volcado (dry-run) — nada se escribe. Repite con --ejecutar para aplicar.');
  console.log('');

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) { console.error('No se pudo listar auth.users:', error.message); process.exit(1); }

  const candidatos = data.users.filter((u) => {
    const pending = u.user_metadata?.pending_studio;
    if (!pending || typeof pending !== 'object' || !pending.nombre) return false;
    if (soloEmail && u.email?.toLowerCase() !== soloEmail) return false;
    return true;
  });

  if (candidatos.length === 0) {
    console.log('Ninguna cuenta con pending_studio pendiente. Nada que hacer.');
    return;
  }

  console.log(`${candidatos.length} cuenta(s) con alta a medias:\n`);

  let creados = 0;
  let yaExistian = 0;
  let fallidos = 0;

  for (const u of candidatos) {
    const pending = u.user_metadata.pending_studio as PendingStudio;
    // Por si acaso: comprobar que de verdad no tiene ya un estudio (podría
    // tener pending_studio sin limpiar aunque el suyo se creara con otro
    // nombre en otro momento — no debería pasar, pero mejor no crear un
    // segundo estudio a alguien que ya tiene uno).
    const { data: existentes } = await admin.from('studios').select('id, slug').eq('owner_auth_user_id', u.id);
    if (existentes && existentes.length > 0) {
      console.log(`· ${u.email} — YA tiene estudio (${existentes[0].slug}); solo limpio la metadata.`);
      if (EJECUTAR) {
        await admin.auth.admin.updateUserById(u.id, { user_metadata: { ...u.user_metadata, pending_studio: null } });
      }
      continue;
    }

    const diasDesdeAlta = Math.round((Date.now() - new Date(u.created_at).getTime()) / 86_400_000);
    console.log(`· ${u.email} — «${pending.nombre}» (plan ${pending.plan ?? 'BASE'}), cuenta creada hace ${diasDesdeAlta} días, email ${u.email_confirmed_at ? 'confirmado' : 'SIN confirmar'}.`);

    if (!EJECUTAR) continue;

    try {
      const r = await crearEstudioComoAdmin(u.id, pending);
      await admin.auth.admin.updateUserById(u.id, { user_metadata: { ...u.user_metadata, pending_studio: null } });
      if (r.yaExistia) { yaExistian++; console.log(`  → ya existía, metadata limpiada.`); }
      else { creados++; console.log(`  → creado: tentare.app/${r.slug}`); }
    } catch (e) {
      fallidos++;
      console.error(`  → FALLÓ:`, e instanceof Error ? e.message : e);
    }
  }

  console.log('');
  if (EJECUTAR) {
    console.log(`Hecho. Creados: ${creados} · Ya existían: ${yaExistian} · Fallidos: ${fallidos}.`);
  } else {
    console.log('Esto era un volcado. Repite con --ejecutar para crear los estudios de verdad.');
  }
}

main();
