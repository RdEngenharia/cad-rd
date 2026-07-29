/**
 * scripts/playwright-test-iteracao45-logout-trava-edicao.js
 * -----------------------------------------------------------------------
 * Iteração 45 -- pedido do usuário: "sobre o login deu certo apos
 * atualizar a pagina, porem ao deslogar continuo desenhando no cad" --
 * mesmo com login obrigatório pra abrir/criar/salvar (`ProjectManagerModal`),
 * clicar em "Sair" (`AuthPanel.tsx`) não travava o Desenho: dava pra
 * continuar desenhando geometria nova livremente, sem conta.
 *
 * Causa raiz (2 partes):
 *   1) `handleSair` só limpava `usuario`, sem reabrir o gate
 *      (`ProjectManagerModal`) que trava tudo no carregamento inicial.
 *   2) Mesmo reabrindo o modal, um comando de vários cliques já em
 *      andamento (ex.: 1º ponto da LINHA já cravado, aguardando o
 *      comprimento digitado) continuava vivo por trás do overlay -- o
 *      campo "Comprimento" (`CommandLine.tsx`) reganha foco sozinho nesse
 *      estado e cria a linha via teclado, sem precisar clicar no
 *      `<canvas>` (que o overlay do modal bloqueia).
 *
 * Este teste cobre as DUAS partes:
 *   A) Loga, desenha uma linha completa (2 cliques) -- sanity check que
 *      still funciona logado.
 *   B) Loga nem novo, clica no 1º ponto de uma 2ª linha (deixando
 *      `pontoRascunho` armado, aguardando comprimento), clica em "Sair",
 *      e confirma que: o modal de Projetos reabre; a ferramenta volta pra
 *      "selecionar" (rascunho cancelado); digitar um comprimento não cria
 *      mais linha nenhuma; clicar no canvas (nas coordenadas do 1º ponto
 *      antigo) não cria geometria nova (clique cai no overlay do modal).
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

  const bindingOk = await page.evaluate(() => typeof window.__cadStoreTeste !== "undefined");
  checar("window.__cadStoreTeste está definido (build com o binding de depuração)", bindingOk);

  // Loga (simulado via binding, mesma mecânica de setUsuario que o
  // observarUsuario/onAuthStateChanged real usaria) e sai da Prancha
  // padrão pra GeometryLayer ser renderizado.
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.setUsuario({ uid: "teste-uid-logout", email: "teste-logout@teste.com" });
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
    s.setViewport({ scale: 0.15, x: 150, y: 150 });
  });
  const fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(200);

  const canvasBox = await page.locator("canvas").last().boundingBox();

  function screenDe(worldX, worldY) {
    return { x: canvasBox.x + 150 + 0.15 * worldX, y: canvasBox.y + 150 + 0.15 * worldY };
  }

  console.log("\n=== Parte A: logado -- desenhar uma linha completa funciona normalmente (sanidade) ===");
  await page.getByRole("button", { name: "Linha", exact: true }).click();
  const p1 = screenDe(0, 0);
  const p2 = screenDe(2000, 0);
  await page.mouse.click(p1.x, p1.y);
  await page.waitForTimeout(80);
  await page.mouse.click(p2.x, p2.y);
  await page.waitForTimeout(150);

  const geometriaAposLinhaA = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.length);
  checar("linha completa (2 cliques) criou 1 elemento de geometria, logado", geometriaAposLinhaA === 1, geometriaAposLinhaA);

  console.log("\n=== Parte B: 1º ponto de uma NOVA linha armado, depois clica em Sair ===");
  await page.getByRole("button", { name: "Linha", exact: true }).click();
  const p3 = screenDe(0, 3000);
  await page.mouse.click(p3.x, p3.y);
  await page.waitForTimeout(120);

  const pontoRascunhoArmado = await page.evaluate(() => window.__cadStoreTeste.getState().pontoRascunho !== null);
  checar("1º ponto da 2ª linha ficou armado (pontoRascunho ≠ null) antes do logout", pontoRascunhoArmado);

  // Clica em "Sair" (AuthPanel).
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForTimeout(200);

  const estadoPosLogout = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    return {
      usuario: s.usuario,
      gerenciadorAberto: s.gerenciadorProjetosAberto,
      pontoRascunho: s.pontoRascunho,
      ferramenta: s.ferramenta,
      totalGeometria: s.projeto.geometria.length,
    };
  });
  checar("usuário deslogado (usuario === null)", estadoPosLogout.usuario === null, estadoPosLogout.usuario);
  checar('modal "Projetos" reabriu sozinho ao sair (gate obrigatório)', estadoPosLogout.gerenciadorAberto === true, estadoPosLogout);
  checar("rascunho da 2ª linha foi CANCELADO ao sair (pontoRascunho === null)", estadoPosLogout.pontoRascunho === null, estadoPosLogout);
  checar('ferramenta voltou para "selecionar" ao sair', estadoPosLogout.ferramenta === "selecionar", estadoPosLogout);

  // Tenta "completar" a linha cancelada digitando um comprimento no campo
  // de comando -- não deve ter mais nenhum campo de "Comprimento:" ativo
  // (o rascunho foi cancelado), então isso não deveria criar geometria
  // nenhuma, MESMO que alguma tecla ainda caia em algum input focado.
  await page.keyboard.type("2000");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);

  // Tenta clicar diretamente onde o 1º ponto da linha cancelada estava --
  // esse clique deveria cair no overlay do modal (bloqueado), não no
  // canvas por baixo.
  await page.mouse.click(p3.x, p3.y);
  await page.waitForTimeout(100);
  const p4 = screenDe(2000, 3000);
  await page.mouse.click(p4.x, p4.y);
  await page.waitForTimeout(150);

  const geometriaFinal = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.length);
  checar(
    "NENHUMA geometria nova foi criada depois do logout (digitando comprimento OU clicando no canvas)",
    geometriaFinal === geometriaAposLinhaA,
    { geometriaAposLinhaA, geometriaFinal }
  );

  // Confirma que o modal "Projetos" está de fato visível na tela (não só
  // no estado do store) -- prova visual de que o overlay existe.
  const modalVisivel = await page.getByText("É preciso entrar com uma conta").isVisible().catch(() => false);
  checar('modal "Projetos" (com o aviso de login obrigatório) está VISÍVEL na tela após o logout', modalVisivel);

  console.log("\n=== Parte C: logar de novo funciona normalmente depois do logout (sanidade final) ===");
  await page.evaluate(() => {
    window.__cadStoreTeste.getState().setUsuario({ uid: "teste-uid-logout-2", email: "teste-logout-2@teste.com" });
  });
  await page.waitForTimeout(150);
  const fecharProjetos2 = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos2.isVisible().catch(() => false)) await fecharProjetos2.click();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Linha", exact: true }).click();
  const p5 = screenDe(4000, 0);
  const p6 = screenDe(6000, 0);
  await page.mouse.click(p5.x, p5.y);
  await page.waitForTimeout(80);
  await page.mouse.click(p6.x, p6.y);
  await page.waitForTimeout(150);
  const geometriaAposRelogin = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria.length);
  checar(
    "depois de logar de novo, desenhar volta a funcionar normalmente",
    geometriaAposRelogin === geometriaAposLinhaA + 1,
    { geometriaAposLinhaA, geometriaAposRelogin }
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
