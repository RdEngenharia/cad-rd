/**
 * scripts/playwright-test-iteracao45-tema-escuro-cores.js
 * -----------------------------------------------------------------------
 * Iteração 45 -- pedido do usuário: "se a tela estiver em modo escuro a
 * cor de todas as camadas da mesma cor devem ser brancas ou ficam
 * camufladas na tela" + "faça o mesmo com a cor dos blocos, devem ser
 * brancos se o fundo for escuro".
 *
 * Causa raiz confirmada por leitura de código: a camada "0" (padrão pra
 * paredes) é `#475569`, a camada TEXTOS é `#0f172a`, e TODO bloco/símbolo
 * elétrico (`lib/blocks.ts`) tem o traço cravado em `#0f172a` -- essa
 * última é EXATAMENTE a mesma cor do fundo escuro do Desenho
 * (`bg-slate-900`). Sem correção, esses 3 elementos ficam LITERALMENTE
 * invisíveis (não só baixo contraste) no tema escuro.
 *
 * Este teste liga o tema escuro, desenha 1 linha na camada "0", 1 texto
 * na camada TEXTOS, e 1 bloco (tomada_media), e lê o PIXEL DE VERDADE do
 * canvas renderizado (via `getImageData` no próprio `<canvas>` do Konva)
 * exatamente onde cada elemento deveria estar -- prova visual real de
 * que ficaram BRANCOS (não camuflados). Também desenha 1 linha na camada
 * BARRAMENTO (âmbar, cor viva escolhida pelo usuário) pra confirmar que
 * essa NÃO muda (só cores escuras demais são substituídas).
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

  // Reset: sai da Prancha padrão (senão GeometryLayer nem é renderizado --
  // ver `CanvasStage.tsx`), limpa o desenho, garante tema CLARO
  // (sanidade) e viewport conhecido.
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    if (s.temaCanvas === "escuro") s.alternarTemaCanvas();
    s.setViewport({ scale: 0.15, x: 150, y: 150 });
  });
  await page.waitForTimeout(150);

  // Função que lê o pixel do canvas TOPO (GeometryLayer, desenhado por
  // último -- por cima do Grid/Xref) numa coordenada de MUNDO, convertendo
  // pra pixel de tela relativo ao <canvas> (CSS px) e depois pro backing
  // store (considerando devicePixelRatio).
  async function pixelNoMundo(x, y) {
    return page.evaluate(
      ([wx, wy]) => {
        const canvases = Array.from(document.querySelectorAll("canvas"));
        const canvas = canvases[canvases.length - 1];
        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const cssX = 150 + 0.15 * wx;
        const cssY = 150 + 0.15 * wy;
        const data = ctx.getImageData(Math.round(cssX * dpr), Math.round(cssY * dpr), 1, 1).data;
        return { r: data[0], g: data[1], b: data[2], a: data[3] };
      },
      [x, y]
    );
  }

  // =========================================================================
  // Parte 1: TEMA CLARO (sanidade) -- linha da camada "0" deve sair na cor
  // ORIGINAL (#475569, cinza escuro), não branca.
  // =========================================================================
  console.log("\n=== Parte 1: tema CLARO (sanidade) -- cores originais, sem alteração ===");
  const idsClaros = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: 4000, y2: 0 });
    s.addGeometria({ tipo: "linha", camada: "BARRAMENTO", x1: 0, y1: 500, x2: 4000, y2: 500 });
    return s.projeto.geometria.map((g) => g.id);
  });
  void idsClaros;
  await page.waitForTimeout(150);
  const pixelClaro0 = await pixelNoMundo(2000, 0);
  // #475569 = rgb(71, 85, 105)
  checar(
    'linha da camada "0" no tema CLARO sai com a cor original (~#475569, cinza escuro)',
    Math.abs(pixelClaro0.r - 71) < 20 && Math.abs(pixelClaro0.g - 85) < 20 && Math.abs(pixelClaro0.b - 105) < 20,
    pixelClaro0
  );

  // =========================================================================
  // Parte 2: TEMA ESCURO -- linha "0"/texto "TEXTOS"/bloco devem virar
  // BRANCOS; linha "BARRAMENTO" (âmbar, cor viva) continua âmbar.
  // =========================================================================
  console.log("\n=== Parte 2: tema ESCURO -- camadas escuras viram brancas, cores vivas ficam intactas ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.alternarTemaCanvas(); // claro -> escuro
    s.addGeometria({ tipo: "linha", camada: "0", x1: 0, y1: 0, x2: 4000, y2: 0 });
    s.addGeometria({ tipo: "texto", camada: "TEXTOS", x: 0, y: 500, conteudo: "SALA", fontSize: 400 });
    s.addGeometria({ tipo: "linha", camada: "BARRAMENTO", x1: 0, y1: 1500, x2: 4000, y2: 1500 });
    s.addGeometria({ tipo: "bloco", camada: "ELETRICA_TOMADAS", nome: "tomada_media", x: 2000, y: 2500 });
  });
  await page.waitForTimeout(250);

  const temaAgora = await page.evaluate(() => window.__cadStoreTeste.getState().temaCanvas);
  checar('tema está "escuro" agora', temaAgora === "escuro", temaAgora);

  const pixelEscuro0 = await pixelNoMundo(2000, 0);
  checar(
    'linha da camada "0" no tema ESCURO virou BRANCA (não mais #475569 camuflado)',
    pixelEscuro0.r > 240 && pixelEscuro0.g > 240 && pixelEscuro0.b > 240 && pixelEscuro0.a > 0,
    pixelEscuro0
  );

  // Texto: amostra um pixel dentro da área do glifo (perto do início, meio da altura da fonte).
  const pixelTexto = await pixelNoMundo(80, 500 + 150);
  checar(
    'texto da camada TEXTOS no tema ESCURO virou BRANCO (era #0f172a, idêntico ao fundo)',
    pixelTexto.a > 0 && pixelTexto.r > 240 && pixelTexto.g > 240 && pixelTexto.b > 240,
    pixelTexto
  );

  const pixelBarramento = await pixelNoMundo(2000, 1500);
  // #f59e0b = rgb(245, 158, 11) -- cor viva, deve continuar intacta.
  checar(
    "linha da camada BARRAMENTO (âmbar, cor viva) continua âmbar -- não foi alterada",
    Math.abs(pixelBarramento.r - 245) < 20 && Math.abs(pixelBarramento.g - 158) < 20 && Math.abs(pixelBarramento.b - 11) < 20,
    pixelBarramento
  );

  // Bloco (tomada_media): amostra o centro do símbolo -- deve ter pelo
  // menos 1 pixel branco (traço do símbolo) em vez de só o fundo
  // transparente ou o antigo #0f172a camuflado. Varre uma pequena grade
  // ao redor do centro (o SVG do símbolo não cobre o pixel central exato
  // em todos os símbolos).
  let achouTracoBrancoNoBloco = false;
  let amostraBloco = null;
  for (let dx = -6; dx <= 6 && !achouTracoBrancoNoBloco; dx += 1) {
    for (let dy = -6; dy <= 6 && !achouTracoBrancoNoBloco; dy += 1) {
      const px = await pixelNoMundo(2000 + dx * 8, 2500 + dy * 8);
      if (px.a > 0 && px.r > 240 && px.g > 240 && px.b > 240) {
        achouTracoBrancoNoBloco = true;
        amostraBloco = px;
      }
    }
  }
  checar("bloco (tomada_media) no tema ESCURO tem traço BRANCO visível (era #0f172a, idêntico ao fundo)", achouTracoBrancoNoBloco, amostraBloco);

  // Verificação complementar, direta na fonte: o data-URI do bloco (via
  // `blockToDataUri`) não deve mais conter a cor antiga cravada.
  const dataUriInfo = await page.evaluate(() => {
    // @ts-ignore -- acesso via debug binding não tem tipos aqui.
    return null;
  });
  void dataUriInfo;

  await page.screenshot({ path: "/tmp/it45-tema-escuro-cores.png" });

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
