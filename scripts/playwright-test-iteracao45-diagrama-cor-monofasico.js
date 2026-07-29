/**
 * scripts/playwright-test-iteracao45-diagrama-cor-monofasico.js
 * -----------------------------------------------------------------------
 * Iteração 45 -- pedido do usuário: "quando for monofasico deixe as
 * linhas do diagrama apenas vermelho". A camada `QDC_DIAGRAMA` (tronco,
 * barramento e ramais do diagrama unifilar/multifilar do QDC) passa a
 * ser vermelha (`#dc2626`) quando o sistema é monofásico (`numeroFases:
 * 1`), e mantém a cor de sempre (`#0f172a`) em bifásico/trifásico -- ver
 * `store.ts#gerarDimensionamentoCargas`.
 *
 * Testa via a APLICAÇÃO REAL (store de verdade, não a função pura): gera
 * o dimensionamento 1x como MONOFÁSICO (camada nasce vermelha), depois
 * gera de novo como TRIFÁSICO NA MESMA sessão/projeto (a camada já
 * existe -- `criarCamada` sozinho seria no-op) -- confirma que
 * `atualizarCamada` reflete a cor certa mesmo trocando de configuração
 * sem recarregar a página.
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

  const dadosBase = {
    ambientes: [{ nome: "Sala", tipo: "sala", areaM2: 20, quantidadeTomadas: 4, quantidadeLampadas: 2, tues: [] }],
    config: { tensaoFaseV: 127, tensaoEntradaV: 127, numeroFases: 1, fatorPotencia: 0.92 },
  };

  console.log("\n=== Parte 1: sistema MONOFÁSICO -- camada QDC_DIAGRAMA nasce vermelha ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  await page.evaluate((dados) => {
    window.__cadStoreTeste.getState().gerarDimensionamentoCargas(dados);
  }, dadosBase);
  await page.waitForTimeout(150);
  const corMono = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.camadas["QDC_DIAGRAMA"]?.cor);
  checar('camada "QDC_DIAGRAMA" fica vermelha (#dc2626) em sistema monofásico', corMono === "#dc2626", corMono);

  console.log("\n=== Parte 2: regera como TRIFÁSICO (mesma sessão) -- camada volta pra cor de sempre ===");
  const dadosTrifasico = {
    ambientes: dadosBase.ambientes,
    config: { tensaoFaseV: 127, tensaoEntradaV: 220, numeroFases: 3, fatorPotencia: 0.92 },
  };
  await page.evaluate((dados) => {
    window.__cadStoreTeste.getState().gerarDimensionamentoCargas(dados);
  }, dadosTrifasico);
  await page.waitForTimeout(150);
  const corTri = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.camadas["QDC_DIAGRAMA"]?.cor);
  checar(
    'camada "QDC_DIAGRAMA" volta pra cor de sempre (#0f172a) em trifásico, mesmo já existindo (não fica "presa" no vermelho)',
    corTri === "#0f172a",
    corTri
  );

  console.log("\n=== Parte 3: regera de novo como MONOFÁSICO -- camada some vermelha de novo ===");
  await page.evaluate((dados) => {
    window.__cadStoreTeste.getState().gerarDimensionamentoCargas(dados);
  }, dadosBase);
  await page.waitForTimeout(150);
  const corMono2 = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.camadas["QDC_DIAGRAMA"]?.cor);
  checar('camada "QDC_DIAGRAMA" fica vermelha de novo ao regerar como monofásico', corMono2 === "#dc2626", corMono2);

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
