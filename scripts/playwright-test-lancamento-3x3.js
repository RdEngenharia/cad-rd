/**
 * scripts/playwright-test-lancamento-3x3.js
 * -----------------------------------------------------------------------
 * Iteração 35b (bugfix) -- verificação end-to-end NA APLICAÇÃO REAL,
 * reproduzindo EXATAMENTE o relato do usuário: "encontrei um erro no
 * dimensionamento dos circuitos, quero as simbologias faceando com a
 * parede da planta baixa e preciso que eles tenham o tamanho visivel,
 * simulei em um comodo 3mx3m e fica invisivel aos olhos a simbologia".
 *
 * Cobre:
 *  1) Um cômodo "Quarto" 3000x3000mm (o mesmo teste do usuário) -- depois
 *     de gerar, tira um screenshot da casa inteira já auto-enquadrada
 *     (mesmo enquadramento automático que o usuário veria na tela) pra
 *     confirmar visualmente que a simbologia NÃO está mais invisível.
 *  2) Um cômodo "Cozinha" 3000x3000mm (espaçamento de 3,5m -> 4 tomadas,
 *     ~1 por parede num quadrado) -- pra cada tomada, usa a posição/ângulo
 *     REAIS lidos direto do store (sem adivinhar) pra enquadrar um zoom
 *     fechado nela e tirar um screenshot individual, confirmando que o
 *     símbolo está de fato ENCOSTADO e VIRADO pra a parede mais próxima
 *     (as 4 orientações: parede de cima/direita/baixo/esquerda).
 *
 * PRÉ-REQUISITO (não fica no código entregue): mesmo binding de debug
 * temporário `window.__cadStoreTeste` já usado em
 * `scripts/playwright-test-lancamento.js` -- ver o cabeçalho daquele
 * arquivo para instruções de como reativar/remover.
 * -----------------------------------------------------------------------
 */
