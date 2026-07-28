"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCadStore } from "@/lib/store";
import { interpretarComando } from "@/lib/commands";
import { FATOR_POR_UNIDADE, formatarComUnidade, type UnidadeDesenho } from "@/lib/unidades";

/**
 * CommandLine
 * -----------------------------------------------------------------------
 * Linha de comando global no rodapé, estilo AutoCAD:
 *   - `L` (linha), `C` (círculo), `REC` (retângulo): armam a ferramenta
 *     de desenho. Linha e Retângulo também aceitam uma medida exata
 *     digitada depois do 1º ponto/canto -- Linha: um número (com unidade
 *     opcional -- "10", "10m", "10cm") vira o comprimento exato na
 *     direção do mouse; Retângulo: "LARGURAxALTURA" (cada lado com
 *     unidade opcional -- "100x50", "2mx1.5m") vira as medidas exatas,
 *     crescendo a partir do 1º canto pro quadrante em que o mouse estiver
 *     apontando.
 *   - `POL` (polígono): clique repetido crava vértices; `Enter` fecha
 *     (mínimo 3 vértices), `Esc` cancela.
 *   - `PL` (polilinha/PLINE): igual ao POL, mas o resultado fica ABERTO
 *     (mínimo 2 vértices) e não é hachurável -- um único elemento
 *     "polilinha" unindo todos os segmentos.
 *   - `E` / `DEL` (apagar): se já houver elementos selecionados, apaga
 *     na hora; senão arma o modo clique-para-apagar (igual ao ERASE do
 *     AutoCAD sem seleção prévia -- entra em "modo de seleção").
 *   - `H` (hachurar): com seleção prévia, aplica a hachura ativa na
 *     hora a todo retângulo/polígono selecionado; sem seleção, arma o
 *     modo clique-para-hachurar (clicar de novo no mesmo elemento
 *     remove a hachura).
 *   - `M` (mover) / `CO` ou `CP` (copiar): exigem uma seleção prévia
 *     (ferramenta "Selecionar" + clique nos elementos); arma o modo de
 *     apontar o ponto-base e depois o destino.
 *   - `TR` (aparar/TRIM): passe o mouse sobre um segmento (calculado ao
 *     vivo pelas interseções com as outras linhas) e clique para
 *     removê-lo.
 *   - `O` (deslocar/OFFSET): o PRÓXIMO Enter é lido como a distância
 *     (mm), não como um comando novo; depois clique numa linha e clique
 *     de novo em um dos lados para definir a direção.
 *   - `F` (concordância/FILLET): usa o raio "lembrado" do uso anterior
 *     (0 = une em bico); `R` + Enter + um número pede um raio novo antes
 *     de selecionar as duas linhas.
 *   - `T` (texto/TEXT): clique posiciona o texto; o PRÓXIMO Enter é o
 *     conteúdo literal (não interpretado como comando).
 *   - `DIM` (cota/DIMENSION): 3 cliques -- ponto inicial, ponto final
 *     (distância ao vivo) e a posição da linha de cota, que já insere o
 *     elemento "COTAS" definitivo. `Esc` a qualquer momento cancela sem
 *     salvar nada.
 *   - `Esc` cancela o comando em andamento.
 *
 * O histórico acima do input funciona como "eco" de comando, dando o
 * mesmo feedback textual do AutoCAD.
 * -----------------------------------------------------------------------
 */
