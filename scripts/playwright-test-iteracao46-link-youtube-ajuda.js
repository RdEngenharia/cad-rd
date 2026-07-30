/**
 * scripts/playwright-test-iteracao46-link-youtube-ajuda.js
 * -----------------------------------------------------------------------
 * Iteração 46 (continuação) -- pedido do usuário: "esse é o link do
 * tutorial de videos sobre o cad que lancei no youtube, quero que deixe
 * esse link no campo ajuda assim a pessoa é direcionada ao curso em
 * video aulas do youtube". Confirma que o modal "❓ Ajuda" mostra um
 * banner com o link certo, que abre em nova aba (não navega o app pra
 * fora), e que o resto do manual continua funcionando normalmente.
 * -----------------------------------------------------------------------
 */
const { chromium } = require("playwright");

const LINK_ESPERADO = "https://youtube.com/playlist?list=PLZ3Mg4e3fxMk&si=kQ12doXAzOAa2fYy";

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

  console.log("\n=== Link do curso em vídeo-aulas no painel de Ajuda ===");
  // Sem login, a tela inicial é o gate "📁 Projetos" (login obrigatório),
  // que já tem seu próprio atalho "Ver manual de ajuda (sem precisar de
  // conta)" -- abre o mesmo AjudaModal sem precisar fechar o gate antes.
  const botaoAjudaGate = page.getByRole("button", { name: "Ver manual de ajuda", exact: false });
  if (await botaoAjudaGate.isVisible().catch(() => false)) {
    await botaoAjudaGate.click();
  } else {
    await page.getByRole("button", { name: "❓ Ajuda" }).click();
  }
  await page.waitForTimeout(200);

  const modalAberto = await page.getByText("Manual do Cad RD", { exact: false }).isVisible().catch(() => false);
  checar("modal de Ajuda abre normalmente", modalAberto);

  const linkYoutube = page.locator(`a[href="${LINK_ESPERADO}"]`);
  const linkVisivel = await linkYoutube.isVisible().catch(() => false);
  checar("link do curso em vídeo-aulas do YouTube está visível no painel de Ajuda", linkVisivel);

  const target = await linkYoutube.getAttribute("target").catch(() => null);
  checar('link abre em nova aba (target="_blank")', target === "_blank");

  const rel = await linkYoutube.getAttribute("rel").catch(() => "");
  checar('link tem rel="noopener noreferrer" (nova aba sem repassar referência)', /noopener/.test(rel || "") && /noreferrer/.test(rel || ""));

  const textoLink = await linkYoutube.innerText().catch(() => "");
  checar("texto do link menciona o curso em vídeo-aulas", /v[ií]deo/i.test(textoLink));

  // Sanidade: resto do manual (índice + 1ª seção) continua funcionando.
  const primeiraSecaoOk = await page.getByText("Primeiros passos: conta e projetos", { exact: false }).first().isVisible().catch(() => false);
  checar("(sanidade) manual continua mostrando as seções normais (ex.: Primeiros passos)", primeiraSecaoOk);

  await page.getByRole("button", { name: "Camadas (layers)", exact: false }).click();
  await page.waitForTimeout(150);
  const secaoCamadasOk = await page.getByText("O painel", { exact: false }).first().isVisible().catch(() => false);
  checar("(sanidade) navegação do índice lateral continua funcionando", secaoCamadasOk);

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