const { chromium } = require("playwright");
const fs = require("fs");

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
  if (await fecharProjetos.isVisible().catch(() => false)) {
    await fecharProjetos.click();
  }
  await page.waitForTimeout(300);

  // -----------------------------------------------------------------------
  // Injeta 2 cômodos 3x3m (Quarto seco + Cozinha bancada), garante que
  // estamos no "Desenho" (não numa Prancha, ver gotcha documentado -- senão
  // o auto-enquadramento de `gerarLancamentoEletrico` não se aplica).
  // -----------------------------------------------------------------------
  const idsInseridos = await page.evaluate(() => {
    const store = window.__cadStoreTeste;
    if (!store) return null;
    const s = store.getState();
    s.selecionarPrancha(null);

    function linha(x1, y1, x2, y2) {
      s.addGeometria({ tipo: "linha", camada: "0", x1, y1, x2, y2 });
    }
    function texto(x, y, conteudo) {
      s.addGeometria({ tipo: "texto", camada: "0", x, y, conteudo, fontSize: 200 });
    }

    // Quarto: 3000x3000mm -- EXATAMENTE o repro do usuário ("comodo 3mx3m").
    linha(0, 0, 3000, 0);
    linha(3000, 0, 3000, 3000);
    linha(3000, 3000, 0, 3000);
    linha(0, 3000, 0, 0);
    texto(1500, 1500, "Quarto");

    // Cozinha: 3000x3000mm, parede dupla de 140mm de gap -- espaçamento de
    // tomada por norma é 3,5m (não 5m) -> ceil(12/3.5)=4, ~1 tomada por
    // parede num quadrado, ótimo pra testar as 4 orientações de uma vez.
    linha(3140, 0, 6140, 0);
    linha(6140, 0, 6140, 3000);
    linha(6140, 3000, 3140, 3000);
    linha(3140, 3000, 3140, 0);
    texto(4640, 1500, "Cozinha");

    return store.getState().projeto.geometria.map((g) => g.id);
  });

  checar("binding de debug encontrado e geometria injetada (10 itens)", Array.isArray(idsInseridos) && idsInseridos.length === 10, idsInseridos);

  await page.evaluate((ids) => {
    const store = window.__cadStoreTeste;
    for (const id of ids) store.getState().alternarSelecao(id);
  }, idsInseridos);
  await page.waitForTimeout(200);

  const botao = page.locator('button:has-text("Lançar tomadas/iluminação")');
  checar("botão HABILITADO após selecionar os 2 cômodos", await botao.isEnabled());
  await botao.click();
  await page.waitForTimeout(300);

  const tituloSucesso = page.locator('h2:has-text("Lançamento elétrico gerado")');
  const okModal = await tituloSucesso.isVisible().catch(() => false);
  checar("modal de SUCESSO apareceu", okModal);
  if (!okModal) {
    const corpo = await page.locator("body").innerText().catch(() => "");
    console.log("  (corpo da página:", corpo.slice(0, 600), ")");
  }
  await page.locator('button:has-text("Fechar")').first().click();
  await page.waitForTimeout(200);

  // -----------------------------------------------------------------------
  // Aguarda o auto-enquadramento (`enquadramentoPendente` -> aplicado pelo
  // CanvasStage) e tira o screenshot GERAL -- é EXATAMENTE o que o usuário
  // veria na tela ao clicar no botão, sem nenhum zoom manual extra da
  // minha parte. Este é o teste direto do relato "fica invisivel aos
  // olhos" -- se o bug persistisse, o retângulo do Quarto apareceria
  // "limpo", sem nenhum triângulo/círculo visível dentro dele.
  // -----------------------------------------------------------------------
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/3x3-geral.png", fullPage: false });
  console.log("  screenshot geral salvo em /tmp/3x3-geral.png");

  // -----------------------------------------------------------------------
  // Lê a geometria de verdade direto do store (sem UI) pra saber POSIÇÃO e
  // ROTAÇÃO reais de cada tomada/interruptor lançado, e classificar quais
  // pertencem à Cozinha (x >= 3140) pra testar as 4 orientações.
  // -----------------------------------------------------------------------
  const dados = await page.evaluate(() => {
    const store = window.__cadStoreTeste;
    const geo = store.getState().projeto.geometria;
    const blocos = geo.filter((g) => g.tipo === "bloco" && g.origemGeradorId === "lancamentoEletrico" && g.camada !== "ELETRICA_LEGENDA");
    return blocos.map((g) => ({ nome: g.nome, x: g.x, y: g.y, rotacao: g.rotacao ?? null, camada: g.camada }));
  });
  fs.writeFileSync("/tmp/3x3-blocos.json", JSON.stringify(dados, null, 2));

  const tomadasCozinha = dados.filter((g) => g.nome.startsWith("tomada_") && g.x >= 3140);
  checar("Cozinha: 4 tomadas lançadas (ceil(12/3.5))", tomadasCozinha.length === 4, tomadasCozinha.length);
  checar("Cozinha: todas as tomadas têm rotacao numérica", tomadasCozinha.every((g) => typeof g.rotacao === "number"), tomadasCozinha);

  const tomadasQuarto = dados.filter((g) => g.nome.startsWith("tomada_") && g.x < 3000);
  checar("Quarto: 3 tomadas lançadas (ceil(12/5))", tomadasQuarto.length === 3, tomadasQuarto.length);

  // Classifica cada tomada da Cozinha pela parede mais próxima (bbox
  // 3140-6140 x 0-3000) e confere se a rotação bate com a normal
  // ESPERADA daquela parede (mesma fórmula documentada publicamente em
  // `anguloFaceandoParede`, duplicada aqui de forma independente).
  const MINX = 3140, MAXX = 6140, MINY = 0, MAXY = 3000;
  function anguloEsperado(x, y) {
    const distTopo = y - MINY;
    const distBaixo = MAXY - y;
    const distEsq = x - MINX;
    const distDir = MAXX - x;
    const menor = Math.min(distTopo, distBaixo, distEsq, distDir);
    let nx = 0, ny = 0;
    if (menor === distTopo) { nx = 0; ny = 1; }
    else if (menor === distBaixo) { nx = 0; ny = -1; }
    else if (menor === distEsq) { nx = 1; ny = 0; }
    else { nx = -1; ny = 0; }
    let graus = (Math.atan2(nx, -ny) * 180) / Math.PI;
    if (graus < 0) graus += 360;
    return graus;
  }

  let idx = 0;
  for (const t of tomadasCozinha) {
    idx++;
    const esperado = anguloEsperado(t.x, t.y);
    const diff = Math.min(Math.abs(t.rotacao - esperado), 360 - Math.abs(t.rotacao - esperado));
    checar(
      `Cozinha tomada #${idx} (${t.x.toFixed(0)},${t.y.toFixed(0)}) rotacao=${t.rotacao.toFixed(1)}° faceando a parede mais próxima (esperado ${esperado}°)`,
      diff < 1,
      { t, esperado }
    );

    // Zoom fechado (scale alto) centrado no símbolo -- confirma visualmente
    // que ele está: (a) claramente visível/grande o bastante, (b) com a
    // base encostada na parede (não flutuando torto).
    const scale = 0.35; // px/mm -- num viewport de 1400x900, mostra ~4000x2570mm ao redor do ponto.
    await page.evaluate(
      ({ x, y, scale, w, h }) => {
        window.__cadStoreTeste.getState().setViewport({ scale, x: w / 2 - x * scale, y: h / 2 - y * scale });
      },
      { x: t.x, y: t.y, scale, w: 1400, h: 900 }
    );
    await page.waitForTimeout(150);
    await page.screenshot({ path: `/tmp/3x3-cozinha-tomada-${idx}.png`, fullPage: false });
    console.log(`  screenshot cozinha tomada #${idx} salvo em /tmp/3x3-cozinha-tomada-${idx}.png`);
  }

  // Mesmo zoom fechado numa tomada do Quarto (o cômodo do repro literal do
  // usuário) -- confirma visibilidade individual do símbolo também aqui.
  if (tomadasQuarto[0]) {
    const t = tomadasQuarto[0];
    const scale = 0.35;
    await page.evaluate(
      ({ x, y, scale, w, h }) => {
        window.__cadStoreTeste.getState().setViewport({ scale, x: w / 2 - x * scale, y: h / 2 - y * scale });
      },
      { x: t.x, y: t.y, scale, w: 1400, h: 900 }
    );
    await page.waitForTimeout(150);
    await page.screenshot({ path: "/tmp/3x3-quarto-tomada-1.png", fullPage: false });
    console.log("  screenshot quarto tomada #1 salvo em /tmp/3x3-quarto-tomada-1.png");
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
