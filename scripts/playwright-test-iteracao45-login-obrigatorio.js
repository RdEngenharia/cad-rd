/**
 * scripts/playwright-test-iteracao45-login-obrigatorio.js
 * -----------------------------------------------------------------------
 * Iteração 45 -- pedido do usuário: "descobri um erro de entrada, quando
 * ele pede login se eu clicar em novo projeto ele abre sem conta". O
 * usuário confirmou (pergunta de esclarecimento) que quer login
 * OBRIGATÓRIO: ninguém consegue criar/abrir/editar/salvar um projeto sem
 * antes entrar com e-mail/senha (ou criar conta).
 *
 * Antes desta iteração, "+ Novo Projeto"/"💾 Salvar projeto atual"/"Abrir
 * um projeto por ID..."/"✕ Fechar e ir para o desenho atual" funcionavam
 * MESMO sem login (comportamento de propósito desde a Iteração 34, pra
 * uso 100% local/offline) -- o usuário decidiu mudar isso agora.
 *
 * Este teste confirma, numa sessão SEM login (estado inicial de
 * qualquer sessão nova):
 *   1) NENHum desses 4 controles aparece -- só o aviso + botão "Entrar /
 *      Criar conta".
 *   2) Depois de logar (`setUsuario`, mesma mecânica que
 *      `lib/auth.ts#observarUsuario` usaria de verdade), os 4 controles
 *      voltam a aparecer normalmente -- nada quebrou pra quem tem conta.
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
  await page.waitForTimeout(300);

  console.log("\n=== Parte 1: sessão SEM login -- modal de Projetos abre sozinho, sem nenhum atalho ===");
  const usuarioInicial = await page.evaluate(() => window.__cadStoreTeste.getState().usuario);
  checar("(sanidade) sessão nova começa SEM usuário logado", usuarioInicial === null, usuarioInicial);

  const modalAberto = await page.evaluate(() => window.__cadStoreTeste.getState().gerenciadorProjetosAberto);
  checar('modal "📁 Projetos" abre sozinho ao carregar (comportamento de sempre, Iteração 34)', modalAberto === true, modalAberto);

  checar('botão "+ Novo Projeto" NÃO aparece sem login', !(await page.getByRole("button", { name: "+ Novo Projeto" }).isVisible().catch(() => false)));
  checar(
    'botão "💾 Salvar projeto atual" NÃO aparece sem login',
    !(await page.getByRole("button", { name: /Salvar projeto atual/ }).isVisible().catch(() => false))
  );
  checar(
    'botão "✕ Fechar e ir para o desenho atual" NÃO aparece sem login (não dá pra escapar do modal sem conta)',
    !(await page.locator('button[title="Fechar e ir para o desenho atual"]').isVisible().catch(() => false))
  );
  checar(
    'link "Abrir um projeto por ID..." NÃO aparece sem login',
    !(await page.getByText("Abrir um projeto por ID...").isVisible().catch(() => false))
  );
  checar(
    'aviso explicando que login é obrigatório está visível',
    await page.getByText(/preciso entrar com uma conta/i).isVisible().catch(() => false)
  );
  checar(
    'botão "👤 Entrar / Criar conta" está visível (único caminho disponível)',
    await page.getByRole("button", { name: /Entrar \/ Criar conta/ }).isVisible().catch(() => false)
  );

  console.log("\n=== Parte 2: depois de logar -- todos os controles voltam a aparecer normalmente ===");
  await page.evaluate(() => {
    window.__cadStoreTeste.getState().setUsuario({ uid: "teste-uid-login-obrigatorio", email: "teste-login@teste.com" });
  });
  await page.waitForTimeout(200);

  checar('botão "+ Novo Projeto" aparece depois de logar', await page.getByRole("button", { name: "+ Novo Projeto" }).isVisible().catch(() => false));
  checar(
    'botão "💾 Salvar projeto atual" aparece depois de logar',
    await page.getByRole("button", { name: /Salvar projeto atual/ }).isVisible().catch(() => false)
  );
  checar(
    'botão "✕ Fechar e ir para o desenho atual" aparece depois de logar',
    await page.locator('button[title="Fechar e ir para o desenho atual"]').isVisible().catch(() => false)
  );
  checar(
    'link "Abrir um projeto por ID..." aparece depois de logar',
    await page.getByText("Abrir um projeto por ID...").isVisible().catch(() => false)
  );

  // Confirma que dá pra realmente USAR o app depois de logar (não é só
  // visual) -- clica em Novo Projeto e confirma que o modal fecha.
  await page.getByRole("button", { name: "+ Novo Projeto" }).click();
  await page.waitForTimeout(200);
  const modalFechadoAposNovoProjeto = await page.evaluate(() => window.__cadStoreTeste.getState().gerenciadorProjetosAberto);
  checar('clicar em "+ Novo Projeto" (logado) fecha o modal normalmente e libera o Desenho', modalFechadoAposNovoProjeto === false, modalFechadoAposNovoProjeto);

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
