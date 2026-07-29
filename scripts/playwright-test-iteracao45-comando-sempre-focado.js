/**
 * scripts/playwright-test-iteracao45-comando-sempre-focado.js
 * -----------------------------------------------------------------------
 * Iteração 45 -- pedido do usuário: "corrija a barra de comando embaixo
 * nao fica piscando esperando eu digitar um comando, para digitar o
 * comando tenho que clicar na barra para depois digitar ai atrasa, quero
 * que fique igual ao autocad, mesmo eu desenhando uma linha se digitar o
 * comando e apertar enter ele tem que funcionar sem eu ter que clicar
 * primeiro na barra de comando."
 *
 * Este teste confirma (ver `CommandLine.tsx`):
 *   1) A barra de comando já fica com foco assim que a Prancha padrão é
 *      fechada -- sem clicar nela, digitar já funciona.
 *   2) Com a ferramenta LINHA armada mas ainda SEM nenhum ponto clicado
 *      (nem canvas, nem a própria barra tocados), digitar "C" + Enter
 *      troca pra CIRCULO -- o caso relatado pelo usuário, que antes desta
 *      correção não funcionava (nada estava focado, então as teclas
 *      caíam "no vazio").
 *   3) Clicar num campo LEGÍTIMO (ex.: "Nome do projeto" na Toolbar) e
 *      digitar continua indo pro campo certo -- a captura global não
 *      "rouba" foco de outros campos.
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

  const bindingOk = await page.evaluate(() => typeof window.__cadStoreTeste !== "undefined");
  checar("window.__cadStoreTeste está definido (build com o binding de depuração)", bindingOk);

  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.setUsuario({ uid: "teste-uid-cmd", email: "teste-cmd@teste.com" });
    s.selecionarPrancha(null);
  });
  const fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(200);

  console.log("\n=== Parte 1: barra de comando já nasce focada (sem clicar nela) ===");
  const inputComando = page.locator('input[placeholder*="L · C · REC"]');
  await checarFocoAtivo(inputComando, "campo de comando já está com foco assim que o modal fecha (sem clique nenhum)");

  console.log("\n=== Parte 2: ferramenta LINHA armada, NENHUM ponto clicado -- digitar C troca pra CIRCULO ===");
  await page.getByRole("button", { name: "Linha", exact: true }).click();
  // Tira o foco de propósito (clicar no botão já tira o foco dele mesmo --
  // ver comentário em ToolRuler.tsx sobre blur() após clique -- mas aqui
  // simulamos o pior caso: foco em lugar nenhum, ex.: `document.body`).
  await page.evaluate(() => (document.activeElement)?.blur?.());
  const ferramentaAntes = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar('ferramenta está "linha" antes de digitar (armada pelo botão)', ferramentaAntes === "linha", ferramentaAntes);

  await page.keyboard.type("C");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const ferramentaDepois = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar(
    'digitar "C" + Enter SEM clicar na barra trocou a ferramenta para "circulo" (caso relatado pelo usuário)',
    ferramentaDepois === "circulo",
    ferramentaDepois
  );

  console.log("\n=== Parte 3: digitar em outro campo legítimo (Nome do projeto) não é roubado ===");
  await page.evaluate(() => window.__cadStoreTeste.getState().cancelarDesenho());
  const nomeProjetoInput = page.locator('input[title="Nome do projeto"]');
  await nomeProjetoInput.click();
  await nomeProjetoInput.fill("");
  await page.keyboard.type("Projeto XPTO");
  await page.waitForTimeout(100);
  const nomeProjeto = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.nome);
  checar('digitar no campo "Nome do projeto" (já focado por clique) vai pro campo certo, não pra barra de comando', nomeProjeto === "Projeto XPTO", nomeProjeto);
  const comandoTextoAposDigitarNome = await inputComando.inputValue();
  checar('a barra de comando ficou VAZIA enquanto se digitava no campo do nome (nada vazou pra lá)', comandoTextoAposDigitarNome === "", comandoTextoAposDigitarNome);

  console.log("\n=== Parte 4: depois de clicar fora do campo de nome, digitar de novo cai na barra de comando ===");
  await page.evaluate(() => (document.activeElement)?.blur?.());
  await page.keyboard.type("REC");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const ferramentaRec = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar('depois de sair do campo de nome, digitar "REC" + Enter funciona de novo sem clicar na barra', ferramentaRec === "retangulo", ferramentaRec);

  async function checarFocoAtivo(locator, desc) {
    const focado = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
    checar(desc, focado);
  }

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
