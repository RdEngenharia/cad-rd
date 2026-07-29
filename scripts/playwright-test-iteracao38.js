/**
 * scripts/playwright-test-iteracao38.js
 * -----------------------------------------------------------------------
 * Iteração 38 -- verificação end-to-end NA APLICAÇÃO REAL dos 3 pedidos
 * do usuário nesta rodada:
 *
 *  1) "configure a tecla space para repetir o ultimo comando, o ultimo
 *     botao, exemplo se usei cotas ao apertar a tecla space ele
 *     seleciona novamente o botao cotas igual o autocad" -- Espaço
 *     repete o último comando (`ultimoComandoRepetivel`), só quando
 *     nenhum outro comando está em andamento e o foco não está num
 *     controle interativo (input/textarea/select/button).
 *  2) "altere o nome concordancia para fillit igual o autocad" --
 *     botão da régua de ferramentas agora mostra "Fillet".
 *  3) "quero ter a opcao de fechar um canto de linhas arredondado
 *     tambem" -- controle "Raio do canto -- Fillet (mm)" sempre visível
 *     na barra de propriedades (não precisa mais saber digitar "R" na
 *     linha de comando), produzindo de fato um arco arredondado ao
 *     aplicar o FILLET em duas linhas com raio > 0.
 *
 * PRÉ-REQUISITO (não fica no código entregue): mesmo binding de debug
 * temporário `window.__cadStoreTeste` já usado nos scripts anteriores.
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
    // Iteração 45 -- login virou obrigatório antes de qualquer ação no
  // modal de Projetos (ver ProjectManagerModal.tsx); simula estar
  // logado via o binding de debug, sem precisar automatizar o
  // formulário de login de verdade.
  await page.evaluate(() =>
    window.__cadStoreTeste.getState().setUsuario({ uid: "teste-uid", email: "teste@teste.com" })
  );
  const fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  await page.waitForTimeout(150);

  // =========================================================================
  // PARTE 1: botão renomeado de "Concordância" para "Fillet"
  // =========================================================================
  console.log("\n=== Parte 1: botão renomeado para Fillet ===");
  const botaoFillet = page.locator('button:has-text("Fillet")');
  checar("botão \"Fillet\" está visível na régua de ferramentas", await botaoFillet.isVisible().catch(() => false));
  const textoConcordancia = await page.locator("text=Concordância").count();
  checar("texto \"Concordância\" não aparece mais em lugar nenhum da tela", textoConcordancia === 0, textoConcordancia);

  // =========================================================================
  // PARTE 2: raio do FILLET pela barra lateral (canto arredondado)
  // =========================================================================
  console.log("\n=== Parte 2: FILLET com raio (canto arredondado) via barra lateral ===");

  // Duas linhas formando um ângulo reto: L1 horizontal (0,0)-(1000,0),
  // L2 vertical (1000,0)-(1000,1000) -- vértice teórico em (1000,0).
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: 1000, y2: 0 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 1000, y1: 0, x2: 1000, y2: 1000 });
  });
  await page.waitForTimeout(150);

  await page.evaluate(() => window.__cadStoreTeste.getState().setViewport({ scale: 0.2, x: 100, y: 100 }));
  await page.waitForTimeout(150);
  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(x, y) {
    return { sx: canvasBox.x + 100 + 0.2 * x, sy: canvasBox.y + 100 + 0.2 * y };
  }

  // Define o raio pela BARRA LATERAL (não digitando "R" na linha de
  // comando) -- é exatamente essa a opção que o usuário pediu pra ter.
  const raioInput = page.locator('label:has-text("Raio do canto -- Fillet (mm)") input');
  checar("campo \"Raio do canto -- Fillet (mm)\" está visível (sempre, não só com Fillet ativo)", await raioInput.isVisible().catch(() => false));
  await raioInput.fill("300");
  await raioInput.press("Tab");
  await page.waitForTimeout(100);
  const raioArmadoPelaUI = await page.evaluate(() => window.__cadStoreTeste.getState().filletRaio);
  checar("filletRaio = 300mm depois de digitar no campo da barra lateral", raioArmadoPelaUI === 300, raioArmadoPelaUI);

  await botaoFillet.click();
  await page.waitForTimeout(100);

  let p = pxDoMundo(500, 0); // meio da linha horizontal
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  p = pxDoMundo(1000, 500); // meio da linha vertical
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);

  const resultadoFillet = await page.evaluate(() => {
    const geo = window.__cadStoreTeste.getState().projeto.geometria;
    return {
      linhas: geo.filter((g) => g.tipo === "linha"),
      arcos: geo.filter((g) => g.tipo === "arco"),
      filletAlvo1: window.__cadStoreTeste.getState().filletAlvo1,
    };
  });
  checar("FILLET com raio > 0 cria exatamente 1 arco novo", resultadoFillet.arcos.length === 1, resultadoFillet);
  const arco = resultadoFillet.arcos[0];
  checar(
    "arco tem raio = 300mm (o valor definido na barra lateral)",
    !!arco && Math.abs(arco.raio - 300) < 1,
    arco
  );
  checar(
    "arco está centrado em (700,300) -- bissetriz do ângulo reto entre as duas linhas",
    !!arco && Math.abs(arco.x - 700) < 1 && Math.abs(arco.y - 300) < 1,
    arco
  );
  const l1Depois = resultadoFillet.linhas.find((l) => Math.abs(l.y1) < 1 && Math.abs(l.y2) < 1);
  checar(
    "linha horizontal foi cortada no ponto de tangência (700,0), preservando a ponta longe (0,0)",
    !!l1Depois &&
      ((Math.abs(l1Depois.x1 - 0) < 1 && Math.abs(l1Depois.x2 - 700) < 1) ||
        (Math.abs(l1Depois.x2 - 0) < 1 && Math.abs(l1Depois.x1 - 700) < 1)),
    l1Depois
  );
  const l2Depois = resultadoFillet.linhas.find((l) => Math.abs(l.x1 - 1000) < 1 && Math.abs(l.x2 - 1000) < 1);
  checar(
    "linha vertical foi cortada no ponto de tangência (1000,300), preservando a ponta longe (1000,1000)",
    !!l2Depois &&
      ((Math.abs(l2Depois.y1 - 1000) < 1 && Math.abs(l2Depois.y2 - 300) < 1) ||
        (Math.abs(l2Depois.y2 - 1000) < 1 && Math.abs(l2Depois.y1 - 300) < 1)),
    l2Depois
  );
  checar("filletAlvo1 volta a null depois de aplicar (pronto pro próximo par de linhas)", resultadoFillet.filletAlvo1 === null, resultadoFillet.filletAlvo1);

  await page.screenshot({ path: "/tmp/it38-fillet-arredondado.png" });

  // =========================================================================
  // PARTE 3: tecla Espaço repete o último comando
  // =========================================================================
  console.log("\n=== Parte 3: Espaço repete o último comando (exemplo do usuário: Cota) ===");

  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.setViewport({ scale: 0.2, x: 100, y: 100 });
  });
  await page.waitForTimeout(150);

  // Fluxo real da UI: clica "Cota", faz os 3 cliques (ponto inicial,
  // ponto final, posição da linha de cota) -- exatamente o exemplo do
  // usuário ("se usei cotas").
  await page.locator('button:has-text("Cota")').click();
  await page.waitForTimeout(100);
  p = pxDoMundo(0, 0);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(100);
  p = pxDoMundo(1000, 0);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(100);
  p = pxDoMundo(500, -100);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);

  const ferramentaAposCota = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar("depois de concluir a Cota, a ferramenta volta sozinha pra \"selecionar\" (comportamento já existente)", ferramentaAposCota === "selecionar", ferramentaAposCota);
  const ultimoComando = await page.evaluate(() => window.__cadStoreTeste.getState().ultimoComandoRepetivel);
  checar("ultimoComandoRepetivel gravou \"cota\"", ultimoComando === "cota", ultimoComando);

  // Clica em algum lugar neutro do canvas primeiro (garante que o foco
  // do teclado NÃO está em nenhum input/textarea da linha de comando --
  // senão Espaço deveria digitar um espaço em vez de repetir o comando).
  await page.mouse.click(canvasBox.x + 50, canvasBox.y + 400);
  await page.waitForTimeout(100);

  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  const ferramentaAposEspaco = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar(
    "Espaço reativa a ferramenta \"Cota\" sozinho (igual clicar no botão de novo) -- pedido do usuário",
    ferramentaAposEspaco === "cota",
    ferramentaAposEspaco
  );

  // Volta pro estado ocioso e confirma que Espaço NÃO faz nada enquanto
  // o campo de comando (input) está com foco -- deve deixar o navegador
  // digitar um espaço normalmente, não interceptar.
  await page.evaluate(() => window.__cadStoreTeste.getState().cancelarDesenho());
  await page.waitForTimeout(100);
  await page.locator('input[type="text"]').first().click().catch(() => {});
  const inputComando = page.locator("form input").first();
  await inputComando.click();
  await inputComando.fill("");
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  const ferramentaComInputFocado = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  const valorDigitado = await inputComando.inputValue().catch(() => "");
  checar(
    "com o campo de comando focado, Espaço NÃO repete comando nenhum (ferramenta continua \"selecionar\")",
    ferramentaComInputFocado === "selecionar",
    ferramentaComInputFocado
  );
  checar("com o campo de comando focado, Espaço digita um espaço normalmente no campo", valorDigitado === " ", JSON.stringify(valorDigitado));

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
