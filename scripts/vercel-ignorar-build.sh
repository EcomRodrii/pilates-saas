#!/bin/sh
# ignoreCommand de Vercel: exit 0 = saltar el build, exit 1 = construir.
# Vive aquí y no en vercel.json porque Vercel limita ese campo a 256 caracteres.
#
# - Preview: siempre se salta (el CI ya construye).
# - Producción con un commit MÁS NUEVO ya en main: se salta. Ese build iba a
#   quedar obsoleto en minutos; el siguiente compara contra el último SHA
#   desplegado (VERCEL_GIT_PREVIOUS_SHA), así que incluye estos cambios. Si no
#   se puede preguntar a GitHub, se construye (nunca se salta a ciegas).
# - Sin commit previo desplegado: se construye.
# - Solo cambian rutas que no alteran lo que se construye: se salta. Un build de
#   producción es el 94 % de la factura de Vercel, así que cada uno cuenta.
#   El `lib/db-types.ts` que acompaña a una migración SÍ dispara el build.
if [ "$VERCEL_ENV" = "preview" ]; then exit 0; fi
if [ "$VERCEL_ENV" = "production" ] && [ -n "$VERCEL_GIT_COMMIT_SHA" ]; then
  ULTIMO=$(git ls-remote "https://github.com/${VERCEL_GIT_REPO_OWNER:-EcomRodrii}/${VERCEL_GIT_REPO_SLUG:-pilates-saas}.git" "refs/heads/${VERCEL_GIT_COMMIT_REF:-main}" 2>/dev/null | cut -f1)
  if [ -n "$ULTIMO" ] && [ "$ULTIMO" != "$VERCEL_GIT_COMMIT_SHA" ]; then
    echo "Hay un commit más nuevo en ${VERCEL_GIT_COMMIT_REF:-main} ($ULTIMO): se salta este build."
    exit 0
  fi
fi
if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then exit 1; fi
if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- \
  ':!docs/**' ':!**/*.md' ':!e2e/**' ':!**/*.test.ts' \
  ':!supabase/**' ':!.github/**' ':!.claude/**' \
  ':!ios/**' ':!capturas/**'; then exit 0; fi
exit 1
