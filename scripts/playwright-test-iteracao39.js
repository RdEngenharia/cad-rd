/**
 * scripts/playwright-test-iteracao39.js
 * -----------------------------------------------------------------------
 * Iteração 39 -- verificação end-to-end NA APLICAÇÃO REAL de 2 pedidos
 * do usuário:
 *
 *  1) "ainda esta com problema no comando de desenhar linha, preciso de
 *     uma linha reta para cima,baixo e laterais sem ela ficar torta [...]
 *     preciso de uma linha perfeita na vertical ou orizontal e nao existe
 *     essa opcao ainda" -- o ORTHO já existia mas só era aplicado no
 *     clique final; o PREVIEW ao vivo (linha de borracha enquanto
 *     arrasta) ficava torto o tempo todo. Corrigido: `aplicarOrtho`
 *     agora também é usado no `handleMouseMove`, e o F8 (atalho padrão
 *     do AutoCAD) liga/desliga o ORTHO.
 *  2) Follow-up auto-corrigido (não pedido explicitamente, mas achado
 *     durante o teste da Iteração 38): StatusBar/CommandLine ainda
 *     mostravam "CONCORDANCIA" (id interno cru) em vez de "FILLET" --
 *     corrigido via `NOME_FERRAMENTA`.
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
    s.setViewport({ scale: 0.2, x: 100, y: 100 });
  });
  await page.waitForTimeout(150);
  const canvasBox = await page.locator("canvas").first().boundingBox();
  function pxDoMundo(x, y) {
    return { sx: canvasBox.x + 100 + 0.2 * x, sy: canvasBox.y + 100 + 0.2 * y };
  }

  // =========================================================================
  // PARTE 0: NOME_FERRAMENTA -- StatusBar/CommandLine mostram "FILLET"
  // =========================================================================
  console.log("\n=== Parte 0: rótulo amigável (StatusBar/CommandLine) para a ferramenta Fillet ===");
  await page.locator('button:has-text("Fillet")').click();
  await page.waitForTimeout(100);
  const statusBarTexto = await page.locator("text=Ferramenta:").locator("..").innerText().catch(() => "");
  checar(
    'StatusBar mostra "Fillet" (não "concordancia" cru) quando a ferramenta Fillet está ativa',
    /fillet/i.test(statusBarTexto) && !/concordancia/i.test(statusBarTexto),
    statusBarTexto
  );
  const commandBadgeTexto = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("body *"));
    const el = els.find((e) => e.children.length === 0 && /concordancia|fillet/i.test(e.textContent || ""));
    return el ? el.textContent : null;
  });
  checar(
    'nenhum elemento de texto folha na tela mostra "concordancia" cru (deve mostrar "FILLET")',
    !commandBadgeTexto || !/concordancia/i.test(commandBadgeTexto),
    commandBadgeTexto
  );
  await page.evaluate(() => window.__cadStoreTeste.getState().setFerramenta("selecionar"));
  await page.waitForTimeout(100);

  // =========================================================================
  // PARTE 1: ORTHO desligado -- preview ao vivo fica DIAGONAL (baseline)
  // =========================================================================
  console.log("\n=== Parte 1: baseline -- ORTHO desligado, preview diagonal normalmente ===");
  const orthoInicial = await page.evaluate(() => window.__cadStoreTeste.getState().orthoAtivo);
  checar("ORTHO começa desligado (padrão, igual ao AutoCAD)", orthoInicial === false, orthoInicial);

  await page.getByRole("button", { name: "Linha", exact: true }).click();
  await page.waitForTimeout(100);
  let p0 = pxDoMundo(0, 0);
  await page.mouse.click(p0.sx, p0.sy);
  await page.waitForTimeout(100);
  let p1 = pxDoMundo(1000, 600); // diagonal -- não é nem horizontal nem vertical
  await page.mouse.move(p1.sx, p1.sy);
  await page.waitForTimeout(100);
  const previewSemOrtho = await page.evaluate(() => window.__cadStoreTeste.getState().ponteiroMundo);
  checar(
    "sem ORTHO, o preview ao vivo (ponteiroMundo) fica na diagonal (dx e dy diferentes de 0)",
    !!previewSemOrtho && Math.abs(previewSemOrtho.x - 1000) < 5 && Math.abs(previewSemOrtho.y - 600) < 5,
    previewSemOrtho
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // =========================================================================
  // PARTE 2: liga ORTHO pelo botão da StatusBar, testa preview ao vivo reto
  // =========================================================================
  console.log("\n=== Parte 2: ORTHO ligado pelo botão -- preview ao vivo (rubber-band) fica RETO ===");
  await page.locator('button:has-text("ORTHO OFF")').click();
  await page.waitForTimeout(100);
  const orthoLigado = await page.evaluate(() => window.__cadStoreTeste.getState().orthoAtivo);
  checar("clicar no botão ORTHO liga o modo (orthoAtivo = true)", orthoLigado === true, orthoLigado);
  checar('botão da StatusBar agora mostra "ORTHO ON"', await page.locator('button:has-text("ORTHO ON")').isVisible().catch(() => false));

  await page.getByRole("button", { name: "Linha", exact: true }).click();
  await page.waitForTimeout(100);
  p0 = pxDoMundo(0, 0);
  await page.mouse.click(p0.sx, p0.sy);
  await page.waitForTimeout(100);

  // Move o mouse na diagonal (maior deslocamento em X) -- com ORTHO
  // ligado, o preview deve travar em Y=0 (linha horizontal), SEM
  // precisar clicar ainda -- exatamente o que o usuário pediu ("o
  // comando livre deve existir mais [...] preciso de uma linha perfeita
  // na vertical ou horizontal").
  p1 = pxDoMundo(1000, 300);
  await page.mouse.move(p1.sx, p1.sy);
  await page.waitForTimeout(100);
  const previewComOrthoH = await page.evaluate(() => window.__cadStoreTeste.getState().ponteiroMundo);
  checar(
    "ORTHO ligado + deslocamento maior em X: preview ao vivo trava em Y=0 (horizontal) ANTES do clique",
    !!previewComOrthoH && Math.abs(previewComOrthoH.y - 0) < 1 && Math.abs(previewComOrthoH.x - 1000) < 5,
    previewComOrthoH
  );

  // Agora desloca o mouse com maior deslocamento em Y -- preview deve
  // travar em X=0 (vertical).
  p1 = pxDoMundo(300, 1000);
  await page.mouse.move(p1.sx, p1.sy);
  await page.waitForTimeout(100);
  const previewComOrthoV = await page.evaluate(() => window.__cadStoreTeste.getState().ponteiroMundo);
  checar(
    "ORTHO ligado + deslocamento maior em Y: preview ao vivo trava em X=0 (vertical) ANTES do clique",
    !!previewComOrthoV && Math.abs(previewComOrthoV.x - 0) < 1 && Math.abs(previewComOrthoV.y - 1000) < 5,
    previewComOrthoV
  );

  // Clica pra fechar a linha vertical e confirma que a geometria final
  // também saiu reta (x1 === x2).
  await page.mouse.click(p1.sx, p1.sy);
  await page.waitForTimeout(150);
  const linhaFinal = await page.evaluate(() => {
    const geo = window.__cadStoreTeste.getState().projeto.geometria;
    return geo.find((g) => g.tipo === "linha");
  });
  checar(
    "linha final criada com ORTHO saiu perfeitamente vertical (x1 === x2)",
    !!linhaFinal && Math.abs(linhaFinal.x1 - linhaFinal.x2) < 1,
    linhaFinal
  );

  await page.screenshot({ path: "/tmp/it39-ortho-preview.png" });

  // =========================================================================
  // PARTE 3: atalho F8 liga/desliga ORTHO (padrão AutoCAD)
  // =========================================================================
  console.log("\n=== Parte 3: atalho de teclado F8 liga/desliga ORTHO ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  // Ortho está ligado (Parte 2) -- clica em área neutra do canvas antes
  // pra garantir que o foco do teclado não está em nenhum input.
  await page.mouse.click(canvasBox.x + 50, canvasBox.y + 400);
  await page.waitForTimeout(100);
  await page.keyboard.press("F8");
  await page.waitForTimeout(100);
  const orthoAposF8_1 = await page.evaluate(() => window.__cadStoreTeste.getState().orthoAtivo);
  checar("F8 desliga o ORTHO (estava ligado)", orthoAposF8_1 === false, orthoAposF8_1);
  await page.keyboard.press("F8");
  await page.waitForTimeout(100);
  const orthoAposF8_2 = await page.evaluate(() => window.__cadStoreTeste.getState().orthoAtivo);
  checar("F8 liga o ORTHO de novo", orthoAposF8_2 === true, orthoAposF8_2);

  // Confirma que o preview volta a ficar diagonal quando desligado de novo.
  await page.keyboard.press("F8"); // desliga
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Linha", exact: true }).click();
  await page.waitForTimeout(100);
  p0 = pxDoMundo(0, 0);
  await page.mouse.click(p0.sx, p0.sy);
  await page.waitForTimeout(100);
  p1 = pxDoMundo(800, 500);
  await page.mouse.move(p1.sx, p1.sy);
  await page.waitForTimeout(100);
  const previewDesligadoDeNovo = await page.evaluate(() => window.__cadStoreTeste.getState().ponteiroMundo);
  checar(
    "com ORTHO desligado via F8, o preview volta a seguir o mouse livremente (diagonal)",
    !!previewDesligadoDeNovo && Math.abs(previewDesligadoDeNovo.x - 800) < 5 && Math.abs(previewDesligadoDeNovo.y - 500) < 5,
    previewDesligadoDeNovo
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

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