// Entrada de comprimento por digitação (Iteração 12j): converte um texto
// como "10" (assume mm, mesma convenção do OFFSET/FILLET), "10m" (metros --
// unidade mais comum pra comprimento de cabo/trecho num diagrama elétrico)
// ou "10cm" para milímetros. Só casa se o texto for um NÚMERO (com unidade
// opcional) -- qualquer outra coisa (ex.: "M" sozinho, o comando MOVER)
// retorna `null` e cai no caminho normal de `interpretarComando`, então não
// há conflito com nenhum comando de letra existente.
// Iteração 12s: o fallback "sem sufixo" (`match[2] ?? unidadePadrao`) usa a
// unidade padrão ESCOLHIDA PELO USUÁRIO (`unidadeDesenho`, StatusBar) em
// vez de sempre assumir mm -- pedido explícito: "assim o desenho já é
// desenhado em escala real" (digitar só "10" com a unidade em "m" vira
// 10 metros, não 10mm). Um sufixo EXPLÍCITO ("10mm", "2m") sempre vence,
// unidade nenhuma muda isso.
// Iteração 17: generalizado pra `parseNumeroComUnidade`, com um flag
// `aceitaZero` -- extraído porque OFFSET e FILLET (abaixo) tinham cada um
// seu PRÓPRIO parsing manual (`Number(bruto.replace(",", "."))`) que
// IGNORAVA completamente `unidadeDesenho`: um número digitado sem sufixo
// sempre virava mm ali, mesmo com a Unidade de Desenho do projeto
// configurada pra "m" -- inconsistente com a Linha/Retângulo (12j/12o),
// que já respeitavam a unidade ativa, e a causa raiz do pedido do
// usuário ("preciso que se a escala estiver em metros ele entenda 1
// como 1metro, 0.10 como 10cm"). FILLET precisa aceitar RAIO = 0 (une em
// bico, um valor legítimo), por isso o flag -- os demais usos (Linha,
// Retângulo, OFFSET) continuam exigindo um valor estritamente positivo.
function parseNumeroComUnidade(
  bruto: string,
  unidadePadrao: UnidadeDesenho = "mm",
  aceitaZero = false
): number | null {
  const limpo = bruto.trim().toLowerCase().replace(",", ".");
  const match = limpo.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/);
  if (!match) return null;
  const valor = Number(match[1]);
  if (!Number.isFinite(valor) || valor < 0 || (!aceitaZero && valor === 0)) return null;
  const unidade = match[2] ?? unidadePadrao;
  return valor * FATOR_POR_UNIDADE[unidade as UnidadeDesenho];
}

function parseComprimentoMm(bruto: string, unidadePadrao: UnidadeDesenho = "mm"): number | null {
  return parseNumeroComUnidade(bruto, unidadePadrao, false);
}

// Entrada de dimensões do RETÂNGULO por digitação (Iteração 12o): mesma
// ideia do comprimento da Linha (12j), só que com 2 números em vez de 1 --
// "LARGURAxALTURA", cada lado aceitando a mesma unidade opcional
// (mm/cm/m) e "," como separador decimal. O "x" (maiúsculo ou minúsculo)
// separa os 2 números sem ambiguidade com a vírgula decimal (ex.:
// "100x50", "2mx1.5m", "10,5x8cm"). Só casa se o texto inteiro bater com
// esse formato -- qualquer outra coisa retorna `null` e cai no caminho
// normal de `interpretarComando`, igual ao comprimento da Linha.
function parseDimensoesRetanguloMm(
  bruto: string,
  unidadePadrao: UnidadeDesenho = "mm"
): { largura: number; altura: number } | null {
  const limpo = bruto.trim().toLowerCase();
  const match = limpo.match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*x\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?$/);
  if (!match) return null;
  const largura = Number(match[1].replace(",", ".")) * FATOR_POR_UNIDADE[(match[2] ?? unidadePadrao) as UnidadeDesenho];
  const altura = Number(match[3].replace(",", ".")) * FATOR_POR_UNIDADE[(match[4] ?? unidadePadrao) as UnidadeDesenho];
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura <= 0 || altura <= 0) return null;
  return { largura, altura };
}

