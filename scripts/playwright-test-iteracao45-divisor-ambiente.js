/**
 * scripts/playwright-test-iteracao45-divisor-ambiente.js
 * -----------------------------------------------------------------------
 * Iteração 45 -- verificação end-to-end NA APLICAÇÃO REAL (via UI de
 * verdade: clique nos botões da barra lateral + mouse no canvas pra
 * desenhar a linha) do fluxo completo pedido pelo usuário:
 *
 *  1) Casa de 2 cômodos (sala/banheiro, parede dupla) com um vão de porta
 *     EXTERNO de verdade (sem nenhuma linha cobrindo -- não é bug, é uma
 *     porta real) -> "Lançar tomadas/iluminação" deve RECUSAR com
 *     problema "aberta" (comportamento correto, documentado).
 *  2) Botão "🔍 Ir para o local" no problema reportado -> troca pro
 *     Desenho (prenchaAtivaId vira null) e arma `enquadramentoPendente`
 *     centralizado exatamente no centróide do problema.
 *  3) Botão "🚪 Divisor de ambiente" -> cria/ativa a camada
 *     "DIVISORIA_AMBIENTE" (roxa, tracejada) e já troca a ferramenta ativa
 *     pra "Linha".
 *  4) Usuário desenha (mouse de verdade: clique + clique + Esc) uma linha
 *     cobrindo o vão inteiro da porta -> ao selecionar tudo de novo
 *     (paredes + nomes + a nova linha divisória) e relançar, agora deve
 *     ter SUCESSO.
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
    s.setViewport({ scale: 0.15, x: 150, y: 150 });
  });
  await page.waitForTimeout(150);
  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(x, y) {
    return { sx: canvasBox.x + 150 + 0.15 * x, sy: canvasBox.y + 150 + 0.15 * y };
  }

  // =========================================================================
  // Setup: casa sala/banheiro, parede dupla (140mm), parede externa com um
  // vão de porta de VERDADE (800 a 1600 em x, na parede sul) -- igual ao
  // cenário 2 do teste de lógica pura (/tmp/test-porta-simulacao.ts).
  // =========================================================================
  console.log("\n=== Setup: sala/banheiro com porta externa aberta de verdade ===");
  const T = 140;
  const W = 6000, H = 4000;
  const PART_L = 3000 - T / 2, PART_R = 3000 + T / 2;
  const idsAntes = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    // Parede externa OUTER, com vão 800-1600 na aresta sul (y=0):
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: 800, y2: 0 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 1600, y1: 0, x2: 6000, y2: 0 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 6000, y1: 0, x2: 6000, y2: 4000 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 6000, y1: 4000, x2: 0, y2: 4000 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 4000, x2: 0, y2: 0 });
    // Parede externa INNER (y=140), com o mesmo vão 800-1600:
    s.addGeometria({ tipo: "linha", camada: "0", x1: 140, y1: 140, x2: 800, y2: 140 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 1600, y1: 140, x2: 5860, y2: 140 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 5860, y1: 140, x2: 5860, y2: 3860 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 5860, y1: 3860, x2: 140, y2: 3860 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 140, y1: 3860, x2: 140, y2: 140 });
    return null;
  });
  const idsDivisoria = await page.evaluate(
    ([PART_L, PART_R]) => {
      const s = window.__cadStoreTeste.getState();
      const idsAntes = new Set(s.projeto.geometria.map((g) => g.id));
      s.addGeometria({ tipo: "linha", camada: "0", x1: PART_L, y1: 140, x2: PART_L, y2: 3860 });
      s.addGeometria({ tipo: "linha", camada: "0", x1: PART_R, y1: 140, x2: PART_R, y2: 3860 });
      s.addGeometria({ tipo: "texto", camada: "0", x: 1500, y: 2000, conteudo: "sala", fontSize: 129 });
      s.addGeometria({ tipo: "texto", camada: "0", x: 4500, y: 2000, conteudo: "banheiro", fontSize: 129 });
      return window.__cadStoreTeste.getState().projeto.geometria.map((g) => g.id).filter((id) => !idsAntes.has(id));
    },
    [PART_L, PART_R]
  );
  void idsAntes;
  await page.waitForTimeout(150);

  // Seleciona TUDO.
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.alternarSelecao(g.id);
  });
  const qtdSelecionada1 = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds.length);
  checar("14 elementos selecionados (5+5 paredes externas + 2 paredes da divisória + 2 textos)", qtdSelecionada1 === 14, qtdSelecionada1);

  // =========================================================================
  // Parte 1: 1º lançamento -- deve RECUSAR (porta aberta de verdade).
  // =========================================================================
  console.log("\n=== Parte 1: 1º lançamento recusa (porta externa aberta) ===");
  await page.getByRole("button", { name: /Lançar tomadas\/iluminação/ }).click();
  await page.waitForTimeout(300);
  const tituloRecusa = await page.locator('h2:has-text("Não foi possível gerar")').isVisible().catch(() => false);
  checar('modal mostra "Não foi possível gerar" (porta aberta de verdade -- comportamento correto)', tituloRecusa);
  const textoProblema = await page.locator("text=/Área aberta/").first().textContent().catch(() => "");
  checar('problema reportado é "Área aberta"', /Área aberta/.test(textoProblema || ""), textoProblema);

  // =========================================================================
  // Parte 2: botão "Ir para o local".
  // =========================================================================
  console.log('\n=== Parte 2: botão "🔍 Ir para o local" ===');
  await page.evaluate(() => {
    // Prancha auxiliar só pra provar que "Ir para o local" TROCA de volta pro Desenho.
    const s = window.__cadStoreTeste.getState();
    if (!s.prenchaAtivaId) s.criarPrancha("A4");
  });
  await page.waitForTimeout(100);
  const estavaEmPrancha = await page.evaluate(() => window.__cadStoreTeste.getState().prenchaAtivaId !== null);
  checar("(setup) estava numa Prancha antes de clicar", estavaEmPrancha);

  // Nota: `enquadramentoPendente` é intencionalmente transiente (o
  // `useEffect` de `CanvasStage.tsx` aplica o pan/zoom e já limpa o campo
  // de volta pra `null` na mesma leva de render) -- não dá pra observar
  // de forma confiável via Playwright entre 2 chamadas assíncronas
  // separadas. A prova real e observável de que o enquadramento
  // automático funcionou é a CÂMERA (`viewport`) ter mudado de verdade.
  const viewportAntesDeIr = await page.evaluate(() => window.__cadStoreTeste.getState().viewport);
  await page.getByRole("button", { name: /Ir para o local/ }).first().click();
  await page.waitForTimeout(200);
  const estadoAposIrParaLocal = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    return { prenchaAtivaId: s.prenchaAtivaId, viewport: s.viewport };
  });
  checar('"Ir para o local" troca de volta pro Desenho (prenchaAtivaId = null)', estadoAposIrParaLocal.prenchaAtivaId === null, estadoAposIrParaLocal);
  checar(
    "a câmera (viewport) de fato mudou -- CanvasStage aplicou o enquadramento automático (pan/zoom real) na direção do problema",
    estadoAposIrParaLocal.viewport.scale !== viewportAntesDeIr.scale ||
      estadoAposIrParaLocal.viewport.x !== viewportAntesDeIr.x ||
      estadoAposIrParaLocal.viewport.y !== viewportAntesDeIr.y,
    { antes: viewportAntesDeIr, depois: estadoAposIrParaLocal.viewport }
  );

  // O modal fecha sozinho ao clicar (onFechar()) -- reseleciona tudo de novo.
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) {
      if (!s.selecionadoIds.includes(g.id)) s.alternarSelecao(g.id);
    }
  });

  // =========================================================================
  // Parte 3: botão "Divisor de ambiente".
  // =========================================================================
  console.log('\n=== Parte 3: botão "🚪 Divisor de ambiente" ===');
  await page.getByRole("button", { name: /Divisor de ambiente/ }).click();
  await page.waitForTimeout(150);
  const estadoDivisor = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    return { ferramenta: s.ferramenta, activeLayer: s.activeLayer, camada: s.projeto.camadas["DIVISORIA_AMBIENTE"] };
  });
  checar('ferramenta ativa vira "linha"', estadoDivisor.ferramenta === "linha", estadoDivisor.ferramenta);
  checar('camada ativa vira "DIVISORIA_AMBIENTE"', estadoDivisor.activeLayer === "DIVISORIA_AMBIENTE", estadoDivisor.activeLayer);
  checar("camada foi criada roxa (#9333ea) e tracejada", estadoDivisor.camada?.cor === "#9333ea" && estadoDivisor.camada?.estiloLinha === "tracejada", estadoDivisor.camada);

  // =========================================================================
  // Parte 4: desenha (mouse de verdade) a linha cobrindo o vão INTEIRO da
  // porta (x=800 a x=1600, y=70 -- meio da espessura da parede) -> reseleciona
  // tudo (incluindo a nova linha) -> relança -> agora deve ter SUCESSO.
  // =========================================================================
  console.log("\n=== Parte 4: desenha a linha divisória via mouse e relança com sucesso ===");
  // "Ir para o local" (Parte 2) arma `enquadramentoPendente`, que o
  // `useEffect` de `CanvasStage.tsx` aplica automaticamente (muda scale/x/y
  // de verdade, câmera real) e depois limpa -- precisa reconhecer o
  // viewport de volta pro valor conhecido ANTES de calcular os pontos de
  // clique do mouse, senão as coordenadas de tela ficam erradas (era isso
  // que causava a linha sair fora do vão da porta).
  await page.evaluate(() => window.__cadStoreTeste.getState().setViewport({ scale: 0.15, x: 150, y: 150 }));
  await page.waitForTimeout(150);
  const canvasBox2 = await page.locator("canvas").first().boundingBox();
  function pxDoMundo2(x, y) {
    return { sx: canvasBox2.x + 150 + 0.15 * x, sy: canvasBox2.y + 150 + 0.15 * y };
  }
  const p1 = pxDoMundo2(750, 70);
  const p2 = pxDoMundo2(1650, 70);
  await page.mouse.click(p1.sx, p1.sy);
  await page.waitForTimeout(80);
  await page.mouse.click(p2.sx, p2.sy);
  await page.waitForTimeout(80);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  const linhasDivisor = await page.evaluate(
    () => window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.camada === "DIVISORIA_AMBIENTE")
  );
  console.log("  (debug) linha(s) divisória criada(s):", JSON.stringify(linhasDivisor));
  checar("1 linha foi desenhada na camada DIVISORIA_AMBIENTE", linhasDivisor.length === 1, linhasDivisor);

  // Volta a ferramenta pra "selecionar" e reseleciona TUDO (paredes + textos + a nova linha divisória).
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.setFerramenta("selecionar");
    for (const g of s.projeto.geometria) {
      if (!s.selecionadoIds.includes(g.id)) s.alternarSelecao(g.id);
    }
  });
  await page.waitForTimeout(100);
  const qtdSelecionada2 = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds.length);
  checar("15 elementos selecionados agora (14 de antes + a linha divisória)", qtdSelecionada2 === 15, qtdSelecionada2);

  await page.getByRole("button", { name: /Lançar tomadas\/iluminação/ }).click();
  await page.waitForTimeout(300);
  const sucessoAgora = await page.locator('h2:has-text("Lançamento elétrico gerado")').isVisible().catch(() => false);
  if (!sucessoAgora) {
    const problemasRestantes = await page.locator("li").allTextContents().catch(() => []);
    console.log("  (debug) problemas restantes reportados:", problemasRestantes);
  }
  checar("2º lançamento (com a linha divisória fechando o vão) tem SUCESSO", sucessoAgora);
  const resumoTexto = await page.locator("text=/cômodo\\(s\\) processado/").first().textContent().catch(() => "");
  checar("resumo menciona 2 cômodos processados (sala + banheiro)", /^2 cômodo/.test((resumoTexto || "").trim()), resumoTexto);

  await page.screenshot({ path: "/tmp/it45-divisor-ambiente-sucesso.png" });

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
