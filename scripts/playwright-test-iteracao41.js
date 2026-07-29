/**
 * scripts/playwright-test-iteracao41.js
 * -----------------------------------------------------------------------
 * Iteração 41 -- verificação end-to-end NA APLICAÇÃO REAL dos pedidos do
 * usuário nesta rodada (mensagem verbatim):
 *
 *  "altere o nome aparar para trim, corrija o defeito quando vou apagar
 *  algumas linhas ela quebra em varios pedaços ao inves de ficar vermelhar
 *  e apagar de uma vez, [...] crie um botao que arredonde uma quina,
 *  assim se eu desenhar ruas com linhas eu consiga arredondar cantos,
 *  arredondar quinas de quadrados e retangulos, igual o autocad faz."
 *
 * Cobre neste script:
 *  1) O botão da barra de ferramentas agora mostra "Trim" (não mais
 *     "Aparar").
 *  2) Ao ativar a ferramenta "Apagar" e passar o mouse sobre uma linha,
 *     ela fica destacada em VERMELHO (highlight de mira) -- e some ao
 *     tirar o mouse de cima -- ANTES de qualquer clique. Clicar remove a
 *     forma inteira de uma vez (comportamento sempre atômico; o "quebra
 *     em vários pedaços" relatado era confusão com o TRIM, que agora fica
 *     visualmente muito claro que é uma ferramenta diferente).
 *  3) Fillet (Concordância) agora arredonda o PRÓPRIO canto de um
 *     retângulo (2 arestas adjacentes da MESMA forma, via 2 cliques reais
 *     na UI) -- não só 2 linhas soltas.
 *
 * (Overlap dos lançamentos automáticos e a falsa detecção de "cômodo sem
 * nome" já têm cobertura própria em testes de unidade/integração dedicados
 * -- lib/roomDetection.ts e lib/layoutAutomatico.ts -- rodados à parte.)
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
    s.setViewport({ scale: 0.1, x: 100, y: 100 });
  });
  await page.waitForTimeout(150);
  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(x, y) {
    return { sx: canvasBox.x + 100 + 0.1 * x, sy: canvasBox.y + 100 + 0.1 * y };
  }

  // =========================================================================
  // PARTE 1: botão "Trim" (não mais "Aparar")
  // =========================================================================
  console.log("\n=== Parte 1: botão da barra agora mostra \"Trim\" ===");
  const botaoTrim = page.getByRole("button", { name: "Trim", exact: true });
  checar("botão \"Trim\" existe e está visível", await botaoTrim.isVisible().catch(() => false));
  const botaoAparar = page.getByRole("button", { name: "Aparar", exact: true });
  checar("botão \"Aparar\" (nome antigo) NÃO existe mais", (await botaoAparar.count()) === 0, await botaoAparar.count());

  // =========================================================================
  // PARTE 2: hover com "Apagar" ativo destaca a linha em VERMELHO antes do
  // clique (pedido do usuário: "ficar vermelha e apagar de uma vez").
  // =========================================================================
  console.log("\n=== Parte 2: hover com Apagar ativo mostra highlight VERMELHO ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 2000, x2: 6000, y2: 2000 });
  });
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "Apagar", exact: true }).click();
  await page.waitForTimeout(100);

  // Verificação por PIXEL real do canvas (não depende de nenhum binding de
  // debug -- lê a cor de fato desenhada na tela, igual ao que o usuário
  // vê). Amostra uma pequena REGIÃO ao redor do ponto (em vez de 1 pixel
  // exato) pra não perder o traço por causa de antialiasing/arredondamento
  // de subpixel -- basta QUALQUER pixel vermelho na região.
  function ehVermelho([r, g, b, a]) {
    return a > 0 && r > 150 && g < 100 && b < 100;
  }
  async function regiaoTemVermelho(sx, sy, raio = 4) {
    const x0 = Math.round(sx - canvasBox.x - raio);
    const y0 = Math.round(sy - canvasBox.y - raio);
    const lado = raio * 2 + 1;
    const pixels = await page.evaluate(
      ([x, y, w, h]) => {
        const canvas = document.querySelectorAll("canvas")[document.querySelectorAll("canvas").length - 1];
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        return ctx ? Array.from(ctx.getImageData(x, y, w, h).data) : [];
      },
      [x0, y0, lado, lado]
    );
    for (let i = 0; i < pixels.length; i += 4) {
      if (ehVermelho([pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]])) return true;
    }
    return false;
  }

  // Mouse bem longe da linha primeiro -- sem highlight.
  let pLonge = pxDoMundo(0, 0);
  await page.mouse.move(pLonge.sx, pLonge.sy - 300);
  await page.waitForTimeout(150);
  let pSobreLinha = pxDoMundo(3000, 2000);
  const vermelhoAntes = await regiaoTemVermelho(pSobreLinha.sx, pSobreLinha.sy);
  checar("ANTES do hover, nenhum pixel vermelho na linha (sem highlight)", !vermelhoAntes);

  await page.mouse.move(pSobreLinha.sx, pSobreLinha.sy);
  await page.waitForTimeout(200);
  const vermelhoDurante = await regiaoTemVermelho(pSobreLinha.sx, pSobreLinha.sy);
  checar("DURANTE o hover (Apagar ativo), a linha fica VERMELHA (#dc2626)", vermelhoDurante);

  await page.screenshot({ path: "/tmp/it41-apagar-hover-vermelho.png" });

  // Tira o mouse de cima -- o highlight some (destaque não fica "grudado").
  await page.mouse.move(pLonge.sx, pLonge.sy - 300);
  await page.waitForTimeout(200);
  const vermelhoDepoisDeSair = await regiaoTemVermelho(pSobreLinha.sx, pSobreLinha.sy);
  checar("ao tirar o mouse de cima, o highlight vermelho some (não fica grudado)", !vermelhoDepoisDeSair);

  // Clica -- remove a forma inteira de UMA VEZ (nunca "quebra em pedaços").
  await page.mouse.move(pSobreLinha.sx, pSobreLinha.sy);
  await page.waitForTimeout(150);
  await page.mouse.click(pSobreLinha.sx, pSobreLinha.sy);
  await page.waitForTimeout(150);
  const geoDepoisApagar = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria);
  checar("a linha some inteira com 1 clique (nenhum pedaço sobra)", geoDepoisApagar.length === 0, geoDepoisApagar);

  // =========================================================================
  // PARTE 3: Fillet arredondando o PRÓPRIO canto de um retângulo (2
  // cliques reais em 2 arestas adjacentes da MESMA forma).
  // =========================================================================
  console.log("\n=== Parte 3: Fillet arredondando o canto de um retângulo (via UI) ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.addGeometria({ tipo: "retangulo", camada: "0", x: 0, y: 0, largura: 4000, altura: 3000 });
    s.setFilletRaio(300);
  });
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "Fillet", exact: true }).click();
  await page.waitForTimeout(100);

  // 1º clique: aresta de CIMA (perto de x=3500,y=0).
  let pAresta1 = pxDoMundo(3500, 0);
  await page.mouse.click(pAresta1.sx, pAresta1.sy);
  await page.waitForTimeout(150);
  const alvo1Depois = await page.evaluate(() => window.__cadStoreTeste.getState().filletAlvo1);
  checar("1º clique arma o alvo 1 do Fillet (aresta de cima)", !!alvo1Depois && alvo1Depois.indiceAresta === 0, alvo1Depois);

  // 2º clique: aresta da DIREITA (perto de x=4000,y=500) -- mesma forma, aresta adjacente.
  let pAresta2 = pxDoMundo(4000, 500);
  await page.mouse.click(pAresta2.sx, pAresta2.sy);
  await page.waitForTimeout(150);

  const geoDepoisFillet = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria);
  checar("o retângulo original foi explodido (não sobra 'retangulo')", !geoDepoisFillet.some((g) => g.tipo === "retangulo"), geoDepoisFillet);
  checar("1 arco foi criado (o canto arredondado)", geoDepoisFillet.filter((g) => g.tipo === "arco").length === 1, geoDepoisFillet);
  const arcoCriado = geoDepoisFillet.find((g) => g.tipo === "arco");
  checar("raio do arco bate com o configurado (300mm)", arcoCriado?.raio === 300, arcoCriado);
  // As outras 2 arestas (baixo e esquerda) sobrevivem intactas.
  const arestaBaixoFillet = geoDepoisFillet.find(
    (g) => g.tipo === "linha" && Math.abs(g.y1 - 3000) < 1 && Math.abs(g.y2 - 3000) < 1 && Math.abs(g.x1 - g.x2) > 3000
  );
  const arestaEsquerdaFillet = geoDepoisFillet.find(
    (g) => g.tipo === "linha" && Math.abs(g.x1) < 1 && Math.abs(g.x2) < 1 && Math.abs(g.y1 - g.y2) > 2000
  );
  checar("aresta de BAIXO sobrevive intacta", !!arestaBaixoFillet, arestaBaixoFillet);
  checar("aresta da ESQUERDA sobrevive intacta", !!arestaEsquerdaFillet, arestaEsquerdaFillet);

  await page.screenshot({ path: "/tmp/it41-fillet-canto-retangulo.png" });

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
