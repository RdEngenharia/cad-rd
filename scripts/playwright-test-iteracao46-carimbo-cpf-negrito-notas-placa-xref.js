/**
 * scripts/playwright-test-iteracao46-carimbo-cpf-negrito-notas-placa-xref.js
 * -----------------------------------------------------------------------
 * Iteração 46 (rodada 6) -- cobre os 3 pedidos deste round:
 *
 * 1) Carimbo: campo "CPF do cliente" novo, negrito removido (canvas/PDF),
 *    tamanho do texto das Notas igual ao do diagrama (4.6mm), todo texto
 *    digitado (campos do carimbo + Notas) vira maiúsculo, e um projeto
 *    NOVO já nasce com o texto padrão de Notas fotovoltaico (editável).
 *
 * 2) Diagrama FV: o desenho vetorial da placa de advertência foi trocado
 *    pela imagem real (auto-inserida como XREF dentro de `boxDetalhePlaca`,
 *    sem ação do usuário), e o rótulo "MÓDULOS FOTOVOLTAICOS" ganhou a
 *    quantidade total de painéis + potência total em kWp.
 *
 * 3) Painel de XREF: a lista deixou de mostrar sempre o botão "Calibrar
 *    por referência" + grade X/Y/Escala pra TODO XREF importado -- agora
 *    só aparece pro XREF selecionado (`xrefSelecionadoId`), com o
 *    recém-importado se auto-selecionando.
 *
 * Testa via APLICAÇÃO REAL: UI de verdade (inputs/textarea do
 * TitleBlockPanel, upload de arquivo real no XrefImportButton) + o
 * binding de debug `window.__cadStoreTeste` só para inspecionar o estado
 * resultante (nunca para pular a ação do usuário).
 * -----------------------------------------------------------------------
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const os = require("os");

// 1x1 PNG (vermelho), só para exercitar o fluxo real de importação de XREF.
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function stripComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const falhas = [];
  function checar(desc, cond, detalhe) {
    if (cond) {
      console.log(`  OK  ${desc}`);
    } else {
      falhas.push(desc);
      console.log(`  FALHOU  ${desc}${detalhe !== undefined ? " -- " + JSON.stringify(detalhe) : ""}`);
    }
  }

  console.log("\n=== Parte 0: checagem estática -- negrito removido / tamanho de fonte das Notas ===");
  const raizSrc = path.join(__dirname, "..", "src");
  const arquivosCarimbo = [
    path.join(raizSrc, "components", "TitleBlockLayer.tsx"),
    path.join(raizSrc, "lib", "pdfExport.ts"),
    path.join(raizSrc, "lib", "dxfExport.ts"),
  ];
  for (const arq of arquivosCarimbo) {
    const semComentarios = stripComentarios(fs.readFileSync(arq, "utf8"));
    const temBold = /fontStyle\s*=\s*(["']bold["']|\{["']bold["']\})/.test(semComentarios);
    checar(`${path.basename(arq)}: nenhum fontStyle="bold" fora de comentário`, !temBold);
  }
  const diagramaFvSrc = fs.readFileSync(path.join(raizSrc, "lib", "diagramaFv.ts"), "utf8");
  const fsLabelMatch = diagramaFvSrc.match(/^const FS_LABEL\s*=\s*([\d.]+)/m);
  const fsLabel = fsLabelMatch ? Number(fsLabelMatch[1]) : null;
  checar("diagramaFv.ts: FS_LABEL encontrado", fsLabel !== null, fsLabel);
  for (const [arq, padrao] of [
    [path.join(raizSrc, "components", "TitleBlockLayer.tsx"), /const FS_DIAGRAMA\s*=\s*([\d.]+)/],
    [path.join(raizSrc, "lib", "pdfExport.ts"), /const FS_DIAGRAMA_MM\s*=\s*([\d.]+)/],
    [path.join(raizSrc, "lib", "dxfExport.ts"), /const FS_DIAGRAMA\s*=\s*([\d.]+)/],
  ]) {
    const conteudo = fs.readFileSync(arq, "utf8");
    const m = conteudo.match(padrao);
    const valor = m ? Number(m[1]) : null;
    checar(`${path.basename(arq)}: tamanho das Notas casa com o texto do diagrama (${fsLabel}mm)`, valor === fsLabel, valor);
  }

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.evaluate(() =>
    window.__cadStoreTeste.getState().setUsuario({ uid: "teste-uid", email: "teste@teste.com" })
  );
  const fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) await fecharProjetos.click();
  await page.waitForTimeout(300);

  console.log("\n=== Parte 1: novo projeto já nasce com o texto padrão de Notas (fotovoltaico), editável ===");
  await page.evaluate(() => window.__cadStoreTeste.getState().novoProjeto());
  await page.waitForTimeout(200);
  const notasIniciais = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.carimbo.notas);
  checar("notas do carimbo vêm preenchidas por padrão", !!notasIniciais && notasIniciais.length > 100);
  checar("notas padrão contêm o texto real fornecido (XLPE)", notasIniciais.includes("XLPE"));
  checar("notas padrão contêm o texto real fornecido (DPS CC)", notasIniciais.includes("DPS CC"));
  checar("notas padrão já vêm em maiúsculo", notasIniciais === notasIniciais.toUpperCase());
  const cpfInicial = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.carimbo.cpfCliente);
  checar('carimbo novo nasce com "cpfCliente" vazio (campo existe, não obrigatório)', cpfInicial === "");

  // Precisa de 1 Prancha selecionada pra editar o carimbo (Model Space não mostra o carimbo).
  const pranchaTab = page.locator('button:has-text("Prancha 1")').first();
  if (await pranchaTab.isVisible().catch(() => false)) await pranchaTab.click();
  await page.waitForTimeout(200);

  console.log("\n=== Parte 2: campo \"CPF do cliente\" existe no painel e é editável ===");
  const campoCliente = page.locator('label:has-text("Cliente") input[type="text"]').first();
  const campoCpf = page.locator('label:has-text("CPF do cliente") input[type="text"]');
  checar('painel mostra o campo "CPF do cliente"', await campoCpf.isVisible().catch(() => false));
  await campoCliente.fill("joao da silva");
  await campoCpf.fill("123.456.789-00");
  await page.waitForTimeout(150);
  const carimboAposEdicao = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.carimbo);
  checar('digitar em "Cliente" salva em MAIÚSCULO', carimboAposEdicao.cliente === "JOAO DA SILVA", carimboAposEdicao.cliente);
  checar('CPF do cliente foi salvo', carimboAposEdicao.cpfCliente === "123.456.789-00", carimboAposEdicao.cpfCliente);

  console.log("\n=== Parte 3: Notas -- textarea mostra o padrão e maiusculiza o que for digitado ===");
  const notasTextarea = page.locator("textarea").first();
  const valorNotasNaTela = await notasTextarea.inputValue();
  checar("textarea de Notas mostra o texto padrão carregado", valorNotasNaTela.includes("XLPE"));
  await notasTextarea.fill("observação extra em minúsculo");
  await page.waitForTimeout(150);
  const notasDepois = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.carimbo.notas);
  checar("digitar nas Notas salva em MAIÚSCULO", notasDepois === "OBSERVAÇÃO EXTRA EM MINÚSCULO", notasDepois);

  console.log("\n=== Parte 4: diagrama FV -- geometria via store (sem depender do formulário do modal) ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    s.selecionarPrancha(null);
    for (const g of s.projeto.geometria) s.removeGeometria(g.id);
  });
  const dadosFv = {
    padraoEntrada: {
      tipoRede: "monofasico",
      ramalLigacao: "1x10+1x10mm²",
      correnteDisjuntorPadraoA: 40,
      caboPadraoAteDistribuicao: "1#10(10)MM²",
      correnteDisjuntorDistribuicaoA: 40,
      especificacaoDpsCa: "classe II\nIn:10KA Imax:20KA 275Vca",
      caboDistribuicaoAteProtecaoCa: "1#10(10)+T10mm²",
      correnteDisjuntorProtecaoCaA: 32,
      caboProtecaoCaAteInversor: "1#6(6)+T6mm²",
    },
    inversores: [
      {
        modelo: "FOXESS (F6000-G2)",
        potenciaW: 6000,
        tensaoEntradaMinV: 90,
        tensaoEntradaMaxV: 560,
        tensaoMaxCcV: 600,
        correnteMaxPorMpptA: 16,
        tensaoSaidaV: 220,
        correnteSaidaA: 27,
        correnteDisjuntorSaidaA: 32,
        caboCcMm2: "4mm²",
        especificacaoDpsCc: "classe II\nIn:18KA Imax:400KA 600/1040v",
        mppts: [{ numeroStrings: 1, modulosPorString: 52, correnteProtecaoCcA: 15 }],
      },
    ],
    modulo: { marca: "JINKO", modelo: "585W", potenciaWp: 585, vmp: 41.9, voc: 49.9, imp: 13.96, eficiencia: 21.3 },
    temFotoPadraoEntrada: false,
  };
  const resultadoFv = await page.evaluate(
    (dados) => window.__cadStoreTeste.getState().gerarDiagramaFotovoltaico(dados),
    dadosFv
  );
  checar("gerador devolve boxPadraoEntradaRepresentativo", !!resultadoFv.boxPadraoEntradaRepresentativo);
  checar("gerador devolve boxDetalhePlaca (novo retângulo reservado pra placa)", !!resultadoFv.boxDetalhePlaca);

  const geometriaFv = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.geometria);
  const textos = geometriaFv.filter((g) => g.tipo === "texto").map((g) => g.conteudo || "");
  const temTextoAntigoDaPlaca = textos.some((t) => /RISCO DE CHOQUE|GERAÇÃO PRÓPRIA/i.test(t));
  checar("não sobra mais texto vetorial antigo da placa (ATENÇÃO/RISCO DE CHOQUE/GERAÇÃO PRÓPRIA)", !temTextoAntigoDaPlaca);
  const temQuantidadeTotal = textos.some((t) => /Quantidade total: 52 painéis de 585W = 30[.,]42kWp/.test(t));
  checar(
    'rótulo "MÓDULOS FOTOVOLTAICOS" mostra "Quantidade total: 52 painéis de 585W = 30.42kWp"',
    temQuantidadeTotal,
    textos.find((t) => t.includes("MÓDULOS FOTOVOLTAICOS"))
  );

  console.log("\n=== Parte 5: diagrama FV via MODAL de verdade -- placa de advertência auto-inserida como XREF ===");
  await page.evaluate(() => {
    const s = window.__cadStoreTeste.getState();
    for (const x of s.projeto.xrefs) s.removeXref(x.id);
  });
  await page.locator('button:has-text("Gerar diagrama fotovoltaico")').click();
  await page.waitForTimeout(200);

  const inversorBox = page.locator("div.rounded-md.border.p-2").first();
  await inversorBox.locator('label:has-text("Modelo") input').fill("FOXESS (F6000-G2)");
  await inversorBox.locator('label:has-text("Potência (W)") input').fill("6000");
  await inversorBox.locator('label:has-text("Tensão de entrada mínima (V)") input').fill("90");
  await inversorBox.locator('label:has-text("Tensão de entrada máxima -- faixa MPPT (V)") input').fill("560");
  await inversorBox.locator('label:has-text("Tensão CC máxima admissível / Voc (V)") input').fill("600");
  await inversorBox.locator('label:has-text("Corrente máxima por MPPT (A)") input').fill("16");
  await inversorBox.locator('label:has-text("Corrente de saída (A)") input').fill("27");
  await inversorBox.locator('label:has-text("Corrente do disjuntor de saída deste inversor (A)") input').fill("32");
  await inversorBox.locator('label:has-text("Módulos/string") input').fill("52");
  await inversorBox.locator('label:has-text("Proteção CC (A)") input').fill("15");

  const moduloBox = page.locator('[data-testid="campos-modulo"]');
  await moduloBox.locator('label:has-text("Marca") input').fill("JINKO");
  await moduloBox.locator('label:has-text("Modelo") input').fill("585W");
  await moduloBox.locator('label:has-text("Potência (Wp)") input').fill("585");
  await moduloBox.locator('label:has-text("Tensão nominal Vmp (V)") input').fill("41.9");
  await moduloBox.locator('label:has-text("Tensão de circuito aberto Voc (V)") input').fill("49.9");
  await moduloBox.locator('label:has-text("Corrente Imp (A)") input').fill("13.96");
  await moduloBox.locator('label:has-text("Eficiência (%)") input').fill("21.3");

  await page.getByRole("button", { name: "⚡ Gerar diagrama", exact: true }).click();
  await page.waitForTimeout(600);

  const errosModal = await page.locator("text=Corrija antes de gerar").isVisible().catch(() => false);
  checar("modal gerou sem erros de validação", !errosModal);

  const xrefsAposGerar = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.xrefs);
  const xrefPlaca = xrefsAposGerar.find((x) => x.nome_arquivo === "placa-advertencia-padrao.jpg");
  checar("XREF da placa de advertência foi inserido automaticamente, sem ação do usuário", !!xrefPlaca);
  if (xrefPlaca) {
    const box = resultadoFv.boxDetalhePlaca;
    const dentroDaCaixaX = xrefPlaca.x >= box.x - 1 && xrefPlaca.x <= box.x + box.largura + 1;
    const dentroDaCaixaY = xrefPlaca.y >= box.y - 1 && xrefPlaca.y <= box.y + box.altura + 1;
    checar("XREF da placa está posicionado dentro/perto de boxDetalhePlaca", dentroDaCaixaX && dentroDaCaixaY, {
      xref: { x: xrefPlaca.x, y: xrefPlaca.y },
      box,
    });
  }

  console.log("\n=== Parte 6: painel de XREF -- accordion (só mostra Calibrar/X/Y/Escala do XREF selecionado) ===");
  // Reaproveita o XREF da placa (já inserido acima) + importa mais 1 arquivo de verdade.
  const tmpPng = path.join(os.tmpdir(), `xref-teste-${Date.now()}.png`);
  fs.writeFileSync(tmpPng, Buffer.from(PNG_1PX_BASE64, "base64"));

  await page.waitForTimeout(200);
  const listaXrefAntes = page.locator("ul li");
  const qtdAntes = await listaXrefAntes.count();
  checar("já existe ao menos 1 XREF na lista (a placa) antes de importar o novo", qtdAntes >= 1, qtdAntes);

  // Antes de importar o 2º: nenhum "Calibrar por referência" deveria estar visível
  // (o XREF da placa foi inserido programaticamente, sem selecionarXref -- fica colapsado).
  const calibrarVisivelAntes = await page.locator('button:has-text("Calibrar por referência")').count();
  checar('lista mostra "Calibrar por referência" só quando algo está selecionado (0 visível agora)', calibrarVisivelAntes === 0, calibrarVisivelAntes);

  const inputArquivo = page.locator('input[type="file"]').first();
  await inputArquivo.setInputFiles(tmpPng);
  await page.waitForTimeout(400);

  const qtdDepois = await page.locator("ul li").count();
  checar("novo XREF apareceu na lista", qtdDepois === qtdAntes + 1, { qtdAntes, qtdDepois });

  const calibrarVisivelDepois = await page.locator('button:has-text("Calibrar por referência")').count();
  checar('XREF recém-importado se auto-seleciona (exatamente 1 "Calibrar por referência" visível)', calibrarVisivelDepois === 1, calibrarVisivelDepois);

  const gradeXYEscala = page.locator("text=Escala").first();
  checar("grade X/Y/Escala aparece pro XREF selecionado", await gradeXYEscala.isVisible().catch(() => false));

  const xrefsFinal = await page.evaluate(() => window.__cadStoreTeste.getState().projeto.xrefs);
  const idNovoXref = xrefsFinal[xrefsFinal.length - 1]?.id;
  const selecionadoIdApósImportar = await page.evaluate(() => window.__cadStoreTeste.getState().xrefSelecionadoId);
  checar("xrefSelecionadoId aponta pro XREF recém-importado", selecionadoIdApósImportar === idNovoXref);

  // Clica na linha compacta do PRIMEIRO xref (a placa) pra selecioná-lo -- deve
  // expandir o dele e colapsar o do recém-importado (só 1 expandido por vez).
  const primeiraLinha = page.locator("ul li").first().locator("button").first();
  await primeiraLinha.click();
  await page.waitForTimeout(200);
  const calibrarVisivelAposClicar = await page.locator('button:has-text("Calibrar por referência")').count();
  checar('clicar em outro XREF da lista expande só ele (continua exatamente 1 visível)', calibrarVisivelAposClicar === 1);

  // Clica de novo na mesma linha -- deve colapsar (0 visíveis).
  await primeiraLinha.click();
  await page.waitForTimeout(200);
  const calibrarVisivelAposColapsar = await page.locator('button:has-text("Calibrar por referência")').count();
  checar("clicar de novo na mesma linha colapsa (0 visíveis)", calibrarVisivelAposColapsar === 0, calibrarVisivelAposColapsar);

  fs.unlinkSync(tmpPng);

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
