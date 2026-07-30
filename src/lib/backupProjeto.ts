/**
 * backupProjeto.ts
 * -----------------------------------------------------------------------
 * Exportar/importar projeto como arquivo .json (Iteração 45 -- melhoria
 * sugerida e aceita pelo usuário: "quero avisos fáceis e limpos, foque na
 * experiência do usuário"). O autosave e o salvamento na nuvem já cobrem a
 * maior parte dos casos, mas como o Beta vai ser divulgado publicamente
 * (grupos de projetistas/eletricistas), um backup manual em arquivo dá
 * uma segurança extra: mesmo que algo dê errado com a conta ou com a
 * nuvem, o usuário tem uma cópia independente no próprio computador.
 *
 * Formato do arquivo: o `Projeto` inteiro, em JSON legível (2 espaços de
 * indentação) -- o mesmo formato que `lib/firebase.ts#salvarProjeto`
 * grava no Firestore, então um arquivo exportado pode ser recarregado
 * tanto aqui (import) quanto, em teoria, inspecionado manualmente.
 * -----------------------------------------------------------------------
 */

import type { Projeto } from "./types";

/**
 * Gera e dispara o download de um arquivo `.json` com o projeto atual.
 * Roda só no navegador (usa `Blob`/`URL.createObjectURL`) -- nunca é
 * chamada durante SSR.
 */
export function exportarProjetoParaArquivo(projeto: Projeto): void {
  // Mesma sanitização de `salvarProjeto`: nunca persiste `objectUrl` (é um
  // Blob URL válido só nesta sessão do navegador, não faz sentido num
  // arquivo pra abrir depois/noutro dispositivo).
  const payload: Projeto = {
    ...projeto,
    xrefs: projeto.xrefs.map((x) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { objectUrl, ...resto } = x;
      return resto;
    }),
  };

  const conteudo = JSON.stringify(payload, null, 2);
  const blob = new Blob([conteudo], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const nomeArquivo = `${(projeto.nome || "projeto-cad-rd").trim() || "projeto-cad-rd"}.cadrd.json`;
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  // Precisa estar no DOM pro `.click()` funcionar em todos os navegadores
  // (alguns ignoram cliques sintéticos em elementos "soltos").
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Lê e valida um arquivo `.json` de backup, devolvendo o `Projeto` pronto
 * pra passar pro `carregarProjeto` do store (que já cuida de migrar
 * formatos antigos -- ver `store.ts`). Validação propositalmente MÍNIMA
 * (só o suficiente pra rejeitar um arquivo claramente errado, ex.: uma
 * imagem ou um .json de outro programa) -- o resto das inconsistências
 * (campos legados/ausentes) já são tratadas pela própria migração do
 * `carregarProjeto`, então duplicar validação aqui só aumentaria a chance
 * de rejeitar por engano um backup antigo válido.
 */
export async function importarProjetoDeArquivo(arquivo: File): Promise<{ ok: boolean; projeto?: Projeto; erro?: string }> {
  if (!arquivo.name.toLowerCase().endsWith(".json")) {
    return { ok: false, erro: "Escolha um arquivo .json (exportado pelo próprio Cad RD)." };
  }

  let texto: string;
  try {
    texto = await arquivo.text();
  } catch {
    return { ok: false, erro: "Não foi possível ler o arquivo." };
  }

  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "Este arquivo não é um JSON válido." };
  }

  if (
    typeof dados !== "object" ||
    dados === null ||
    !Array.isArray((dados as { geometria?: unknown }).geometria) ||
    typeof (dados as { nome?: unknown }).nome !== "string"
  ) {
    return { ok: false, erro: "Este arquivo não parece ser um backup de projeto do Cad RD." };
  }

  return { ok: true, projeto: dados as Projeto };
}
