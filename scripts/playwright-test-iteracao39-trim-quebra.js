/**
 * scripts/playwright-test-iteracao39-trim-quebra.js
 * -----------------------------------------------------------------------
 * Iteração 39 -- verificação end-to-end NA APLICAÇÃO REAL do pedido do
 * usuário (com print da tela mostrando o comando de Aparar/Offset em uso
 * numa planta baixa): "estou tentando abrir uma vao de porta em uma
 * planta baixa com o comando de aparar e nao esta funcionando, teste e
 * corrija".
 *
 * Reproduz o cenário exato: uma parede reta (linha) SEM nenhuma outra
 * linha cruzando -- o TRIM de sempre não tinha como cortar nada aqui
 * (só corta em interseções). A "quebra manual" nova (2 cliques, estilo
 * BREAK do AutoCAD) deixa abrir um vão de porta em qualquer ponto da
 * parede, mesmo sem cruzamento nenhum -- e sem alterar em nada o
 * comportamento de 1-clique-corta-na-interseção já existente.
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
    // Parede reta de 6m, SEM nenhuma outra linha cruzando -- exatamente
    // o caso reportado (parede de uma planta baixa onde se quer abrir
    // um vão de porta).
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: 6000, y2: 0 });
    s.setViewport({ scale: 0.2, x: 100, y: 100 });
  });
  await page.waitForTimeout(150);
  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(x, y) {
    return { sx: canvasBox.x + 100 + 0.2 * x, sy: canvasBox.y + 100 + 0.2 * y };
  }

  // =========================================================================
  // PARTE 1: TRIM normal falha (baseline -- confirma o bug reportado)
  // =========================================================================
  console.log("\n=== Parte 1: baseline -- TRIM normal não consegue cortar uma parede sem cruzamento ===");
  await page.getByRole("button", { name: "Trim", exact: true }).click();
  await page.waitForTimeout(100);
  let p = pxDoMundo(3000, 0); // meio da parede
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  const candidataAoPassarMouse = await page.evaluate(() => window.__cadStoreTeste.getState().trimQuebraCandidata);
  checar(
    "passar o mouse sobre a linha sem cruzamento vira candidata a \"abrir vão\" (hover azul)",
    !!candidataAoPassarMouse,
    candidataAoPassarMouse
  );
  const trimPreviewAoPassarMouse = await page.evaluate(() => window.__cadStoreTeste.getState().trimPreview);
  checar("trimPreview (corte por interseção) continua null (nada cruza)", trimPreviewAoPassarMouse === null, trimPreviewAoPassarMouse);

  // =========================================================================
  // PARTE 2: quebra manual -- 2 cliques abrem o vão da porta
  // =========================================================================
  console.log("\n=== Parte 2: quebra manual (2 cliques) abre o vão de porta ===");

  // 1º clique: arma o ponto A em x=2000 (porta de 900mm começando aqui).
  p = pxDoMundo(2000, 0);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  const quebraA = await page.evaluate(() => window.__cadStoreTeste.getState().trimQuebraA);
  checar("1º clique arma o ponto A (trimQuebraA) em x=2000", !!quebraA && Math.abs(quebraA.ponto.x - 2000) < 5, quebraA);

  // Move o mouse até x=2900 (vão de 900mm) -- confirma o preview ao vivo.
  p = pxDoMundo(2900, 0);
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  const previewB = await page.evaluate(() => window.__cadStoreTeste.getState().trimQuebraPreviewB);
  checar("preview ao vivo do ponto B acompanha o mouse (projetado na mesma linha, y=0)", !!previewB && Math.abs(previewB.x - 2900) < 5 && Math.abs(previewB.y - 0) < 1, previewB);

  // 2º clique: confirma o vão.
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);

  const geoFinal = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "linha"));
  checar("depois do 2º clique, a parede virou 2 pedaços (antes/depois do vão)", geoFinal.length === 2, geoFinal);
  const esquerda = geoFinal.find((l) => Math.abs(l.x1) < 5 || Math.abs(l.x2) < 5);
  const direita = geoFinal.find((l) => Math.abs(l.x1 - 6000) < 5 || Math.abs(l.x2 - 6000) < 5);
  checar(
    "pedaço esquerdo vai de x=0 até x=2000 (o vão da porta começa aí)",
    !!esquerda && ((Math.abs(esquerda.x1) < 5 && Math.abs(esquerda.x2 - 2000) < 5) || (Math.abs(esquerda.x2) < 5 && Math.abs(esquerda.x1 - 2000) < 5)),
    esquerda
  );
  checar(
    "pedaço direito vai de x=2900 (fim do vão) até x=6000",
    !!direita && ((Math.abs(direita.x1 - 2900) < 5 && Math.abs(direita.x2 - 6000) < 5) || (Math.abs(direita.x2 - 2900) < 5 && Math.abs(direita.x1 - 6000) < 5)),
    direita
  );
  const estadoPosClique2 = await page.evaluate(() => ({
    trimQuebraA: window.__cadStoreTeste.getState().trimQuebraA,
    trimQuebraPreviewB: window.__cadStoreTeste.getState().trimQuebraPreviewB,
  }));
  checar("trimQuebraA/trimQuebraPreviewB voltam a null (pronto pro próximo vão)", estadoPosClique2.trimQuebraA === null && estadoPosClique2.trimQuebraPreviewB === null, estadoPosClique2);

  await page.screenshot({ path: "/tmp/it39-trim-quebra-vao-porta.png" });

  // =========================================================================
  // PARTE 3: regressão -- TRIM normal (1 clique numa interseção de verdade)
  // continua funcionando exatamente como antes.
  // =========================================================================
  console.log("\n=== Parte 3: regressão -- TRIM normal (cruzamento de verdade) continua igual ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: 2000, y2: 0 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 1000, y1: -1000, x2: 1000, y2: 1000 }); // cruza em (1000,0)
  });
  await page.waitForTimeout(150);
  p = pxDoMundo(500, 0); // metade esquerda da horizontal, antes do cruzamento
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  const trimPreviewCruzamento = await page.evaluate(() => window.__cadStoreTeste.getState().trimPreview);
  checar("hover numa linha com cruzamento ativa o trimPreview normal (não a quebra manual)", !!trimPreviewCruzamento, trimPreviewCruzamento);
  const candidataDuranteCruzamento = await page.evaluate(() => window.__cadStoreTeste.getState().trimQuebraCandidata);
  checar("candidata a vão fica null quando a linha JÁ tem cruzamento (comportamento antigo prevalece)", candidataDuranteCruzamento === null, candidataDuranteCruzamento);

  await page.mouse.click(p.sx, p.sy); // 1 clique só -- remove o sub-segmento em mira, igual sempre
  await page.waitForTimeout(150);
  const geoAposTrimNormal = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "linha"));
  const horizontalRestante = geoAposTrimNormal.find((l) => Math.abs(l.y1) < 1 && Math.abs(l.y2) < 1);
  checar(
    "1 clique já corta o segmento na interseção (comportamento de sempre, sem precisar de 2º clique)",
    !!horizontalRestante && ((Math.abs(horizontalRestante.x1 - 1000) < 5 && Math.abs(horizontalRestante.x2 - 2000) < 5) || (Math.abs(horizontalRestante.x2 - 1000) < 5 && Math.abs(horizontalRestante.x1 - 2000) < 5)),
    horizontalRestante
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
