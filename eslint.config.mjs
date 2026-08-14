import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Feature-freeze (lib/frozen-features.ts, docs/FEATURE-FREEZE-2026-07.md):
    // los `*.frozen.tsx` están APARCADOS a propósito y no entran en ningún
    // build — `app/kiosk/` ni siquiera tiene stub, da 404 natural. Lintarlos
    // solo produce ruido sobre código que nadie ejecuta, y "arreglarlo"
    // significaría editar ficheros congelados, que es justo lo que la
    // congelación pide no hacer. Si algún día se reactivan (renombrando a
    // page.tsx), vuelven a entrar en el lint solos.
    "**/*.frozen.tsx",
    "**/*.frozen.ts",
    // Generado por scripts/build-widget-bundle.mjs (esbuild, minificado) —
    // no es código fuente, es exactamente lo mismo que `.next/**` de arriba
    // pero para el bundle embebible.
    "public/widget.js",
  ]),
  {
    // `no-unused-vars` sin opciones marca como deuda dos idiomas que este repo
    // usa a propósito para decir "esto sobra AQUÍ", que es justo lo contrario:
    //
    //   const { id: _i, studioId: _s, ...esperado } = guardado;  // omitir claves
    //   catch { }                                                // el error da igual
    //
    // `ignoreRestSiblings` es además el valor por defecto de la regla base de
    // eslint; aquí se había perdido al no pasar opciones. Declararlo no es
    // relajar nada: lo que sí lo sería es dejar 200 avisos y que nadie los mire.
    // El prefijo `_` queda como la única forma de callar la regla, y se ve.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  {
    // `any` en pruebas: los dobles de test son parciales a propósito. Un mock
    // de PostgREST o de `page.route` tipado al milímetro no aporta seguridad
    // —el objeto real nunca pasa por ahí— y sí obliga a inventar interfaces
    // que solo existen para el test. 49 de los 53 `any` del repo vivían aquí.
    //
    // ⚠️ Esto NO afecta a código de producción: allí `no-explicit-any` sigue
    // siendo error, y los 4 que había se han tipado de verdad.
    files: ["e2e/**/*.ts", "e2e/**/*.tsx", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Aquí vivía el bloque que bajaba a "warn" 5 reglas de react-hooks
  // (`set-state-in-effect`, `purity`, `refs`, `preserve-manual-memoization`,
  // `immutability`) mientras se saldaba la deuda con la que llegaron. Su propio
  // comentario decía "al llegar a 0, borrar este bloque entero — no relajarlo
  // más", y eso es lo que se ha hecho: vuelven a su severidad por defecto, que
  // es error. Con el contador a 0 y el `--max-warnings 0` del workflow, ni un
  // aviso nuevo puede volver a acumularse sin que alguien lo vea.
]);

export default eslintConfig;
