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
    // Worker do pdf.js copiado como asset estático (ver script
    // `sync-pdf-worker`) -- minificado de terceiros, não é código-fonte
    // do projeto.
    "public/pdf.worker.min.mjs",
    // Iteração 35: scripts de verificação/teste sintético (rodados via
    // `npx tsx`/`node`, fora do bundle Next.js) -- usam `require()` estilo
    // Node comum em scripts standalone, não a convenção ESM do resto do
    // app.
    "scripts/**",
  ]),
]);

export default eslintConfig;
