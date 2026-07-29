/**
 * scripts/playwright-test-iteracao36.js
 * -----------------------------------------------------------------------
 * Iteração 36 -- verificação end-to-end NA APLICAÇÃO REAL dos 4 pedidos
 * do usuário nesta rodada:
 *  1) Tamanho padrão do texto proporcional ao desenho (10mm -> 129mm).
 *  2) Tomadas/interruptor/luz em 8x o tamanho ORIGINAL (confirmado com o
 *     usuário), com tomada baixa/média/alta diferenciadas por
 *     PREENCHIMENTO (vazado/meio/sólido), sem número escrito dentro.
 *  3) Legenda com ícones em tamanho real (1:1, sem reduzir) + retângulo
 *     contornando tudo.
 *  4) OFFSET (Deslocar) funcionando em qualquer aresta de um retângulo/
 *     quadrado fechado, não só em linhas soltas.
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
  // PARTE 1: tamanho padrão do texto (129mm)
  // =========================================================================
  console.log("\n=== Parte 1: tamanho padrão do texto ===");
  const fontSizeAtivoInicial = await page.evaluate(() => window.__cadStoreTeste.getState().textoFontSizeAtivo);
  checar("textoFontSizeAtivo padrão = 129mm", fontSizeAtivoInicial === 129, fontSizeAtivoInicial);

  // Fluxo real da UI: ferramenta Texto -> clique no canvas -> digita -> "✓ Inserir".
  await page.evaluate(() => window.__cadStoreTeste.getState().selecionarPrancha(null));
  await page.locator('button:has-text("Texto")').click();
  await page.mouse.click(400, 400);
  await page.waitForTimeout(150);
  await page.locator('textarea, input').last().fill("TESTE").catch(async () => {
    await page.keyboard.type("TESTE");
  });
  await page.waitForTimeout(100);
  const botaoInserir = page.locator('button:has-text("✓ Inserir")');
  if (await botaoInserir.isVisible().catch(() => false)) {
    await botaoInserir.click();
  } else {
    await page.keyboard.press("Control+Enter");
  }
  await page.waitForTimeout(200);
  const textoInserido = await page.evaluate(() => {
    const geo = window.__cadStoreTeste.getState().projeto.geometria;
    const t = geo.filter((g) => g.tipo === "texto" && g.conteudo === "TESTE");
    return t.length > 0 ? t[t.length - 1] : null;
  });
  checar("texto 'TESTE' inserido via UI real", !!textoInserido, textoInserido);
  checar("texto inserido usa fontSize=129mm (default, sem alterar manualmente)", textoInserido?.fontSize === 129, textoInserido);

  // =========================================================================
  // PARTE 2 e 3: tomadas (fill baixa/média/alta) + legenda com borda
  // =========================================================================
  console.log("\n=== Parte 2/3: preenchimento das tomadas + legenda ===");
  const idsInseridos = await page.evaluate(() => {
    // IMPORTANTE: a Parte 1 (texto "TESTE") já deixou geometria no projeto
    // -- captura os ids de ANTES pra devolver só os ids NOVOS desta
    // injeção (senão o texto "TESTE" solto entraria na seleção e
    // confundiria a detecção de cômodos, tratando-o como um nome de
    // ambiente "flutuando" em área aberta).
    const idsAntes = new Set(window.__cadStoreTeste.getState().projeto.geometria.map((g) => g.id));
    const s = window.__cadStoreTeste.getState();
    function linha(x1, y1, x2, y2) { s.addGeometria({ tipo: "linha", camada: "0", x1, y1, x2, y2 }); }
    function texto(x, y, c) { s.addGeometria({ tipo: "texto", camada: "0", x, y, conteudo: c, fontSize: 200 }); }

    // Sala (seca -> tomada_baixa): 3000x3000mm.
    linha(0, 0, 3000, 0); linha(3000, 0, 3000, 3000); linha(3000, 3000, 0, 3000); linha(0, 3000, 0, 0);
    texto(1200, 1500, "Sala");

    // Cozinha (bancada -> tomada_media): 3000x3000mm, gap de parede dupla.
    linha(3140, 0, 6140, 0); linha(6140, 0, 6140, 3000); linha(6140, 3000, 3140, 3000); linha(3140, 3000, 3140, 0);
    texto(4340, 1500, "Cozinha");

    // Banheiro (-> tomada_alta): 2000x2000mm.
    linha(6280, 0, 8280, 0); linha(8280, 0, 8280, 2000); linha(8280, 2000, 6280, 2000); linha(6280, 2000, 6280, 0);
    texto(6980, 1000, "Banheiro");

    // Pega o estado FRESCO de novo (`getState()` outra vez -- `s` é um
    // snapshot tirado antes dos `addGeometria` acima, ficaria
    // "congelado") e filtra só os ids que não existiam antes.
    return window.__cadStoreTeste.getState().projeto.geometria.map((g) => g.id).filter((id) => !idsAntes.has(id));
  });
  checar("geometria das 3 salas injetada", idsInseridos.length > 0, idsInseridos.length);

  await page.evaluate((ids) => { const s = window.__cadStoreTeste.getState(); for (const id of ids) s.alternarSelecao(id); }, idsInseridos);
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Lançar tomadas/iluminação")').click();
  await page.waitForTimeout(300);
  const sucesso = await page.locator('h2:has-text("Lançamento elétrico gerado")').isVisible().catch(() => false);
  checar("modal de sucesso apareceu (3 cômodos)", sucesso);
  await page.locator('button:has-text("Fechar")').first().click();
  await page.waitForTimeout(200);

  const dados = await page.evaluate(() => {
    const geo = window.__cadStoreTeste.getState().projeto.geometria;
    const blocos = geo.filter((g) => g.tipo === "bloco" && g.origemGeradorId === "lancamentoEletrico");
    return blocos.map((g) => ({ nome: g.nome, x: g.x, y: g.y, camada: g.camada, escalaX: g.escalaX, escalaY: g.escalaY }));
  });
  const tomadaBaixa = dados.find((g) => g.nome === "tomada_baixa" && g.camada !== "ELETRICA_LEGENDA");
  const tomadaMedia = dados.find((g) => g.nome === "tomada_media" && g.camada !== "ELETRICA_LEGENDA");
  const tomadaAlta = dados.find((g) => g.nome === "tomada_alta" && g.camada !== "ELETRICA_LEGENDA");
  checar("tomada_baixa (Sala) foi lançada", !!tomadaBaixa, tomadaBaixa);
  checar("tomada_media (Cozinha) foi lançada", !!tomadaMedia, tomadaMedia);
  checar("tomada_alta (Banheiro) foi lançada", !!tomadaAlta, tomadaAlta);

  const legendaBlocos = dados.filter((g) => g.camada === "ELETRICA_LEGENDA");
  checar("ícones da legenda SEM escalaX/escalaY (tamanho real 1:1)", legendaBlocos.every((g) => g.escalaX === undefined && g.escalaY === undefined), legendaBlocos);

  const retangulosLegenda = await page.evaluate(() => {
    const geo = window.__cadStoreTeste.getState().projeto.geometria;
    return geo.filter((g) => g.tipo === "retangulo" && g.camada === "ELETRICA_LEGENDA");
  });
  checar("existe 1 retângulo contornando a legenda", retangulosLegenda.length === 1, retangulosLegenda);

  // Screenshot geral (auto-enquadrado) -- visão de conjunto.
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/it36-geral.png", fullPage: false });

  // Screenshots individuais de cada tipo de tomada (zoom fechado).
  async function zoomEm(x, y, scale) {
    await page.evaluate(
      ({ x, y, scale, w, h }) => window.__cadStoreTeste.getState().setViewport({ scale, x: w / 2 - x * scale, y: h / 2 - y * scale }),
      { x, y, scale, w: 1400, h: 900 }
    );
    await page.waitForTimeout(150);
  }
  if (tomadaBaixa) { await zoomEm(tomadaBaixa.x, tomadaBaixa.y, 1.2); await page.screenshot({ path: "/tmp/it36-tomada-baixa.png" }); }
  if (tomadaMedia) { await zoomEm(tomadaMedia.x, tomadaMedia.y, 1.2); await page.screenshot({ path: "/tmp/it36-tomada-media.png" }); }
  if (tomadaAlta) { await zoomEm(tomadaAlta.x, tomadaAlta.y, 1.2); await page.screenshot({ path: "/tmp/it36-tomada-alta.png" }); }

  // Screenshot da legenda inteira (zoom out o bastante pra pegar o retângulo todo).
  if (retangulosLegenda.length === 1) {
    const r = retangulosLegenda[0];
    const cx = r.x + r.largura / 2;
    const cy = r.y + r.altura / 2;
    const scaleAjustado = Math.min(1300 / r.largura, 800 / r.altura, 1);
    await zoomEm(cx, cy, scaleAjustado);
    await page.screenshot({ path: "/tmp/it36-legenda.png" });
  }

  // =========================================================================
  // PARTE 4: OFFSET (Deslocar) numa aresta de retângulo fechado
  // =========================================================================
  console.log("\n=== Parte 4: offset (deslocar) em aresta de retângulo ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    // Limpa o projeto pra um teste limpo e isolado do offset.
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.addGeometria({ tipo: "retangulo", camada: "0", x: 0, y: 0, largura: 3000, altura: 3000 });
  });
  await page.waitForTimeout(150);

  // Viewport conhecido e fixo: scale=0.2, origem (100,100) -- mundo (0,0)
  // cai no pixel LOCAL DO STAGE (100,100); mundo (x,y) cai em
  // (100+0.2x, 100+0.2y) EM COORDENADAS DO KONVA STAGE, que são relativas
  // ao canto superior-esquerdo do próprio <canvas>, não da página inteira
  // -- o canvas fica deslocado na página (depois da sidebar/toolbar), então
  // `page.mouse.click` (coordenadas de PÁGINA) precisa somar o
  // `boundingBox()` do canvas, senão clica no lugar errado (bug já visto
  // ao rodar este script pela 1ª vez: nenhuma linha de offset aparecia).
  await page.evaluate(() => window.__cadStoreTeste.getState().setViewport({ scale: 0.2, x: 100, y: 100 }));
  await page.waitForTimeout(150);
  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(x, y) { return { sx: canvasBox.x + 100 + 0.2 * x, sy: canvasBox.y + 100 + 0.2 * y }; }

  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.setFerramenta("deslocar");
    s.setOffsetDistancia(200);
  });
  await page.waitForTimeout(150);

  // 1º teste: aresta de CIMA -- clica no meio da aresta de cima (1500,0),
  // depois clica um ponto ACIMA/FORA do retângulo (1500,-100) pra escolher
  // o lado. Espera uma nova linha (0,-200)-(3000,-200).
  let p = pxDoMundo(1500, 0);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  p = pxDoMundo(1500, -100);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);

  let linhasOffset = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "linha"));
  const linhaTopo = linhasOffset.find((l) => Math.abs(l.y1 - -200) < 1 && Math.abs(l.y2 - -200) < 1);
  checar(
    "OFFSET na aresta de CIMA do retângulo criou linha nova em y=-200 (200mm pra fora, pro lado clicado)",
    !!linhaTopo && Math.abs(linhaTopo.x1 - 0) < 1 && Math.abs(linhaTopo.x2 - 3000) < 1,
    { linhaTopo, todas: linhasOffset }
  );

  // 2º teste (distância continua armada -- "Mantém a distância armada"):
  // aresta da ESQUERDA -- clica no meio da aresta esquerda (0,1500), depois
  // um ponto À ESQUERDA/FORA (-100,1500). Espera nova linha em x=-200.
  const offsetDistanciaAindaArmada = await page.evaluate(() => window.__cadStoreTeste.getState().offsetDistancia);
  checar("distância do offset continua armada pro próximo clique (200mm)", offsetDistanciaAindaArmada === 200, offsetDistanciaAindaArmada);

  p = pxDoMundo(0, 1500);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);
  p = pxDoMundo(-100, 1500);
  await page.mouse.click(p.sx, p.sy);
  await page.waitForTimeout(150);

  linhasOffset = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.filter((g) => g.tipo === "linha"));
  const linhaEsquerda = linhasOffset.find((l) => Math.abs(l.x1 - -200) < 1 && Math.abs(l.x2 - -200) < 1);
  checar(
    "OFFSET na aresta da ESQUERDA do retângulo criou linha nova em x=-200 (200mm pra fora)",
    !!linhaEsquerda && Math.abs(Math.min(linhaEsquerda.y1, linhaEsquerda.y2) - 0) < 1 && Math.abs(Math.max(linhaEsquerda.y1, linhaEsquerda.y2) - 3000) < 1,
    { linhaEsquerda, todas: linhasOffset }
  );

  const retanguloOriginalIntacto = await page.evaluate(() => {
    const geo = window.__cadStoreTeste.getState().projeto.geometria;
    return geo.filter((g) => g.tipo === "retangulo").length === 1;
  });
  checar("retângulo original permanece intacto (offset não edita, só cria linha nova)", retanguloOriginalIntacto);

  await page.screenshot({ path: "/tmp/it36-offset-retangulo.png" });

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
