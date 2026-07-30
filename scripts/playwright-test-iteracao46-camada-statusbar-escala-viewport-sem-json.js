/**
 * scripts/playwright-test-iteracao46-camada-statusbar-escala-viewport-sem-json.js
 * -----------------------------------------------------------------------
 * Iteração 46 -- cobre os pedidos do usuário desta rodada:
 *
 *   1) "quero que o nome das camadas fique visivel, preciso saber sobre
 *      qual item do desenho é a camada só de olhar" -- resposta escolhida:
 *      nome da camada na barra de status, ao passar o mouse sobre um
 *      elemento (ou, sem hover, com um único elemento selecionado).
 *
 *   2) "preciso implantar um jeito de colocar um desenho na escala na
 *      prancha da viewport, exemplo escala igual o autocad" -- resposta
 *      escolhida: deixar mais visível/fácil de achar o controle de escala
 *      que já existia só no painel lateral, clicando direto no rótulo
 *      "ESC 1:X" desenhado embaixo de CADA viewport (tanto o viewport MV
 *      "solto" do Desenho quanto um viewport de uma Prancha).
 *
 *   3) "nao gostei desse json na tela pode retirar" -- o painel de
 *      depuração "{ } JSON" (atalho Ctrl+J) foi removido de vez.
 *
 *   4) (continuação) "voce entendeu errado a ultima instrucao, o nome das
 *      layers precisam ser lidas por completo no painel a esquerda... nao
 *      dar para ler o nome da leyer, so inicio" -- o pedido #1 acima
 *      cobria a barra de status, mas o painel lateral "Camadas" também
 *      cortava os nomes (ex.: "ELE..."); agora o nome tem uma linha
 *      própria, sem truncar (quebra em 2 linhas se precisar).
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
  const bindingsOk = await page.evaluate(() => typeof window.__cadStoreTeste !== "undefined");
  checar("binding de depuração definido", bindingsOk);

  // Loga (mock) e fecha o modal de Projetos, pra chegar no editor de verdade.
  await page.evaluate(() =>
    window.__cadStoreTeste.getState().setUsuario({ uid: "teste-uid-iteracao46", email: "teste46@teste.com" })
  );
  const fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(200);

  // Estado limpo e determinístico: sem geometria, na página DESENHO (um
  // projeto novo abre com 1 Prancha já ativa por padrão -- `selecionarPrancha(null)`
  // volta pro Desenho, mesmo padrão já usado em `playwright-test-iteracao42.js`),
  // zoom/pan fixo.
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.setViewport({ scale: 0.2, x: 100, y: 100 });
    s.limparSelecao();
  });
  await page.waitForTimeout(150);

  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(viewport, x, y) {
    return { sx: canvasBox.x + viewport.x + viewport.scale * x, sy: canvasBox.y + viewport.y + viewport.scale * y };
  }

  // =========================================================================
  // PARTE 1: nome da camada na barra de status (hover e seleção)
  // =========================================================================
  console.log("\n=== Parte 1: 'Camada: NOME' na barra de status ===");

  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.addGeometria({ tipo: "linha", camada: "BARRAMENTO", x1: 0, y1: 0, x2: 2000, y2: 0 });
  });
  await page.waitForTimeout(150);
  const idLinha = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria[0].id);

  const semHoverNemSelecao = await page.getByText("Camada:", { exact: false }).isVisible().catch(() => false);
  checar("sem hover nem seleção, 'Camada:' NÃO aparece na barra de status", !semHoverNemSelecao);

  const viewportAtual = await page.evaluate(() => window.__cadStoreTeste.getState().viewport);
  const pMeio = pxDoMundo(viewportAtual, 1000, 0);
  await page.mouse.move(pMeio.sx, pMeio.sy);
  await page.waitForTimeout(200);
  const elementoSobMouseId = await page.evaluate(() => window.__cadStoreTeste.getState().elementoSobMouseId);
  checar("passar o mouse sobre a linha atualiza `elementoSobMouseId` no store", elementoSobMouseId === idLinha, elementoSobMouseId);
  const camadaVisivelNoHover = await page.getByText("Camada: BARRAMENTO", { exact: false }).isVisible().catch(() => false);
  checar('barra de status mostra "Camada: BARRAMENTO" ao passar o mouse sobre a linha', camadaVisivelNoHover);

  // Tira o mouse de cima de qualquer elemento (canto vazio do canvas).
  await page.mouse.move(canvasBox.x + 5, canvasBox.y + 5);
  await page.waitForTimeout(200);
  const elementoSobMouseDepois = await page.evaluate(() => window.__cadStoreTeste.getState().elementoSobMouseId);
  checar("tirar o mouse de cima do elemento limpa `elementoSobMouseId`", elementoSobMouseDepois === null, elementoSobMouseDepois);
  const camadaSomeSemHover = await page.getByText("Camada:", { exact: false }).isVisible().catch(() => false);
  checar('"Camada:" some da barra de status sem hover nem seleção', !camadaSomeSemHover);

  // Seleciona (sem hover) -- deve continuar mostrando pelo elemento selecionado.
  await page.evaluate((id) => window.__cadStoreTeste.getState().selecionarUnico(id), idLinha);
  await page.waitForTimeout(150);
  const camadaVisivelNaSelecao = await page.getByText("Camada: BARRAMENTO", { exact: false }).isVisible().catch(() => false);
  checar('com o elemento SELECIONADO (sem hover), a barra de status ainda mostra "Camada: BARRAMENTO"', camadaVisivelNaSelecao);
  await page.evaluate(() => window.__cadStoreTeste.getState().limparSelecao());

  // =========================================================================
  // PARTE 2: menu de escala clicável na viewport -- MV do Desenho
  // =========================================================================
  console.log("\n=== Parte 2a: menu de escala clicável -- viewport MV do Desenho ===");

  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.addGeometria({
      tipo: "viewport",
      camada: "0",
      x: 0,
      y: 0,
      largura: 1000,
      altura: 800,
      modelScale: 20,
      modelOffsetX: 0,
      modelOffsetY: 0,
      bordaVisivel: true,
    });
  });
  await page.waitForTimeout(150);
  const idViewportMV = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria[0].id);
  await page.evaluate(() => window.__cadStoreTeste.getState().setViewport({ scale: 0.3, x: 100, y: 100 }));
  await page.waitForTimeout(150);

  const viewportMV = await page.evaluate(() => window.__cadStoreTeste.getState().viewport);
  // Rótulo "ESC 1:20" é desenhado em (geo.x + 2/scale, geo.y + geo.altura + 1/scale) -- mundo.
  const labelMV = pxDoMundo(viewportMV, 0 + 2 / viewportMV.scale, 800 + 1 / viewportMV.scale);
  await page.mouse.click(labelMV.sx + 20, labelMV.sy + 4);
  await page.waitForTimeout(200);

  const menuAbriuMV = await page.getByText("Escala de impressão (1 : N)", { exact: false }).isVisible().catch(() => false);
  checar("clicar no rótulo 'ESC 1:X' do viewport MV abre o menu de escala", menuAbriuMV);
  const menuStateMV = await page.evaluate(() => window.__cadStoreTeste.getState().menuEscalaViewport);
  checar("menu de escala aberto aponta pro alvo certo (geometria/MV)", menuStateMV?.alvo?.tipo === "geometria" && menuStateMV?.alvo?.id === idViewportMV, menuStateMV);

  await page.getByRole("button", { name: "1:100", exact: true }).click();
  await page.waitForTimeout(150);
  const modelScaleAposClique = await page.evaluate(
    (id) => window.__cadStoreTeste.getState().projeto.geometria.find((g) => g.id === id)?.modelScale,
    idViewportMV
  );
  checar('escolher "1:100" na lista rápida aplica modelScale=100 no viewport certo', modelScaleAposClique === 100, modelScaleAposClique);
  const menuFechouAposEscolha = await page.getByText("Escala de impressão (1 : N)", { exact: false }).isVisible().catch(() => false);
  checar("menu fecha sozinho depois de escolher uma escala", !menuFechouAposEscolha);

  // Nota: o rótulo "ESC 1:X" é desenhado DENTRO do canvas (Konva/<canvas>),
  // não é texto de DOM de verdade -- por isso não dá (nem faz sentido) pra
  // checar com `page.getByText` aqui; o valor já foi confirmado direto no
  // store acima (`modelScaleAposClique === 100`).

  // Reabre e testa o campo de valor customizado. Escopado pelo `title`
  // específico do campo do MENU (a barra de status também tem um
  // `input[type="number"]` -- o do grid -- que seria o 1º da página e
  // "roubaria" um `.first()` sem escopo).
  const viewportAtual2 = await page.evaluate(() => window.__cadStoreTeste.getState().viewport);
  const labelMV2 = pxDoMundo(viewportAtual2, 0 + 2 / viewportAtual2.scale, 800 + 1 / viewportAtual2.scale);
  await page.mouse.click(labelMV2.sx + 20, labelMV2.sy + 4);
  await page.waitForTimeout(200);
  const campoCustom = page.locator('input[title*="Enter aplica"]');
  await campoCustom.fill("333");
  await page.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(150);
  const modelScaleCustom = await page.evaluate(
    (id) => window.__cadStoreTeste.getState().projeto.geometria.find((g) => g.id === id)?.modelScale,
    idViewportMV
  );
  checar("digitar uma escala customizada (333) e clicar OK aplica corretamente", modelScaleCustom === 333, modelScaleCustom);

  // Reabre e testa Esc (fecha sem aplicar).
  const viewportAtual3 = await page.evaluate(() => window.__cadStoreTeste.getState().viewport);
  const labelMV3 = pxDoMundo(viewportAtual3, 0 + 2 / viewportAtual3.scale, 800 + 1 / viewportAtual3.scale);
  await page.mouse.click(labelMV3.sx + 20, labelMV3.sy + 4);
  await page.waitForTimeout(200);
  const menuAbriuDeNovo = await page.getByText("Escala de impressão (1 : N)", { exact: false }).isVisible().catch(() => false);
  checar("menu reabre normalmente pra testar o Esc", menuAbriuDeNovo);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const menuFechouComEsc = await page.getByText("Escala de impressão (1 : N)", { exact: false }).isVisible().catch(() => false);
  checar("Esc fecha o menu de escala sem mudar o valor", !menuFechouComEsc);
  const modelScaleAposEsc = await page.evaluate(
    (id) => window.__cadStoreTeste.getState().projeto.geometria.find((g) => g.id === id)?.modelScale,
    idViewportMV
  );
  checar("valor da escala não muda ao fechar com Esc", modelScaleAposEsc === 333, modelScaleAposEsc);

  // =========================================================================
  // PARTE 2b: menu de escala clicável -- viewport de uma Prancha
  // =========================================================================
  console.log("\n=== Parte 2b: menu de escala clicável -- viewport de uma Prancha ===");

  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    const pranchaId = s.criarPrancha("A4");
    // Zoom/pan determinístico da PÁGINA da prancha (senão cai no
    // fit-to-page automático, que dependeria do tamanho do canvas).
    s.setPranchaViewport(pranchaId, { scale: 0.6, x: 300, y: 200 });
  });
  await page.waitForTimeout(200);

  const { pranchaId, viewportPrancha, pranchaViewportCam } = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    const pranchaId = s.prenchaAtivaId;
    const prancha = s.projeto.pranchas.find((p) => p.id === pranchaId);
    return { pranchaId, viewportPrancha: prancha.viewports[0], pranchaViewportCam: s.pranchaViewports[pranchaId] };
  });
  checar("Prancha criada com 1 viewport padrão", Boolean(viewportPrancha));

  const labelPrancha = pxDoMundo(
    pranchaViewportCam,
    viewportPrancha.x + 2 / pranchaViewportCam.scale,
    viewportPrancha.y + viewportPrancha.altura + 1 / pranchaViewportCam.scale
  );
  await page.mouse.click(labelPrancha.sx + 20, labelPrancha.sy + 4);
  await page.waitForTimeout(200);

  const menuAbriuPrancha = await page.getByText("Escala de impressão (1 : N)", { exact: false }).isVisible().catch(() => false);
  checar("clicar no rótulo 'ESC 1:X' de um viewport de Prancha abre o menu de escala", menuAbriuPrancha);
  const menuStatePrancha = await page.evaluate(() => window.__cadStoreTeste.getState().menuEscalaViewport);
  checar(
    "menu de escala aberto aponta pro alvo certo (prancha)",
    menuStatePrancha?.alvo?.tipo === "prancha" &&
      menuStatePrancha?.alvo?.pranchaId === pranchaId &&
      menuStatePrancha?.alvo?.viewportId === viewportPrancha.id,
    menuStatePrancha
  );

  await page.getByRole("button", { name: "1:50", exact: true }).click();
  await page.waitForTimeout(150);
  const modelScalePranchaAposClique = await page.evaluate(
    ({ pranchaId, viewportId }) => {
      const s = window.__cadStoreTeste.getState();
      const prancha = s.projeto.pranchas.find((p) => p.id === pranchaId);
      return prancha.viewports.find((v) => v.id === viewportId)?.modelScale;
    },
    { pranchaId, viewportId: viewportPrancha.id }
  );
  checar('escolher "1:50" aplica modelScale=50 no viewport certo DA PRANCHA (não mexe no viewport MV do Desenho)', modelScalePranchaAposClique === 50, modelScalePranchaAposClique);

  // Confirma que o painel de Propriedades (fluxo antigo) continua igual --
  // não foi substituído, só ganhou um jeito extra de chegar no mesmo lugar.
  const bordaRect = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    return s.viewportPranchaSelecionadoId;
  });
  console.log(`  (info) viewportPranchaSelecionadoId após clique no rótulo: ${bordaRect ?? "null (esperado -- clique foi no rótulo, não na borda)"}`);

  // =========================================================================
  // PARTE 3: painel de depuração JSON (Ctrl+J) removido
  // =========================================================================
  console.log("\n=== Parte 3: painel JSON (Ctrl+J) removido ===");

  const textoAntes = await page.evaluate(() => document.body.innerText.length);
  await page.keyboard.press("Control+J");
  await page.waitForTimeout(300);
  const painelJsonApareceu = await page.getByText("Projeto (JSON)", { exact: false }).isVisible().catch(() => false);
  checar('Ctrl+J NÃO abre mais o painel "Projeto (JSON)"', !painelJsonApareceu);
  const textoDepois = await page.evaluate(() => document.body.innerText.length);
  checar("Ctrl+J não altera a tela de forma nenhuma (nenhum painel novo aparece)", textoAntes === textoDepois, { textoAntes, textoDepois });

  // =========================================================================
  // PARTE 4: nome da camada legível POR COMPLETO no painel "Camadas" (sidebar)
  // =========================================================================
  // Iteração 46 (continuação) -- pedido do usuário: "voce entendeu errado a
  // ultima instrucao, o nome das layers precisam ser lidas por completo no
  // painel a esquerda... nao dar para ler o nome da layer, so inicio". A
  // Parte 1 acima já cobre a barra de status (o pedido original); esta
  // Parte cobre o painel lateral "Camadas" em si, onde os nomes ficavam
  // cortados tipo "ELE..." por dividir a linha com o campo de espessura e o
  // select de estilo.
  console.log('\n=== Parte 4: nome da camada legível por completo no painel "Camadas" ===');

  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    if (!s.projeto.camadas["ELETRICA_LEGENDA"]) s.criarCamada("ELETRICA_LEGENDA", "#0ea5e9");
    if (!s.projeto.camadas["QUADRO_DISTRIBUICAO_GERAL"]) s.criarCamada("QUADRO_DISTRIBUICAO_GERAL", "#ef4444");
  });
  await page.waitForTimeout(150);

  // O painel "Camadas" vem recolhido por padrão -- abre clicando no título.
  const tituloCamadasFechado = await page.getByText("Camadas", { exact: true }).isVisible().catch(() => false);
  if (tituloCamadasFechado) {
    const painelJaAberto = await page.getByText("ELETRICA_LEGENDA", { exact: true }).isVisible().catch(() => false);
    if (!painelJaAberto) await page.getByText("Camadas", { exact: true }).click();
  }
  await page.waitForTimeout(150);

  const nomeCurtoVisivel = await page.getByText("ELETRICA_LEGENDA", { exact: true }).isVisible().catch(() => false);
  checar('nome de camada "ELETRICA_LEGENDA" aparece POR COMPLETO no painel (não corta em "ELE...")', nomeCurtoVisivel);
  const nomeLongoVisivel = await page.getByText("QUADRO_DISTRIBUICAO_GERAL", { exact: true }).isVisible().catch(() => false);
  checar('nome de camada mais longo "QUADRO_DISTRIBUICAO_GERAL" também aparece por completo (quebra linha se precisar, não corta)', nomeLongoVisivel);
  const naoTemReticencias = !(await page.getByText("ELE...", { exact: false }).isVisible().catch(() => false));
  checar('não sobra nenhum nome cortado com "..." no painel de camadas', naoTemReticencias);

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
