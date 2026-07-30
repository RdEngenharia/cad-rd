/**
 * scripts/playwright-test-iteracao45-autosave-privacidade-erros-preco.js
 * -----------------------------------------------------------------------
 * Iteração 45 -- cobre as 4 melhorias restantes de "implemente todas":
 *
 *   1) Autosave + aviso de alterações não salvas: depois do boot (projeto
 *      "limpo"), o `beforeunload` NÃO deve ser bloqueado; depois de mudar
 *      o nome do projeto (fica "sujo"), o `beforeunload` DEVE ser
 *      bloqueado (`event.defaultPrevented === true`). Confere a lógica do
 *      hook diretamente via um evento sintético (não dá pra esperar os 2
 *      minutos reais do intervalo num teste automatizado).
 *   2) Página /privacidade: existe, tem o conteúdo esperado, e tem um
 *      link de volta para o app. O LoginModal tem um link pra ela.
 *   3) Monitoramento de erros: um erro JS não tratado é capturado
 *      automaticamente (`window.onerror`) e aparece na aba "⚠️ Erros" do
 *      painel do admin.
 *   4) Aviso de preço futuro (R$49,90/mês) visível na tela de login.
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

  const bindingsOk = await page.evaluate(() => typeof window.__cadStoreTeste !== "undefined");
  checar("binding de depuração (__cadStoreTeste) definido", bindingsOk);

  // Limpa localStorage de execuções anteriores (mock de erros + sessão).
  await page.evaluate(() => {
    window.localStorage.removeItem("cad-unifilar:mock-auth-user");
    window.localStorage.removeItem("cad-unifilar:mock-erros");
  });
  await page.reload({ waitUntil: "networkidle" });

  console.log("\n=== Parte 1: autosave -- estado limpo no boot, sujo depois de editar ===");
  await page.waitForTimeout(300); // garante que os efeitos de montagem (garantirIdProjeto) já rodaram

  const sujoNoBoot = await page.evaluate(() => {
    const { projeto, ultimoSnapshotSalvo } = window.__cadStoreTeste.getState();
    return JSON.stringify(projeto) !== ultimoSnapshotSalvo;
  });
  checar("projeto NÃO está sujo logo após o boot (marcarProjetoComoSalvo rodou)", !sujoNoBoot);

  const beforeUnloadBloqueadoNoBoot = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  checar("beforeunload NÃO é bloqueado com projeto limpo", !beforeUnloadBloqueadoNoBoot);

  await page.evaluate(() => {
    window.__cadStoreTeste.getState().setNomeProjeto("Projeto de teste -- autosave");
  });
  await page.waitForTimeout(100);

  const sujoDepoisDeEditar = await page.evaluate(() => {
    const { projeto, ultimoSnapshotSalvo } = window.__cadStoreTeste.getState();
    return JSON.stringify(projeto) !== ultimoSnapshotSalvo;
  });
  checar("projeto fica sujo depois de editar o nome", sujoDepoisDeEditar);

  const beforeUnloadBloqueadoSujo = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  checar("beforeunload É bloqueado com projeto sujo (aviso de alterações não salvas)", beforeUnloadBloqueadoSujo);

  // `marcarProjetoComoSalvo` (chamado pelo autosave/salvamento manual)
  // limpa o estado "sujo" de novo.
  await page.evaluate(() => window.__cadStoreTeste.getState().marcarProjetoComoSalvo());
  const limpoDeNovo = await page.evaluate(() => {
    const { projeto, ultimoSnapshotSalvo } = window.__cadStoreTeste.getState();
    return JSON.stringify(projeto) === ultimoSnapshotSalvo;
  });
  checar("marcarProjetoComoSalvo() limpa o estado sujo de novo", limpoDeNovo);

  console.log("\n=== Parte 2: página /privacidade ===");
  await page.goto("http://localhost:3000/privacidade", { waitUntil: "networkidle" });
  const tituloPrivacidade = await page.getByText("Política de Privacidade -- Cad RD").isVisible().catch(() => false);
  checar("página /privacidade carrega com o título esperado", tituloPrivacidade);
  const mencionaEmailAdmin = await page.getByText("rodrigues.solar@hotmail.com", { exact: false }).first().isVisible().catch(() => false);
  checar("página menciona o e-mail de contato para pedidos de exclusão de dados", mencionaEmailAdmin);
  const linkVoltar = await page.getByText("← Voltar para o Cad RD").isVisible().catch(() => false);
  checar('link "Voltar para o Cad RD" presente', linkVoltar);

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  const fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(150);

  console.log("\n=== Parte 3: aviso de preço futuro + link de privacidade no LoginModal ===");
  const botaoAjudaNoGate = page.getByRole("button", { name: "👤 Entrar / Criar conta" });
  if (await botaoAjudaNoGate.isVisible().catch(() => false)) {
    await botaoAjudaNoGate.click();
  } else {
    await page.getByRole("button", { name: "👤 Entrar" }).click();
  }
  await page.waitForTimeout(150);

  const avisoPreco = await page.getByText("R$49,90", { exact: false }).isVisible().catch(() => false);
  checar('aviso de preço futuro ("R$49,90") visível na tela de login', avisoPreco);

  const linkPrivacidadeLogin = page.locator('a[href="/privacidade"]');
  const linkPrivacidadeVisivel = await linkPrivacidadeLogin.isVisible().catch(() => false);
  checar("link para Política de Privacidade presente no LoginModal", linkPrivacidadeVisivel);
  const abreNovaAba = (await linkPrivacidadeLogin.getAttribute("target").catch(() => null)) === "_blank";
  checar("link de privacidade abre em nova aba (target=_blank)", abreNovaAba);

  console.log("\n=== Parte 4: monitoramento de erros -- captura automática + painel do admin ===");
  // Loga como admin (mesmo e-mail fixo de EMAIL_ADMIN em suporte.ts).
  await page.evaluate(() => {
    window.__cadStoreTeste.getState().setUsuario({ uid: "teste-uid-admin-erros", email: "rodrigues.solar@hotmail.com" });
  });
  await page.waitForTimeout(150);
  // O LoginModal (aberto na Parte 3) não fecha sozinho só por `usuario`
  // mudar via store direto (só fecharia via `handleSubmit` de verdade) --
  // fecha ele manualmente, e depois o ProjectManagerModal (que agora, com
  // `usuario` presente, já tem o botão "✕ Fechar e ir para o desenho atual").
  const cancelarLogin = page.getByRole("button", { name: "Cancelar" });
  if (await cancelarLogin.isVisible().catch(() => false)) await cancelarLogin.click();
  await page.waitForTimeout(150);
  const fecharProjetosLogado = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetosLogado.isVisible().catch(() => false)) await fecharProjetosLogado.click();
  await page.waitForTimeout(150);

  // Dispara um erro sintético (mesma forma que `window.onerror` entrega
  // pro listener em `useCapturarErros.ts`).
  await page.evaluate(() => {
    const evt = new ErrorEvent("error", {
      message: "Erro de teste iteracao45 (captura automática)",
      error: new Error("Erro de teste iteracao45 (captura automática)"),
    });
    window.dispatchEvent(evt);
  });
  await page.waitForTimeout(300);

  const errosLocalStorage = await page.evaluate(() => {
    const raw = window.localStorage.getItem("cad-unifilar:mock-erros");
    return raw ? JSON.parse(raw) : [];
  });
  checar(
    "erro sintético foi gravado no mock local (cad-unifilar:mock-erros)",
    errosLocalStorage.some((e) => e.mensagem.includes("Erro de teste iteracao45")),
    errosLocalStorage
  );
  const erroTemEmailUsuario = errosLocalStorage.some((e) => e.usuarioEmail === "rodrigues.solar@hotmail.com");
  checar("erro gravado inclui o e-mail da conta logada no momento", erroTemEmailUsuario);

  await page.getByRole("button", { name: "💬 Sugestões" }).click();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: /⚠️ Erros/ }).click();
  await page.waitForTimeout(150);
  const erroVisivelNoPainel = await page.getByText("Erro de teste iteracao45", { exact: false }).first().isVisible().catch(() => false);
  checar("erro aparece listado na aba Erros do painel do admin", erroVisivelNoPainel);

  await page.getByText("Erro de teste iteracao45", { exact: false }).first().click();
  await page.waitForTimeout(150);
  const stackVisivel = await page.getByText("Stack trace:").isVisible().catch(() => false);
  checar("detalhe do erro selecionado mostra a seção de stack trace", stackVisivel);

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
