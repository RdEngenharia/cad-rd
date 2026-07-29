"use client";

import { useState } from "react";
import { Layer, Line, Circle, Rect, Text, RegularPolygon, Shape, Group } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useCadStore, escalarGeometria } from "@/lib/store";
import { resolverCamada } from "@/lib/layers";
import { estiloHachuraKonva } from "@/lib/hachura";
import { linhaDeCota } from "@/lib/geom";
import {
  gripsDeGeometria,
  gripsIntermediariosDeGeometria,
  aplicarStretchNaGeometria,
  aplicarStretchArestaNaGeometria,
} from "@/lib/grips";
import { bboxCombinada, caixaEnvolvente } from "@/lib/selection";
import { BlocoShape } from "./BlocoShape";
import { getBlockDef } from "@/lib/blocks";
import { ArcoShape } from "./ArcoShape";
import { ViewportShape } from "./ViewportShape";
import { screenToWorld, type Viewport } from "@/lib/snap";
import type { Camada, Geometria, RetanguloGeometria } from "@/lib/types";
import { PADRAO_TRACEJADO_MM } from "@/lib/types";
import { formatarComUnidade, deMm, ROTULO_UNIDADE } from "@/lib/unidades";
import { arestasDe } from "@/lib/trim";

/**
 * Converte `Camada.estiloLinha` no `dash` que o Konva espera -- `undefined`
 * (linha contínua) quando a camada é "continua" ou não tem o campo
 * (camadas salvas antes deste campo existir, ver `Camada.estiloLinha` em
 * lib/types.ts), ou o padrão em `PADRAO_TRACEJADO_MM` escalado por
 * `1/scale` (mesma convenção de todo `dash` de preview já usado neste
 * arquivo, ex.: a linha de borracha da ferramenta LINHA) quando é
 * "tracejada".
 */
function dashDaCamada(camada: Camada, scale: number): [number, number] | undefined {
  if (camada.estiloLinha !== "tracejada") return undefined;
  return [PADRAO_TRACEJADO_MM[0] / scale, PADRAO_TRACEJADO_MM[1] / scale];
}

/**
 * Iteração 16: mesma coisa que `dashDaCamada`, mas pra retângulo -- que
 * agora também pode pedir tracejado PRÓPRIO via `RetanguloGeometria.tracejado`
 * (ver `lib/types.ts`), independente do `estiloLinha` da camada em que
 * está (usado pelas caixas de agrupamento do gerador de diagrama FV, que
 * ficam todas na camada "0", de traço contínuo). `tracejado: true` no
 * retângulo tem prioridade; caso contrário cai no comportamento de sempre.
 */
function dashDoRetangulo(g: RetanguloGeometria, camada: Camada, scale: number): [number, number] | undefined {
  if (g.tracejado) return [PADRAO_TRACEJADO_MM[0] / scale, PADRAO_TRACEJADO_MM[1] / scale];
  return dashDaCamada(camada, scale);
}

interface GeometryLayerProps {
  viewport: Viewport;
}

const COR_SELECAO = "#2563eb";
const COR_OSNAP = "#22c55e";
const COR_GHOST = "#0ea5e9";
const COR_CALIBRACAO = "#eab308";
// OFFSET (Deslocar), Iteração 37 -- destaque em âmbar da linha/aresta
// "em mira" ANTES do 1º clique (hover), pra diferenciar visualmente do
// azul de seleção normal, do vermelho do TRIM (que remove) e do ciano do
// ghost/ preview (que já mostra a duplicata em si).
const COR_OFFSET_HOVER = "#f59e0b";

// TRIM (Aparar) -- quebra manual / "abrir vão" (Iteração 39): azul-céu
// pro hover da linha candidata (sem nenhum cruzamento, elegível a virar
// vão -- diferente do vermelho normal do TRIM, que já mostra o segmento
// que SERIA removido num cruzamento de verdade), e o mesmo tom (mais
// forte) pro vão em si, entre o ponto A já armado e o ponto B ao vivo.
const COR_TRIM_QUEBRA = "#0ea5e9";

// Iteração 41 (pedido do usuário: "corrija o defeito quando vou apagar
// algumas linhas ela quebra em varios pedaços ao inves de ficar
// vermelhar e apagar de uma vez") -- com a ferramenta Apagar ativa, a
// forma sob o cursor agora acende neste vermelho ANTES do clique (hover),
// deixando claro exatamente o que vai ser removido POR INTEIRO com um
// único clique -- sem esse aviso, era fácil confundir Apagar com o TRIM
// (Aparar), que de propósito corta só um pedaço da linha (ver
// COR_TRIM_QUEBRA acima); Apagar nunca corta, sempre remove o elemento
// inteiro de uma vez (ver `GeometryLayer.handleShapeClick`).
const COR_APAGAR_HOVER = "#dc2626";

// Iteração 41 -- FILLET generalizado (ver `store.ts#aplicarFillet`):
// destaca em roxo a 1ª aresta já escolhida, enquanto o usuário ainda não
// clicou na 2ª -- sem esse aviso, depois de clicar na 1ª linha/aresta
// não havia NENHUM sinal visual de qual delas já estava armada.
const COR_FILLET_ALVO1 = "#9333ea";

