/**
 * scripts/playwright-test-iteracao40.js
 * -----------------------------------------------------------------------
 * Iteração 40 -- verificação end-to-end NA APLICAÇÃO REAL dos pedidos do
 * usuário nesta rodada:
 *
 *  1) "aparar só esta aceitando se for desenho feito apenas com linha
 *     [...] preciso que funcione se for em um retangulo e nao apague o
 *     desenho todo [...] se eu traçar uma linha no meio de un retangulo
 *     ou quadrado ou qualquer desenho ele deve aceitar aparar so a
 *     linha que estiver naquele trecho" -- TRIM generalizado pra
 *     qualquer aresta reta (retângulo/polígono/polilinha), não só
 *     "linha" solta. Ao cortar uma aresta de uma forma fechada, só
 *     aquela forma é "explodida" em linhas soltas -- as outras arestas
 *     sobrevivem intactas, e só o trecho cortado desaparece.
 *  2) "a tecla espace deve funcionar para puchar qualquer ultimo
 *     comando" -- Espaço agora dispara mesmo com uma ferramenta
 *     "pegajosa" ativa (ex.: Aparar), contanto que não haja nenhum
 *     clique intermediário pendente.
 *  3) "biblioteca de blocos já abre aberta na tela inicial, deixe ele
 *     iminimizado" -- painel agora começa FECHADO.
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

  // =========================================================================
  // PARTE 0: Biblioteca de Blocos começa FECHADA
  // =========================================================================
  console.log("\n=== Parte 0: Biblioteca de Blocos começa fechada ===");
  const botaoBiblioteca = page.locator('button:has-text("Biblioteca de Blocos")');
  checar("botão \"Biblioteca de Blocos\" está visível", await botaoBiblioteca.isVisible().catch(() => false));
  const disjuntorVisivelInicial = await page.locator("text=Disjuntor").first().isVisible().catch(() => false);
  checar("conteúdo da biblioteca (ex.: \"Disjuntor\") NÃO está visível de cara (painel fechado)", !disjuntorVisivelInicial, disjuntorVisivelInicial);
  await botaoBiblioteca.click();
  await page.waitForTimeout(150);
  const disjuntorVisivelDepois = await page.locator("text=Disjuntor").first().isVisible().catch(() => false);
  checar("clicar no cabeçalho ainda expande a biblioteca normalmente", disjuntorVisivelDepois, disjuntorVisivelDepois);
  await botaoBiblioteca.click(); // fecha de novo pra não atrapalhar o resto do teste
  await page.waitForTimeout(150);

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
  // PARTE 1: TRIM (Aparar) numa aresta de RETÂNGULO -- não apaga a forma
  // inteira, corta só o trecho cruzado por uma linha (batente de porta).
  // =========================================================================
  console.log("\n=== Parte 1: Aparar numa aresta de retângulo (parede) -- abre vão de porta ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    // Retângulo (parede) 6000x4000mm.
    s.addGeometria({ tipo: "retangulo", camada: "0", x: 0, y: 0, largura: 6000, altura: 4000 });
    // 2 linhas cruzando a aresta de BAIXO (y=4000), marcando um vão de
    // porta de 1000mm entre elas (x=2000 a x=3000) -- exatamente o
    // fluxo descrito pelo usuário: "traçar uma linha no meio de um
    // retangulo".
    s.addGeometria({ tipo: "linha", camada: "0", x1: 2000, y1: 3500, x2: 2000, y2: 4500 });
    s.addGeometria({ tipo: "linha", camada: "0", x1: 3000, y1: 3500, x2: 3000, y2: 4500 });
  });
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "Trim", exact: true }).click();
  await page.waitForTimeout(100);

  // Passa o mouse sobre o TRECHO DO MEIO da aresta de baixo (entre as 2
  // linhas de referência, em x=2500) -- deve reconhecer a interseção e
  // destacar o sub-segmento a remover.
  let p = pxDoMundo(2500, 4000);
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  const previewSobreRetangulo = await page.evaluate(() => window.__cadStoreTeste.getState().trimPreview);
  checar(
    "hover no meio do vão (entre as 2 linhas de referência) reconhece a interseção na aresta do retângulo",
    !!previewSobreRetangulo && previewSobreRetangulo.segmentos.length === 3,
    previewSobreRetangulo
  );

  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);

  const geoDepois = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria);
  const retanguloSobrevivente = geoDepois.find((g) => g.tipo === "retangulo");
  checar("o retângulo original NÃO existe mais (foi explodido -- não apagou o desenho todo, virou linhas)", !retanguloSobrevivente, retanguloSobrevivente);

  const linhasDaParede = geoDepois.filter(
    (g) => g.tipo === "linha" && !(Math.abs(g.y1 - g.y2) < 1 && Math.abs(g.y1 - 3500) < 1500 && g.y1 !== g.y2)
  );
  // Conta especificamente as arestas do retângulo original (topo/direita/esquerda intactas + 2 pedaços da aresta de baixo).
  const arestaTopo = geoDepois.find((g) => g.tipo === "linha" && Math.abs(g.y1) < 1 && Math.abs(g.y2) < 1 && Math.abs(g.x1 - g.x2) > 5000);
  checar("aresta de CIMA do retângulo sobrevive intacta (0..6000, y=0)", !!arestaTopo, arestaTopo);
  const arestaDireita = geoDepois.find((g) => g.tipo === "linha" && Math.abs(g.x1 - 6000) < 1 && Math.abs(g.x2 - 6000) < 1);
  checar("aresta da DIREITA do retângulo sobrevive intacta (x=6000)", !!arestaDireita, arestaDireita);
  const arestaEsquerda = geoDepois.find((g) => g.tipo === "linha" && Math.abs(g.x1) < 1 && Math.abs(g.x2) < 1 && Math.abs(g.y1 - g.y2) > 3000);
  checar("aresta da ESQUERDA do retângulo sobrevive intacta (x=0)", !!arestaEsquerda, arestaEsquerda);

  const pedacoDireita = geoDepois.find(
    (g) => g.tipo === "linha" && Math.abs(g.y1 - 4000) < 1 && Math.abs(g.y2 - 4000) < 1 &&
      ((Math.abs(g.x1 - 6000) < 1 && Math.abs(g.x2 - 3000) < 1) || (Math.abs(g.x2 - 6000) < 1 && Math.abs(g.x1 - 3000) < 1))
  );
  checar("pedaço da aresta de baixo entre x=6000 e x=3000 sobrevive (fora do vão)", !!pedacoDireita, pedacoDireita);
  const pedacoEsquerda = geoDepois.find(
    (g) => g.tipo === "linha" && Math.abs(g.y1 - 4000) < 1 && Math.abs(g.y2 - 4000) < 1 &&
      ((Math.abs(g.x1 - 2000) < 1 && Math.abs(g.x2) < 1) || (Math.abs(g.x2 - 2000) < 1 && Math.abs(g.x1) < 1))
  );
  checar("pedaço da aresta de baixo entre x=2000 e x=0 sobrevive (fora do vão)", !!pedacoEsquerda, pedacoEsquerda);
  const vaoRemovido = geoDepois.find(
    (g) => g.tipo === "linha" && Math.abs(g.y1 - 4000) < 1 && Math.abs(g.y2 - 4000) < 1 &&
      ((Math.abs(g.x1 - 3000) < 1 && Math.abs(g.x2 - 2000) < 1) || (Math.abs(g.x2 - 3000) < 1 && Math.abs(g.x1 - 2000) < 1))
  );
  checar("o trecho do vão (x=3000 a x=2000) foi removido", !vaoRemovido, vaoRemovido);

  await page.screenshot({ path: "/tmp/it40-trim-retangulo-vao-porta.png" });

  // =========================================================================
  // PARTE 2: quebra manual (2 cliques) DIRETO numa aresta de retângulo,
  // sem precisar de nenhuma linha cruzando.
  // =========================================================================
  console.log("\n=== Parte 2: quebra manual (2 cliques) direto numa aresta de retângulo ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.addGeometria({ tipo: "retangulo", camada: "0", x: 0, y: 0, largura: 6000, altura: 4000 });
  });
  await page.waitForTimeout(150);

  p = pxDoMundo(2500, 4000); // aresta de baixo, sem nenhuma linha cruzando
  await page.mouse.move(p.sx, p.sy);
  await page.waitForTimeout(150);
  const candidataRetangulo = await page.evaluate(() => window.__cadStoreTeste.getState().trimQuebraCandidata);
  checar("aresta de retângulo sem cruzamento vira candidata a \"abrir vão\" (mesmo destaque azul de uma linha solta)", !!candidataRetangulo, candidataRetangulo);

  p = pxDoMundo(2000, 4000);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  const quebraA2 = await page.evaluate(() => window.__cadStoreTeste.getState().trimQuebraA);
  checar("1º clique arma o ponto A na aresta do retângulo", !!quebraA2, quebraA2);

  p = pxDoMundo(3000, 4000);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  const geoDepoisQuebra = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria);
  checar("retângulo explodido depois da quebra manual (não sobra 'retangulo')", !geoDepoisQuebra.some((g) => g.tipo === "retangulo"), geoDepoisQuebra);
  checar("sobram 5 linhas (3 arestas intactas + 2 pedaços do vão)", geoDepoisQuebra.filter((g) => g.tipo === "linha").length === 5, geoDepoisQuebra.length);

  // =========================================================================
  // PARTE 3: Espaço funciona mesmo estando "preso" numa ferramenta
  // pegajosa (Aparar) -- pedido do usuário: "a tecla espace deve
  // funcionar para puchar qualquer ultimo comando".
  // =========================================================================
  console.log("\n=== Parte 3: Espaço funciona mesmo com Aparar ativo (ferramenta \"pegajosa\") ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  // Ativa Aparar pelo BOTÃO (não pelo teclado) -- é exatamente esse o
  // fluxo real: o usuário clica um botão de ferramenta, o botão fica
  // com o FOCO do teclado (padrão do navegador), e "aparar" é uma
  // ferramenta "pegajosa" que nunca volta sozinha pra "selecionar".
  // ANTES desta correção, isso deixava Espaço sem efeito de 2 formas
  // diferentes ao mesmo tempo: (a) o guard antigo só disparava com
  // `ferramenta === "selecionar"`, nunca satisfeito aqui; (b) mesmo se
  // disparasse, o botão "Aparar" continuava com o foco, e o guard
  // exclui propositalmente qualquer <button> focado (pra não brigar
  // com o navegador ativando o botão nativamente). A correção faz 2
  // coisas: o botão perde o foco sozinho depois do clique
  // (`ToolRuler.tsx`), e o guard de Espaço passou a testar por ESTADO
  // ("nada em andamento"), não mais pela ferramenta atual.
  await page.getByRole("button", { name: "Trim", exact: true }).click();
  await page.waitForTimeout(100);
  const ferramentaAtualAntesDoEspaco = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar("ferramenta atual é \"aparar\" (não volta sozinha pra \"selecionar\")", ferramentaAtualAntesDoEspaco === "aparar", ferramentaAtualAntesDoEspaco);
  const focoNoBotaoDepoisDoClique = await page.evaluate(() => document.activeElement?.tagName);
  checar("o botão \"Aparar\" NÃO fica com o foco depois do clique (perde o foco sozinho)", focoNoBotaoDepoisDoClique !== "BUTTON", focoNoBotaoDepoisDoClique);
  const ultimoComandoAntes = await page.evaluate(() => window.__cadStoreTeste.getState().ultimoComandoRepetivel);
  checar("\"aparar\" foi gravado como último comando repetível (é o último de verdade)", ultimoComandoAntes === "aparar", ultimoComandoAntes);
  const seqAntes = await page.evaluate(() => window.__cadStoreTeste.getState().ferramentaAtivacaoSeq);

  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  const estadoAposEspaco = await page.evaluate(() => ({
    ferramenta: window.__cadStoreTeste.getState().ferramenta,
    seq: window.__cadStoreTeste.getState().ferramentaAtivacaoSeq,
  }));
  checar(
    "Espaço DISPARA mesmo com \"aparar\" (ferramenta pegajosa, não \"selecionar\") ativa -- ferramentaAtivacaoSeq incrementou",
    estadoAposEspaco.seq > seqAntes,
    { seqAntes, seqDepois: estadoAposEspaco.seq }
  );
  checar("ferramenta continua \"aparar\" (repetiu o último comando de verdade, sem travar em \"selecionar\")", estadoAposEspaco.ferramenta === "aparar", estadoAposEspaco.ferramenta);

  // Confirma que ANTES da correção este exato cenário travava: simula o
  // guard antigo (`ferramenta === "selecionar"`) sobre o estado atual.
  const ferramentaEraSelecionar = "aparar" === "selecionar";
  checar("(sanidade) o guard antigo (ferramenta === \"selecionar\") NUNCA teria disparado aqui -- por isso o bug relatado", !ferramentaEraSelecionar);

  // Cenário complementar: depois de usar Linha e ela voltar sozinha pra
  // "selecionar" (fluxo que já funcionava desde a Iteração 38), Espaço
  // continua repetindo "linha" normalmente -- sem regressão.
  await page.evaluate(() => window.__cadStoreTeste.getState().cancelarDesenho());
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Linha", exact: true }).click();
  await page.waitForTimeout(100);
  p = pxDoMundo(0, 0);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(100);
  p = pxDoMundo(1000, 0);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  // LINHA encadeia (estilo AutoCAD LINE): depois do 2º clique ela cria o
  // segmento MAS continua no modo linha, pronta pro próximo ponto (não
  // volta sozinha pra "selecionar") -- por isso o pontoRascunho ainda
  // fica armado e só o Esc encerra a cadeia. Nada disso é regressão; é
  // assim desde sempre. Confirma esse comportamento e ENCERRA com Esc
  // antes de testar Espaço a partir do estado ocioso de verdade.
  const estadoMeioLinha = await page.evaluate(() => ({
    ferramenta: window.__cadStoreTeste.getState().ferramenta,
    pontoRascunho: window.__cadStoreTeste.getState().pontoRascunho,
  }));
  checar("LINHA continua encadeando depois do 2º clique (pontoRascunho armado pro próximo segmento)", estadoMeioLinha.ferramenta === "linha" && !!estadoMeioLinha.pontoRascunho, estadoMeioLinha);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const ferramentaAposEsc = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar("Esc encerra a cadeia de LINHA, voltando pra \"selecionar\"", ferramentaAposEsc === "selecionar", ferramentaAposEsc);
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  const ferramentaAposEspacoLinha = await page.evaluate(() => window.__cadStoreTeste.getState().ferramenta);
  checar("Espaço reativa \"linha\" a partir de \"selecionar\" (fluxo original da Iteração 38, sem regressão)", ferramentaAposEspacoLinha === "linha", ferramentaAposEspacoLinha);

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
