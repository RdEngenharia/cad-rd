/**
 * scripts/playwright-test-iteracao45-termos-backup-antispam-resumo-onboarding.js
 * -----------------------------------------------------------------------
 * Iteração 45 (continuação 3) -- cobre as 5 melhorias de "implemente
 * todas quero avisos fáceis e limpos, foque na experiência do usuário":
 *
 *   1) Termos de Uso (/termos) + link no LoginModal.
 *   2) Backup manual: exportar projeto atual como .json (dispara
 *      download) e importar um arquivo .json de volta (carrega o
 *      projeto).
 *   3) Limite anti-spam: mensagens de suporte além do limite por hora são
 *      recusadas com aviso claro; erros reportados automaticamente têm
 *      dedup (mesma mensagem em sequência não duplica) e teto por sessão.
 *   4) Aba "📊 Resumo" no painel do admin mostra números básicos de uso.
 *   5) Banner de boas-vindas aparece 1x, é dispensável, e não volta depois
 *      de dispensado.
 * -----------------------------------------------------------------------
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const os = require("os");

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
  const bindingsOk = await page.evaluate(
    () => typeof window.__cadStoreTeste !== "undefined" && typeof window.__suporteTeste !== "undefined"
  );
  checar("bindings de depuração definidos", bindingsOk);

  await page.evaluate(() => {
    window.localStorage.removeItem("cad-unifilar:mock-auth-user");
    window.localStorage.removeItem("cad-unifilar:mock-erros");
    window.localStorage.removeItem("cad-unifilar:boas-vindas-vista");
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith("cad-unifilar:mock-suporte:")) window.localStorage.removeItem(k);
    }
  });
  await page.reload({ waitUntil: "networkidle" });

  console.log("\n=== Parte 1: Termos de Uso (/termos) + link no LoginModal ===");
  await page.goto("http://localhost:3000/termos", { waitUntil: "networkidle" });
  const tituloTermos = await page.getByText("Termos de Uso -- Cad RD").isVisible().catch(() => false);
  checar("página /termos carrega com o título esperado", tituloTermos);
  const mencionaCobranca = await page.getByText("R$49,90 por mês", { exact: false }).isVisible().catch(() => false);
  checar("página menciona a cobrança de R$49,90/mês após o Beta", mencionaCobranca);

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  let fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(150);
  const botaoEntrarGate = page.getByRole("button", { name: "👤 Entrar / Criar conta" });
  if (await botaoEntrarGate.isVisible().catch(() => false)) {
    await botaoEntrarGate.click();
  } else {
    await page.getByRole("button", { name: "👤 Entrar" }).click();
  }
  await page.waitForTimeout(150);
  const linkTermosLogin = page.locator('a[href="/termos"]');
  checar("link para Termos de Uso presente no LoginModal", await linkTermosLogin.isVisible().catch(() => false));

  console.log("\n=== Parte 2: backup manual -- exportar/importar projeto (.json) ===");
  // Loga (mock) e fecha os modais de login/gate pra chegar no editor de verdade.
  await page.evaluate(() => {
    window.__cadStoreTeste.getState().setUsuario({ uid: "teste-uid-backup", email: "backup-teste@teste.com" });
  });
  await page.waitForTimeout(150);
  const cancelarLogin = page.getByRole("button", { name: "Cancelar" });
  if (await cancelarLogin.isVisible().catch(() => false)) await cancelarLogin.click();
  await page.waitForTimeout(150);

  // Reabre "Meus Projetos" pra alcançar os botões de backup (o gate se
  // fecha authomaticamente só quando já tinha usuário antes; aqui setamos
  // via store direto, então o modal de projetos continua aberto).
  const tituloProjetos = await page.getByText("📁 Projetos").isVisible().catch(() => false);
  checar("(sanidade) Gerenciador de Projetos está aberto e logado", tituloProjetos);

  await page.getByRole("button", { name: "⬇️ Baixar cópia (.json)" }).click();
  await page.waitForTimeout(200);
  const statusExportou = await page.getByText("Cópia baixada", { exact: false }).isVisible().catch(() => false);
  checar('mensagem de status "Cópia baixada ✓" aparece após exportar', statusExportou);

  // Importar: escreve um arquivo .json válido no disco e o injeta
  // diretamente no <input type="file"> (mais confiável que simular o
  // clique no botão + diálogo nativo do SO, que o Playwright não abre).
  const nomeImportado = "Projeto Importado Teste Iteracao45";
  const projetoValido = {
    id_projeto: "id-projeto-importado-teste",
    nome: nomeImportado,
    xrefs: [],
    geometria: [],
    camadas: {},
  };
  const caminhoArquivo = path.join(os.tmpdir(), "projeto-teste-importar.cadrd.json");
  fs.writeFileSync(caminhoArquivo, JSON.stringify(projetoValido, null, 2));

  await page.locator('input[type="file"][accept=".json"]').setInputFiles(caminhoArquivo);
  await page.waitForTimeout(300);

  const nomeProjetoAposImportar = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.nome);
  checar("projeto importado foi carregado no store (nome bate)", nomeProjetoAposImportar === nomeImportado, nomeProjetoAposImportar);
  const modalFechouAposImportar = !(await page.getByText("📁 Projetos").isVisible().catch(() => false));
  checar("modal de Projetos fechou automaticamente após importar com sucesso", modalFechouAposImportar);

  // Tenta importar um arquivo claramente inválido -- deve mostrar erro
  // claro, sem travar nada.
  await page.evaluate(() => window.__cadStoreTeste.getState().abrirGerenciadorProjetos());
  await page.waitForTimeout(150);
  const caminhoInvalido = path.join(os.tmpdir(), "arquivo-invalido.cadrd.json");
  fs.writeFileSync(caminhoInvalido, JSON.stringify({ qualquerCoisa: true }));
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(caminhoInvalido);
  await page.waitForTimeout(300);
  const erroArquivoInvalido = await page.getByText("não parece ser um backup de projeto", { exact: false }).isVisible().catch(() => false);
  checar("arquivo .json inválido mostra mensagem de erro clara (não trava o app)", erroArquivoInvalido);

  console.log("\n=== Parte 3: limite anti-spam (suporte + erros) ===");
  const UID_SPAM = "teste-uid-spam-suporte";
  const respostasEnvio = [];
  for (let i = 0; i < 6; i++) {
    const r = await page.evaluate(
      ({ uid, i }) => window.__suporteTeste.enviarMensagemUsuario(uid, "spam-teste@teste.com", `mensagem ${i}`),
      { uid: UID_SPAM, i }
    );
    respostasEnvio.push(r);
  }
  const primeirasCincoOk = respostasEnvio.slice(0, 5).every((r) => r.ok);
  checar("as primeiras 5 mensagens (dentro do limite) foram aceitas", primeirasCincoOk, respostasEnvio.slice(0, 5));
  const sextaBloqueada = respostasEnvio[5].ok === false && /limite/i.test(respostasEnvio[5].erro || "");
  checar("a 6ª mensagem (acima do limite de 5/hora) foi recusada com aviso claro", sextaBloqueada, respostasEnvio[5]);

  // Erros: dedup (mesma mensagem 2x seguidas não duplica) + teto por sessão.
  await page.evaluate(() => {
    const evt = () => new ErrorEvent("error", { message: "Erro de teste dedup", error: new Error("Erro de teste dedup") });
    window.dispatchEvent(evt());
    window.dispatchEvent(evt());
  });
  await page.waitForTimeout(200);
  const errosApósDedup = await page.evaluate(() => {
    const raw = window.localStorage.getItem("cad-unifilar:mock-erros");
    const lista = raw ? JSON.parse(raw) : [];
    return lista.filter((e) => e.mensagem === "Erro de teste dedup").length;
  });
  checar("2 erros IGUAIS em sequência geram só 1 registro (cooldown/dedup)", errosApósDedup === 1, errosApósDedup);

  await page.evaluate(() => {
    for (let i = 0; i < 25; i++) {
      window.dispatchEvent(new ErrorEvent("error", { message: `erro único ${i}`, error: new Error(`erro único ${i}`) }));
    }
  });
  await page.waitForTimeout(300);
  const totalErrosNaSessao = await page.evaluate(() => {
    const raw = window.localStorage.getItem("cad-unifilar:mock-erros");
    return raw ? JSON.parse(raw).length : 0;
  });
  checar("teto de erros por sessão respeitado (não deixou passar todos os 25+1)", totalErrosNaSessao <= 21, totalErrosNaSessao);

  console.log("\n=== Parte 4: aba Resumo no painel do admin ===");
  await page.evaluate(() => {
    window.__cadStoreTeste.getState().setUsuario({ uid: "teste-uid-admin-resumo", email: "rodrigues.solar@hotmail.com" });
  });
  await page.waitForTimeout(150);
  fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "💬 Sugestões" }).click();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "📊 Resumo" }).click();
  await page.waitForTimeout(500);
  const resumoCarregou = await page.getByText("projeto(s) salvo(s) ao todo").isVisible().catch(() => false);
  checar("aba Resumo carrega e mostra o card de projetos salvos", resumoCarregou);
  const resumoMostraErros = await page.getByText("erro(s) reportado(s) automaticamente").isVisible().catch(() => false);
  checar("aba Resumo mostra o card de erros reportados", resumoMostraErros);
  const resumoNota = await page.getByText("não inclui o número total de contas criadas", { exact: false }).isVisible().catch(() => false);
  checar("aba Resumo explica a limitação sobre contas criadas", resumoNota);

  console.log("\n=== Parte 5: banner de boas-vindas (onboarding simples) ===");
  await page.locator('[title="Fechar"]').first().click();
  await page.waitForTimeout(150);
  const bannerApareceu = await page.getByText("Dica rápida", { exact: false }).isVisible().catch(() => false);
  checar("banner de boas-vindas aparece (localStorage limpo, 1ª vez)", bannerApareceu);

  await page.getByRole("button", { name: "Entendi" }).click();
  await page.waitForTimeout(150);
  const bannerSumiu = !(await page.getByText("Dica rápida", { exact: false }).isVisible().catch(() => false));
  checar("banner some ao clicar em Entendi", bannerSumiu);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const bannerNaoReaparece = !(await page.getByText("Dica rápida", { exact: false }).isVisible().catch(() => false));
  checar("banner NÃO reaparece depois de recarregar a página (dispensado fica salvo)", bannerNaoReaparece);

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
