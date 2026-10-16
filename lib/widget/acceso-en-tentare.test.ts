import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// El widget sin marco NO hace el acceso en la web del estudio (16-oct-2026).
//
// La site key de Turnstile solo da token en tentare.app: en la web de un
// estudio contesta 110200 («dominio no autorizado»), y sin token gotrue rechaza
// todo acceso, porque el captcha se exige a nivel de PROYECTO. Con el acceso
// dentro del bundle nadie podía entrar ni darse de alta desde la nativa en
// ninguna web, y ningún test lo veía: los e2e no pasan por Cloudflare.
//
// Ahora el acceso lo hace la ventana de Tentare (app/widget-auth-retorno).
// Esta guardia falla si el bundle vuelve a llamar a gotrue para entrar o a
// cargar Turnstile, y si alguien manda un mensaje con tokens a `'*'`.
// ─────────────────────────────────────────────────────────────────────────────

const raiz = path.resolve(import.meta.dirname, '../..');

function ficherosDe(dir: string): string[] {
  const abs = path.join(raiz, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name))
    .map((e) => path.relative(raiz, path.join(e.parentPath, e.name)));
}

// Lo que corre en la web del estudio: el bundle y lo suyo.
const DEL_BUNDLE = [...ficherosDe('app/widget-bundle'), ...ficherosDe('components/widget'), ...ficherosDe('lib/widget')];

const ACCESO_A_GOTRUE = /\.(signInWithPassword|signInWithOtp|signUp|signInAnonymously|resetPasswordForEmail)\s*\(/;
const CAPTCHA = /challenges\.cloudflare\.com|useCaptcha\b|turnstile-widget|turnstile-shadow/;

test('el bundle de la nativa no llama a gotrue para entrar (sin captcha posible en la web del estudio)', () => {
  assert.ok(DEL_BUNDLE.length > 5, 'la guardia no encuentra los ficheros del bundle: ¿se han movido?');
  const conAcceso = DEL_BUNDLE.filter((f) => ACCESO_A_GOTRUE.test(fs.readFileSync(path.join(raiz, f), 'utf8')));
  assert.deepEqual(conAcceso, [], 'El acceso va por la ventana de Tentare (useAuthWidget().acceder), nunca desde la web del estudio.');
});

test('el bundle de la nativa no carga Turnstile', () => {
  const conCaptcha = DEL_BUNDLE.filter((f) => CAPTCHA.test(fs.readFileSync(path.join(raiz, f), 'utf8')));
  assert.deepEqual(conCaptcha, [], 'En la web del estudio Turnstile contesta 110200: el captcha va en app/widget-auth-retorno.');
});

test('la ventana del puente hace el acceso con captcha y la contraseña con un cliente sin almacenamiento', () => {
  const cliente = fs.readFileSync(path.join(raiz, 'app/widget-auth-retorno/cliente.tsx'), 'utf8');
  assert.match(cliente, /useCaptcha\(\)/);
  assert.match(cliente, /clienteEfimero\(\)\.signInWithPassword\(/);
  assert.doesNotMatch(cliente, /supabasePortal\.auth\.signInWithPassword\(/,
    'La sesión de la contraseña no se guarda en tentare.app: dos dueños del mismo refresh token se lo revocan al rotarlo.');
  assert.match(cliente, /persistSession:\s*false/);
});

test('ningún mensaje del acceso del widget se manda a cualquier origen', () => {
  for (const f of ['app/widget-auth-retorno/cliente.tsx', 'lib/widget/usar-auth-widget.ts']) {
    const src = fs.readFileSync(path.join(raiz, f), 'utf8');
    assert.ok(/postMessage\(/.test(src), `${f} debería hablar por postMessage`);
    assert.doesNotMatch(src, /postMessage\([^)]*['"]\*['"]/, `${f}: postMessage con '*'`);
  }
});