export function CommandLine() {
  const [texto, setTexto] = useState("");
  const historico = useCadStore((s) => s.historicoComandos);
  const pushComando = useCadStore((s) => s.pushComando);
  const setFerramenta = useCadStore((s) => s.setFerramenta);
  const cancelarDesenho = useCadStore((s) => s.cancelarDesenho);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const unidadeDesenho = useCadStore((s) => s.unidadeDesenho);
  const selecionadoIds = useCadStore((s) => s.selecionadoIds);
  const apagarSelecionados = useCadStore((s) => s.apagarSelecionados);
  const aplicarHachuraSelecionados = useCadStore((s) => s.aplicarHachuraSelecionados);
  const offsetDistancia = useCadStore((s) => s.offsetDistancia);
  const setOffsetDistancia = useCadStore((s) => s.setOffsetDistancia);
  const filletRaio = useCadStore((s) => s.filletRaio);
  const setFilletRaio = useCadStore((s) => s.setFilletRaio);
  const filletAguardandoRaio = useCadStore((s) => s.filletAguardandoRaio);
  const setFilletAguardandoRaio = useCadStore((s) => s.setFilletAguardandoRaio);
  const pontoRascunho = useCadStore((s) => s.pontoRascunho);
  const setPontoRascunho = useCadStore((s) => s.setPontoRascunho);
  const ponteiroMundo = useCadStore((s) => s.ponteiroMundo);
  const addGeometria = useCadStore((s) => s.addGeometria);
  const activeLayer = useCadStore((s) => s.activeLayer);
  const textoFontSizeAtivo = useCadStore((s) => s.textoFontSizeAtivo);

  const historicoRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // TEXTO multilinha (Iteração 12h): enquanto aguarda o conteúdo do texto
  // (ponto já clicado no canvas), o campo vira um `<textarea>` em vez do
  // `<input>` de uma linha só -- Enter então insere quebra de linha
  // nativamente (comportamento padrão do navegador num textarea, ele NÃO
  // envia o `<form>`), e Ctrl+Enter (ou Cmd+Enter no Mac) confirma/insere
  // o texto, tratado no handler de teclado do próprio textarea abaixo.
  const aguardandoConteudoTexto = ferramenta === "texto" && !!pontoRascunho;

  // Comprimento de linha por digitação (Iteração 12k): usado só pra dar
  // destaque visual (rótulo/placeholder) na MESMA caixa de comando de
  // sempre -- ao contrário do Texto, a Linha continua usando um <input> de
  // uma linha só, porque digitar aqui também precisa continuar aceitando
  // um comando de letra normal a qualquer momento (trocar de ferramenta no
  // meio do encadeamento). Sem esse destaque, nada no campo indicava que
  // dava pra digitar uma medida -- só uma mensagem pequena no histórico,
  // fácil de não notar (relatado pelo usuário: "não aparece a opção de
  // digitar").
  const aguardandoComprimentoLinha = ferramenta === "linha" && !!pontoRascunho;

  // Dimensões de retângulo por digitação (Iteração 12o): mesmo destaque
  // visual da Linha (12k) -- o usuário já tinha pedido exatamente essa
  // opção pro Retângulo ("escolher o tamanho dos lados... ja vem com a
  // medida correta"), então o destaque visual entra JUNTO com a
  // funcionalidade desta vez, em vez de precisar de um 2º relato de bug
  // (ver 12i/12k, o mesmo tipo de lição repetida 2x antes).
  const aguardandoDimensoesRetangulo = ferramenta === "retangulo" && !!pontoRascunho;

  // Verdadeiro em qualquer sub-prompt "digite um valor de medida aqui" que
  // usa o MESMO <input> de sempre (ao contrário do Texto, que troca pra um
  // <textarea> -- ver `aguardandoConteudoTexto`) -- usado só pra decidir o
  // destaque visual (rótulo/borda/placeholder) compartilhado entre eles.
  const aguardandoValorDeMedida = aguardandoComprimentoLinha || aguardandoDimensoesRetangulo;

  useEffect(() => {
    historicoRef.current?.scrollTo({ top: historicoRef.current.scrollHeight });
  }, [historico]);

  // Bug real corrigido (Iteração 12f): depois de clicar no canvas para
  // posicionar um TEXTO (ou armar OFFSET/FILLET), o usuário precisa
  // digitar o valor/conteúdo AQUI, nesta linha de comando -- mas nada
  // movia o foco pra este `<input>` depois do clique no canvas (que fica
  // num `<canvas>`, não um campo de texto). Resultado: o usuário digitava
  // "no vazio" -- as teclas não caíam em lugar nenhum visível, e nada
  // parecia acontecer. Corrigido focando este input automaticamente
  // sempre que a ferramenta entra num desses estados de "aguardando
  // sub-prompt digitado".
  useEffect(() => {
    if (aguardandoConteudoTexto) {
      textareaRef.current?.focus();
      return;
    }
    // Bug real corrigido (Iteração 12l): `aguardandoComprimentoLinha` foi
    // adicionado na 12k (destaque visual da caixa), mas ficou de fora desta
    // lista de auto-foco por descuido -- resultado: a caixa ficava com a
    // aparência certa (borda/rótulo/placeholder em amber), mas o usuário
    // precisava CLICAR nela manualmente antes de conseguir digitar, porque o
    // foco do teclado continuava em qualquer lugar que estivesse antes
    // (tipicamente nenhum campo, já que o clique que armou o 1º ponto foi
    // no `<canvas>`, que não é um campo de texto).
    const aguardandoSubPrompt =
      aguardandoValorDeMedida ||
      (ferramenta === "deslocar" && offsetDistancia === null) ||
      (ferramenta === "concordancia" && filletAguardandoRaio);
    if (aguardandoSubPrompt) inputRef.current?.focus();
  }, [aguardandoConteudoTexto, aguardandoValorDeMedida, ferramenta, offsetDistancia, filletAguardandoRaio]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const bruto = texto;
    setTexto("");
    if (!bruto.trim()) return;

    pushComando(`Comando: ${bruto}`);

    // Sub-prompts numéricos: quando a ferramenta ativa está aguardando
    // um VALOR (não um comando novo), o texto digitado tem que ser
    // interpretado como esse valor -- verificado ANTES de
    // `interpretarComando`, senão "50" cairia em "comando desconhecido".
    if (ferramenta === "deslocar" && offsetDistancia === null) {
      // Iteração 17: unit-aware -- número sem sufixo assume `unidadeDesenho`
      // (ex.: unidade em "m", digitar "1" vira 1000mm), sufixo explícito
      // ("500mm", "0.10m") sempre vence, igual à Linha/Retângulo.
      const distanciaMm = parseNumeroComUnidade(bruto, unidadeDesenho, false);
      if (distanciaMm === null) {
        pushComando("Distância inválida. Digite um número maior que zero.");
        return;
      }
      setOffsetDistancia(distanciaMm);
      pushComando(`OFFSET: distância = ${formatarComUnidade(distanciaMm, unidadeDesenho)}. Clique na linha a deslocar.`);
      return;
    }
    if (ferramenta === "concordancia" && filletAguardandoRaio) {
      // Iteração 17: unit-aware, com `aceitaZero` porque raio 0 é um
      // valor legítimo (une em bico, ver comentário de `parseNumeroComUnidade`).
      const raioMm = parseNumeroComUnidade(bruto, unidadeDesenho, true);
      if (raioMm === null) {
        pushComando("Raio inválido. Digite um número maior ou igual a zero.");
        return;
      }
      setFilletRaio(raioMm);
      setFilletAguardandoRaio(false);
      pushComando(
        `FILLET: raio = ${formatarComUnidade(raioMm, unidadeDesenho)}. Selecione as duas linhas (ou digite R para mudar o raio de novo).`
      );
      return;
    }
    if (ferramenta === "concordancia" && bruto.trim().toUpperCase() === "R") {
      setFilletAguardandoRaio(true);
      pushComando(`Novo raio de concordância (em ${unidadeDesenho}, ou com sufixo mm/cm/m):`);
      return;
    }

    // LINHA por comprimento digitado (Iteração 12j): com o 1º ponto já
    // clicado (pontoRascunho), se o texto digitado for um número (com
    // unidade opcional -- "10", "10m", "10cm"), a linha é criada com
    // exatamente esse comprimento, na direção em que o mouse estava
    // apontando por último (`ponteiroMundo`, já resolvido por OSNAP/snap de
    // grid -- mesma referência usada pelo preview "de borracha"). Se o texto
    // não for um número (ex.: outro comando de letra), cai no caminho normal
    // logo abaixo -- não há sub-prompt "travando" a linha de comando, ao
    // contrário do OFFSET/FILLET.
    if (ferramenta === "linha" && pontoRascunho) {
      const comprimentoMm = parseComprimentoMm(bruto, unidadeDesenho);
      if (comprimentoMm !== null) {
        if (!ponteiroMundo) {
          pushComando("Mova o mouse pra indicar a direção antes de digitar o comprimento.");
          return;
        }
        const dx = ponteiroMundo.x - pontoRascunho.x;
        const dy = ponteiroMundo.y - pontoRascunho.y;
        const distanciaAtual = Math.hypot(dx, dy);
        if (distanciaAtual < 1e-6) {
          pushComando("Mova o mouse pra indicar a direção antes de digitar o comprimento.");
          return;
        }
        const ux = dx / distanciaAtual;
        const uy = dy / distanciaAtual;
        const destino = { x: pontoRascunho.x + ux * comprimentoMm, y: pontoRascunho.y + uy * comprimentoMm };
        addGeometria({
          tipo: "linha",
          camada: activeLayer,
          x1: pontoRascunho.x,
          y1: pontoRascunho.y,
          x2: destino.x,
          y2: destino.y,
        });
        // Encadeia a próxima linha a partir do ponto final, igual ao clique
        // (comando LINE do AutoCAD continua até Esc).
        setPontoRascunho(destino);
        pushComando(`LINHA: comprimento ${comprimentoMm}mm inserido na direção do mouse. Continue ou Esc para terminar.`);
        return;
      }
    }

    // RETÂNGULO por dimensões digitadas (Iteração 12o): com o 1º canto já
    // clicado (pontoRascunho), se o texto digitado bater com
    // "LARGURAxALTURA" (cada lado com unidade opcional -- "100x50",
    // "2mx1.5m"), o retângulo nasce com EXATAMENTE essas medidas. O
    // quadrante (pra qual lado o retângulo cresce a partir do 1º canto)
    // vem de onde o mouse está apontando por último (`ponteiroMundo`) --
    // mesmo papel que a direção do mouse tem pro comprimento da Linha, só
    // que aqui decide sinal(x)/sinal(y) em vez de um ângulo contínuo. Se o
    // texto não bater com esse formato, cai no caminho normal logo abaixo
    // -- não há sub-prompt "travando" a linha de comando, mesmo espírito
    // da Linha (ainda dá pra trocar de ferramenta digitando uma letra).
    if (ferramenta === "retangulo" && pontoRascunho) {
      const dimensoes = parseDimensoesRetanguloMm(bruto, unidadeDesenho);
      if (dimensoes !== null) {
        if (!ponteiroMundo) {
          pushComando("Mova o mouse pra indicar o quadrante antes de digitar as dimensões.");
          return;
        }
        const sinalX = ponteiroMundo.x >= pontoRascunho.x ? 1 : -1;
        const sinalY = ponteiroMundo.y >= pontoRascunho.y ? 1 : -1;
        const cantoOpostoX = pontoRascunho.x + sinalX * dimensoes.largura;
        const cantoOpostoY = pontoRascunho.y + sinalY * dimensoes.altura;
        const x = Math.min(pontoRascunho.x, cantoOpostoX);
        const y = Math.min(pontoRascunho.y, cantoOpostoY);
        addGeometria({
          tipo: "retangulo",
          camada: activeLayer,
          x,
          y,
          largura: dimensoes.largura,
          altura: dimensoes.altura,
        });
        // Não encadeia sozinho pro próximo retângulo (mesmo comportamento
        // já existente do clique-clique -- a ferramenta continua armada,
        // só precisa de um novo 1º canto).
        setPontoRascunho(null);
        pushComando(
          `RETANGULO: ${dimensoes.largura}x${dimensoes.altura}mm inserido no quadrante do mouse.`
        );
        return;
      }
    }

    // TEXTO: depois que o ponto de inserção já foi clicado (pontoRascunho
    // setado por CanvasStage), o campo vira um `<textarea>` multilinha (ver
    // JSX abaixo) -- Enter sozinho quebra linha dentro dele, e só
    // Ctrl+Enter/Cmd+Enter chega a disparar este `handleSubmit` (via
    // `requestSubmit`), então `bruto` aqui já pode conter `\n`s literais.
    // Não é interpretado como comando (inclusive se por acaso parecer um,
    // ex.: digitar "L" aqui vira um texto "L", não a ferramenta Linha).
    if (ferramenta === "texto" && pontoRascunho) {
      if (!bruto.trim()) {
        pushComando("Texto vazio ignorado. Digite o conteúdo, ou Esc para cancelar.");
        return;
      }
      // Remove só quebras de linha SOLTAS no início/fim (ex.: usuário apertou
      // Enter uma vez a mais antes de clicar em "Inserir") -- preserva
      // quebras de linha INTERNAS, que são o conteúdo real do texto.
      const conteudoFinal = bruto.replace(/^\n+/, "").replace(/\n+$/, "");
      addGeometria({
        tipo: "texto",
        camada: activeLayer,
        x: pontoRascunho.x,
        y: pontoRascunho.y,
        conteudo: conteudoFinal,
        fontSize: textoFontSizeAtivo,
      });
      setFerramenta("selecionar");
      const linhas = conteudoFinal.split("\n");
      pushComando(
        linhas.length > 1
          ? `TEXTO inserido (${linhas.length} linhas): "${linhas[0]}..."`
          : `TEXTO: "${conteudoFinal}" inserido.`
      );
      return;
    }

    const resultado = interpretarComando(bruto);

    if (resultado.tipo !== "ferramenta") {
      if (resultado.tipo === "cancelar") {
        cancelarDesenho();
        pushComando("*Cancelar*");
      } else {
        pushComando(`Comando desconhecido: "${bruto}". Use L, C, REC, POL, PL, E/DEL, M, CO/CP, H, TR, O, F, T, DIM.`);
      }
      return;
    }

    // APAGAR: com seleção prévia, remove na hora (como o AutoCAD faz
    // quando ERASE roda sobre uma seleção já ativa). Sem seleção, arma
    // o modo clique-para-apagar de sempre.
    if (resultado.ferramenta === "apagar") {
      if (selecionadoIds.length > 0) {
        const quantidade = selecionadoIds.length;
        apagarSelecionados();
        pushComando(`APAGAR: ${quantidade} elemento(s) removido(s).`);
      } else {
        setFerramenta("apagar");
        pushComando("APAGAR: clique em um elemento para excluí-lo. [Esc para sair]");
      }
      return;
    }

    // HACHURA: mesmo espírito do APAGAR -- com seleção prévia, aplica a
    // hachura ativa na hora a todo retângulo/polígono selecionado; sem
    // seleção, arma o modo clique-para-hachurar de sempre.
    if (resultado.ferramenta === "hachurar") {
      if (selecionadoIds.length > 0) {
        const quantidade = aplicarHachuraSelecionados(selecionadoIds);
        pushComando(
          quantidade > 0
            ? `HACHURA: aplicada a ${quantidade} elemento(s) selecionado(s).`
            : "HACHURA: nenhum dos selecionados é retângulo/polígono (a hachura só vale para formas fechadas)."
        );
      } else {
        setFerramenta("hachurar");
        pushComando(
          "HACHURA: clique num retângulo/polígono para aplicar (clique de novo para remover). [Esc para sair]"
        );
      }
      return;
    }

    // OFFSET: sempre repergunta a distância (o "O" arma a ferramenta;
    // o valor numérico vem no PRÓXIMO Enter, tratado no bloco de
    // sub-prompt acima).
    if (resultado.ferramenta === "deslocar") {
      setFerramenta("deslocar");
      // Iteração 17: não fixa mais "(mm)" na mensagem -- um número puro
      // já assume a Unidade de Desenho ativa (StatusBar), sufixo explícito
      // (mm/cm/m) sempre funciona também.
      pushComando(`OFFSET: informe a distância (em ${unidadeDesenho}, ou com sufixo mm/cm/m) e pressione Enter.`);
      return;
    }

    // FILLET: usa o raio já "lembrado" por padrão -- R + Enter troca.
    if (resultado.ferramenta === "concordancia") {
      setFerramenta("concordancia");
      pushComando(
        `FILLET: raio atual = ${formatarComUnidade(filletRaio, unidadeDesenho)}. Digite R para mudar o raio, ou clique nas duas linhas (a segunda conclui).`
      );
      return;
    }

    // TRIM: não precisa de ponto-base -- o preview já é calculado ao
    // vivo a partir do cursor (ver CanvasStage + lib/trim.ts).
    if (resultado.ferramenta === "aparar") {
      setFerramenta("aparar");
      pushComando("APARAR: passe o mouse sobre um segmento e clique para removê-lo. [Esc para sair]");
      return;
    }

    // TEXTO: arma a ferramenta; o clique de posicionamento é tratado no
    // CanvasStage, e o conteúdo digitado no PRÓXIMO Enter (ver
    // sub-prompt acima) é o que efetivamente insere o elemento.
    if (resultado.ferramenta === "texto") {
      setFerramenta("texto");
      pushComando(
        "TEXTO: clique no canvas para posicionar (depois digite o conteúdo -- Enter quebra linha, clique em \"✓ Inserir\" ou Ctrl+Enter confirma). [Esc cancela]"
      );
      return;
    }

    // COTA (Dimension/Ruler): 3 cliques -- ponto inicial, ponto final
    // (com a distância mostrada ao vivo durante o arraste) e a posição
    // da linha de cota, que já insere o elemento definitivo.
    if (resultado.ferramenta === "cota") {
      setFerramenta("cota");
      pushComando("COTA: clique no ponto inicial da medição. [Esc cancela sem salvar]");
      return;
    }

    // MOVER/COPIAR exigem uma seleção prévia (ferramenta Selecionar).
    if (resultado.ferramenta === "mover" || resultado.ferramenta === "copiar") {
      if (selecionadoIds.length === 0) {
        pushComando(
          "Nada selecionado. Use a ferramenta Selecionar (clique nos elementos, Shift+clique para adicionar) e digite o comando de novo."
        );
        return;
      }
      setFerramenta(resultado.ferramenta);
      pushComando(
        `${resultado.ecoAcao}: ${selecionadoIds.length} elemento(s) — especifique o ponto base (clique no canvas).`
      );
      return;
    }

    setFerramenta(resultado.ferramenta);
    pushComando(
      resultado.ferramenta === "selecionar"
        ? "SELECIONAR: clique em um elemento (Shift+clique para adicionar à seleção)."
        : resultado.ferramenta === "poligono"
        ? "POLIGONO: clique para cravar cada vértice. Enter fecha (mín. 3 vértices), Esc cancela."
        : resultado.ferramenta === "polilinha"
        ? "POLILINHA: clique para cravar cada vértice. Enter conclui ABERTA (mín. 2 vértices), Esc cancela."
        : resultado.ferramenta === "linha"
        ? "LINHA: clique o primeiro ponto (depois, clique o 2º ou digite o comprimento -- ex.: 10m)."
        : resultado.ferramenta === "retangulo"
        ? "RETANGULO: clique o primeiro canto (depois, clique o 2º ou digite largura x altura -- ex.: 100x50)."
        : `${resultado.ecoAcao}: especifique o primeiro ponto (clique no canvas).`
    );
  }

  return (
    <div className="flex h-24 shrink-0 flex-col border-t border-slate-300 bg-slate-900 text-slate-100">
      <div ref={historicoRef} className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1 font-mono text-[11px] leading-snug">
        {historico.map((linha, i) => (
          <div key={i} className="text-slate-300">
            {linha}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-700 px-2 py-1.5">
        <span
          className={
            aguardandoValorDeMedida
              ? "font-mono text-[11px] font-semibold text-amber-400"
              : "font-mono text-[11px] text-slate-400"
          }
        >
          {aguardandoComprimentoLinha ? "Comprimento:" : aguardandoDimensoesRetangulo ? "Dimensões:" : "Comando:"}
        </span>
        {aguardandoConteudoTexto ? (
          // Multilinha (Iteração 12h): Enter dentro de um <textarea> insere
          // quebra de linha nativamente e NÃO envia o form (diferente de um
          // <input>) -- por isso Ctrl+Enter/Cmd+Enter é interceptado aqui
          // pra confirmar o texto explicitamente (`requestSubmit` dispara o
          // mesmo `handleSubmit` de sempre).
          <>
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Digite o texto -- Enter quebra linha, Esc cancela"
              rows={Math.min(6, Math.max(2, texto.split("\n").length))}
              className="flex-1 resize-none bg-transparent font-mono text-[12px] text-slate-50 outline-none placeholder:text-slate-500"
              autoComplete="off"
              spellCheck={false}
            />
            {/* Botão explícito de confirmar (Iteração 12i): depender só de
                Ctrl+Enter/Cmd+Enter se mostrou pouco descobrível -- o usuário
                tinha o hábito de "Enter sempre confirma" de todos os outros
                sub-prompts desta mesma linha de comando (OFFSET, FILLET) e,
                ao só apertar Enter aqui (que agora quebra linha), a caixa
                parecia "não fazer nada", sem indicar que Ctrl+Enter era
                necessário -- resultado: o texto nunca era inserido de fato
                (`addGeometria` nunca rodava). Este botão dá um caminho de
                confirmação óbvio e clicável, sem precisar lembrar do atalho;
                Ctrl+Enter continua funcionando também, para quem já pegou o
                jeito. */}
            <button
              type="button"
              onClick={() => textareaRef.current?.form?.requestSubmit()}
              disabled={!texto.trim()}
              title="Confirma e insere o texto (atalho: Ctrl+Enter)"
              className="shrink-0 rounded bg-blue-700 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-50 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              ✓ Inserir
            </button>
          </>
        ) : (
          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              aguardandoComprimentoLinha
                ? "Digite o comprimento -- ex.: 10 ou 10m -- e Enter (ou clique o próximo ponto no canvas)"
                : aguardandoDimensoesRetangulo
                ? "Digite largura x altura -- ex.: 100x50 ou 2mx1.5m -- e Enter (ou clique o 2º canto no canvas)"
                : "L · C · REC · POL · PL · TR · O · F · T · DIM · E/DEL · M · CO/CP · H · Esc"
            }
            className={
              aguardandoValorDeMedida
                ? "flex-1 rounded border border-amber-500 bg-slate-800 px-1.5 py-0.5 font-mono text-[12px] text-slate-50 outline-none placeholder:text-amber-500/70"
                : "flex-1 bg-transparent font-mono text-[12px] text-slate-50 outline-none placeholder:text-slate-500"
            }
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {selecionadoIds.length > 0 && (
          <span className="rounded bg-blue-800 px-2 py-0.5 font-mono text-[10px] text-blue-100">
            {selecionadoIds.length} selecionado(s)
          </span>
        )}
        <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-200">
          {ferramenta}
        </span>
      </form>
    </div>
  );
}
