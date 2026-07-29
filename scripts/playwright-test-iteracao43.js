/**
 * scripts/playwright-test-iteracao43.js
 * -----------------------------------------------------------------------
 * Iteração 43 -- verificação end-to-end na aplicação real do pedido do
 * usuário (3 prints anexados): "sobre o comando trim ainda esta dando
 * erro, analise com atencao o print e corrija. Ainda da erro no
 * lançamento automatico de circuitos. o botao de texto precisa aceitar a
 * tecla enter i inserir o nome, atualmente eu tenho que ir com o mouse no
 * nome inserir, facilite o trabalho do projtista, altere o nome deslocar
 * para offset igual o autocad"
 *
 * Cobre as 3 partes com verificação na UI real (o 4º item -- o "sem
 * nome" no lançamento automático -- já foi coberto por testes de lógica
 * pura em `roomDetection.ts`, ver /tmp/test-casa-L-formato.ts e
 * /tmp/test-casa-L-com-porta.ts):
 *
 *   1) Botão "Offset" (era "Deslocar") -- rótulo novo, id/atalho iguais.
 *   2) Ferramenta TEXTO: Enter sozinho confirma/insere (sem precisar de
 *      mouse/Ctrl+Enter); Shift+Enter continua quebrando linha.
 *   3) TRIM "quebra manual": depois de armar o 1º clique (ponto A) numa
 *      aresta, clicar bem longe (numa aresta DIFERENTE) não trava mais o
 *      app repetindo "clique no 2º ponto" -- em vez disso cancela a
 *      quebra pendente sozinho e arma um NOVO ponto A na aresta nova.
 *
 * PRÉ-REQUISITO (não fica no código entregue): binding de debug temporário
 * `window.__cadStoreTeste` (adicionado no fim de `src/lib/store.ts` só
 * pra rodar este teste -- removido antes da entrega final).
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

  // Garante que a Prancha NÃO está ativa -- com uma Prancha ativa, quase
  // todos os botões da régua (inclusive "Offset") ficam desabilitados de
  // propósito (só Selecionar/Zoom Window/Viewport funcionam nela).
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  await page.waitForTimeout(150);

  // =========================================================================
  // PARTE 1: botão "Offset" (era "Deslocar")
  // =========================================================================
  console.log("\n=== Parte 1: botão da régua de ferramentas mostra \"Offset\", não \"Deslocar\" ===");
  const botaoOffset = page.getByRole("button", { name: "Offset", exact: true });
  checar("botão \"Offset\" existe e está visível", await botaoOffset.isVisible().catch(() => false));
  const botaoDeslocarAntigo = page.getByRole("button", { name: "Deslocar", exact: true });
  checar("botão \"Deslocar\" (rótulo antigo) NÃO existe mais", (await botaoDeslocarAntigo.count()) === 0);
  await botaoOffset.click();
  await page.waitForTimeout(100);
  const ferramentaAposClique = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar("clicar no botão \"Offset\" arma a ferramenta interna \"deslocar\" (id não mudou)", ferramentaAposClique === "deslocar", ferramentaAposClique);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // =========================================================================
  // PARTE 2: ferramenta TEXTO -- Enter sozinho confirma/insere
  // =========================================================================
  console.log("\n=== Parte 2: TEXTO -- Enter sozinho confirma (sem precisar do mouse) ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.setViewport({ scale: 0.2, x: 100, y: 100 });
  });
  await page.waitForTimeout(150);
  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(x, y) {
    return { sx: canvasBox.x + 100 + 0.2 * x, sy: canvasBox.y + 100 + 0.2 * y };
  }

  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.waitForTimeout(100);
  let p = pxDoMundo(1000, 1000);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);

  const aguardandoConteudo = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    return s.ferramenta === "texto" && !!s.pontoRascunho;
  });
  checar("depois de clicar o ponto, app aguarda o conteúdo do texto (textarea deve estar visível)", aguardandoConteudo);

  const textarea = page.locator("textarea").first();
  checar("o campo virou um <textarea> (multilinha)", await textarea.isVisible().catch(() => false));
  await textarea.fill("sala");
  await page.waitForTimeout(100);
  // ENTER sozinho (sem Shift, sem Ctrl) -- deve confirmar/inserir direto,
  // sem precisar clicar no botão "✓ Inserir" nem usar Ctrl+Enter.
  await textarea.press("Enter");
  await page.waitForTimeout(150);

  const geoAposEnter = await page.evaluate(() =>
    window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "texto")
  );
  checar("Enter sozinho já insere o texto \"sala\" (sem precisar de mouse/Ctrl+Enter)", geoAposEnter.length === 1 && geoAposEnter[0].conteudo === "sala", geoAposEnter);
  const ferramentaAposEnter = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar("depois de inserir, a ferramenta volta pra \"selecionar\" (igual antes)", ferramentaAposEnter === "selecionar", ferramentaAposEnter);

  // Regressão: Shift+Enter ainda deve permitir texto em 2+ linhas.
  console.log("\n=== Parte 2b: regressão -- Shift+Enter continua quebrando linha (texto multilinha) ===");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.waitForTimeout(100);
  p = pxDoMundo(1000, 2000);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  const textarea2 = page.locator("textarea").first();
  await textarea2.pressSequentially("linha 1");
  await textarea2.press("Shift+Enter");
  await textarea2.pressSequentially("linha 2");
  await page.waitForTimeout(100);
  await textarea2.press("Enter"); // confirma de vez, sem Shift
  await page.waitForTimeout(150);
  const geoMultilinha = await page.evaluate(() =>
    window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "texto" && g.conteudo.includes("\n"))
  );
  checar(
    "Shift+Enter ainda insere quebra de linha real (texto multilinha continua funcionando)",
    geoMultilinha.length === 1 && geoMultilinha[0].conteudo === "linha 1\nlinha 2",
    geoMultilinha
  );

  // =========================================================================
  // PARTE 3: TRIM "quebra manual" não trava mais ao clicar longe
  // =========================================================================
  console.log("\n=== Parte 3: TRIM -- clicar longe (aresta diferente) cancela a quebra pendente, sem travar ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    // 2 paredes retas, BEM separadas, sem cruzamento nenhuma com a outra.
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: 6000, y2: 0 }); // parede A
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 1500, x2: 6000, y2: 1500 }); // parede B, longe da A
  });
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "Trim", exact: true }).click();
  await page.waitForTimeout(100);

  // 1º clique na parede A (arma o ponto A da quebra manual).
  p = pxDoMundo(2000, 0);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  const quebraAInicial = await page.evaluate(() => window.__cadStoreTeste.getState().trimQuebraA);
  checar("1º clique na parede A arma o ponto A (trimQuebraA) nela", !!quebraAInicial && Math.abs(quebraAInicial.ponto.x - 2000) < 5 && Math.abs(quebraAInicial.ponto.y - 0) < 5, quebraAInicial);

  // Move o mouse pra BEM longe, sobre a parede B (>24px de distância da
  // aresta armada) -- antes do fix, isso continuava projetando (errado)
  // na parede A; agora deve cancelar a quebra pendente e reconhecer a
  // parede B como a nova candidata.
  p = pxDoMundo(2000, 1500);
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  const estadoAposMoverLonge = await page.evaluate(() => ({
    trimQuebraA: window.__cadStoreTeste.getState().trimQuebraA,
    trimQuebraCandidata: window.__cadStoreTeste.getState().trimQuebraCandidata,
  }));
  checar(
    "mover o mouse pra longe (parede B) cancela a quebra pendente da parede A (trimQuebraA volta a null)",
    estadoAposMoverLonge.trimQuebraA === null,
    estadoAposMoverLonge
  );
  checar(
    "a parede B (bem embaixo do mouse agora) vira a nova candidata a \"abrir vão\"",
    !!estadoAposMoverLonge.trimQuebraCandidata,
    estadoAposMoverLonge.trimQuebraCandidata
  );

  // Clique na parede B: antes do fix, isso ficaria preso tentando aplicar
  // a quebra na parede A (stale) e sempre falharia/repetiria a mensagem
  // "clique no 2º ponto"; agora deve armar um NOVO ponto A limpo na
  // parede B.
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  const quebraAposCliqueB = await page.evaluate(() => window.__cadStoreTeste.getState().trimQuebraA);
  checar(
    "clique na parede B arma um NOVO ponto A nela (não trava, não tenta aplicar na parede A antiga)",
    !!quebraAposCliqueB && Math.abs(quebraAposCliqueB.ponto.y - 1500) < 5,
    quebraAposCliqueB
  );

  // Fecha o vão na própria parede B pra confirmar que o fluxo completo
  // (2 cliques) continua funcionando normalmente depois da recuperação.
  p = pxDoMundo(2900, 1500);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  const geoFinal = await page.evaluate(() =>
    window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "linha")
  );
  const pedacosParedeA = geoFinal.filter((l) => Math.abs(l.y1) < 1 && Math.abs(l.y2) < 1);
  const pedacosParedeB = geoFinal.filter((l) => Math.abs(l.y1 - 1500) < 1 && Math.abs(l.y2 - 1500) < 1);
  checar("parede A continua intacta (1 segmento, nunca foi cortada de verdade)", pedacosParedeA.length === 1, pedacosParedeA);
  checar("parede B agora tem 2 pedaços (vão aberto de verdade depois da recuperação)", pedacosParedeB.length === 2, pedacosParedeB);

  await page.screenshot({ path: "/tmp/it43-trim-recuperacao.png" });

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
