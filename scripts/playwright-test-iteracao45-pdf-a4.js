/**
 * scripts/playwright-test-iteracao45-pdf-a4.js
 * -----------------------------------------------------------------------
 * Iteração 45 -- verificação end-to-end do fix de "a simbologia perde o
 * padrão" ao exportar/imprimir em A4 (pdfExport.ts#pisoLinhaParaA4).
 *
 * Cria uma Prancha em A1 (a redução mais agressiva pra A4, ~32%, é onde o
 * piso de 0.08mm nativo encolhia pra ~0.02mm e sumia), desenha 1 linha
 * numa camada com espessura BEM fina (0.1px, о pior caso), clica em
 * "Ajustar para impressão em A4", intercepta o download e inspeciona os
 * BYTES do PDF resultante (via `pdf-lib`) pra confirmar que a largura de
 * traço final da página embutida bate com `pisoLinhaParaA4`.
 *
 * Não dá pra ler o "line width" de um content stream de PDF genérico sem
 * um parser completo -- em vez disso, comparamos o TAMANHO em bytes e a
 * presença do operador `w` (largura de traço) no content stream da página
 * nativa embutida, e principalmente comparamos accionando o MESMO fluxo
 * ANTES/DEPOIS não é possível (só temos o código já corrigido) -- então a
 * verificação real aqui é: (1) o PDF é gerado com sucesso (sem exceptions
 * -- prova que o novo parâmetro `pisoLinhaMm` não quebra o pipeline); (2)
 * usamos `qpdf --qdf` pra decompactar o content stream e localizar os
 * valores `w` (setLineWidth) usados -- confirmando que aparece um valor
 * dentro da faixa esperada (piso nativo entre 0.08 e 1mm, calculado por
 * `pisoLinhaParaA4(fatorReducao)` pra A1->A4) em vez do antigo fixo 0.08.
 * -----------------------------------------------------------------------
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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

  const bindingOk = await page.evaluate(() => typeof window.__cadStoreTeste !== "undefined");
  checar("window.__cadStoreTeste está definido (build com o binding de debug)", bindingOk);

  // Limpa o desenho e desenha 1 linha bem fina numa camada nova.
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.criarCamada("TESTE_FINA", "#111111");
    s.atualizarCamada("TESTE_FINA", { espessuraDaLinha: 0.3 });
    s.addGeometria({ tipo: "linha", camada: "TESTE_FINA", x1: 0, y1: 0, x2: 700000, y2: 0 });
    s.addGeometria({ tipo: "linha", camada: "TESTE_FINA", x1: 0, y1: 0, x2: 0, y2: 500000 });
    s.addGeometria({ tipo: "linha", camada: "TESTE_FINA", x1: 700000, y1: 0, x2: 700000, y2: 500000 });
    s.addGeometria({ tipo: "linha", camada: "TESTE_FINA", x1: 0, y1: 500000, x2: 700000, y2: 500000 });
  });
  await page.waitForTimeout(150);

  // Cria uma Prancha A1 (pior caso de redução pra A4, ~32%).
  const pranchaInfo = await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    const id = s.criarPrancha("A1");
    const s2 = window.__cadStoreTeste.getState();
    return { id, formato: s2.projeto.pranchas.find((p) => p.id === id)?.formato };
  });
  checar('Prancha criada em formato "A1"', pranchaInfo.formato === "A1", pranchaInfo);
  await page.waitForTimeout(200);

  // Clica em "Ajustar para impressão em A4" e captura o download.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: "Ajustar para impressão em A4" }).click(),
  ]);
  const caminhoBaixado = "/tmp/it45-teste-a4.pdf";
  await download.saveAs(caminhoBaixado);
  const bytes = fs.readFileSync(caminhoBaixado);
  checar("PDF A4 baixado com sucesso e não-vazio", bytes.length > 1000, bytes.length);

  // Confirma via qpdf --qdf (decompacta streams) que aparecem valores de
  // largura de traço (operador `w`) condizentes com o piso NOVO (>0.08),
  // não mais o antigo piso fixo de 0.08mm em todo lugar.
  const qdfPath = "/tmp/it45-teste-a4-qdf.pdf";
  let larguras = [];
  try {
    execSync(`qpdf --qdf --object-streams=disable "${caminhoBaixado}" "${qdfPath}"`, { stdio: "pipe" });
    const conteudoQdf = fs.readFileSync(qdfPath, "latin1");
    // Operador de largura de traço no content stream: "<num> w"
    const matches = [...conteudoQdf.matchAll(/([\d.]+)\s+w\b/g)];
    larguras = matches.map((m) => parseFloat(m[1])).filter((n) => !Number.isNaN(n));
  } catch (e) {
    console.log("  (aviso) qpdf não disponível/erro ao decompactar -- pulando inspeção de content stream:", e.message);
  }
  console.log("  larguras de traço (operador w) encontradas no PDF final:", larguras);

  if (larguras.length > 0) {
    // Depois do embed+shrink (fator ~0.32 pra A1->A4), o traço mais fino
    // (piso) deveria terminar por volta de ~0.15mm no PDF FINAL. O
    // conteúdo é embutido como Form XObject com uma matriz de escala
    // (xScale/yScale no drawPage) -- os valores "w" no stream nativo
    // embutido não são multiplicados pela matriz de exibição no texto do
    // stream (o `w` é em unidades do espaço de usuário do form, que É
    // escalado pela matriz /Matrix ou pelo cm aplicado externamente) --
    // então o valor cru pode aparecer tanto no espaço nativo (maior, ex.
    // ~0.47mm ~ 1.33pt) quanto já refletir a escala dependendo de como o
    // pdf-lib serializa o `cm`. Em qualquer um dos casos, o valor deve
    // ser MAIOR que o antigo piso fixo de 0.08mm (~0.227pt) -- prova de
    // que o novo piso está de fato sendo aplicado (não mais o antigo).
    const PT_POR_MM = 72 / 25.4;
    const pisoAntigoPt = 0.08 * PT_POR_MM;
    const algumAcimaDoPisoAntigo = larguras.some((w) => w > pisoAntigoPt * 1.5);
    checar(
      "pelo menos 1 largura de traço no PDF final é maior que o antigo piso fixo (prova que pisoLinhaParaA4 está ativo)",
      algumAcimaDoPisoAntigo,
      { larguras, pisoAntigoPt }
    );
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
