/**
 * scripts/playwright-test-iteracao37.js
 * -----------------------------------------------------------------------
 * Iteração 37 -- verificação end-to-end NA APLICAÇÃO REAL dos 3 pedidos
 * do usuário nesta rodada, todos sobre a ferramenta OFFSET (Deslocar):
 *
 *  1) "o botao deslocar precisa mostrar que está ativo quando encostar
 *     por cima da linha, faça ele selecionar a linha que vai ser
 *     duplicada para o usuario ver que esta funcionando" -- destaque em
 *     âmbar (`offsetHover`) na linha/aresta sob o cursor, ANTES do 1º
 *     clique.
 *  2) "quando eu arrastar para a direita ou esquerda a linha duplicada
 *     venha antes de eu clicar no local assim vou ver que está correto
 *     o lado" -- preview ao vivo (ghost ciano) da linha paralela, agora
 *     funcionando pra QUALQUER tipo de alvo (a versão anterior só
 *     reconhecia `tipo === "linha"` e ficava muda numa aresta de
 *     retângulo/polígono/polilinha -- exatamente o caso mais comum,
 *     já que a Iteração 36 tinha acabado de liberar o clique em arestas
 *     de forma fechada).
 *  3) "estou tendo dificuldade as vezes porque quando clico no botao
 *     deslocar o campo de digitar o comando da distancia nao ativa
 *     sozinho" -- o campo de comando agora reganha o foco mesmo
 *     reclicando a MESMA ferramenta já ativa, sem nenhum outro campo do
 *     store mudar de valor entre os dois cliques (`ferramentaAtivacaoSeq`).
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
  const fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(300);

  // Garante que nenhuma Prancha esteja ativa (a maioria das ferramentas,
  // incluindo Deslocar, fica desabilitada dentro de uma Prancha -- ver
  // `FERRAMENTAS_PERMITIDAS_EM_PRANCHA` em `ToolRuler.tsx`), depois monta
  // um projeto limpo + 1 retângulo 3000x3000mm, mesmo cenário do teste da
  // Iteração 36 (offset em aresta de forma fechada), reaproveitado aqui
  // pro hover e pro preview.
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.addGeometria({ tipo: "retangulo", camada: "0", x: 0, y: 0, largura: 3000, altura: 3000 });
  });
  await page.waitForTimeout(150);

  // Viewport conhecido e fixo -- mesma convenção do teste da Iteração 36:
  // mundo (0,0) cai no pixel LOCAL DO STAGE (100,100), escala 0.2.
  await page.evaluate(() => window.__cadStoreTeste.getState().setViewport({ scale: 0.2, x: 100, y: 100 }));
  await page.waitForTimeout(150);
  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(x, y) {
    return { sx: canvasBox.x + 100 + 0.2 * x, sy: canvasBox.y + 100 + 0.2 * y };
  }

  // =========================================================================
  // PARTE 1: hover ao vivo ANTES do 1º clique
  // =========================================================================
  console.log("\n=== Parte 1: hover (offsetHover) antes do 1º clique ===");

  await page.locator('button:has-text("Offset")').click();
  await page.waitForTimeout(100);
  const distanciaInputFocado1 = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
  checar("campo de comando focado automaticamente ao entrar em Deslocar (1ª vez)", distanciaInputFocado1);

  await page.keyboard.type("200");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const distanciaArmada = await page.evaluate(() => window.__cadStoreTeste.getState().offsetDistancia);
  checar("distância armada = 200mm", distanciaArmada === 200, distanciaArmada);

  // Move o mouse (sem clicar) sobre a aresta de CIMA do retângulo
  // (mundo (1500,0)) -- espera `offsetHover` apontar pro retângulo, com o
  // segmento resolvido sendo EXATAMENTE a aresta de cima (0,0)-(3000,0),
  // não o retângulo inteiro.
  let p = pxDoMundo(1500, 0);
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  let hover = await page.evaluate(() => window.__cadStoreTeste.getState().offsetHover);
  const retanguloId = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria[0].id);
  checar(
    "offsetHover aponta pro retângulo ao pairar sobre a aresta de cima",
    !!hover && hover.id === retanguloId,
    hover
  );
  checar(
    "offsetHover.segmento resolve a ARESTA DE CIMA exata (0,0)-(3000,0), não o retângulo inteiro",
    !!hover &&
      Math.min(hover.segmento.y1, hover.segmento.y2) === 0 &&
      Math.max(hover.segmento.y1, hover.segmento.y2) === 0 &&
      Math.min(hover.segmento.x1, hover.segmento.x2) === 0 &&
      Math.max(hover.segmento.x1, hover.segmento.x2) === 3000,
    hover
  );

  // Move o mouse sobre a aresta da ESQUERDA -- hover deve acompanhar e
  // resolver a aresta diferente.
  p = pxDoMundo(0, 1500);
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  hover = await page.evaluate(() => window.__cadStoreTeste.getState().offsetHover);
  checar(
    "offsetHover troca pra ARESTA DA ESQUERDA (0,0)-(0,3000) ao mover o cursor pra lá",
    !!hover &&
      Math.min(hover.segmento.x1, hover.segmento.x2) === 0 &&
      Math.max(hover.segmento.x1, hover.segmento.x2) === 0 &&
      Math.min(hover.segmento.y1, hover.segmento.y2) === 0 &&
      Math.max(hover.segmento.y1, hover.segmento.y2) === 3000,
    hover
  );

  // Move o mouse pro meio do retângulo, longe de qualquer aresta -- fora
  // da tolerância de captura (8px de tela) -- hover deve sumir (null).
  p = pxDoMundo(1500, 1500);
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  hover = await page.evaluate(() => window.__cadStoreTeste.getState().offsetHover);
  checar("offsetHover volta a null longe de qualquer aresta", hover === null, hover);

  // Volta o mouse pra cima da aresta de cima antes de clicar (screenshot
  // de conferência visual do destaque âmbar).
  p = pxDoMundo(1500, 0);
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  await page.screenshot({ path: "/tmp/it37-hover-aresta-cima.png" });

  // =========================================================================
  // PARTE 2: preview ao vivo DEPOIS do 1º clique (ghost na aresta certa)
  // =========================================================================
  console.log("\n=== Parte 2: preview ao vivo depois do 1º clique (aresta de retângulo) ===");

  // 1º clique: escolhe a aresta de cima como alvo.
  p = pxDoMundo(1500, 0);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);

  const alvoArmado = await page.evaluate(() => ({
    offsetAlvoId: window.__cadStoreTeste.getState().offsetAlvoId,
    offsetAlvoSegmento: window.__cadStoreTeste.getState().offsetAlvoSegmento,
    offsetHover: window.__cadStoreTeste.getState().offsetHover,
  }));
  checar("1º clique arma offsetAlvoId no retângulo", alvoArmado.offsetAlvoId === retanguloId, alvoArmado);
  checar(
    "offsetAlvoSegmento resolvido = aresta de cima (0,0)-(3000,0)",
    !!alvoArmado.offsetAlvoSegmento &&
      Math.min(alvoArmado.offsetAlvoSegmento.y1, alvoArmado.offsetAlvoSegmento.y2) === 0 &&
      Math.max(alvoArmado.offsetAlvoSegmento.y1, alvoArmado.offsetAlvoSegmento.y2) === 0,
    alvoArmado
  );
  checar("offsetHover volta a null assim que o alvo é armado (some o destaque de 'candidato')", alvoArmado.offsetHover === null, alvoArmado.offsetHover);

  // Move o mouse pra FORA do retângulo, acima da aresta de cima -- é
  // exatamente o gesto "arrastar pro lado" que o usuário pediu pra ver
  // ANTES de clicar. Antes desta correção, `GeometryLayer.tsx` só sabia
  // desenhar esse preview quando o alvo era `tipo === "linha"` -- numa
  // aresta de retângulo o preview ficava mudo (nenhuma linha ciano
  // aparecia), mesmo com tudo armado certo no store.
  p = pxDoMundo(1500, -150);
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  await page.screenshot({ path: "/tmp/it37-preview-lado-de-fora.png" });

  // Confirma visualmente via pixel-sampling: a região onde o ghost ciano
  // deveria aparecer (perto de mundo (1500,-200), ou seja pxDoMundo(1500,-200)
  // em coordenadas de STAGE) deve conter pixels na cor do ghost (COR_GHOST
  // = #0ea5e9), não o fundo cinza-claro da tela.
  const corGhostPresente = await page.evaluate(() => {
    // O Konva empilha CADA `<Layer>` no seu PRÓPRIO elemento `<canvas>`
    // (grid, geometria, overlay etc.), todos sobrepostos via CSS -- o
    // ghost do OFFSET é desenhado na camada de geometria, não
    // necessariamente a 1ª do DOM. Varre TODOS os canvases da página.
    const canvases = document.querySelectorAll("canvas");
    const x = Math.round(100 + 0.2 * 1500);
    const y = Math.round(100 + 0.2 * -200);
    for (const canvas of canvases) {
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      // Varre uma janela pequena ao redor do ponto esperado (a linha tem
      // largura fixa em pixels de tela, não exatamente 1px).
      for (let dy = -6; dy <= 6; dy++) {
        const py = y + dy;
        if (py < 0 || py >= canvas.height) continue;
        const row = ctx.getImageData(Math.max(0, x - 20), py, Math.min(40, canvas.width - Math.max(0, x - 20)), 1).data;
        for (let i = 0; i < row.length; i += 4) {
          const [r, g, b, a] = [row[i], row[i + 1], row[i + 2], row[i + 3]];
          // #0ea5e9 -> (14, 165, 233) -- tolerância generosa (antialiasing).
          if (a > 0 && Math.abs(r - 14) < 40 && Math.abs(g - 165) < 40 && Math.abs(b - 233) < 40) return true;
        }
      }
    }
    return false;
  });
  checar(
    "preview ciano (ghost) da linha paralela aparece no canvas ao mover o mouse pro lado de fora (aresta de retângulo -- caso que antes ficava mudo)",
    corGhostPresente
  );

  // 2º clique: confirma o offset (mesma matemática já testada na
  // Iteração 36 -- aqui só re-confirmando que o refactor pra
  // `lib/offset.ts` não quebrou o fluxo de aplicar de fato).
  p = pxDoMundo(1500, -150);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  const linhasOffset = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "linha"));
  const linhaTopo = linhasOffset.find((l) => Math.abs(l.y1 - -200) < 1 && Math.abs(l.y2 - -200) < 1);
  checar(
    "2º clique aplica o offset de fato: nova linha em y=-200, x=0..3000",
    !!linhaTopo && Math.abs(linhaTopo.x1 - 0) < 1 && Math.abs(linhaTopo.x2 - 3000) < 1,
    { linhaTopo, todas: linhasOffset }
  );

  // =========================================================================
  // PARTE 3: foco automático do campo de comando reclicando a MESMA
  // ferramenta já ativa (bug relatado: "as vezes...nao ativa sozinho")
  // =========================================================================
  console.log("\n=== Parte 3: foco automático reclicando Deslocar já ativo ===");

  // Estado agora: ferramenta já é "deslocar" (nunca trocou desde a Parte
  // 1/2), mas offsetDistancia continua ARMADA em 200 (offset concluído
  // não reseta a distância -- ver `aplicarOffset`). Escolhe outra
  // ferramenta primeiro, SEM usá-la, só pra chegar num estado limpo antes
  // do teste real: ferramenta != "deslocar", offsetDistancia != null.
  await page.locator('button:has-text("Selecionar")').click();
  await page.waitForTimeout(100);

  // 1º clique em Deslocar: ferramenta muda -> mesmo o código ANTIGO já
  // focava aqui (a dependência `ferramenta` do efeito mudou de valor).
  await page.locator('button:has-text("Offset")').click();
  await page.waitForTimeout(100);
  const focoNoPrimeiroClique = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
  checar("1º clique em Deslocar foca o campo de comando", focoNoPrimeiroClique);

  // Zera a distância (simula ela já estar null, como logo na 1ª ativação
  // da ferramenta) e tira o foco do campo manualmente (simula o usuário
  // clicando em outro lugar da página sem trocar de ferramenta).
  await page.evaluate(() => window.__cadStoreTeste.getState().setOffsetDistancia(NaN));
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(100);
  const focoAposBlur = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
  checar("(sanidade) o campo perdeu o foco depois do blur manual", !focoAposBlur, focoAposBlur);

  // 2º clique em Deslocar: ferramenta JÁ ERA "deslocar" (não muda de
  // valor) e offsetDistancia JÁ ERA null (não muda de valor) -- é
  // EXATAMENTE o cenário relatado pelo usuário. Sem `ferramentaAtivacaoSeq`
  // forçando o efeito a rodar de novo, o campo continuaria sem foco aqui.
  await page.locator('button:has-text("Offset")').click();
  await page.waitForTimeout(100);
  const focoNoSegundoClique = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
  checar(
    "2º clique em Deslocar (mesma ferramenta já ativa, offsetDistancia já null) RE-foca o campo de comando -- bug relatado corrigido",
    focoNoSegundoClique
  );

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
