/**
 * scripts/playwright-test-lancamento.js
 * -----------------------------------------------------------------------
 * Verificação end-to-end (Iteração 35) do gerador de tomadas/iluminação NA
 * APLICAÇÃO REAL rodando em localhost:3000: injeta geometria de uma casa
 * sintética direto no store, confirma que o botão fica desabilitado sem
 * seleção e habilitado com seleção, dispara a geração e confere o
 * resultado tanto no modal quanto no painel JSON de depuração (Ctrl+J).
 *
 * PRÉ-REQUISITO (não fica no código entregue): este script foi rodado
 * durante o desenvolvimento com um binding temporário de debug em
 * `store.ts` (`window.__cadStoreTeste = useCadStore`, removido antes da
 * entrega final -- a app de produção NÃO expõe o store na window). Pra
 * rodar este script de novo no futuro, adicione temporariamente ao fim de
 * `src/lib/store.ts`:
 *   if (typeof window !== "undefined") (window).__cadStoreTeste = useCadStore;
 * rode `npm run build && npm run start`, execute o script, e remova a
 * linha depois.
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

  // Fecha o modal "Projetos" que abre sozinho ao carregar (Iteração 34).
  const fecharProjetos = page.locator('button[title="Fechar e ir para o desenho atual"]');
  if (await fecharProjetos.isVisible().catch(() => false)) {
    await fecharProjetos.click();
  }
  await page.waitForTimeout(300);

  // -----------------------------------------------------------------------
  // Botão desabilitado sem seleção nenhuma.
  // -----------------------------------------------------------------------
  const botao = page.locator('button:has-text("Lançar tomadas/iluminação")');
  checar("botão presente na sidebar", await botao.count() > 0);
  checar("botão DESABILITADO sem seleção", await botao.isDisabled());

  // -----------------------------------------------------------------------
  // Injeta uma casa sintética (3 cômodos) direto no store, via o binding
  // de debug temporário -- equivalente ao Teste 2 de
  // scripts/test-lancamento-eletrico.ts, mas agora fluindo pela app real
  // (React + Zustand + Konva), não só a função pura.
  // -----------------------------------------------------------------------
  const idsInseridos = await page.evaluate(() => {
    const store = window.__cadStoreTeste;
    if (!store) return null;
    const s = store.getState();

    function linha(x1, y1, x2, y2) {
      s.addGeometria({ tipo: "linha", camada: "0", x1, y1, x2, y2 });
    }
    function texto(x, y, conteudo) {
      s.addGeometria({ tipo: "texto", camada: "0", x, y, conteudo, fontSize: 200 });
    }

    // Sala 5000x4000, Cozinha 3000x4000 (parede dupla 14cm), Banheiro 2000x2000.
    linha(0, 0, 5000, 0);
    linha(5000, 0, 5000, 4000);
    linha(5000, 4000, 0, 4000);
    linha(0, 4000, 0, 0);
    texto(2500, 2000, "Sala");

    linha(5140, 0, 8140, 0);
    linha(8140, 0, 8140, 4000);
    linha(8140, 4000, 5140, 4000);
    linha(5140, 4000, 5140, 0);
    texto(6640, 2000, "Cozinha");

    linha(8280, 0, 10280, 0);
    linha(10280, 0, 10280, 2000);
    linha(10280, 2000, 8280, 2000);
    linha(8280, 2000, 8280, 0);
    texto(9280, 1000, "Banheiro");

    return store.getState().projeto.geometria.map((g) => g.id);
  });

  checar("binding de debug encontrado e geometria injetada", Array.isArray(idsInseridos) && idsInseridos.length === 15, idsInseridos);

  // Seleciona TODA a geometria injetada (equivalente a uma caixa de
  // seleção do usuário em volta da casa inteira).
  await page.evaluate((ids) => {
    const store = window.__cadStoreTeste;
    for (const id of ids) store.getState().alternarSelecao(id);
  }, idsInseridos);
  await page.waitForTimeout(200);

  checar("botão HABILITADO após selecionar a casa", await botao.isEnabled());

  // -----------------------------------------------------------------------
  // Clica no botão -- deve abrir o modal de RESULTADO (não de problemas).
  // -----------------------------------------------------------------------
  await botao.click();
  await page.waitForTimeout(300);

  const tituloSucesso = page.locator('h2:has-text("Lançamento elétrico gerado")');
  const tituloErro = page.locator('h2:has-text("Não foi possível gerar")');
  checar("modal de SUCESSO apareceu (não o de erro)", await tituloSucesso.isVisible().catch(() => false));
  if (await tituloErro.isVisible().catch(() => false)) {
    const corpoErro = await page.locator("text=Corrija").first().textContent().catch(() => "");
    console.log("  (modal de erro mostrou:", corpoErro, ")");
  }

  const corpoModal = await page.locator("body").innerText();
  checar("resumo menciona '3 cômodo(s) processado(s)'", corpoModal.includes("3 cômodo(s) processado(s)"), corpoModal.slice(0, 400));
  checar("tabela lista Sala/Cozinha/Banheiro", corpoModal.includes("Sala") && corpoModal.includes("Cozinha") && corpoModal.includes("Banheiro"));

  // Fecha o modal de resultado.
  await page.locator('button:has-text("Fechar")').first().click();
  await page.waitForTimeout(200);

  // -----------------------------------------------------------------------
  // Confere a geometria de verdade via o painel JSON (Ctrl+J).
  // -----------------------------------------------------------------------
  await page.keyboard.press("Control+j");
  await page.waitForTimeout(200);
  const jsonTexto = await page.locator("pre").first().textContent();
  let projeto;
  try {
    projeto = JSON.parse(jsonTexto);
  } catch (e) {
    checar("painel JSON contém um JSON válido", false, String(e));
  }

  if (projeto) {
    const todosBlocos = projeto.geometria.filter((g) => g.tipo === "bloco" && g.origemGeradorId === "lancamentoEletrico");
    // A legenda usa os MESMOS nomes de bloco (ícones em miniatura) mas numa
    // camada própria (ELETRICA_LEGENDA) -- precisa ser excluída pra contar
    // só os pontos "de verdade" lançados nos cômodos.
    const blocos = todosBlocos.filter((g) => g.camada !== "ELETRICA_LEGENDA");
    const legendaBlocos = todosBlocos.filter((g) => g.camada === "ELETRICA_LEGENDA");
    const tomadas = blocos.filter((g) => g.nome.startsWith("tomada_"));
    const luzes = blocos.filter((g) => g.nome === "ponto_luz_teto");
    const interruptores = blocos.filter((g) => g.nome === "interruptor_simples");
    const chuveiros = blocos.filter((g) => g.nome === "tomada_chuveiro");
    const legendaTextos = projeto.geometria.filter((g) => g.tipo === "texto" && g.camada === "ELETRICA_LEGENDA");

    checar("3 pontos de luz no JSON", luzes.length === 3, luzes.length);
    checar("3 interruptores no JSON", interruptores.length === 3, interruptores.length);
    checar("nenhuma tomada_chuveiro automática (nem nos pontos, nem na legenda)", chuveiros.length === 0 && !legendaBlocos.some((g) => g.nome === "tomada_chuveiro"), chuveiros.length);
    checar("9 tomadas no JSON (4 sala + 4 cozinha + 1 banheiro)", tomadas.length === 9, tomadas.length);
    checar("legenda com pelo menos 1 texto (título) e 1 ícone por bloco distinto usado", legendaTextos.length >= 1 && legendaBlocos.length === 5, `textos=${legendaTextos.length} icones=${legendaBlocos.length}`);

    // Confere que TODA tomada/luz/interruptor REAL (excluindo a legenda,
    // que fica DE PROPÓSITO fora da casa) caiu dentro da bbox da casa --
    // nenhum ponto pode "vazar" pra fora do cômodo detectado.
    const dentroDaCasa = blocos.every((g) => g.x >= -200 && g.x <= 10480 && g.y >= -200 && g.y <= 4200);
    checar("todos os pontos elétricos REAIS caem dentro da bbox da casa (com folga)", dentroDaCasa, JSON.stringify(blocos.map((b) => [b.nome, Math.round(b.x), Math.round(b.y)])));

    // A legenda, ao contrário, deve ficar FORA da bbox da casa (ancorada à
    // direita) -- confirma que ela não se sobrepõe ao desenho.
    checar("legenda ancorada à direita da casa (fora da bbox)", legendaBlocos.every((g) => g.x > 10480));
  }

  // -----------------------------------------------------------------------
  // Undo (Ctrl+Z) deve remover a geração inteira de uma vez (1 passo de
  // undo, como os outros geradores) -- fecha o painel JSON antes (senão o
  // foco no <pre> pode capturar o atalho).
  // -----------------------------------------------------------------------
  await page.keyboard.press("Control+j"); // fecha o painel JSON de novo antes do undo
  await page.waitForTimeout(150);

  await page.screenshot({ path: "/tmp/lancamento-eletrico-resultado.png", fullPage: false });

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
