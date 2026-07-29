/**
 * scripts/playwright-test-iteracao44.js
 * -----------------------------------------------------------------------
 * Iteração 44 -- verificação end-to-end NA APLICAÇÃO REAL do pedido do
 * usuário (mensagem verbatim, 2 prints anexados mostrando o modal de
 * Projetos vazio e a tela "Recent" do AutoCAD como referência):
 *
 *  "eu simulei uma cozinha fechada e lancei os cicuitos e depois gerei
 *  automaticamente o quadro de cargas, resolvi adicionar umas tue na
 *  cozinha como ar condicionado e fogao de inducao, quero que se eu
 *  lançar circuitos extras a simbologia dessas tomadas apareçam
 *  automaticamente no comodo, tomada Tue, se depois eu resolver lançar
 *  mais tomadas na planta baixa manualmente o botao deve atualizar o
 *  quadro de cargas e tabelas, [...] quero que o fundo da tela tenha a
 *  opcao de branco e escuro igual no autocad"
 *
 * Cobre neste script (o item "tabela de disjuntores editável" já é
 * suportado por infraestrutura EXISTENTE -- seleciona 1 texto, edita o
 * conteúdo na barra de propriedades -- e o item "abrir projeto salvo" já
 * está implementado por completo em `ProjectManagerModal.tsx`; nenhum dos
 * 2 precisou de código novo nesta rodada, ver mensagem de entrega):
 *
 *  1) TUE cadastrado no Dimensionamento de Cargas -> ao lançar circuitos
 *     de novo, o símbolo `tomada_tue` + texto com o nome do equipamento
 *     aparecem automaticamente no cômodo certo.
 *  2) Botão "🔄 Sincronizar com a planta baixa": tomada adicionada
 *     manualmente depois do lançamento -- o Dimensionamento de Cargas
 *     reflete a contagem real ao sincronizar, preservando os TUEs já
 *     cadastrados.
 *  3) Toggle de tema claro/escuro do fundo do Desenho.
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
  // SETUP: casa de 1 cômodo (cozinha, parede dupla) -> seleciona tudo ->
  // 1º lançamento (ainda sem TUE nenhum cadastrado).
  // =========================================================================
  console.log("\n=== Setup: cozinha fechada -> seleção -> 1º lançamento (sem TUE) ===");
  const E = 150;
  const W = 4000;
  const H = 3000;
  await page.evaluate(
    ([e, w, h]) => {
      const s = window.__cadStoreTeste.getState();
      s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: w, y2: 0 });
      s.addGeometria({ tipo: "linha", camada: "0", x1: w, y1: 0, x2: w, y2: h });
      s.addGeometria({ tipo: "linha", camada: "0", x1: w, y1: h, x2: 0, y2: h });
      s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: h, x2: 0, y2: 0 });
      s.addGeometria({ tipo: "linha", camada: "0", x1: e, y1: e, x2: w - e, y2: e });
      s.addGeometria({ tipo: "linha", camada: "0", x1: w - e, y1: e, x2: w - e, y2: h - e });
      s.addGeometria({ tipo: "linha", camada: "0", x1: w - e, y1: h - e, x2: e, y2: h - e });
      s.addGeometria({ tipo: "linha", camada: "0", x1: e, y1: h - e, x2: e, y2: e });
      s.addGeometria({ tipo: "texto", camada: "0", x: w / 2 - 400, y: h / 2, conteudo: "cozinha", fontSize: 129 });
    },
    [E, W, H]
  );
  await page.waitForTimeout(150);

  const pontosDeClique = [
    [W / 2, 0],
    [W, H / 2],
    [W / 2, H],
    [0, H / 2],
    [W / 2, E],
    [W - E, H / 2],
    [W / 2, H - E],
    [E, H / 2],
  ];
  for (const [x, y] of pontosDeClique) {
    const p = pxDoMundo(x, y);
    await page.mouse.click(p.sx, p.sy);
    await page.waitForTimeout(50);
  }
  let pTexto = pxDoMundo(W / 2 - 350, H / 2 + 60);
  await page.mouse.click(pTexto.sx, pTexto.sy);
  await page.waitForTimeout(100);

  const selecaoInicial = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar("9 elementos da cozinha selecionados (8 paredes + 1 texto)", selecaoInicial.length === 9, selecaoInicial);

  await page.getByRole("button", { name: /Lançar tomadas\/iluminação/ }).click();
  await page.waitForTimeout(300);
  const fecharResultado1 = page.getByRole("button", { name: "Fechar" });
  if (await fecharResultado1.first().isVisible().catch(() => false)) {
    await fecharResultado1.first().click();
    await page.waitForTimeout(150);
  }
  const tomadasAposPrimeiroLancamento = await page.evaluate(
    () => window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "bloco" && g.nome === "tomada_media").length
  );
  checar("1º lançamento colocou tomadas normais (tomada_media, cozinha é bancada)", tomadasAposPrimeiroLancamento > 0, tomadasAposPrimeiroLancamento);
  const tueAntesDeCadastrar = await page.evaluate(
    () => window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "bloco" && g.nome === "tomada_tue").length
  );
  checar("nenhum tomada_tue ainda (nenhum TUE cadastrado no Dimensionamento de Cargas)", tueAntesDeCadastrar === 0, tueAntesDeCadastrar);

  // =========================================================================
  // PARTE 1: cadastra 2 TUEs no Dimensionamento de Cargas -> relança
  // circuitos -> símbolos tomada_tue aparecem automaticamente.
  // =========================================================================
  console.log("\n=== Parte 1: TUE cadastrado -> símbolo aparece automaticamente ao relançar circuitos ===");
  await page.getByRole("button", { name: /Dimensionar cargas elétricas/ }).click();
  await page.waitForTimeout(200);

  const nomeAmbiente = await page.locator('[data-testid="campos-ambientes-cargas"] input').first().inputValue();
  checar('ambiente pré-preenchido é "cozinha" (vindo da planta baixa)', nomeAmbiente.trim().toLowerCase() === "cozinha", nomeAmbiente);

  const botaoAddTue = page.getByRole("button", { name: "+ Adicionar equipamento (TUE) neste ambiente" });
  await botaoAddTue.click();
  await page.waitForTimeout(100);
  await botaoAddTue.click();
  await page.waitForTimeout(100);

  const nomesTue = page.locator('input[placeholder="ex.: Chuveiro Elétrico"]');
  checar("2 linhas de TUE adicionadas no formulário", (await nomesTue.count()) === 2, await nomesTue.count());
  await nomesTue.nth(0).fill("Ar-condicionado");
  await nomesTue.nth(1).fill("Fogão de indução");

  const potenciasTue = page.locator('input[placeholder="W"]');
  await potenciasTue.nth(0).fill("1400");
  await potenciasTue.nth(1).fill("3500");

  await page.getByRole("button", { name: "🔌 Gerar dimensionamento" }).click();
  await page.waitForTimeout(300);
  const fecharCargas1 = page.getByRole("button", { name: "Fechar" });
  if (await fecharCargas1.first().isVisible().catch(() => false)) {
    await fecharCargas1.first().click();
    await page.waitForTimeout(150);
  }

  const dadosSalvosAposGerar = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.dadosCargasEletricas);
  checar(
    "os 2 TUEs foram salvos no projeto (dadosCargasEletricas)",
    dadosSalvosAposGerar?.ambientes?.[0]?.tues?.length === 2,
    dadosSalvosAposGerar?.ambientes?.[0]?.tues
  );

  // Relança os circuitos NA MESMA seleção (Iteração 42: a seleção nunca é
  // mexida pelo lançamento) -- agora deve trazer os símbolos de TUE junto.
  const selecaoAindaAtiva = await page.evaluate(() => window.__cadStoreTeste.getState().selecionadoIds);
  checar("seleção da cozinha continua ativa depois do Dimensionamento de Cargas", selecaoAindaAtiva.length === 9, selecaoAindaAtiva);

  await page.getByRole("button", { name: /Lançar tomadas\/iluminação/ }).click();
  await page.waitForTimeout(300);

  const resumoTexto = await page.locator("text=/TUE\\(s\\)/").first().textContent().catch(() => "");
  checar("resultado do lançamento menciona TUE(s) no resumo", /TUE/.test(resumoTexto || ""), resumoTexto);

  const fecharResultado2 = page.getByRole("button", { name: "Fechar" });
  if (await fecharResultado2.first().isVisible().catch(() => false)) {
    await fecharResultado2.first().click();
    await page.waitForTimeout(150);
  }

  const estadoAposRelancamento = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    // Filtra pela camada ELETRICA_TOMADAS (planta baixa de verdade) -- a
    // legenda (`gerarLegendaEletrica`) desenha 1 ícone extra de CADA bloco
    // usado (camada ELETRICA_LEGENDA), o que é comportamento CORRETO e
    // esperado (mesmo tratamento de tomada_media/interruptor_simples/etc),
    // não deve ser contado aqui como um 3º símbolo na planta.
    const blocosTue = s.projeto.geometria.filter((g) => g.tipo === "bloco" && g.nome === "tomada_tue" && g.camada === "ELETRICA_TOMADAS");
    const textosTue = s.projeto.geometria.filter(
      (g) => g.tipo === "texto" && (g.conteudo === "Ar-condicionado" || g.conteudo === "Fogão de indução")
    );
    return { qtdBlocosTue: blocosTue.length, qtdTextosTue: textosTue.length };
  });
  checar("2 símbolos tomada_tue lançados automaticamente na cozinha", estadoAposRelancamento.qtdBlocosTue === 2, estadoAposRelancamento);
  checar("2 textos com o nome de cada equipamento (Ar-condicionado, Fogão de indução) lançados", estadoAposRelancamento.qtdTextosTue === 2, estadoAposRelancamento);

  await page.screenshot({ path: "/tmp/it44-tue-lancado-automaticamente.png" });

  // =========================================================================
  // PARTE 2: tomada extra adicionada manualmente -> botão "Sincronizar
  // com a planta baixa" atualiza a contagem, preservando os TUEs.
  // =========================================================================
  console.log("\n=== Parte 2: sincronizar quadro de cargas depois de tomada extra manual ===");
  const quantidadeTomadasAntesDoExtra = await page.evaluate(
    () => window.__cadStoreTeste.getState().projeto.dadosCargasEletricas.ambientes[0].quantidadeTomadas
  );

  // Simula o projetista arrastando MAIS 1 tomada manual pra dentro da
  // cozinha (mesma ação de `addGeometria` que o drag&drop da biblioteca
  // de blocos dispara de verdade).
  await page.evaluate(([w, h]) => {
    const s = window.__cadStoreTeste.getState();
    s.addGeometria({ tipo: "bloco", camada: "ELETRICA_TOMADAS", nome: "tomada_media", x: w / 2, y: h - 300 });
  }, [W, H]);
  await page.waitForTimeout(100);

  await page.getByRole("button", { name: /Ajustar dimensionamento de cargas/ }).click();
  await page.waitForTimeout(200);

  const botaoSincronizar = page.getByRole("button", { name: "🔄 Sincronizar com a planta baixa" });
  checar("botão de sincronizar está visível e habilitado (seleção da planta ainda ativa)", await botaoSincronizar.isEnabled().catch(() => false));
  await botaoSincronizar.click();
  await page.waitForTimeout(200);

  const statusSincronizacao = await page.locator("text=/Sincronizado/").first().textContent().catch(() => "");
  checar("mensagem de status confirma a sincronização", /Sincronizado/.test(statusSincronizacao || ""), statusSincronizacao);

  // Ordem dos <input> no card do ambiente (o campo "Tipo" é um <select>,
  // não conta): 0=Nome, 1=Área (m²), 2=Qtd. de tomadas, 3=Qtd. de lâmpadas.
  const quantidadeTomadasCampo = await page.locator('[data-testid="campos-ambientes-cargas"] input').nth(2).inputValue();
  checar(
    "quantidade de tomadas no formulário aumentou em 1 (reflete a tomada extra manual)",
    Number(quantidadeTomadasCampo.replace(",", ".")) === quantidadeTomadasAntesDoExtra + 1,
    { quantidadeTomadasCampo, quantidadeTomadasAntesDoExtra }
  );

  const nomesTueAposSincronizar = page.locator('input[placeholder="ex.: Chuveiro Elétrico"]');
  const valoresTue = await nomesTueAposSincronizar.evaluateAll((els) => els.map((e) => e.value));
  checar(
    "os 2 TUEs (Ar-condicionado, Fogão de indução) continuam intactos depois de sincronizar",
    valoresTue.length === 2 && valoresTue.includes("Ar-condicionado") && valoresTue.includes("Fogão de indução"),
    valoresTue
  );

  // Fecha o modal (Cancelar/X) sem gerar de novo -- só queríamos conferir o formulário.
  const fecharModalCargas = page.locator('button[title="Fechar sem gerar"]');
  if (await fecharModalCargas.isVisible().catch(() => false)) await fecharModalCargas.click();
  await page.waitForTimeout(100);

  // =========================================================================
  // PARTE 3: tema claro/escuro do fundo do Desenho.
  // =========================================================================
  console.log("\n=== Parte 3: toggle de tema claro/escuro do Desenho ===");
  const temaInicial = await page.evaluate(() => window.__cadStoreTeste.getState().temaCanvas);
  checar('tema inicial é "claro" (padrão, nunca muda quem nunca mexeu no toggle)', temaInicial === "claro", temaInicial);

  const botaoTema = page.getByRole("button", { name: /TEMA/ });
  checar('botão mostra "☀️ TEMA CLARO" antes do clique', (await botaoTema.textContent())?.includes("CLARO"));
  await botaoTema.click();
  await page.waitForTimeout(150);

  const temaDepoisDoClique = await page.evaluate(() => window.__cadStoreTeste.getState().temaCanvas);
  checar('clicar no botão muda o tema pra "escuro"', temaDepoisDoClique === "escuro", temaDepoisDoClique);
  checar('botão passa a mostrar "🌙 TEMA ESCURO"', (await botaoTema.textContent())?.includes("ESCURO"));

  const bgEscuro = await page.evaluate(() => {
    const el = document.querySelector("canvas")?.closest(".overflow-hidden");
    return el ? el.className : "";
  });
  checar("o container do canvas ganhou a classe de fundo escuro (bg-slate-900)", bgEscuro.includes("bg-slate-900"), bgEscuro);

  // Alterna de volta -- confirma reversibilidade (nada fica "preso" no escuro).
  await botaoTema.click();
  await page.waitForTimeout(150);
  const temaFinal = await page.evaluate(() => window.__cadStoreTeste.getState().temaCanvas);
  checar('clicar de novo volta pro tema "claro"', temaFinal === "claro", temaFinal);
  const bgClaro = await page.evaluate(() => {
    const el = document.querySelector("canvas")?.closest(".overflow-hidden");
    return el ? el.className : "";
  });
  checar("o container do canvas volta pra classe de fundo claro (bg-slate-100)", bgClaro.includes("bg-slate-100"), bgClaro);

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
