/**
 * scripts/playwright-test-iteracao42.js
 * -----------------------------------------------------------------------
 * Iteração 42 -- verificação end-to-end NA APLICAÇÃO REAL dos pedidos do
 * usuário nesta rodada (mensagem verbatim):
 *
 *  "quero ao clicar em uma linha ou texto ou bloco ele fique selecionadoe
 *  se eu clicar em varios itens todos eles vao ficando selecionados,
 *  atualmente se eu clicar em duas linha a primeira sai da selecao e
 *  mantem apenas o ultimo item selecionado. [...] interligue de uma
 *  maneira acertiva o botao de lançamento de dimensionamento de cargas ao
 *  selecionar a planta baixa com os circuitos lançados, assim teremos
 *  diagrama unifilar e multifilar e tabela de cargas vinculados a uma
 *  planta baixa, o usuario só terá o trabalho de desenhar a planta baixa,
 *  selecionar a planta baixa e lançar os cicuitos automatico e depois
 *  gerar diagrama e tabela de cargas e lista de material [...] as vezes
 *  o projetista nao tem a planta baixa, recebe apenas as informacoes de
 *  quantidades de tomadas e iluminação."
 *
 * Cobre neste script:
 *  1) Clique simples (sem Shift) em vários elementos ACUMULA a seleção
 *     (não troca mais, só o último ficando selecionado) -- e clicar de
 *     novo num item JÁ selecionado o remove (alterna), sem afetar o
 *     resto. Clicar em área vazia continua limpando tudo.
 *  2) Fluxo ponta a ponta: desenha uma "casa" de 1 cômodo (paredes
 *     duplas + nome), SELECIONA TUDO clicando em cada parede/texto (é
 *     assim que o usuário seleciona a planta baixa, já que o app não tem
 *     janela de seleção -- exatamente o motivo pelo qual o bug #1
 *     importava tanto aqui), lança tomadas/iluminação automaticamente, e
 *     confirma que o botão de Dimensionamento de Cargas abre com o
 *     ambiente já pré-preenchido (nome/tipo/área/tomadas da planta baixa,
 *     sem precisar redigitar) -- e que gerar produz tabela + diagrama do
 *     QDC vinculados a essa mesma planta.
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
  // PARTE 1: clique simples ACUMULA a seleção (não troca mais)
  // =========================================================================
  console.log("\n=== Parte 1: clique simples em vários itens acumula a seleção ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: 2000, y2: 0 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 1000, x2: 2000, y2: 1000 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 2000, x2: 2000, y2: 2000 });
  });
  await page.waitForTimeout(150);
  const [id1, id2, id3] = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.map((g) => g.id));

  let p1 = pxDoMundo(1000, 0);
  await page.mouse.click(p1.sx, p1.sy);
  await page.waitForTimeout(100);
  let sel = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar("clique na 1ª linha seleciona só ela", sel.length === 1 && sel.includes(id1), sel);

  let p2 = pxDoMundo(1000, 1000);
  await page.mouse.click(p2.sx, p2.sy);
  await page.waitForTimeout(100);
  sel = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar(
    "clique (SEM Shift) na 2ª linha ACUMULA -- a 1ª continua selecionada junto (bug relatado corrigido)",
    sel.length === 2 && sel.includes(id1) && sel.includes(id2),
    sel
  );

  let p3 = pxDoMundo(1000, 2000);
  await page.mouse.click(p3.sx, p3.sy);
  await page.waitForTimeout(100);
  sel = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar("clique na 3ª linha acumula de novo -- as 3 ficam selecionadas", sel.length === 3 && [id1, id2, id3].every((id) => sel.includes(id)), sel);

  // Clicar de novo num item JÁ selecionado o REMOVE (alterna), sem afetar o resto.
  await page.mouse.click(p1.sx, p1.sy);
  await page.waitForTimeout(100);
  sel = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar("clicar de novo na 1ª linha (já selecionada) a remove, mantendo as outras 2", sel.length === 2 && !sel.includes(id1) && sel.includes(id2) && sel.includes(id3), sel);

  // Clique em área vazia continua limpando tudo -- usa o CENTRO do canvas
  // (bem longe das 3 linhas de teste, que ficam num cantinho perto da
  // origem do mundo) em vez de coordenadas de mundo grandes, que podiam
  // cair fora da área visível do canvas e não registrar clique nenhum.
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.waitForTimeout(100);
  sel = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar("clique em área vazia limpa a seleção inteira", sel.length === 0, sel);

  // =========================================================================
  // PARTE 2: fluxo ponta a ponta -- desenhar planta -> selecionar clicando
  // em cada elemento -> lançar circuitos -> Cargas já vem pré-preenchido.
  // =========================================================================
  console.log("\n=== Parte 2: planta baixa -> seleção por cliques -> circuitos -> cargas pré-preenchido ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  await page.waitForTimeout(100);

  const E = 150;
  const W = 4000;
  const H = 3000;
  await page.evaluate(
    ([e, w, h]) => {
      const s = window.__cadStoreTeste.getState();
      // Parede dupla (face externa + interna) formando 1 cômodo retangular.
      s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: w, y2: 0 });
      s.addGeometria({ tipo: "linha", camada: "0", x1: w, y1: 0, x2: w, y2: h });
      s.addGeometria({ tipo: "linha", camada: "0", x1: w, y1: h, x2: 0, y2: h });
      s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: h, x2: 0, y2: 0 });
      s.addGeometria({ tipo: "linha", camada: "0", x1: e, y1: e, x2: w - e, y2: e });
      s.addGeometria({ tipo: "linha", camada: "0", x1: w - e, y1: e, x2: w - e, y2: h - e });
      s.addGeometria({ tipo: "linha", camada: "0", x1: w - e, y1: h - e, x2: e, y2: h - e });
      s.addGeometria({ tipo: "linha", camada: "0", x1: e, y1: h - e, x2: e, y2: e });
      s.addGeometria({ tipo: "texto", camada: "0", x: w / 2 - 300, y: h / 2, conteudo: "sala", fontSize: 129 });
    },
    [E, W, H]
  );
  await page.waitForTimeout(150);

  // "Selecionar a planta baixa" -- clica em CADA parede/texto (não há
  // janela de seleção no app; é assim que o usuário de fato monta a
  // seleção da casa inteira, ver comentário de cabeçalho).
  const pontosDeClique = [
    [W / 2, 0], // aresta de cima (externa)
    [W, H / 2], // aresta da direita (externa)
    [W / 2, H], // aresta de baixo (externa)
    [0, H / 2], // aresta da esquerda (externa)
    [W / 2, E], // aresta de cima (interna)
    [W - E, H / 2], // aresta da direita (interna)
    [W / 2, H - E], // aresta de baixo (interna)
    [E, H / 2], // aresta da esquerda (interna)
  ];
  for (const [x, y] of pontosDeClique) {
    const p = pxDoMundo(x, y);
    await page.mouse.click(p.sx, p.sy);
    await page.waitForTimeout(60);
  }
  // Texto "sala" -- clica perto do ponto de inserção.
  let pTexto = pxDoMundo(W / 2 - 250, H / 2 + 60);
  await page.mouse.click(pTexto.sx, pTexto.sy);
  await page.waitForTimeout(100);

  const totalGeometria = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.length);
  const selecaoFinal = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar(
    "todos os 9 elementos da planta (8 paredes + 1 texto) ficaram selecionados ao clicar em cada um, um de cada vez",
    selecaoFinal.length === totalGeometria && selecaoFinal.length === 9,
    { selecaoFinal, totalGeometria }
  );

  // Lançar tomadas/iluminação automaticamente (NBR 5410) na seleção.
  await page.getByRole("button", { name: /Lançar tomadas\/iluminação/ }).click();
  await page.waitForTimeout(300);
  const resultadoLancamento = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    return { totalTomadas: s.projeto.geometria.filter((g) => g.camada === "ELETRICA_TOMADAS").length };
  });
  checar("lançamento elétrico automático colocou tomadas na planta", resultadoLancamento.totalTomadas > 0, resultadoLancamento);
  // Fecha o modal de resultado do lançamento elétrico, se ainda estiver aberto.
  const fecharResultadoLancamento = page.getByRole("button", { name: "Fechar" });
  if (await fecharResultadoLancamento.first().isVisible().catch(() => false)) {
    await fecharResultadoLancamento.first().click();
    await page.waitForTimeout(150);
  }

  const selecaoAposLancamento = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar("a seleção da planta baixa continua intacta depois de lançar os circuitos (nunca é mexida)", selecaoAposLancamento.length === 9, selecaoAposLancamento);

  // Abre o Dimensionamento de Cargas -- deve vir PRÉ-PREENCHIDO a partir
  // da planta baixa (mesma seleção), sem precisar redigitar nada.
  await page.getByRole("button", { name: /Dimensionar cargas elétricas/ }).click();
  await page.waitForTimeout(200);

  const avisoPreenchimento = page.locator("text=Ambientes pré-preenchidos automaticamente");
  checar("o modal avisa que pré-preencheu a partir da planta baixa", await avisoPreenchimento.isVisible().catch(() => false));

  const campoNomeAmbiente = page.locator('[data-testid="campos-ambientes-cargas"] input').first();
  const nomeAmbientePreenchido = await campoNomeAmbiente.inputValue().catch(() => "");
  checar('nome do ambiente pré-preenchido é "sala" (vindo da planta baixa, não do exemplo genérico)', nomeAmbientePreenchido.trim().toLowerCase() === "sala", nomeAmbientePreenchido);

  // Gera o dimensionamento com o que já veio pré-preenchido (só clica Gerar).
  await page.getByRole("button", { name: "🔌 Gerar dimensionamento" }).click();
  await page.waitForTimeout(300);

  const estadoFinal = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    return {
      temTabela: s.projeto.geometria.some((g) => g.camada === "QDC_TABELA"),
      temDiagrama: s.projeto.geometria.some((g) => g.camada === "QDC_DIAGRAMA"),
      dadosSalvos: s.projeto.dadosCargasEletricas ?? null,
    };
  });
  checar("gerou a tabela de cargas (camada QDC_TABELA) vinculada à mesma planta", estadoFinal.temTabela, estadoFinal);
  checar("gerou o diagrama do QDC (camada QDC_DIAGRAMA) vinculada à mesma planta", estadoFinal.temDiagrama, estadoFinal);
  checar(
    'o ambiente salvo veio da planta baixa ("sala"), não do exemplo genérico de 4 ambientes',
    estadoFinal.dadosSalvos?.ambientes.length === 1 && estadoFinal.dadosSalvos.ambientes[0].nome.toLowerCase() === "sala",
    estadoFinal.dadosSalvos
  );

  await page.screenshot({ path: "/tmp/it42-cargas-prefill-planta-baixa.png" });

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
