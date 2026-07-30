/**
 * scripts/playwright-test-iteracao45-ajuda-e-recuperar-senha.js
 * -----------------------------------------------------------------------
 * Iteração 45 (continuação) -- o usuário voltou pedindo especificamente:
 * "eu havia pedido um campo de ajuda, manual passo a passo de como usar
 * os comandos botoes e botoes automaticos" (o manual em PDF já entregue
 * não bastava -- precisava estar DENTRO do app). Também cobre a primeira
 * das 5 melhorias que o usuário pediu para implementar todas: recuperação
 * de senha ("Esqueci minha senha").
 *
 * Cobre:
 *   1) Botão "❓ Ajuda" aparece mesmo SEM login, abre o modal com o
 *      manual, mostra a seção 1 por padrão, e navegar pelo índice pula
 *      para a seção clicada (ex.: "5. Tabela de atalhos") -- confere que
 *      o conteúdo da tabela de atalhos está presente.
 *   2) Fechar o modal de Ajuda funciona.
 *   3) No LoginModal, o link "Esqueceu a senha?" aparece só no modo
 *      "entrar", troca pro modo "recuperar" (esconde o campo Senha), e
 *      submeter com um e-mail válido em modo mock mostra a mensagem
 *      explicando que não há senha real pra redefinir nesse modo.
 *   4) "Voltar para login" retorna pro modo "entrar".
 * -----------------------------------------------------------------------
 */
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const falhas = [];
  function checar(desc, cond, detalhe) {
    if (cond) {
      console.log(`  OK  ${desc}`);
    } else {
      falhas.push(desc);
      console.log(`  FALHOU  ${desc}${detalhe ? " -- " + JSON.stringify(detalhe) : ""}`);
    }
  }

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  // Garante estado deslogado (sem sessão mock de execuções anteriores).
  await page.evaluate(() => window.localStorage.removeItem("cad-unifilar:mock-auth-user"));
  await page.reload({ waitUntil: "networkidle" });

  console.log("\n=== Parte 1: manual acessível SEM login (dentro do gate de login obrigatório) e abre o manual ===");
  // Com login obrigatório, o ProjectManagerModal cobre a tela inteira sem
  // botão de fechar enquanto deslogado -- por isso o manual precisa de um
  // botão dedicado ali dentro (ver ProjectManagerModal.tsx), não só na
  // AuthPanel (que fica atrás desse gate quando deslogado).
  const botaoAjudaNoGate = page.getByRole("button", { name: "❓ Ver manual de ajuda (sem precisar de conta)" });
  const botaoAjudaVisivel = await botaoAjudaNoGate.isVisible().catch(() => false);
  checar('botão de Ajuda visível dentro do gate de login (mesmo deslogado)', botaoAjudaVisivel);

  await botaoAjudaNoGate.click();
  await page.waitForTimeout(150);
  const tituloAjuda = await page.getByText("❓ Ajuda -- Manual do Cad RD").isVisible().catch(() => false);
  checar("modal de Ajuda abriu (título correto)", tituloAjuda);

  const secao1Visivel = await page.getByText("1. Primeiros passos: conta e projetos", { exact: false }).first().isVisible().catch(() => false);
  checar("seção 1 (primeiros passos) visível por padrão", secao1Visivel);

  // Clica no item do índice referente à tabela de atalhos.
  await page.locator("nav button", { hasText: "5. Tabela de atalhos" }).click();
  await page.waitForTimeout(200);
  const tabelaAtalhosVisivel = await page.getByText("Ferramentas (digite na linha de comando").isVisible().catch(() => false);
  checar("navegação do índice -- seção de atalhos com o texto esperado presente no DOM", tabelaAtalhosVisivel);
  const atalhoLVisivel = await page.getByText("Linha", { exact: true }).first().isVisible().catch(() => false);
  checar('tabela de atalhos contém a ferramenta "Linha"', atalhoLVisivel);

  console.log("\n=== Parte 2: fechar o modal de Ajuda ===");
  await page.locator('[title="Fechar"]').first().click();
  await page.waitForTimeout(150);
  const ajudaFechada = !(await page.getByText("❓ Ajuda -- Manual do Cad RD").isVisible().catch(() => false));
  checar("modal de Ajuda fechou", ajudaFechada);

  console.log("\n=== Parte 3: recuperação de senha no LoginModal ===");
  // Ainda deslogado -- o gate do ProjectManagerModal segue aberto atrás do
  // modal de Ajuda que acabamos de fechar; usa o botão de login de DENTRO
  // do gate (o da AuthPanel fica inacessível enquanto deslogado).
  await page.getByRole("button", { name: "👤 Entrar / Criar conta" }).click();
  await page.waitForTimeout(150);
  const linkEsqueceuVisivel = await page.getByText("Esqueceu a senha?").isVisible().catch(() => false);
  checar('link "Esqueceu a senha?" visível no modo Entrar', linkEsqueceuVisivel);

  await page.getByText("Esqueceu a senha?").click();
  await page.waitForTimeout(150);
  const tituloRecuperar = await page.getByText("👤 Recuperar senha").isVisible().catch(() => false);
  checar('modo mudou para "Recuperar senha"', tituloRecuperar);
  const campoSenhaEscondido = !(await page.getByPlaceholder("••••••").isVisible().catch(() => false));
  checar("campo Senha escondido no modo recuperar", campoSenhaEscondido);

  await page.getByPlaceholder("voce@exemplo.com").fill("usuario-teste@teste.com");
  await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await page.waitForTimeout(200);
  const mensagemMockVisivel = await page.getByText("Sessão local: não existe senha de verdade", { exact: false }).isVisible().catch(() => false);
  checar("mensagem de confirmação (modo mock) apareceu", mensagemMockVisivel);

  console.log("\n=== Parte 4: 'Voltar para login' retorna ao modo Entrar ===");
  await page.getByText("Voltar para login").click();
  await page.waitForTimeout(150);
  // Duas ocorrências exatas de "👤 Entrar" no DOM neste ponto: o botão da
  // AuthPanel (atrás do gate, coberto e não-visível) e o <h2> título do
  // LoginModal -- por isso mira especificamente no <h2> pra evitar erro de
  // "strict mode" (locator ambíguo) do Playwright.
  const voltouParaEntrar = await page
    .locator("form.w-80 h2", { hasText: "👤 Entrar" })
    .isVisible()
    .catch(() => false);
  checar('voltou para o modo "Entrar"', voltouParaEntrar);

  console.log("\n-----------------------------------------------------------------------");
  if (falhas.length > 0) {
    console.log(`${falhas.length} verificação(ões) FALHARAM: ${falhas.join(" | ")}`);
    process.exitCode = 1;
  } else {
    console.log("Todas as verificações passaram.");
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