/** Translada uma cópia "fantasma" de uma geometria por (dx, dy) -- só para preview, nunca persistido. */
function transladarPreview(g: Geometria, dx: number, dy: number): Geometria {
  switch (g.tipo) {
    case "linha":
      return { ...g, x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy };
    case "circulo":
      return { ...g, x: g.x + dx, y: g.y + dy };
    case "bloco":
      return { ...g, x: g.x + dx, y: g.y + dy };
    case "retangulo":
      return { ...g, x: g.x + dx, y: g.y + dy };
    case "poligono":
      return { ...g, pontos: g.pontos.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "arco":
      return { ...g, x: g.x + dx, y: g.y + dy };
    case "texto":
      return { ...g, x: g.x + dx, y: g.y + dy };
    case "cota":
      return { ...g, x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy, px: g.px + dx, py: g.py + dy };
    case "polilinha":
      return { ...g, pontos: g.pontos.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "viewport":
      return { ...g, x: g.x + dx, y: g.y + dy };
  }
}

/**
 * GeometryLayer
 * -----------------------------------------------------------------------
 * Renderiza toda a geometria persistida do projeto (linhas, círculos,
 * blocos, retângulos, polígonos, arcos), aplicando o estilo (cor/
 * espessura) e a visibilidade da camada de cada elemento -- elementos
 * de camadas invisíveis não são desenhados nem clicáveis. Por cima,
 * desenha:
 *   - o preview "de borracha" (rubber-band) da ferramenta ativa
 *     (linha/círculo/retângulo/polígono/mover/copiar);
 *   - o preview do TRIM (segmentos calculados na hora + o que está em
 *     mira) e do OFFSET (linha paralela seguindo o cursor);
 *   - a linha amarela de calibração de XREF (Scale by Reference), com a
 *     distância medida ao vivo;
 *   - o indicador verde de OSNAP (quadrado = Endpoint, triângulo =
 *     Midpoint);
 *   - o realce azul dos elementos selecionados (seleção múltipla:
 *     clique substitui, Shift+clique alterna um item na seleção).
 *
 * Quando a ferramenta ativa é "apagar", um clique em qualquer forma a
 * remove do projeto POR INTEIRO -- linha inteira, bloco completo, forma
 * fechada (retângulo/polígono) inteira, ou texto inteiro -- do contrário,
 * um clique seleciona (respeitando Shift para seleção múltipla). A
 * Iteração 12q chegou a fazer o Apagar cortar só um sub-segmento quando a
 * linha clicada cruzava outra (igual ao TRIM), mas a Iteração 12r
 * reverteu isso a pedido do usuário: Apagar precisa ser sempre diferente
 * do Aparar/TRIM, sem nenhuma exceção por cruzamento -- cortar segmento é
 * trabalho exclusivo da ferramenta Aparar.
 * -----------------------------------------------------------------------
 */
export function GeometryLayer({ viewport }: GeometryLayerProps) {
  const geometria = useCadStore((s) => s.projeto.geometria);
  const camadas = useCadStore((s) => s.projeto.camadas);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const selecionadoIds = useCadStore((s) => s.selecionadoIds);
  const removeGeometria = useCadStore((s) => s.removeGeometria);
  const alternarSelecao = useCadStore((s) => s.alternarSelecao);
  const pontoRascunho = useCadStore((s) => s.pontoRascunho);
  const ponteiroMundo = useCadStore((s) => s.ponteiroMundo);
  const escalaPreview = useCadStore((s) => s.escalaPreview);
  const osnapAlvo = useCadStore((s) => s.osnapAlvo);
  const osnapTipo = useCadStore((s) => s.osnapTipo);
  const calibPoint1 = useCadStore((s) => s.calibPoint1);
  const calibPoint2 = useCadStore((s) => s.calibPoint2);
  const poligonoPontos = useCadStore((s) => s.poligonoPontos);
  const alternarHachura = useCadStore((s) => s.alternarHachura);
  const trimPreview = useCadStore((s) => s.trimPreview);
  const trimQuebraA = useCadStore((s) => s.trimQuebraA);
  const trimQuebraCandidata = useCadStore((s) => s.trimQuebraCandidata);
  const trimQuebraPreviewB = useCadStore((s) => s.trimQuebraPreviewB);
  const unidadeDesenho = useCadStore((s) => s.unidadeDesenho);
  const offsetAlvoId = useCadStore((s) => s.offsetAlvoId);
  const offsetAlvoSegmento = useCadStore((s) => s.offsetAlvoSegmento);
  const offsetHover = useCadStore((s) => s.offsetHover);
  const offsetDistancia = useCadStore((s) => s.offsetDistancia);
  const filletAlvo1 = useCadStore((s) => s.filletAlvo1);
  const selecionarAlvoOffset = useCadStore((s) => s.selecionarAlvoOffset);
  const selecionarAlvo1Fillet = useCadStore((s) => s.selecionarAlvo1Fillet);
  const aplicarFillet = useCadStore((s) => s.aplicarFillet);
  const pushComando = useCadStore((s) => s.pushComando);
  const selecaoBox = useCadStore((s) => s.selecaoBox);
  const cotaP1 = useCadStore((s) => s.cotaP1);
  const cotaP2 = useCadStore((s) => s.cotaP2);
  const polilinhaPontos = useCadStore((s) => s.polilinhaPontos);
  const gripAlvo = useCadStore((s) => s.gripAlvo);
  const iniciarStretch = useCadStore((s) => s.iniciarStretch);
  const inserirVerticeNoMeio = useCadStore((s) => s.inserirVerticeNoMeio);
  const abrirMenuVertice = useCadStore((s) => s.abrirMenuVertice);
  const viewportAtivoId = useCadStore((s) => s.viewportAtivoId);

  // Iteração 41 -- hover vermelho do Apagar (ver `COR_APAGAR_HOVER`
  // acima). Estado só de UI (não precisa viver no store global -- nada
  // além deste componente depende de "qual forma está em mira pro
  // Apagar agora"), zerado sempre que a ferramenta deixa de ser
  // "apagar" (troca de ferramenta no meio do hover não pode deixar um
  // destaque vermelho "grudado" numa forma). Ajustado DURANTE a
  // renderização (padrão recomendado pelo React pra "resetar estado
  // quando uma prop muda", em vez de um `useEffect` chamando `setState`
  // no corpo -- isso dispara o lint `react-hooks/set-state-in-effect`,
  // que sinaliza o risco de cascata de renders; aqui não há esse risco
  // porque o `if` só dispara quando `ferramenta` de fato muda, mas o
  // padrão de render é a forma canônica mesmo assim).
  const [apagarHoverId, setApagarHoverId] = useState<string | null>(null);
  const [ferramentaAnteriorParaHover, setFerramentaAnteriorParaHover] = useState(ferramenta);
  if (ferramenta !== ferramentaAnteriorParaHover) {
    setFerramentaAnteriorParaHover(ferramenta);
    if (ferramenta !== "apagar" && apagarHoverId !== null) setApagarHoverId(null);
  }
  /** Handlers de hover só ativos com Apagar selecionado -- em qualquer outra ferramenta não faz nada (e não força re-render à toa). */
  function hoverApagarHandlers(id: string) {
    if (ferramenta !== "apagar") return {};
    return {
      onMouseEnter: () => setApagarHoverId(id),
      onMouseLeave: () => setApagarHoverId((atual) => (atual === id ? null : atual)),
    };
  }

  // Só intercepta o clique quando a ferramenta é seleção/apagar/hachura/
  // deslocar(1º clique)/concordância; nas ferramentas de desenho (linha/
  // círculo/carimbo/mover/copiar/aparar) deixamos o clique "vazar" para
  // o Stage, que trata a colocação do ponto normalmente mesmo que o
  // cursor esteja em cima de uma geometria.
  //
  // O Konva sintetiza "click" a partir de pointerdown/up no mesmo alvo,
  // sem filtrar por botão do mouse -- um pan com o botão do meio/direito
  // que comece exatamente sobre uma forma dispararia este handler e
  // apagaria/selecionaria o elemento sem o usuário ter clicado de fato.
  // Ignoramos qualquer clique que não seja do botão principal (0).
  const handleShapeClick = (id: string) => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
    if (ferramenta === "apagar") {
      e.cancelBubble = true;
      // Iteração 12q tentou fazer o Apagar cortar só o sub-segmento em
      // mira quando a linha clicada cruzava outra (igual ao TRIM) -- o
      // usuário testou e pediu pra REVERTER (Iteração 12r): "o botao
      // apagar precisa ser diferente de trim, ele deve apagar o que for
      // um bloco completo ou desenho fechado, ou linha inteira, ou texto
      // inteiro". Apagar volta a ser incondicional: sempre remove o
      // elemento clicado POR INTEIRO, seja linha, bloco, forma fechada
      // (retângulo/polígono) ou texto -- nunca corta um pedaço. Cortar um
      // segmento continua sendo só trabalho da ferramenta Aparar (TRIM),
      // que não foi tocada por essa reversão.
      removeGeometria(id);
    } else if (ferramenta === "hachurar") {
      e.cancelBubble = true;
      alternarHachura(id);
    } else if (ferramenta === "deslocar" && !offsetAlvoId) {
      // O 2º clique (lado/direção) não deve ser interceptado aqui -- só
      // o 1º clique, que escolhe a linha/aresta alvo. Ver CanvasStage
      // para o clique de destino, que trata qualquer ponto do canvas.
      //
      // Iteração 36: `selecionarAlvoOffset` agora também aceita clicar
      // numa aresta de retângulo/polígono/polilinha fechado (antes só
      // "linha" solta funcionava) -- pra isso ela precisa saber ONDE
      // dentro da forma foi o clique (pra escolher qual das 4 arestas de
      // um retângulo, por exemplo), não só o `id`. O Konva só dá a
      // posição do ponteiro em pixels de tela (`getPointerPosition`);
      // convertemos pro mesmo sistema de coordenadas de mundo (mm) que o
      // resto do app usa via `screenToWorld` (mesma função que
      // `CanvasStage.tsx` usa pro clique de nível Stage).
      e.cancelBubble = true;
      const pointer = e.target.getStage()?.getPointerPosition();
      const pontoMundo = pointer ? screenToWorld(pointer, viewport) : { x: 0, y: 0 };
      selecionarAlvoOffset(id, pontoMundo);
    } else if (ferramenta === "concordancia") {
      // Iteração 41: generalizado pra aceitar clicar numa ARESTA de
      // retângulo/polígono/polilinha (não só uma "linha" solta) -- por
      // isso precisa de ONDE dentro da forma foi o clique, igual ao
      // OFFSET logo acima (ver `selecionarAlvoOffset`).
      e.cancelBubble = true;
      const pointerFillet = e.target.getStage()?.getPointerPosition();
      const pontoMundoFillet = pointerFillet ? screenToWorld(pointerFillet, viewport) : { x: 0, y: 0 };
      if (!filletAlvo1) {
        selecionarAlvo1Fillet(id, pontoMundoFillet);
      } else {
        const resultado = aplicarFillet(id, pontoMundoFillet);
        if (!resultado.ok) pushComando(resultado.erro ?? "FILLET: não foi possível concordar essas duas linhas.");
      }
    } else if (ferramenta === "selecionar") {
      // Iteração 27: Alt+clique é o gesto de "selecionar o XREF por baixo
      // desta geometria" (ver `CanvasStage.tsx#handleMouseDown`, que já
      // decidiu e aplicou essa seleção no mousedown, antes deste clique
      // dispar). Só marcamos `cancelBubble` (pra não cair no fallback de
      // "clique em vazio" no Stage, que limparia a seleção que acabou de
      // ser feita) e saímos sem selecionar ESTA geometria por cima dela.
      e.cancelBubble = true;
      if (e.evt instanceof MouseEvent && e.evt.altKey) return;
      // Iteração 42 (pedido do usuário -- verbatim: "quero ao clicar em
      // uma linha ou texto ou bloco ele fique selecionado e se eu clicar
      // em varios itens todos eles vao ficando selecionados, atualmente
      // se eu clicar em duas linha a primeira sai da selecao e mantem
      // apenas o ultimo item selecionado"): ANTES, um clique simples
      // (sem Shift) sempre TROCAVA a seleção inteira por só o item
      // clicado (`selecionarUnico`) -- só Shift+clique acumulava
      // (`alternarSelecao`). Agora todo clique num item (com ou sem
      // Shift) ACUMULA: cada forma clicada entra na seleção, e as já
      // selecionadas continuam selecionadas. Clicar de novo num item JÁ
      // selecionado o retira da seleção (comportamento de "alternar" --
      // forma natural de tirar 1 item sem perder o resto). Clicar em
      // área vazia do desenho continua limpando a seleção inteira (ver
      // `CanvasStage.tsx#limparSelecao`), que é como se troca de seleção
      // "do zero".
      alternarSelecao(id);
    }
  };

  // Grip (STRETCH), Iteração 12c: PRESSIONAR (mousedown) num quadrado azul
  // de vértice já arma o alvo do stretch no store (ver `iniciarStretch`) --
  // a partir daí o preview ao vivo é desenhado mais abaixo (ghost cyan
  // seguindo `ponteiroMundo`) e SOLTAR o botão (mouseup, em qualquer lugar
  // do Stage) confirma (ver `handleMouseUp` em CanvasStage.tsx). Isso vira
  // um gesto de arraste único (pressionar + arrastar + soltar), igual ao
  // AutoCAD -- antes exigia dois cliques separados (armar, depois
  // confirmar em outro lugar), o que o usuário relatou como "não ter
  // controle pra mover". `cancelBubble` impede que esse mesmo mousedown
  // também dispare o início de uma seleção por caixa no Stage por baixo
  // do grip (ver `handleMouseDown` em CanvasStage.tsx).
  const handleGripMouseDown = (id: string, indice: number) => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
    e.cancelBubble = true;
    iniciarStretch(id, indice);
  };

  // "click"/"tap" sintetizado pelo Konva a partir do MESMO par
  // mousedown+mouseup (clique parado, sem arrastar de fato): só absorve o
  // evento (`cancelBubble`) pra não deixar vazar até o Stage e cair no
  // fallback de `limparSelecao()` -- NÃO re-arma o stretch aqui, senão o
  // grip ficaria armado de novo logo depois de `handleMouseUp` já ter
  // confirmado (e encerrado) o stretch.
  const handleGripClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
  };

  // Botão direito num grip sólido (vértice existente): abre o menu de
  // contexto flutuante com "Remover vértice" (ver `VertexContextMenu.tsx`
  // + `menuVerticeContexto` no store). O container do Stage já faz
  // `preventDefault` no contextmenu nativo (CanvasStage.tsx), então só
  // precisamos impedir que esse clique também "vaze" para outro handler.
  const handleGripContextMenu = (id: string, indice: number) => (e: KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    abrirMenuVertice(id, indice, e.evt.clientX, e.evt.clientY);
  };

  // Clique num grip "oco" (ponto médio de uma aresta -- ver
  // `gripsIntermediariosDeGeometria`): crava um vértice novo ali na hora
  // (Sprint 3, item 3 -- "adicionar... num grip intermediário"). Usado só
  // por polígono/polilinha (Iteração 22) -- ver `handleGripIntermediarioMouseDown`
  // logo abaixo pra retângulo/viewport, que ganharam um comportamento
  // diferente no mesmo grip.
  const handleGripIntermediarioClick =
    (id: string, indiceSegmento: number) => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
      e.cancelBubble = true;
      inserirVerticeNoMeio(id, indiceSegmento);
    };

  // Iteração 22 -- pedido do usuário: "Atualmente eu consigo aumentar um
  // contorno ou diminuir clicando nos cantos, porem no autocad tambem
  // tenho a opcao no centro das linhas dos quadrados ou retangulos."
  // PRESSIONAR (mousedown) no grip oco do MEIO de uma aresta de
  // RETÂNGULO arma um STRETCH em modo `"aresta"` (ver
  // `iniciarStretch`/`aplicarStretchArestaNaGeometria`) -- mesmo gesto de
  // arraste único (pressionar + arrastar + soltar) já usado pelos grips
  // de canto, mas travado no eixo perpendicular à aresta (arrastar o meio
  // do topo/base só muda a altura; o meio da esquerda/direita só muda a
  // largura). Reaproveita o MESMO grip visual que polígono/polilinha usam
  // pra inserir vértice -- por isso este mousedown só é ligado quando
  // `tipo` é "retangulo" (ver uso mais abaixo), nunca junto do `onClick`
  // de inserir vértice (que continua exclusivo de polígono/polilinha,
  // formas livres sem eixo X/Y fixo onde "esticar só uma dimensão" não
  // faz sentido). NÃO cobre "viewport": o viewport comum (dentro de uma
  // Prancha) usa um sistema de grips totalmente separado, ver comentário
  // grande em `aplicarStretchArestaNaGeometria` (grips.ts).
  const handleGripIntermediarioMouseDown =
    (id: string, indiceSegmento: number) => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
      e.cancelBubble = true;
      iniciarStretch(id, indiceSegmento, "aresta");
    };

  // Botão direito no grip do meio de uma aresta de RETÂNGULO (Iteração
  // 22): já que o clique esquerdo nesse grip virou "esticar a aresta"
  // (acima), a antiga ação de inserir vértice ali (promovendo o retângulo
  // a polígono, ver `inserirVerticeNoMeio`) muda pro botão direito, pra
  // não conflitar com o novo arrasto -- continua a única forma de
  // transformar um retângulo em polígono editável ponto a ponto. Não
  // ligado a "viewport" (não faz sentido promover uma janela de impressão
  // a polígono -- `inserirVerticeNoMeio` recusaria de qualquer forma).
  const handleGripIntermediarioContextMenu =
    (id: string, indiceSegmento: number) => (e: KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      inserirVerticeNoMeio(id, indiceSegmento);
    };

  const scale = viewport.scale;

  // Delta ao vivo para o preview "fantasma" de Mover/Copiar.
  const deltaPreview =
    pontoRascunho && ponteiroMundo && (ferramenta === "mover" || ferramenta === "copiar")
      ? { dx: ponteiroMundo.x - pontoRascunho.x, dy: ponteiroMundo.y - pontoRascunho.y }
      : null;

  // Centro (bbox combinada) usado pelo preview ao vivo da Escala
  // (Iteração 12p) -- MESMA referência de ponto-base que `escalarSelecao`
  // usa de fato ao "Aplicar" (ver `lib/store.ts`), calculado aqui a partir
  // da geometria REAL (ainda não escalada) dos elementos selecionados, pra
  // o preview bater exatamente com o resultado final.
  const centroEscalaPreview =
    escalaPreview && selecionadoIds.length > 0
      ? (() => {
          const bbox = bboxCombinada(geometria.filter((g) => selecionadoIds.includes(g.id)));
          return bbox ? { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 } : null;
        })()
      : null;

  return (
    <Layer>
      {geometria.map((g) => {
        const camada = resolverCamada(camadas, g.camada);
        if (!camada.visible) return null;

        const selecionado = selecionadoIds.includes(g.id);
        // Iteração 41 -- ver `COR_APAGAR_HOVER`/`hoverApagarHandlers` acima:
        // com Apagar ativo, a forma sob o cursor destaca em vermelho ANTES
        // do clique, com prioridade sobre o azul de seleção.
        const emMiraApagar = ferramenta === "apagar" && apagarHoverId === g.id;
        if (g.tipo === "linha") {
          return (
            <Line
              key={g.id}
              points={[g.x1, g.y1, g.x2, g.y2]}
              stroke={emMiraApagar ? COR_APAGAR_HOVER : selecionado ? COR_SELECAO : camada.cor}
              strokeWidth={(emMiraApagar || selecionado ? camada.espessuraDaLinha + 0.6 : camada.espessuraDaLinha) / scale}
              hitStrokeWidth={Math.max(10 / scale, 6)}
              dash={dashDaCamada(camada, scale)}
              lineCap="round"
              onClick={handleShapeClick(g.id)}
              onTap={handleShapeClick(g.id)}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        if (g.tipo === "circulo") {
          return (
            <Circle
              key={g.id}
              x={g.x}
              y={g.y}
              radius={g.raio}
              stroke={emMiraApagar ? COR_APAGAR_HOVER : selecionado ? COR_SELECAO : camada.cor}
              strokeWidth={(emMiraApagar || selecionado ? camada.espessuraDaLinha + 0.6 : camada.espessuraDaLinha) / scale}
              hitStrokeWidth={Math.max(10 / scale, 6)}
              dash={dashDaCamada(camada, scale)}
              {...estiloHachuraKonva(g.hachura)}
              onClick={handleShapeClick(g.id)}
              onTap={handleShapeClick(g.id)}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        if (g.tipo === "bloco") {
          return (
            <BlocoShape
              key={g.id}
              geo={g}
              scale={scale}
              selecionado={selecionado}
              destacarApagar={emMiraApagar}
              onClick={handleShapeClick(g.id)}
              camada={camada}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        if (g.tipo === "retangulo") {
          return (
            <Rect
              key={g.id}
              x={g.x}
              y={g.y}
              width={g.largura}
              height={g.altura}
              stroke={emMiraApagar ? COR_APAGAR_HOVER : selecionado ? COR_SELECAO : camada.cor}
              strokeWidth={(emMiraApagar || selecionado ? camada.espessuraDaLinha + 0.6 : camada.espessuraDaLinha) / scale}
              hitStrokeWidth={Math.max(10 / scale, 6)}
              dash={dashDoRetangulo(g, camada, scale)}
              {...estiloHachuraKonva(g.hachura)}
              onClick={handleShapeClick(g.id)}
              onTap={handleShapeClick(g.id)}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        if (g.tipo === "poligono") {
          return (
            <Line
              key={g.id}
              points={g.pontos.flatMap((p) => [p.x, p.y])}
              closed
              stroke={emMiraApagar ? COR_APAGAR_HOVER : selecionado ? COR_SELECAO : camada.cor}
              strokeWidth={(emMiraApagar || selecionado ? camada.espessuraDaLinha + 0.6 : camada.espessuraDaLinha) / scale}
              hitStrokeWidth={Math.max(10 / scale, 6)}
              dash={dashDaCamada(camada, scale)}
              {...estiloHachuraKonva(g.hachura)}
              onClick={handleShapeClick(g.id)}
              onTap={handleShapeClick(g.id)}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        if (g.tipo === "arco") {
          return (
            <ArcoShape
              key={g.id}
              geo={g}
              stroke={emMiraApagar ? COR_APAGAR_HOVER : selecionado ? COR_SELECAO : camada.cor}
              strokeWidth={(emMiraApagar || selecionado ? camada.espessuraDaLinha + 0.6 : camada.espessuraDaLinha) / scale}
              hitStrokeWidth={Math.max(10 / scale, 6)}
              dash={dashDaCamada(camada, scale)}
              onClick={handleShapeClick(g.id)}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        if (g.tipo === "texto") {
          return (
            <Text
              key={g.id}
              x={g.x}
              y={g.y}
              text={g.conteudo}
              fontSize={g.fontSize}
              rotation={g.rotacao ?? 0}
              fill={emMiraApagar ? COR_APAGAR_HOVER : selecionado ? COR_SELECAO : camada.cor}
              onClick={handleShapeClick(g.id)}
              onTap={handleShapeClick(g.id)}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        if (g.tipo === "cota") {
          const { q1, q2 } = linhaDeCota({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }, { x: g.px, y: g.py });
          const cor = emMiraApagar ? COR_APAGAR_HOVER : selecionado ? COR_SELECAO : camada.cor;
          const largura = (emMiraApagar || selecionado ? camada.espessuraDaLinha + 0.6 : camada.espessuraDaLinha) / scale;
          const hit = Math.max(10 / scale, 6);
          const dashCota = dashDaCamada(camada, scale);
          return (
            <Group key={g.id}>
              <Line
                points={[g.x1, g.y1, q1.x, q1.y]}
                stroke={cor}
                strokeWidth={largura}
                hitStrokeWidth={hit}
                dash={dashCota}
                onClick={handleShapeClick(g.id)}
                onTap={handleShapeClick(g.id)}
                {...hoverApagarHandlers(g.id)}
              />
              <Line
                points={[g.x2, g.y2, q2.x, q2.y]}
                stroke={cor}
                strokeWidth={largura}
                hitStrokeWidth={hit}
                dash={dashCota}
                onClick={handleShapeClick(g.id)}
                onTap={handleShapeClick(g.id)}
                {...hoverApagarHandlers(g.id)}
              />
              <Line
                points={[q1.x, q1.y, q2.x, q2.y]}
                stroke={cor}
                strokeWidth={largura}
                hitStrokeWidth={hit}
                dash={dashCota}
                onClick={handleShapeClick(g.id)}
                onTap={handleShapeClick(g.id)}
                {...hoverApagarHandlers(g.id)}
              />
              {/* Iteração 12s: reformata ao vivo na unidade de exibição atual
                  (mm/cm/m) sempre que `distanciaMm` estiver presente --
                  cotas salvas ANTES desta iteração não têm esse campo e
                  continuam mostrando o `texto` congelado de sempre. */}
              <Text
                x={(q1.x + q2.x) / 2}
                y={(q1.y + q2.y) / 2 - 12 / scale}
                text={g.distanciaMm !== undefined ? formatarComUnidade(g.distanciaMm, unidadeDesenho) : g.texto}
                fontSize={9 / scale}
                fill={cor}
                onClick={handleShapeClick(g.id)}
                onTap={handleShapeClick(g.id)}
                {...hoverApagarHandlers(g.id)}
              />
            </Group>
          );
        }
        if (g.tipo === "polilinha") {
          // PLINE: segmentos unidos, mas SEM fechar entre o último e o
          // primeiro vértice (diferente do "poligono") -- e nunca
          // hachurável, então não passa por `estiloHachura`.
          return (
            <Line
              key={g.id}
              points={g.pontos.flatMap((p) => [p.x, p.y])}
              stroke={emMiraApagar ? COR_APAGAR_HOVER : selecionado ? COR_SELECAO : camada.cor}
              strokeWidth={(emMiraApagar || selecionado ? camada.espessuraDaLinha + 0.6 : camada.espessuraDaLinha) / scale}
              hitStrokeWidth={Math.max(10 / scale, 6)}
              dash={dashDaCamada(camada, scale)}
              lineCap="round"
              lineJoin="round"
              onClick={handleShapeClick(g.id)}
              onTap={handleShapeClick(g.id)}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        if (g.tipo === "viewport") {
          return (
            <ViewportShape
              key={g.id}
              geo={g}
              geometriaCompleta={geometria}
              camadas={camadas}
              scale={scale}
              selecionado={selecionado}
              destacarApagar={emMiraApagar}
              ativo={viewportAtivoId === g.id}
              onClick={handleShapeClick(g.id)}
              {...hoverApagarHandlers(g.id)}
            />
          );
        }
        return null;
      })}

      {/* Preview em tempo real do que está sendo desenhado agora */}
      {pontoRascunho && ponteiroMundo && ferramenta === "linha" && (
        <>
          <Line
            points={[pontoRascunho.x, pontoRascunho.y, ponteiroMundo.x, ponteiroMundo.y]}
            stroke={COR_SELECAO}
            strokeWidth={1 / scale}
            dash={[6 / scale, 4 / scale]}
            listening={false}
          />
          {/* Rótulo de comprimento ao vivo + dica de digitar (Iteração 12k):
              sem isso, "dá pra digitar o comprimento" não tinha NENHUM sinal
              visual no canvas -- só uma mensagem pequena no histórico da
              linha de comando, fácil de não notar. Mostra a distância atual
              (mesma unidade que o usuário pode digitar) grudada no cursor,
              deixando claro que aquele número pode ser substituído digitando
              um valor exato + Enter na linha de comando embaixo. */}
          <Text
            x={ponteiroMundo.x + 12 / scale}
            y={ponteiroMundo.y + 12 / scale}
            text={`${formatarComUnidade(Math.hypot(ponteiroMundo.x - pontoRascunho.x, ponteiroMundo.y - pontoRascunho.y), unidadeDesenho)}\n(digite outro valor + Enter embaixo)`}
            fontSize={11 / scale}
            fill={COR_SELECAO}
            listening={false}
          />
        </>
      )}
      {pontoRascunho && ponteiroMundo && ferramenta === "circulo" && (
        <Circle
          x={pontoRascunho.x}
          y={pontoRascunho.y}
          radius={Math.hypot(ponteiroMundo.x - pontoRascunho.x, ponteiroMundo.y - pontoRascunho.y)}
          stroke={COR_SELECAO}
          strokeWidth={1 / scale}
          dash={[6 / scale, 4 / scale]}
          listening={false}
        />
      )}
      {pontoRascunho && ponteiroMundo && ferramenta === "retangulo" && (
        <>
          <Rect
            x={Math.min(pontoRascunho.x, ponteiroMundo.x)}
            y={Math.min(pontoRascunho.y, ponteiroMundo.y)}
            width={Math.abs(ponteiroMundo.x - pontoRascunho.x)}
            height={Math.abs(ponteiroMundo.y - pontoRascunho.y)}
            stroke={COR_SELECAO}
            strokeWidth={1 / scale}
            dash={[6 / scale, 4 / scale]}
            listening={false}
          />
          {/* Rótulo de dimensões ao vivo (Iteração 12o), mesmo espírito do
              rótulo de comprimento da Linha (12k): mostra largura x altura
              atuais grudado no cursor, sinalizando que dá pra digitar um
              valor exato ("100x50") na linha de comando embaixo em vez de
              confiar só no clique. */}
          <Text
            x={ponteiroMundo.x + 12 / scale}
            y={ponteiroMundo.y + 12 / scale}
            text={`${deMm(Math.abs(ponteiroMundo.x - pontoRascunho.x), unidadeDesenho).toFixed(1)} x ${deMm(Math.abs(ponteiroMundo.y - pontoRascunho.y), unidadeDesenho).toFixed(1)} ${ROTULO_UNIDADE[unidadeDesenho]}\n(digite LARGURAxALTURA + Enter embaixo)`}
            fontSize={11 / scale}
            fill={COR_SELECAO}
            listening={false}
          />
        </>
      )}
      {/* Ferramenta "viewport" (MV/MVIEW): mesmo preview de borracha do
          retângulo -- 1º clique crava o canto, 2º clique confirma. */}
      {pontoRascunho && ponteiroMundo && ferramenta === "viewport" && (
        <Rect
          x={Math.min(pontoRascunho.x, ponteiroMundo.x)}
          y={Math.min(pontoRascunho.y, ponteiroMundo.y)}
          width={Math.abs(ponteiroMundo.x - pontoRascunho.x)}
          height={Math.abs(ponteiroMundo.y - pontoRascunho.y)}
          stroke="#7c3aed"
          strokeWidth={1.4 / scale}
          dash={[8 / scale, 4 / scale]}
          listening={false}
        />
      )}
      {/* ZOOM WINDOW (Z/W): retângulo de seleção da área a enquadrar --
          preenche 100% da tela ativa (ou do viewport em Model Ativo) no
          2º clique. */}
      {pontoRascunho && ponteiroMundo && ferramenta === "zoomWindow" && (
        <Rect
          x={Math.min(pontoRascunho.x, ponteiroMundo.x)}
          y={Math.min(pontoRascunho.y, ponteiroMundo.y)}
          width={Math.abs(ponteiroMundo.x - pontoRascunho.x)}
          height={Math.abs(ponteiroMundo.y - pontoRascunho.y)}
          stroke="#f97316"
          strokeWidth={1.4 / scale}
          dash={[4 / scale, 3 / scale]}
          listening={false}
        />
      )}

      {/* TEXTO: já cravou o ponto de inserção, aguardando o conteúdo ser
          digitado na linha de comando (sub-prompt) -- só um marcador
          visual de "aqui vai entrar um texto". */}
      {pontoRascunho && ferramenta === "texto" && (
        <Text
          x={pontoRascunho.x}
          y={pontoRascunho.y}
          text="Digite o texto..."
          fontSize={10 / scale}
          fill={COR_SELECAO}
          opacity={0.6}
          listening={false}
        />
      )}

      {/* COTA (Dimension): 1º->2º clique mostra a distância ao vivo
          (igual à calibração de XREF); com os dois pontos já cravados,
          mostra a prévia completa da cota (linhas de extensão + linha de
          cota) seguindo a projeção do cursor -- exatamente o que
          `linhaDeCota` calcularia se o usuário clicasse agora. */}
      {ferramenta === "cota" && cotaP1 && !cotaP2 && ponteiroMundo && (
        <>
          <Line
            points={[cotaP1.x, cotaP1.y, ponteiroMundo.x, ponteiroMundo.y]}
            stroke={COR_SELECAO}
            strokeWidth={1 / scale}
            dash={[6 / scale, 4 / scale]}
            listening={false}
          />
          <Text
            x={(cotaP1.x + ponteiroMundo.x) / 2}
            y={(cotaP1.y + ponteiroMundo.y) / 2 - 14 / scale}
            text={formatarComUnidade(Math.hypot(ponteiroMundo.x - cotaP1.x, ponteiroMundo.y - cotaP1.y), unidadeDesenho)}
            fontSize={11 / scale}
            fill={COR_SELECAO}
            listening={false}
          />
        </>
      )}
      {ferramenta === "cota" &&
        cotaP1 &&
        cotaP2 &&
        ponteiroMundo &&
        (() => {
          const { q1, q2 } = linhaDeCota(cotaP1, cotaP2, ponteiroMundo);
          const dist = Math.hypot(cotaP2.x - cotaP1.x, cotaP2.y - cotaP1.y);
          return (
            <>
              <Line points={[cotaP1.x, cotaP1.y, q1.x, q1.y]} stroke={COR_GHOST} strokeWidth={1 / scale} dash={[5 / scale, 3 / scale]} listening={false} />
              <Line points={[cotaP2.x, cotaP2.y, q2.x, q2.y]} stroke={COR_GHOST} strokeWidth={1 / scale} dash={[5 / scale, 3 / scale]} listening={false} />
              <Line points={[q1.x, q1.y, q2.x, q2.y]} stroke={COR_GHOST} strokeWidth={1.2 / scale} listening={false} />
              <Text
                x={(q1.x + q2.x) / 2}
                y={(q1.y + q2.y) / 2 - 14 / scale}
                text={formatarComUnidade(dist, unidadeDesenho)}
                fontSize={11 / scale}
                fill={COR_GHOST}
                listening={false}
              />
            </>
          );
        })()}

      {/* Seleção por caixa (Window/Crossing Select): azul sólido quando
          arrastado da esquerda p/ direita (Window), verde tracejado
          quando arrastado da direita p/ esquerda (Crossing) -- ver
          `lib/selection.ts` e `confirmarSelecaoBox` no store. */}
      {selecaoBox &&
        (() => {
          const { inicio, atual } = selecaoBox;
          const janela = atual.x >= inicio.x;
          const x = Math.min(inicio.x, atual.x);
          const y = Math.min(inicio.y, atual.y);
          const width = Math.abs(atual.x - inicio.x);
          const height = Math.abs(atual.y - inicio.y);
          return (
            <Rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={janela ? "rgba(37,99,235,0.12)" : "rgba(34,197,94,0.12)"}
              stroke={janela ? "#2563eb" : "#22c55e"}
              strokeWidth={1.2 / scale}
              dash={janela ? undefined : [6 / scale, 4 / scale]}
              listening={false}
            />
          );
        })()}

      {/* TRIM (Aparar): todos os sub-segmentos da linha sob o cursor
          (cinza tracejado), com o segmento em mira (o que seria removido
          num clique agora) destacado em vermelho sólido. A Iteração 12q
          chegou a compartilhar essa visualização com o Apagar também, mas
          a 12r reverteu isso a pedido do usuário -- Apagar não corta mais
          segmento nenhum, então não faz sentido mostrar esse preview com
          ele ativo. */}
      {ferramenta === "aparar" &&
        trimPreview &&
        trimPreview.segmentos.map((seg, i) => (
          <Line
            key={`trim-seg-${i}`}
            points={[seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y]}
            stroke={i === trimPreview.indiceAlvo ? "#ef4444" : "#94a3b8"}
            strokeWidth={(i === trimPreview.indiceAlvo ? 3 : 1.5) / scale}
            dash={i === trimPreview.indiceAlvo ? undefined : [4 / scale, 3 / scale]}
            lineCap="round"
            listening={false}
          />
        ))}

      {/* TRIM (Aparar) -- quebra manual / "abrir vão" (Iteração 39, ver
          `trimQuebraA`/`trimQuebraCandidata` em `lib/store.ts`), pedido
          do usuário: "estou tentando abrir uma vao de porta em uma
          planta baixa com o comando de aparar e nao esta funcionando".
          FASE 0, ANTES do 1º clique: destaca em azul-céu a linha SEM
          nenhum cruzamento sob o cursor (candidata a virar um vão) --
          diferencia visualmente do vermelho do TRIM normal (que já
          mostra o segmento que seria removido AGORA, no caso de
          cruzamento de verdade). */}
      {ferramenta === "aparar" && !trimPreview && !trimQuebraA && trimQuebraCandidata && (
        (() => {
          const alvoCandidata = geometria.find((g) => g.id === trimQuebraCandidata.geometriaId);
          const arestaCandidata = alvoCandidata ? arestasDe(alvoCandidata)[trimQuebraCandidata.indiceAresta] : undefined;
          if (!arestaCandidata) return null;
          return (
            <Line
              points={[arestaCandidata.p1.x, arestaCandidata.p1.y, arestaCandidata.p2.x, arestaCandidata.p2.y]}
              stroke={COR_TRIM_QUEBRA}
              strokeWidth={3 / scale}
              dash={[6 / scale, 4 / scale]}
              lineCap="round"
              listening={false}
            />
          );
        })()
      )}

      {/* TRIM (Aparar) -- quebra manual, FASE 1, DEPOIS do 1º clique
          (`trimQuebraA` armado): mostra o ponto A (círculo) e o vão ao
          vivo até o ponto B (`trimQuebraPreviewB`, projetado na MESMA
          linha a cada mousemove) -- exatamente o pedaço que será
          removido ao confirmar com o 2º clique. */}
      {ferramenta === "aparar" && trimQuebraA && (
        <>
          <Circle x={trimQuebraA.ponto.x} y={trimQuebraA.ponto.y} radius={5 / scale} fill={COR_TRIM_QUEBRA} listening={false} />
          {trimQuebraPreviewB && (
            <Line
              points={[trimQuebraA.ponto.x, trimQuebraA.ponto.y, trimQuebraPreviewB.x, trimQuebraPreviewB.y]}
              stroke={COR_TRIM_QUEBRA}
              strokeWidth={4 / scale}
              dash={[3 / scale, 3 / scale]}
              lineCap="round"
              listening={false}
            />
          )}
        </>
      )}

      {/* FILLET (Concordância) -- 1ª aresta já armada (`filletAlvo1`),
          aguardando o clique na 2ª: destaca em roxo (`COR_FILLET_ALVO1`)
          qual aresta específica foi escolhida (relevante sobretudo pra
          retângulo/polígono, que têm mais de uma). */}
      {ferramenta === "concordancia" && filletAlvo1 && (
        (() => {
          const alvoFillet = geometria.find((g) => g.id === filletAlvo1.geometriaId);
          const arestaFillet = alvoFillet ? arestasDe(alvoFillet)[filletAlvo1.indiceAresta] : undefined;
          if (!arestaFillet) return null;
          return (
            <Line
              points={[arestaFillet.p1.x, arestaFillet.p1.y, arestaFillet.p2.x, arestaFillet.p2.y]}
              stroke={COR_FILLET_ALVO1}
              strokeWidth={3 / scale}
              dash={[6 / scale, 4 / scale]}
              lineCap="round"
              listening={false}
            />
          );
        })()
      )}

      {/* OFFSET (Deslocar) -- FASE 1, ANTES do 1º clique: destaca em
          âmbar a linha/aresta que SERIA escolhida se o usuário clicasse
          agora (`offsetHover`, recalculado a cada mousemove em
          `CanvasStage.tsx`). Pedido do usuário: "o botao deslocar
          precisa mostrar que está ativo quando encostar por cima da
          linha, faça ele selecionar a linha que vai ser duplicada para
          o usuario ver que esta funcionando". */}
      {ferramenta === "deslocar" && !offsetAlvoId && offsetHover && (
        <Line
          points={[offsetHover.segmento.x1, offsetHover.segmento.y1, offsetHover.segmento.x2, offsetHover.segmento.y2]}
          stroke={COR_OFFSET_HOVER}
          strokeWidth={3.5 / scale}
          lineCap="round"
          listening={false}
        />
      )}

      {/* OFFSET (Deslocar) -- FASE 2, DEPOIS do 1º clique: preview ao
          vivo da linha paralela, no lado onde o cursor está AGORA (mesmo
          cálculo de `aplicarOffset`) -- pedido do usuário: "quando eu
          arrastar para a direita ou esquerda a linha duplicada venha
          antes de eu clicar no local assim vou ver que está correto o
          lado". Usa `offsetAlvoSegmento` (já resolvido no 1º clique, ver
          `lib/offset.ts#segmentoOffsetAlvo`) em vez de reler a geometria
          original -- funciona pra QUALQUER tipo de alvo (linha solta OU
          aresta de retângulo/polígono/polilinha fechado), diferente da
          versão anterior desta preview, que só reconhecia `tipo ===
          "linha"` e ficava muda (nenhum preview) pra aresta de forma
          fechada -- exatamente o caso que a Iteração 36 passou a
          suportar no clique em si, mas cujo preview ainda não tinha sido
          atualizado. */}
      {ferramenta === "deslocar" &&
        offsetAlvoId &&
        offsetAlvoSegmento &&
        offsetDistancia !== null &&
        ponteiroMundo &&
        (() => {
          const seg = offsetAlvoSegmento;
          const dx = seg.x2 - seg.x1;
          const dy = seg.y2 - seg.y1;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const midx = (seg.x1 + seg.x2) / 2;
          const midy = (seg.y1 + seg.y2) / 2;
          const proj = (ponteiroMundo.x - midx) * nx + (ponteiroMundo.y - midy) * ny;
          const sinal = proj >= 0 ? 1 : -1;
          const off = sinal * offsetDistancia;
          return (
            <Line
              points={[seg.x1 + nx * off, seg.y1 + ny * off, seg.x2 + nx * off, seg.y2 + ny * off]}
              stroke={COR_GHOST}
              strokeWidth={1.2 / scale}
              dash={[5 / scale, 4 / scale]}
              listening={false}
            />
          );
        })()}

      {/* Preview do polígono em construção: vértices já cravados +
          segmento de borracha até o cursor (Enter fecha, Esc cancela). */}
      {poligonoPontos && poligonoPontos.length > 0 && ferramenta === "poligono" && (
        <>
          {ponteiroMundo && (
            <Line
              points={[...poligonoPontos.flatMap((p) => [p.x, p.y]), ponteiroMundo.x, ponteiroMundo.y]}
              stroke={COR_SELECAO}
              strokeWidth={1 / scale}
              dash={[6 / scale, 4 / scale]}
              listening={false}
            />
          )}
          {poligonoPontos.map((p, i) => (
            <Circle key={`polivert-${i}`} x={p.x} y={p.y} radius={3 / scale} fill={COR_SELECAO} listening={false} />
          ))}
        </>
      )}

      {/* Preview da polilinha (PL/PLINE) em construção -- igual ao
          polígono acima, mas o resultado final fica ABERTO (Enter conclui
          sem ligar o último ponto ao primeiro). */}
      {polilinhaPontos && polilinhaPontos.length > 0 && ferramenta === "polilinha" && (
        <>
          {ponteiroMundo && (
            <Line
              points={[...polilinhaPontos.flatMap((p) => [p.x, p.y]), ponteiroMundo.x, ponteiroMundo.y]}
              stroke={COR_SELECAO}
              strokeWidth={1 / scale}
              dash={[6 / scale, 4 / scale]}
              listening={false}
            />
          )}
          {polilinhaPontos.map((p, i) => (
            <Circle key={`plvert-${i}`} x={p.x} y={p.y} radius={3 / scale} fill={COR_SELECAO} listening={false} />
          ))}
        </>
      )}

      {/* Preview "fantasma" de Mover/Copiar: mostra onde os elementos
          selecionados cairiam se o clique de destino fosse agora. */}
      {deltaPreview &&
        geometria
          .filter((g) => selecionadoIds.includes(g.id))
          .map((g) => {
            const fantasma = transladarPreview(g, deltaPreview.dx, deltaPreview.dy);
            const estiloComum = {
              stroke: COR_GHOST,
              strokeWidth: 1.2 / scale,
              dash: [5 / scale, 4 / scale] as [number, number],
              opacity: 0.7,
              listening: false as const,
            };
            if (fantasma.tipo === "linha") {
              return <Line key={`ghost-${g.id}`} points={[fantasma.x1, fantasma.y1, fantasma.x2, fantasma.y2]} {...estiloComum} />;
            }
            if (fantasma.tipo === "circulo") {
              return <Circle key={`ghost-${g.id}`} x={fantasma.x} y={fantasma.y} radius={fantasma.raio} {...estiloComum} />;
            }
            if (fantasma.tipo === "retangulo") {
              return (
                <Rect
                  key={`ghost-${g.id}`}
                  x={fantasma.x}
                  y={fantasma.y}
                  width={fantasma.largura}
                  height={fantasma.altura}
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "poligono") {
              return (
                <Line
                  key={`ghost-${g.id}`}
                  points={fantasma.pontos.flatMap((p) => [p.x, p.y])}
                  closed
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "polilinha") {
              return (
                <Line
                  key={`ghost-${g.id}`}
                  points={fantasma.pontos.flatMap((p) => [p.x, p.y])}
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "viewport") {
              return (
                <Rect
                  key={`ghost-${g.id}`}
                  x={fantasma.x}
                  y={fantasma.y}
                  width={fantasma.largura}
                  height={fantasma.altura}
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "arco") {
              return (
                <Shape
                  key={`ghost-${g.id}`}
                  sceneFunc={(context, shape) => {
                    context.beginPath();
                    context.arc(
                      fantasma.x,
                      fantasma.y,
                      fantasma.raio,
                      (fantasma.anguloInicial * Math.PI) / 180,
                      (fantasma.anguloFinal * Math.PI) / 180,
                      false
                    );
                    context.strokeShape(shape);
                  }}
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "texto") {
              return (
                <Text
                  key={`ghost-${g.id}`}
                  x={fantasma.x}
                  y={fantasma.y}
                  text={fantasma.conteudo}
                  fontSize={fantasma.fontSize}
                  rotation={fantasma.rotacao ?? 0}
                  fill={COR_GHOST}
                  opacity={0.7}
                  listening={false}
                />
              );
            }
            if (fantasma.tipo === "cota") {
              const { q1, q2 } = linhaDeCota(
                { x: fantasma.x1, y: fantasma.y1 },
                { x: fantasma.x2, y: fantasma.y2 },
                { x: fantasma.px, y: fantasma.py }
              );
              return (
                <Group key={`ghost-${g.id}`}>
                  <Line points={[fantasma.x1, fantasma.y1, q1.x, q1.y]} {...estiloComum} />
                  <Line points={[fantasma.x2, fantasma.y2, q2.x, q2.y]} {...estiloComum} />
                  <Line points={[q1.x, q1.y, q2.x, q2.y]} {...estiloComum} />
                </Group>
              );
            }
            // Bloco: representa como um pequeno retângulo tracejado (evita duplicar o carregamento de imagem).
            return (
              <Rect
                key={`ghost-${g.id}`}
                x={fantasma.x - 10 / scale}
                y={fantasma.y - 10 / scale}
                width={20 / scale}
                height={20 / scale}
                {...estiloComum}
              />
            );
          })}

      {/* Preview "fantasma" da Escala (Iteração 12p): mostra como a
          seleção ficaria com o fator digitado no painel de propriedades
          ANTES de clicar "Aplicar" -- pedido explícito do usuário
          ("preciso ver o tamanho diminuindo ou aumentando... antes mesmo
          de aplicar"). A geometria REAL (`projeto.geometria`) não é
          tocada aqui -- `escalaPreview` é só um estado de UI (ver
          `lib/store.ts`), e este bloco calcula `escalarGeometria` na hora
          de desenhar, sem gerar nenhuma entrada de undo. Mesmo espírito
          visual do "fantasma" de Mover/Copiar acima (linha tracejada azul
          clara, semi-transparente) -- a forma ORIGINAL (não escalada)
          continua desenhada normalmente pelo loop principal, então o
          usuário vê as duas ao mesmo tempo (antes/depois) até soltar. */}
      {escalaPreview &&
        centroEscalaPreview &&
        geometria
          .filter((g) => selecionadoIds.includes(g.id))
          .map((g) => {
            const fantasma = escalarGeometria(g, centroEscalaPreview, escalaPreview.fatorX, escalaPreview.fatorY);
            const estiloComum = {
              stroke: COR_GHOST,
              strokeWidth: 1.2 / scale,
              dash: [5 / scale, 4 / scale] as [number, number],
              opacity: 0.7,
              listening: false as const,
            };
            if (fantasma.tipo === "linha") {
              return <Line key={`escala-ghost-${g.id}`} points={[fantasma.x1, fantasma.y1, fantasma.x2, fantasma.y2]} {...estiloComum} />;
            }
            if (fantasma.tipo === "circulo") {
              return <Circle key={`escala-ghost-${g.id}`} x={fantasma.x} y={fantasma.y} radius={fantasma.raio} {...estiloComum} />;
            }
            if (fantasma.tipo === "retangulo") {
              return (
                <Rect
                  key={`escala-ghost-${g.id}`}
                  x={fantasma.x}
                  y={fantasma.y}
                  width={fantasma.largura}
                  height={fantasma.altura}
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "poligono") {
              return (
                <Line
                  key={`escala-ghost-${g.id}`}
                  points={fantasma.pontos.flatMap((p) => [p.x, p.y])}
                  closed
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "polilinha") {
              return (
                <Line
                  key={`escala-ghost-${g.id}`}
                  points={fantasma.pontos.flatMap((p) => [p.x, p.y])}
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "arco") {
              return (
                <Shape
                  key={`escala-ghost-${g.id}`}
                  sceneFunc={(context, shape) => {
                    context.beginPath();
                    context.arc(
                      fantasma.x,
                      fantasma.y,
                      fantasma.raio,
                      (fantasma.anguloInicial * Math.PI) / 180,
                      (fantasma.anguloFinal * Math.PI) / 180,
                      false
                    );
                    context.strokeShape(shape);
                  }}
                  {...estiloComum}
                />
              );
            }
            if (fantasma.tipo === "texto") {
              return (
                <Text
                  key={`escala-ghost-${g.id}`}
                  x={fantasma.x}
                  y={fantasma.y}
                  text={fantasma.conteudo}
                  fontSize={fantasma.fontSize}
                  rotation={fantasma.rotacao ?? 0}
                  fill={COR_GHOST}
                  opacity={0.7}
                  listening={false}
                />
              );
            }
            if (fantasma.tipo === "cota") {
              const { q1, q2 } = linhaDeCota(
                { x: fantasma.x1, y: fantasma.y1 },
                { x: fantasma.x2, y: fantasma.y2 },
                { x: fantasma.px, y: fantasma.py }
              );
              return (
                <Group key={`escala-ghost-${g.id}`}>
                  <Line points={[fantasma.x1, fantasma.y1, q1.x, q1.y]} {...estiloComum} />
                  <Line points={[fantasma.x2, fantasma.y2, q2.x, q2.y]} {...estiloComum} />
                  <Line points={[q1.x, q1.y, q2.x, q2.y]} {...estiloComum} />
                </Group>
              );
            }
            if (fantasma.tipo === "viewport") {
              return (
                <Rect
                  key={`escala-ghost-${g.id}`}
                  x={fantasma.x}
                  y={fantasma.y}
                  width={fantasma.largura}
                  height={fantasma.altura}
                  {...estiloComum}
                />
              );
            }
            // Bloco: ao contrário do "fantasma" de Mover/Copiar (que só
            // translada, sem mudar de tamanho), a Escala MUDA o tamanho de
            // verdade -- usa a bbox real (`caixaEnvolvente`, que já lê
            // `escalaX`/`escalaY`) em vez de um retângulo fixo de 20mm.
            const bboxBloco = caixaEnvolvente(fantasma);
            return (
              <Rect
                key={`escala-ghost-${g.id}`}
                x={bboxBloco.minX}
                y={bboxBloco.minY}
                width={bboxBloco.maxX - bboxBloco.minX}
                height={bboxBloco.maxY - bboxBloco.minY}
                {...estiloComum}
              />
            );
          })}

      {/* Calibração de XREF (Scale by Reference): linha amarela entre os
          dois pontos de referência, com a distância medida (nas
          unidades de mundo/mm) exibida ao lado -- o valor REAL é
          perguntado no modal só depois do 2º clique. */}
      {ferramenta === "calibrar" && calibPoint1 && !calibPoint2 && ponteiroMundo && (
        <>
          <Line
            points={[calibPoint1.x, calibPoint1.y, ponteiroMundo.x, ponteiroMundo.y]}
            stroke={COR_CALIBRACAO}
            strokeWidth={1.5 / scale}
            dash={[6 / scale, 4 / scale]}
            listening={false}
          />
          <Text
            x={(calibPoint1.x + ponteiroMundo.x) / 2}
            y={(calibPoint1.y + ponteiroMundo.y) / 2 - 14 / scale}
            text={`${Math.hypot(ponteiroMundo.x - calibPoint1.x, ponteiroMundo.y - calibPoint1.y).toFixed(1)} mm no desenho`}
            fontSize={11 / scale}
            fill={COR_CALIBRACAO}
            listening={false}
          />
        </>
      )}
      {calibPoint1 && calibPoint2 && (
        <Line
          points={[calibPoint1.x, calibPoint1.y, calibPoint2.x, calibPoint2.y]}
          stroke={COR_CALIBRACAO}
          strokeWidth={2 / scale}
          listening={false}
        />
      )}

      {/* Indicador de OSNAP: quadrado verde para Endpoint, triângulo verde para Midpoint. */}
      {osnapAlvo && osnapTipo === "endpoint" && (
        <Rect
          x={osnapAlvo.x - 4 / scale}
          y={osnapAlvo.y - 4 / scale}
          width={8 / scale}
          height={8 / scale}
          stroke={COR_OSNAP}
          strokeWidth={1.5 / scale}
          listening={false}
        />
      )}
      {osnapAlvo && osnapTipo === "midpoint" && (
        <RegularPolygon
          x={osnapAlvo.x}
          y={osnapAlvo.y}
          sides={3}
          radius={5.5 / scale}
          stroke={COR_OSNAP}
          strokeWidth={1.5 / scale}
          listening={false}
        />
      )}
      {/* Center (círculos/arcos): círculo verde vazado no centro. */}
      {osnapAlvo && osnapTipo === "center" && (
        <Circle
          x={osnapAlvo.x}
          y={osnapAlvo.y}
          radius={5 / scale}
          stroke={COR_OSNAP}
          strokeWidth={1.5 / scale}
          listening={false}
        />
      )}
      {/* Intersection (cruzamento exato entre dois segmentos): "X" verde. */}
      {osnapAlvo && osnapTipo === "intersection" && (
        <>
          <Line
            points={[osnapAlvo.x - 5 / scale, osnapAlvo.y - 5 / scale, osnapAlvo.x + 5 / scale, osnapAlvo.y + 5 / scale]}
            stroke={COR_OSNAP}
            strokeWidth={1.5 / scale}
            listening={false}
          />
          <Line
            points={[osnapAlvo.x - 5 / scale, osnapAlvo.y + 5 / scale, osnapAlvo.x + 5 / scale, osnapAlvo.y - 5 / scale]}
            stroke={COR_OSNAP}
            strokeWidth={1.5 / scale}
            listening={false}
          />
        </>
      )}

      {/* GRIPS (STRETCH): quando a ferramenta é "Selecionar" e não há
          nenhum stretch em andamento, cada elemento selecionado que tenha
          vértices editáveis (linha/retângulo/polígono/polilinha -- ver
          `gripsDeGeometria`, que retorna null para círculo/arco/bloco/
          texto/cota) ganha um quadrado azul clicável em cada vértice.
          Botão direito num desses grips abre o menu de contexto
          "Remover vértice" (Sprint 3 -- ver `VertexContextMenu.tsx`). */}
      {ferramenta === "selecionar" &&
        !gripAlvo &&
        geometria
          .filter((g) => selecionadoIds.includes(g.id))
          .flatMap((g) => {
            const pts = gripsDeGeometria(g);
            if (!pts) return [];
            return pts.map((p, i) => (
              <Rect
                key={`grip-${g.id}-${i}`}
                x={p.x - 4 / scale}
                y={p.y - 4 / scale}
                width={8 / scale}
                height={8 / scale}
                fill="#ffffff"
                stroke={COR_SELECAO}
                strokeWidth={1.5 / scale}
                hitStrokeWidth={Math.max(10 / scale, 8)}
                onMouseDown={handleGripMouseDown(g.id, i)}
                onTouchStart={handleGripMouseDown(g.id, i)}
                onClick={handleGripClick}
                onTap={handleGripClick}
                onContextMenu={handleGripContextMenu(g.id, i)}
              />
            ));
          })}

      {/* Grips INTERMEDIÁRIOS (ponto médio de cada aresta, Sprint 3):
          quadradinhos OCOS (menores, sem preenchimento) entre cada par de
          grips sólidos -- clicar num deles crava um vértice novo bem ali
          (`inserirVerticeNoMeio`). Só para retângulo/polígono/polilinha
          (ver `gripsIntermediariosDeGeometria`) -- uma linha reta só tem
          1 segmento, não há "meio de aresta" que faça sentido adicionar. */}
      {ferramenta === "selecionar" &&
        !gripAlvo &&
        geometria
          .filter((g) => selecionadoIds.includes(g.id))
          .flatMap((g) => {
            const meios = gripsIntermediariosDeGeometria(g);
            if (!meios) return [];
            return meios.map(({ ponto, indiceSegmento }) => (
              <Rect
                key={`gripmid-${g.id}-${indiceSegmento}`}
                x={ponto.x - 3 / scale}
                y={ponto.y - 3 / scale}
                width={6 / scale}
                height={6 / scale}
                fill="rgba(255,255,255,0.6)"
                stroke={COR_SELECAO}
                strokeWidth={1 / scale}
                dash={[2 / scale, 1.5 / scale]}
                hitStrokeWidth={Math.max(10 / scale, 8)}
                {...(g.tipo === "retangulo"
                  ? {
                      onMouseDown: handleGripIntermediarioMouseDown(g.id, indiceSegmento),
                      onTouchStart: handleGripIntermediarioMouseDown(g.id, indiceSegmento),
                      onContextMenu: handleGripIntermediarioContextMenu(g.id, indiceSegmento),
                    }
                  : {
                      onClick: handleGripIntermediarioClick(g.id, indiceSegmento),
                      onTap: handleGripIntermediarioClick(g.id, indiceSegmento),
                    })}
              />
            ));
          })}

      {/* Preview ao vivo do STRETCH: enquanto um grip está agarrado
          (`gripAlvo`), mostra a geometria já modificada (ghost cyan)
          seguindo `ponteiroMundo` -- o elemento real só muda quando o
          próximo clique confirma (ver `aplicarStretch` em
          CanvasStage.tsx/store.ts). */}
      {gripAlvo &&
        ponteiroMundo &&
        (() => {
          const original = geometria.find((g) => g.id === gripAlvo.id);
          if (!original) return null;
          // Iteração 22: preview do ghost precisa usar a MESMA função de
          // stretch que será usada no commit (`aplicarStretch` em
          // store.ts) -- senão, ao arrastar um grip de meio-de-aresta
          // (`modo === "aresta"`), o preview usaria `aplicarStretchNaGeometria`
          // com um índice de SEGMENTO (não de vértice), produzindo um
          // "fantasma" incorreto/enganoso mesmo que o resultado final (ao
          // soltar) ficasse certo.
          const fantasma =
            gripAlvo.modo === "aresta"
              ? aplicarStretchArestaNaGeometria(original, gripAlvo.indice, ponteiroMundo)
              : aplicarStretchNaGeometria(original, gripAlvo.indice, ponteiroMundo);
          const estiloStretch = {
            stroke: COR_GHOST,
            strokeWidth: 1.4 / scale,
            dash: [5 / scale, 4 / scale] as [number, number],
            listening: false as const,
          };
          if (fantasma.tipo === "linha") {
            return <Line points={[fantasma.x1, fantasma.y1, fantasma.x2, fantasma.y2]} {...estiloStretch} />;
          }
          if (fantasma.tipo === "retangulo" || fantasma.tipo === "viewport") {
            return <Rect x={fantasma.x} y={fantasma.y} width={fantasma.largura} height={fantasma.altura} {...estiloStretch} />;
          }
          if (fantasma.tipo === "poligono") {
            return <Line points={fantasma.pontos.flatMap((p) => [p.x, p.y])} closed {...estiloStretch} />;
          }
          if (fantasma.tipo === "polilinha") {
            return <Line points={fantasma.pontos.flatMap((p) => [p.x, p.y])} {...estiloStretch} />;
          }
          if (fantasma.tipo === "bloco") {
            // Bloco (Iteração 12f): o grip único É o ponto de inserção,
            // então o "fantasma" é só a caixa delimitadora do bloco
            // seguindo o cursor (não dá pra prever a imagem SVG rotacionada
            // aqui sem duplicar `BlocoShape` -- a caixa já deixa claro
            // onde o bloco vai parar ao soltar).
            const def = getBlockDef(fantasma.nome);
            if (!def) return null;
            const larguraF = def.largura * (fantasma.escalaX ?? fantasma.escala ?? 1);
            const alturaF = def.altura * (fantasma.escalaY ?? fantasma.escala ?? 1);
            return (
              <Rect
                x={fantasma.x}
                y={fantasma.y}
                width={larguraF}
                height={alturaF}
                rotation={fantasma.rotacao ?? 0}
                offsetX={larguraF / 2}
                offsetY={alturaF / 2}
                {...estiloStretch}
              />
            );
          }
          return null;
        })()}
    </Layer>
  );
}
