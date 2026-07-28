"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useCadStore } from "@/lib/store";
import { screenToWorld, distance, type Viewport } from "@/lib/snap";
import { resolverPontoAlvo } from "@/lib/osnap";
import { linhaSobCursor, segmentosDeCorte, segmentoNoParametro } from "@/lib/trim";
import { geometriaSobCursorOffset } from "@/lib/offset";
import { BLOCO_DRAG_MIME } from "@/lib/blocks";
import { type LinhaGeometria, type ViewportGeometria, dimensoesFolhaOrientada } from "@/lib/types";
import { GridLayer } from "./GridLayer";
import { XrefLayer } from "./XrefLayer";
import { GeometryLayer } from "./GeometryLayer";
import { TitleBlockLayer } from "./TitleBlockLayer";
import { PranchaLayer } from "./PranchaLayer";
import { VertexContextMenu } from "./VertexContextMenu";

// Iteração 29c: pedido do usuário ("quando tento ir diminuindo o zoom o
// cad só esta permitindo até o tamanho da tela, preciso ter a opcao de
// encolher mais") -- o valor antigo (0.02, ~2%) foi dimensionado pensando
// nos diagramas elétricos unifilares (poucos metros de "papel"), mas o
// gerador de "sistema fotovoltaico no solo" (Iteração 29) desenha
// terrenos de dezenas de metros: por exemplo, um terreno de 50m de
// largura já precisa de uma escala de ~0.02-0.03 só pra CABER na tela --
// ou seja, o usuário batia no piso quase imediatamente, sem margem
// nenhuma pra afastar mais e ver o desenho com folga ao redor. Reduzido
// 20x (0.001, mesmo piso já usado por `MODEL_SCALE_MIN` abaixo, pra
// consistência entre os dois mecanismos de zoom do app) -- dá espaço de
// sobra pra terrenos bem maiores sem tocar em `ZOOM_MAX`/no zoom de
// aproximar, que não foi o que o usuário reportou.
const ZOOM_MIN = 0.001;
const ZOOM_MAX = 40;
const ZOOM_INTENSIDADE = 1.06;
/** Fallback usado só no instante antes do fit-to-page automático de uma Prancha rodar pela 1ª vez (ver `viewportAtual`/useEffect de auto-fit abaixo). */
const VIEWPORT_PADRAO: Viewport = { scale: 1, x: 0, y: 0 };
/** Limites de `modelScale` (mm de mundo por mm de papel) de um Viewport -- ver `ViewportGeometria` em types.ts. */
const MODEL_SCALE_MIN = 0.001;
const MODEL_SCALE_MAX = 1_000_000;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * CanvasStage
 * -----------------------------------------------------------------------
 * Orquestra o Stage do Konva: mede o tamanho disponível, implementa
 * zoom (roda do mouse, centrado no cursor) e pan (arrastar com o botão
 * do meio ou o botão direito), resolve a posição do cursor em
 * coordenadas de mundo (com prioridade OSNAP de Endpoint/Midpoint > snap
 * de grid > coordenada crua, ver `lib/osnap.ts`), e delega o clique para
 * a ferramenta ativa (linha, círculo, retângulo, polígono, carimbo de
 * bloco, mover, copiar, seleção, aparar, deslocar, concordância).
 *
 * As ferramentas "apagar" e "hachurar" (e o 1º clique de "deslocar"/
 * ambos os cliques de "concordância") são tratadas nas próprias formas
 * (GeometryLayer), que fazem `cancelBubble = true` para não deixar o
 * clique "vazar" para cá quando o alvo é uma forma existente. O TRIM
 * (aparar) roda inteiro aqui: o preview é recalculado a cada mousemove
 * (ver `lib/trim.ts`) e o clique só confirma o que já está em mira. Já a
 * ferramenta "apagar" é sempre incondicional (Iteração 12r, revertendo
 * uma tentativa de acoplamento com o TRIM feita na 12q e depois desfeita
 * a pedido do usuário) -- clicar numa forma com Apagar ativo remove ela
 * POR INTEIRO (linha, bloco, forma fechada ou texto), tratado direto em
 * `GeometryLayer.handleShapeClick`, sem nenhum preview/cálculo de corte.
 * -----------------------------------------------------------------------
 */
export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [panejando, setPanejando] = useState(false);
  const centralizouRef = useRef(false);

  const viewport = useCadStore((s) => s.viewport);
  const setViewport = useCadStore((s) => s.setViewport);
  const pranchaViewports = useCadStore((s) => s.pranchaViewports);
  const setPranchaViewport = useCadStore((s) => s.setPranchaViewport);
  const enquadramentoPendente = useCadStore((s) => s.enquadramentoPendente);
  const limparEnquadramentoPendente = useCadStore((s) => s.limparEnquadramentoPendente);
  const gridSize = useCadStore((s) => s.gridSize);
  const snapAtivo = useCadStore((s) => s.snapAtivo);
  const orthoAtivo = useCadStore((s) => s.orthoAtivo);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const activeLayer = useCadStore((s) => s.activeLayer);
  const blocoParaCarimbar = useCadStore((s) => s.blocoParaCarimbar);
  const pontoRascunho = useCadStore((s) => s.pontoRascunho);
  const poligonoPontos = useCadStore((s) => s.poligonoPontos);
  const polilinhaPontos = useCadStore((s) => s.polilinhaPontos);
  const selecionadoIds = useCadStore((s) => s.selecionadoIds);
  const addGeometria = useCadStore((s) => s.addGeometria);
  const moverGeometria = useCadStore((s) => s.moverGeometria);
  const copiarGeometria = useCadStore((s) => s.copiarGeometria);
  const apagarSelecionados = useCadStore((s) => s.apagarSelecionados);
  const setPontoRascunho = useCadStore((s) => s.setPontoRascunho);
  const setPonteiroMundo = useCadStore((s) => s.setPonteiroMundo);
  const setOsnapAlvo = useCadStore((s) => s.setOsnapAlvo);
  const limparSelecao = useCadStore((s) => s.limparSelecao);
  const cancelarDesenho = useCadStore((s) => s.cancelarDesenho);
  const registrarPontoCalibracao = useCadStore((s) => s.registrarPontoCalibracao);
  const adicionarPontoPoligono = useCadStore((s) => s.adicionarPontoPoligono);
  const fecharPoligono = useCadStore((s) => s.fecharPoligono);
  const setTrimPreview = useCadStore((s) => s.setTrimPreview);
  const aplicarTrim = useCadStore((s) => s.aplicarTrim);
  const offsetAlvoId = useCadStore((s) => s.offsetAlvoId);
  const aplicarOffset = useCadStore((s) => s.aplicarOffset);
  const setOffsetHover = useCadStore((s) => s.setOffsetHover);
  const pushComando = useCadStore((s) => s.pushComando);
  const setSelecaoBox = useCadStore((s) => s.setSelecaoBox);
  const confirmarSelecaoBox = useCadStore((s) => s.confirmarSelecaoBox);
  const cotaP1 = useCadStore((s) => s.cotaP1);
  const cotaP2 = useCadStore((s) => s.cotaP2);
  const registrarPontoCota = useCadStore((s) => s.registrarPontoCota);
  const confirmarCota = useCadStore((s) => s.confirmarCota);
  const desfazer = useCadStore((s) => s.desfazer);
  const refazer = useCadStore((s) => s.refazer);
  const gripAlvo = useCadStore((s) => s.gripAlvo);
  const aplicarStretch = useCadStore((s) => s.aplicarStretch);
  const adicionarPontoPolilinha = useCadStore((s) => s.adicionarPontoPolilinha);
  const fecharPolilinha = useCadStore((s) => s.fecharPolilinha);
  const fecharMenuVertice = useCadStore((s) => s.fecharMenuVertice);
  const inserirPadraoConcessionaria = useCadStore((s) => s.inserirPadraoConcessionaria);
  const viewportAtivoId = useCadStore((s) => s.viewportAtivoId);
  const setViewportAtivo = useCadStore((s) => s.setViewportAtivo);
  const atualizarViewport = useCadStore((s) => s.atualizarViewport);
  const prenchaAtivaId = useCadStore((s) => s.prenchaAtivaId);
  const atualizarViewportDaPrancha = useCadStore((s) => s.atualizarViewportDaPrancha);
  const adicionarViewportPrancha = useCadStore((s) => s.adicionarViewportPrancha);
  const removerViewportDaPrancha = useCadStore((s) => s.removerViewportDaPrancha);
  const selecionarViewportPrancha = useCadStore((s) => s.selecionarViewportPrancha);
  const viewportPranchaSelecionadoId = useCadStore((s) => s.viewportPranchaSelecionadoId);
  const xrefSelecionadoId = useCadStore((s) => s.xrefSelecionadoId);
  const selecionarXref = useCadStore((s) => s.selecionarXref);
  const removeXref = useCadStore((s) => s.removeXref);
  const pranchaAtiva = useCadStore((s) => s.projeto.pranchas.find((pr) => pr.id === s.prenchaAtivaId));
  const carimboProjeto = useCadStore((s) => s.projeto.carimbo);
  const copiarSelecaoParaAreaDeTransferencia = useCadStore((s) => s.copiarSelecaoParaAreaDeTransferencia);
  const colarAreaDeTransferencia = useCadStore((s) => s.colarAreaDeTransferencia);
  const colarTextoExterno = useCadStore((s) => s.colarTextoExterno);

  // Iteração 12t: zoom/pan efetivamente em uso pelo Stage agora -- o da
  // PÁGINA da Prancha ativa (`pranchaViewports[id]`) ou o do Desenho
  // (`viewport`), nunca os dois misturados. Ver comentário detalhado no
  // useEffect de auto-fit abaixo e em `CadState.pranchaViewports`
  // (store.ts) sobre por que esses dois precisam ser campos SEPARADOS.
  const viewportAtual = prenchaAtivaId ? pranchaViewports[prenchaAtivaId] ?? VIEWPORT_PADRAO : viewport;

  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  /** Estado local do arraste de seleção por caixa (Window/Crossing Select) -- ver handleMouseDown/Move/Up. */
  const selecaoDragRef = useRef<{ inicioMundo: { x: number; y: number }; moveu: boolean } | null>(null);
  /** Evita que o "click" sintético do Konva (disparado logo após o mouseup que concluiu um arraste de seleção) limpe a seleção recém-feita. */
  const boxSelectJustFinishedRef = useRef(false);

  // Mede o container e mantém o Stage do tamanho da área disponível.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Centraliza a origem do mundo na primeira medição do canvas.
  useEffect(() => {
    if (!centralizouRef.current && size.width > 0 && size.height > 0) {
      centralizouRef.current = true;
      setViewport({ scale: 2, x: size.width / 2, y: size.height / 2 });
    }
  }, [size, setViewport]);

  // Iteração 12t -- fit-to-page automático de uma Prancha, na 1ª vez que
  // ela é vista nesta sessão: pedido explícito do usuário ("as pranchas
  // devem sempre deixar caber todo o desenho na prancha, eu vou ajustar
  // conforme a necessidade na prancha"). Antes, o zoom/pan da Prancha
  // reaproveitava o MESMO campo `viewport` do Desenho -- então dar zoom
  // no Desenho pra desenhar com precisão também bagunçava o enquadramento
  // de qualquer Prancha (relatado: "quando eu aumento o zoom na tela de
  // desenho a tela da prancha diminue o zoom"). Enquadra a FOLHA inteira
  // (não a geometria em si -- cada Viewport dentro da Prancha já nasce
  // enquadrando o Desenho, ver `criarViewportInicialPrancha`) com ~8% de
  // folga, centralizada (a folha já é centrada em (0,0) por convenção, ver
  // `GridLayer.tsx`/`TitleBlockLayer.tsx`). Só roda quando ainda NÃO existe
  // uma entrada pra essa Prancha em `pranchaViewports` -- depois da 1ª vez,
  // o zoom/pan manual do usuário ali dentro (via handleWheel/
  // handleMouseMove abaixo) fica salvo e nunca mais é sobrescrito
  // automaticamente, até a Prancha ser removida e recriada.
  useEffect(() => {
    if (!prenchaAtivaId || !pranchaAtiva || size.width <= 0 || size.height <= 0) return;
    if (pranchaViewports[prenchaAtivaId]) return;
    const folha = dimensoesFolhaOrientada(pranchaAtiva.formato, pranchaAtiva.orientacao);
    const escala = clamp(Math.min(size.width / folha.largura, size.height / folha.altura) * 0.92, ZOOM_MIN, ZOOM_MAX);
    setPranchaViewport(prenchaAtivaId, { scale: escala, x: size.width / 2, y: size.height / 2 });
  }, [prenchaAtivaId, pranchaAtiva, size, pranchaViewports, setPranchaViewport]);

  // Iteração 29h -- enquadra automaticamente geometria recém-gerada por um
  // dos geradores automáticos ("Gerar diagrama fotovoltaico" / "Dimensionar
  // sistema no solo"), assim que `enquadramentoPendente` (store.ts) é
  // preenchido. Pedido explícito do usuário: um diagrama recém-gerado podia
  // nascer fora da área visível atual (zoom/pan não têm relação nenhuma com
  // onde a geometria foi inserida), obrigando a procurar manualmente onde
  // ele apareceu ("ficou tao pequeno o diagrama que deu trabalho para
  // encontrar"). Reaproveita a MESMA fórmula de fit-and-contain do comando
  // "Zoom Window" (ver handleMouseDown mais abaixo), com uma folga de ~10%
  // pra não deixar a geometria colada na borda da tela. Aplica na página
  // (`pranchaViewports`) se uma Prancha estiver ativa, senão no Desenho
  // (`viewport`) -- mesma bifurcação usada pelo Zoom Window.
  useEffect(() => {
    if (!enquadramentoPendente || size.width <= 0 || size.height <= 0) return;
    const bboxW = enquadramentoPendente.maxX - enquadramentoPendente.minX;
    const bboxH = enquadramentoPendente.maxY - enquadramentoPendente.minY;
    if (!(bboxW > 0) || !(bboxH > 0)) {
      // Geometria degenerada (sem área) -- nada seguro pra enquadrar, só
      // descarta o pedido em vez de travar aqui pra sempre.
      limparEnquadramentoPendente();
      return;
    }
    const escala = clamp(Math.min(size.width / bboxW, size.height / bboxH) * 0.9, ZOOM_MIN, ZOOM_MAX);
    const centroX = (enquadramentoPendente.minX + enquadramentoPendente.maxX) / 2;
    const centroY = (enquadramentoPendente.minY + enquadramentoPendente.maxY) / 2;
    const patch = {
      scale: escala,
      x: size.width / 2 - centroX * escala,
      y: size.height / 2 - centroY * escala,
    };
    if (prenchaAtivaId) setPranchaViewport(prenchaAtivaId, patch);
    else setViewport(patch);
    limparEnquadramentoPendente();
  }, [enquadramentoPendente, size, prenchaAtivaId, setViewport, setPranchaViewport, limparEnquadramentoPendente]);

  // Ctrl+V (Iteração 12c): tenta 3 fontes, nesta ordem --
  // 1) clipboard REAL do sistema operacional, SE reconhecido como um JSON
  //    copiado deste mesmo app (permite colar entre abas/janelas
  //    diferentes, não só dentro da mesma sessão);
  // 2) `areaTransferencia` interna (último Ctrl+C desta mesma aba/sessão)
  //    -- sempre funciona, sem depender de permissão de clipboard do
  //    navegador (é o caminho mais comum: copiar e colar dentro do mesmo
  //    desenho);
  // 3) clipboard do sistema como TEXTO PURO (ex.: copiado de fora deste
  //    app -- bloco de notas, Excel, ou o próprio AutoCAD). NÃO é possível
  //    reconstruir entidades CAD reais (linhas, blocos) a partir de um
  //    Ctrl+C feito no AutoCAD: o formato de clipboard dele é proprietário
  //    e não é exposto a páginas web por nenhum navegador. Então o texto
  //    colado vira um elemento de TEXTO normal no ponto do cursor,
  //    editável dali em diante -- é o melhor "veio" possível sem acesso ao
  //    binário do AutoCAD.
  const colarAoVivo = useCallback(async () => {
    const ponto = useCadStore.getState().ponteiroMundo ?? { x: 0, y: 0 };

    let textoClipboard: string | null = null;
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        textoClipboard = await navigator.clipboard.readText();
      } catch {
        // Permissão negada, contexto não-seguro, ou navegador sem suporte
        // -- segue pros fallbacks abaixo em vez de travar o Ctrl+V.
        textoClipboard = null;
      }
    }

    if (textoClipboard) {
      try {
        const dados = JSON.parse(textoClipboard);
        if (dados && dados.cadUnifilarClipboard && Array.isArray(dados.itens) && dados.itens.length > 0) {
          useCadStore.setState({ areaTransferencia: dados.itens });
          colarAreaDeTransferencia(ponto);
          return;
        }
      } catch {
        // Não é o JSON do nosso próprio clipboard -- cai pro texto puro
        // (ou pra área de transferência interna) mais abaixo.
      }
    }

    if (useCadStore.getState().areaTransferencia.length > 0) {
      colarAreaDeTransferencia(ponto);
      return;
    }

    if (textoClipboard && textoClipboard.trim()) {
      colarTextoExterno(textoClipboard, ponto);
      return;
    }

    pushComando("COLAR: nada copiado ainda (selecione algo e Ctrl+C primeiro).");
  }, [colarAreaDeTransferencia, colarTextoExterno, pushComando]);

  // Esc cancela o desenho/carimbo/polígono em andamento. Delete/Backspace
  // apaga a seleção atual -- equivalente físico do comando "E"/"DEL".
  // Enter fecha o polígono em construção (precisa de >= 3 vértices já
  // cravados; ver `fecharPoligono` no store) -- equivalente ao
  // "Close"/Enter do comando PLINE do AutoCAD.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const emCampoDeTexto = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA");
      if (e.key === "Escape") {
        cancelarDesenho();
        fecharMenuVertice();
      } else if (e.key === "Enter" && ferramenta === "poligono" && !emCampoDeTexto) {
        e.preventDefault();
        fecharPoligono();
      } else if (e.key === "Enter" && ferramenta === "polilinha" && !emCampoDeTexto) {
        e.preventDefault();
        fecharPolilinha();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !emCampoDeTexto) {
        e.preventDefault();
        // Viewport de Prancha selecionado (Iteração 12g) ou XREF
        // selecionado (Iteração 12u): cada um tem seleção própria
        // (`viewportPranchaSelecionadoId`/`xrefSelecionadoId`), separada
        // de `selecionadoIds` -- ver comentário em `CadState`.
        if (prenchaAtivaId && viewportPranchaSelecionadoId) {
          removerViewportDaPrancha(prenchaAtivaId, viewportPranchaSelecionadoId);
        } else if (xrefSelecionadoId) {
          removeXref(xrefSelecionadoId);
        } else {
          apagarSelecionados();
        }
      } else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && !e.shiftKey && !emCampoDeTexto) {
        // Ctrl+Z / Cmd+Z: desfazer. Shift+Ctrl+Z é convencionalmente
        // "refazer" em vários apps, então é excluído daqui e tratado
        // junto com Ctrl+Y abaixo.
        e.preventDefault();
        desfazer();
      } else if (
        ((e.key === "y" || e.key === "Y") && (e.ctrlKey || e.metaKey) && !emCampoDeTexto) ||
        ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && e.shiftKey && !emCampoDeTexto)
      ) {
        e.preventDefault();
        refazer();
      } else if ((e.key === "c" || e.key === "C") && (e.ctrlKey || e.metaKey) && !emCampoDeTexto) {
        // Ctrl+C: copia a seleção atual para `areaTransferencia` (Iteração
        // 12c). Sem seleção não faz nada (não precisa de preventDefault --
        // deixa passar pra qualquer Ctrl+C nativo do navegador, ex.: texto
        // selecionado numa caixa de diálogo aberta).
        if (selecionadoIds.length > 0) {
          e.preventDefault();
          copiarSelecaoParaAreaDeTransferencia();
        }
      } else if ((e.key === "v" || e.key === "V") && (e.ctrlKey || e.metaKey) && !emCampoDeTexto) {
        e.preventDefault();
        void colarAoVivo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cancelarDesenho,
    apagarSelecionados,
    ferramenta,
    fecharPoligono,
    fecharPolilinha,
    desfazer,
    refazer,
    fecharMenuVertice,
    selecionadoIds,
    copiarSelecaoParaAreaDeTransferencia,
    colarAoVivo,
    prenchaAtivaId,
    viewportPranchaSelecionadoId,
    removerViewportDaPrancha,
    xrefSelecionadoId,
    removeXref,
  ]);

  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      // Convenção padrão (Figma/AutoCAD/Google Maps): rodar a roda "pra
      // frente"/pra cima (deltaY < 0) APROXIMA (zoom in); "pra trás"/pra
      // baixo (deltaY > 0) AFASTA (zoom out). Estava invertido antes
      // (Iteração 12c -- relatado pelo usuário como "scroll ao contrário").
      const direction = e.evt.deltaY > 0 ? 1 : -1;

      // Model Ativo (duplo clique dentro de um Viewport -- tanto um MV do
      // Desenho quanto um Viewport de uma Prancha, Iteração 12g, ver
      // `handleDblClick`): a roda do mouse passa a dar zoom na "câmera
      // local" desse viewport (modelScale/modelOffsetX/Y) em vez do zoom
      // principal da página -- mesma matemática "âncora no cursor" do
      // zoom principal abaixo, só que resolvida através da composição
      // papel->mundo do viewport (ver `ViewportShape.tsx`). `modelScale`
      // é mm de MUNDO por mm de PAPEL (o INVERSO conceitual da `scale`
      // principal -- maior modelScale = mais mundo cabendo no mesmo
      // retângulo de papel = mais AFASTADO), então o mesmo `direction`
      // que diminui a `scale` principal abaixo (afasta) precisa AUMENTAR
      // `modelScale` aqui, para manter a mesma sensação física de girar a
      // roda do mouse em qualquer um dos dois modos. `viewportAtivoId` é
      // reaproveitado pelos DOIS contextos: dentro de uma Prancha,
      // resolve em `pranchaAtiva.viewports`; no Desenho, em
      // `projeto.geometria` (viewport MV clássico, Sprint 5).
      if (viewportAtivoId) {
        const { projeto } = useCadStore.getState();
        const vp: ViewportGeometria | undefined = prenchaAtivaId
          ? projeto.pranchas.find((pr) => pr.id === prenchaAtivaId)?.viewports.find((v) => v.id === viewportAtivoId)
          : projeto.geometria.find((g): g is ViewportGeometria => g.id === viewportAtivoId && g.tipo === "viewport");
        if (!vp) return;
        const paperPoint = screenToWorld(pointer, viewportAtual);
        const oldModelScale = vp.modelScale || 1;
        const newModelScale = clamp(
          direction > 0 ? oldModelScale * ZOOM_INTENSIDADE : oldModelScale / ZOOM_INTENSIDADE,
          MODEL_SCALE_MIN,
          MODEL_SCALE_MAX
        );
        const modelPointX = vp.modelOffsetX + (paperPoint.x - vp.x) * oldModelScale;
        const modelPointY = vp.modelOffsetY + (paperPoint.y - vp.y) * oldModelScale;
        const patch = {
          modelScale: newModelScale,
          modelOffsetX: modelPointX - (paperPoint.x - vp.x) * newModelScale,
          modelOffsetY: modelPointY - (paperPoint.y - vp.y) * newModelScale,
        };
        if (prenchaAtivaId) atualizarViewportDaPrancha(prenchaAtivaId, viewportAtivoId, patch);
        else atualizarViewport(viewportAtivoId, patch);
        return;
      }

      // Prancha ativa SEM nenhum Viewport em Model Ativo (Iteração 12g):
      // a roda do mouse só dá zoom/pan na PÁGINA em si (Stage), nunca
      // numa câmera de conteúdo -- pedido do usuário ("evita que eu saia
      // da escala por acidente"). Escreve em `pranchaViewports[id]` (não
      // mais em `viewport`, Iteração 12t) -- essa página tem um zoom/pan
      // PRÓPRIO, independente do Desenho (ver comentário em
      // `CadState.pranchaViewports`).

      const oldScale = viewportAtual.scale;
      const newScale = clamp(
        direction > 0 ? oldScale / ZOOM_INTENSIDADE : oldScale * ZOOM_INTENSIDADE,
        ZOOM_MIN,
        ZOOM_MAX
      );

      const worldPoint = screenToWorld(pointer, viewportAtual);
      const patch = {
        scale: newScale,
        x: pointer.x - worldPoint.x * newScale,
        y: pointer.y - worldPoint.y * newScale,
      };
      if (prenchaAtivaId) setPranchaViewport(prenchaAtivaId, patch);
      else setViewport(patch);
    },
    [
      viewportAtual,
      setViewport,
      setPranchaViewport,
      viewportAtivoId,
      atualizarViewport,
      prenchaAtivaId,
      atualizarViewportDaPrancha,
    ]
  );

  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const btn = e.evt.button;
      if (btn === 1 || btn === 2) {
        e.evt.preventDefault();
        isPanningRef.current = true;
        lastPointerRef.current = { x: e.evt.clientX, y: e.evt.clientY };
        setPanejando(true);
        return;
      }
      // Iteração 27: "quando vou inserir a imagem dentro de um desenho nao
      // consigo selecionar mais só a imagem, preciso ter a opcao de
      // selecionar qualquer imagem eu desenho mesmo que esteja por cima de
      // outro desenho" -- causa raiz: `XrefLayer` é renderizada ANTES de
      // `GeometryLayer` (ver `CanvasStage`, JSX mais abaixo), então
      // qualquer geometria desenhada por cima de um XREF sempre vence o
      // hit-test nativo do Konva (o alvo é sempre a forma mais "de cima"),
      // e o clique nunca chega ao próprio `<Group>` do XREF
      // (`XrefLayer.tsx#XrefImage`). Alt+clique dá um jeito de "furar" a
      // geometria por cima e selecionar o XREF por baixo dela -- igual ao
      // "alt-click seleciona o que está por baixo" já comum em editores
      // vetoriais (Illustrator/Figma). Como `GeometryLayer.tsx`'s shapes
      // não escutam `onMouseDown` (só `onClick`, disparado no mouseup),
      // este handler do Stage roda ANTES da forma de cima decidir sua
      // própria seleção no `onClick` -- por isso o hit-test manual (contra
      // a lista de XREFs, não contra o hit-graph do Konva) precisa
      // acontecer aqui, e `handleShapeClick` (GeometryLayer.tsx) precisa
      // ignorar o clique quando Alt estiver pressionado, pra não
      // sobrescrever esta seleção alguns ms depois.
      if (btn === 0 && ferramenta === "selecionar" && e.evt.altKey) {
        const stage = stageRef.current;
        const pointer = stage?.getPointerPosition();
        if (pointer) {
          const mundo = screenToWorld(pointer, viewportAtual);
          const { projeto } = useCadStore.getState();
          // Percorre de trás pra frente: o ÚLTIMO da lista é o desenhado
          // por último (mais "de cima" entre os próprios XREFs, mesma
          // ordem usada por `XrefLayer.tsx`), então é o primeiro candidato
          // certo quando há mais de uma imagem sobreposta no mesmo ponto.
          const alvo = [...projeto.xrefs].reverse().find((x) => {
            if (x.visivel === false) return false;
            const largura = x.largura_px * x.escala;
            const altura = x.altura_px * x.escala;
            return mundo.x >= x.x && mundo.x <= x.x + largura && mundo.y >= x.y && mundo.y <= x.y + altura;
          });
          if (alvo) {
            e.cancelBubble = true;
            limparSelecao();
            selecionarXref(alvo.id);
            return;
          }
        }
      }

      // Arraste de seleção por caixa (Window/Crossing Select): registra o
      // ponto de partida (mundo) em QUALQUER clique esquerdo com a
      // ferramenta "Selecionar" ativa -- mesmo em cima de uma forma
      // existente. Só vira de fato uma caixa se o cursor se mover além de
      // um limiar em handleMouseMove (ver lá); um clique parado continua
      // funcionando como seleção simples de sempre.
      if (btn === 0 && ferramenta === "selecionar") {
        const stage = stageRef.current;
        const pointer = stage?.getPointerPosition();
        if (pointer) {
          selecaoDragRef.current = { inicioMundo: screenToWorld(pointer, viewportAtual), moveu: false };
        }
      }
    },
    [ferramenta, viewportAtual, limparSelecao, selecionarXref]
  );

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (isPanningRef.current && lastPointerRef.current) {
        const dx = e.evt.clientX - lastPointerRef.current.x;
        const dy = e.evt.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: e.evt.clientX, y: e.evt.clientY };
        // Model Ativo (num Viewport MV do Desenho OU de uma Prancha, ver
        // mesmo comentário em `handleWheel`): o arraste de pan (botão do
        // meio/direito) passa a mover a "câmera local" desse viewport
        // (modelOffsetX/Y) em vez do pan principal da página -- `fator`
        // converte um delta em PIXELS DE TELA para um delta em mm de
        // MUNDO através da escala composta do viewport (`escalaEfetiva`
        // em ViewportShape.tsx é o inverso disso: mm de mundo -> px de
        // tela), com o sinal invertido porque AUMENTAR modelOffsetX
        // desloca a janela pra mostrar mundo mais à direita, o que faz o
        // conteúdo aparecer deslocado pra ESQUERDA na tela (mesma relação
        // inversa entre "mover a câmera" e "mover o que ela vê").
        if (viewportAtivoId) {
          const { projeto } = useCadStore.getState();
          const vp: ViewportGeometria | undefined = prenchaAtivaId
            ? projeto.pranchas.find((pr) => pr.id === prenchaAtivaId)?.viewports.find((v) => v.id === viewportAtivoId)
            : projeto.geometria.find((g): g is ViewportGeometria => g.id === viewportAtivoId && g.tipo === "viewport");
          if (vp) {
            const fator = vp.modelScale / viewportAtual.scale;
            const patch = { modelOffsetX: vp.modelOffsetX - dx * fator, modelOffsetY: vp.modelOffsetY - dy * fator };
            if (prenchaAtivaId) atualizarViewportDaPrancha(prenchaAtivaId, viewportAtivoId, patch);
            else atualizarViewport(viewportAtivoId, patch);
          }
          return;
        }
        // Prancha ativa SEM Viewport em Model Ativo (Iteração 12g): pan
        // vai pra página, mas a página da PRANCHA tem seu próprio
        // zoom/pan (`pranchaViewports[id]`, Iteração 12t) -- nunca mais o
        // `viewport` do Desenho, pra não bagunçar um enquadramento quando
        // o outro é ajustado.
        if (prenchaAtivaId) setPranchaViewport(prenchaAtivaId, { x: viewportAtual.x + dx, y: viewportAtual.y + dy });
        else setViewport({ x: viewportAtual.x + dx, y: viewportAtual.y + dy });
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const mundo = screenToWorld(pointer, viewportAtual);

      // Seleção por caixa em andamento: atualiza o retângulo de preview
      // (GeometryLayer) em vez do preview normal de OSNAP/grid. Só passa
      // a "valer" como arraste (e mostrar o retângulo) depois de um
      // limiar de 3px de tela -- abaixo disso ainda pode ser só um
      // clique parado com a mão trêmula.
      if (selecaoDragRef.current) {
        const dxPx = (mundo.x - selecaoDragRef.current.inicioMundo.x) * viewportAtual.scale;
        const dyPx = (mundo.y - selecaoDragRef.current.inicioMundo.y) * viewportAtual.scale;
        if (selecaoDragRef.current.moveu || Math.hypot(dxPx, dyPx) > 3) {
          selecaoDragRef.current.moveu = true;
          setSelecaoBox({ inicio: selecaoDragRef.current.inicioMundo, atual: mundo });
        }
        return;
      }

      // Calibração de XREF mede feições da imagem de fundo, não do grid
      // de desenho -- usa a coordenada de mundo crua, sem OSNAP/snap.
      if (ferramenta === "calibrar") {
        setPonteiroMundo(mundo);
        setOsnapAlvo(null);
        return;
      }

      // Lê a geometria/camadas frescas via getState() (em vez de useCadStore
      // selector) para não precisar recriar este callback a cada desenho.
      const { projeto } = useCadStore.getState();

      // TRIM (Aparar): acha a linha mais próxima do cursor (tolerância em
      // pixels de tela) e recalcula ao vivo em quais sub-segmentos ela fica
      // dividida pelas interseções com as outras linhas visíveis -- o
      // segmento sob o cursor fica "em mira" pro próximo clique, confirmado
      // em `handleStageClick` (`aplicarTrim()`). A Iteração 12q chegou a
      // compartilhar esse mesmo cálculo com a ferramenta "apagar" também,
      // mas a 12r reverteu isso a pedido do usuário -- Apagar não corta
      // mais segmento nenhum (sempre remove o elemento inteiro, ver
      // GeometryLayer.handleShapeClick), então não precisa mais computar
      // este preview. Não usa OSNAP/snap de grid aqui: a precisão do TRIM
      // vem das interseções calculadas, não da posição bruta do cursor.
      if (ferramenta === "aparar") {
        setPonteiroMundo(mundo);
        setOsnapAlvo(null);
        const linhas = projeto.geometria.filter((g): g is LinhaGeometria => g.tipo === "linha");
        const alvo = linhaSobCursor(linhas, projeto.camadas, mundo, viewportAtual);
        if (alvo) {
          const outras = linhas.filter((l) => l.id !== alvo.linha.id);
          const segmentos = segmentosDeCorte(alvo.linha, outras);
          const indice = segmentoNoParametro(segmentos, alvo.t);
          setTrimPreview(segmentos.length > 1 && indice >= 0 ? { linhaId: alvo.linha.id, segmentos, indiceAlvo: indice } : null);
        } else {
          setTrimPreview(null);
        }
        return;
      }

      // OFFSET (Deslocar), Iteração 37 -- ANTES do 1º clique (`offsetAlvoId`
      // ainda não armado): destaca ao vivo qual linha/aresta SERIA
      // escolhida se o usuário clicasse agora, mesma ideia do TRIM acima.
      // Pedido do usuário: "o botao deslocar precisa mostrar que está
      // ativo quando encostar por cima da linha, faça ele selecionar a
      // linha que vai ser duplicada para o usuario ver que esta
      // funcionando". Depois do 1º clique este bloco para de rodar (a
      // condição `!offsetAlvoId` passa a ser falsa) e o ponteiro cai no
      // fluxo normal logo abaixo -- é o `ponteiroMundo` dali que alimenta
      // o preview ao vivo da linha paralela em `GeometryLayer.tsx`.
      if (ferramenta === "deslocar" && !offsetAlvoId) {
        setPonteiroMundo(mundo);
        setOsnapAlvo(null);
        setOffsetHover(geometriaSobCursorOffset(projeto.geometria, projeto.camadas, mundo, viewportAtual));
        return;
      }

      const resultado = resolverPontoAlvo(pointer, mundo, projeto.geometria, projeto.camadas, viewportAtual, gridSize, snapAtivo);
      setPonteiroMundo(resultado.ponto);
      setOsnapAlvo(resultado.tipo ? resultado.ponto : null, resultado.tipo);
    },
    [
      viewportAtual,
      gridSize,
      snapAtivo,
      ferramenta,
      setViewport,
      setPranchaViewport,
      setPonteiroMundo,
      setOsnapAlvo,
      setTrimPreview,
      offsetAlvoId,
      setOffsetHover,
      setSelecaoBox,
      viewportAtivoId,
      atualizarViewport,
      prenchaAtivaId,
      atualizarViewportDaPrancha,
    ]
  );

  const handleMouseUp = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 1 || e.evt.button === 2) {
        isPanningRef.current = false;
        lastPointerRef.current = null;
        setPanejando(false);
        return;
      }
      // GRIP (STRETCH) arrastado (Iteração 12c): se um grip foi agarrado no
      // mousedown (ver `handleGripMouseDown` em GeometryLayer.tsx), este
      // mouseup já CONFIRMA o novo ponto do vértice na hora -- permite
      // "clicar num grip e arrastar até a posição final" num gesto só
      // (pressionar + arrastar + soltar), igual ao AutoCAD, em vez do fluxo
      // antigo que exigia dois cliques separados (um pra armar, outro pra
      // confirmar). Isso facilita, por exemplo, arrastar a ponta de uma
      // linha até encostar num disjuntor. Único caminho de confirmação
      // agora (o antigo confirm-no-click foi removido de handleStageClick)
      // -- evita aplicar o stretch em dobro por causa de closures
      // desatualizadas entre o mouseup e o "click" sintético que o Konva
      // dispara logo em seguida no mesmo alvo.
      if (gripAlvo) {
        const stage = stageRef.current;
        const pointer = stage?.getPointerPosition();
        if (pointer) {
          const mundo = screenToWorld(pointer, viewportAtual);
          const { projeto } = useCadStore.getState();
          const { ponto } = resolverPontoAlvo(pointer, mundo, projeto.geometria, projeto.camadas, viewportAtual, gridSize, snapAtivo);
          aplicarStretch(ponto);
        }
        return;
      }
      if (selecaoDragRef.current) {
        const arrastou = selecaoDragRef.current.moveu;
        selecaoDragRef.current = null;
        if (arrastou) {
          confirmarSelecaoBox(e.evt.shiftKey);
          // O "click" sintético do Konva ainda vai disparar logo em
          // seguida (mesmo par pointerdown/up) -- sinaliza para
          // handleStageClick ignorá-lo, senão o fallback "selecionar"
          // (clique em vazio limpa a seleção) apagaria o que acabamos de
          // selecionar por caixa.
          boxSelectJustFinishedRef.current = true;
        }
      }
    },
    [confirmarSelecaoBox, gripAlvo, viewportAtual, gridSize, snapAtivo, aplicarStretch]
  );

  // Clique esquerdo "puro": posiciona ponto de linha/círculo/mover/
  // copiar, carimba bloco, ou limpa a seleção (se o alvo já não tiver
  // tratado o clique).
  //
  // IMPORTANTE: o Konva sintetiza seu próprio evento "click" a partir de
  // um par pointerdown/pointerup no mesmo alvo -- SEM respeitar a regra
  // do DOM nativo de que "click" só existe para o botão principal. Isso
  // significa que um arraste com o botão do meio/direito (usado para
  // pan) também dispara este handler ao soltar o botão. Por isso
  // verificamos `e.evt.button !== 0` aqui (e em cada forma clicável em
  // GeometryLayer/BlocoShape) -- confiar só em `isPanningRef` não basta,
  // pois ele já foi zerado pelo `onMouseUp` antes deste clique chegar.
  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;
      if (isPanningRef.current) return;
      if (boxSelectJustFinishedRef.current) {
        boxSelectJustFinishedRef.current = false;
        return;
      }
      // Prancha ativa (Layout, Iteração 12e): puramente pra enquadrar/
      // exportar o Desenho, sem edição direta -- as coordenadas de tela
      // aqui mapeiam pro sistema de PAPEL da prancha, não pro mundo do
      // Desenho. Só "Selecionar" (clique em vazio limpa a seleção de
      // Viewport de Prancha, ver fallback no fim desta função), "viewport"
      // (MV -- insere um Viewport na prancha) e "zoomWindow" (ajusta o
      // enquadramento da página ou do Viewport em Model Ativo) continuam
      // operando com uma Prancha ativa (Iteração 12g -- ver
      // `FERRAMENTAS_PERMITIDAS_EM_PRANCHA` em `ToolRuler.tsx`, que já
      // restringe os BOTÕES a essas três; isso aqui é a segunda camada de
      // proteção).
      if (prenchaAtivaId && !["selecionar", "viewport", "zoomWindow"].includes(ferramenta)) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const mundo = screenToWorld(pointer, viewportAtual);
      const { projeto } = useCadStore.getState();
      const { ponto: pontoResolvido } = resolverPontoAlvo(pointer, mundo, projeto.geometria, projeto.camadas, viewportAtual, gridSize, snapAtivo);

      // ORTHO (Iteração 12s, igual ao F8 do AutoCAD): pedido do usuário --
      // "se eu fizer um linha reta para cima iniciando do meio de uma
      // linha horizontal e esse centro nao estiver no mesmo alinhamento
      // que essas linhas do grid a linha fica torta". Causa raiz: o
      // PRIMEIRO ponto pode vir de um OSNAP (ex.: Midpoint) que não cai
      // numa interseção do grid; o SEGUNDO ponto, sem nenhum alvo de
      // OSNAP por perto, cai de volta no snap de grid -- que arredonda
      // pro múltiplo de grid mais próximo, DIFERENTE do X (ou Y) do 1º
      // ponto, torcendo a linha. Com ORTHO ativo, o 2º+ ponto de
      // Linha/Polígono/Polilinha trava no eixo (horizontal OU vertical,
      // o que tiver maior deslocamento) em relação ao ponto anterior --
      // o grid ainda decide a posição ao longo desse eixo, mas não pode
      // mais "puxar" o outro eixo pra fora do alinhamento. Só entra em
      // jogo quando já existe um ponto de referência (2º+ clique); o 1º
      // ponto de cada forma continua livre, sem eixo nenhum pra travar.
      const referenciaOrtho =
        ferramenta === "linha"
          ? pontoRascunho
          : ferramenta === "poligono" && poligonoPontos && poligonoPontos.length > 0
          ? poligonoPontos[poligonoPontos.length - 1]
          : ferramenta === "polilinha" && polilinhaPontos && polilinhaPontos.length > 0
          ? polilinhaPontos[polilinhaPontos.length - 1]
          : null;
      const ponto =
        orthoAtivo && referenciaOrtho
          ? (() => {
              const dx = pontoResolvido.x - referenciaOrtho.x;
              const dy = pontoResolvido.y - referenciaOrtho.y;
              if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return pontoResolvido;
              return Math.abs(dx) >= Math.abs(dy)
                ? { x: pontoResolvido.x, y: referenciaOrtho.y }
                : { x: referenciaOrtho.x, y: pontoResolvido.y };
            })()
          : pontoResolvido;

      // STRETCH (grip): a confirmação agora acontece inteiramente em
      // `handleMouseUp` (mousedown no grip arma, mouseup confirma -- um
      // gesto de arraste só, ver comentário lá). Aqui só evitamos que o
      // "click" sintético que o Konva dispara logo depois desse mouseup
      // caia no fallback de "limparSelecao()" no fim desta função.
      if (gripAlvo) return;

      if (ferramenta === "linha") {
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
          // Entrada de comprimento (Iteração 12j): agora dá pra digitar a
          // medida (ex.: 10 ou 10m) na linha de comando em vez de clicar o
          // 2º ponto -- a linha nasce na direção em que o mouse estiver
          // apontando naquele momento (ver `CommandLine.tsx`).
          pushComando(
            "LINHA: clique o próximo ponto, ou digite o comprimento (ex.: 10 ou 10m) e Enter -- a linha nasce na direção do mouse."
          );
        } else {
          addGeometria({
            tipo: "linha",
            camada: activeLayer,
            x1: pontoRascunho.x,
            y1: pontoRascunho.y,
            x2: ponto.x,
            y2: ponto.y,
          });
          // Encadeia a próxima linha a partir do ponto final (como o
          // comando LINE do AutoCAD, que continua até Esc).
          setPontoRascunho(ponto);
        }
        return;
      }

      if (ferramenta === "circulo") {
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
        } else {
          const raio = distance(pontoRascunho, ponto);
          if (raio > 0) {
            addGeometria({ tipo: "circulo", camada: activeLayer, x: pontoRascunho.x, y: pontoRascunho.y, raio });
          }
          setPontoRascunho(null);
        }
        return;
      }

      if (ferramenta === "retangulo") {
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
        } else {
          const x = Math.min(pontoRascunho.x, ponto.x);
          const y = Math.min(pontoRascunho.y, ponto.y);
          const largura = Math.abs(ponto.x - pontoRascunho.x);
          const altura = Math.abs(ponto.y - pontoRascunho.y);
          if (largura > 0 && altura > 0) {
            addGeometria({ tipo: "retangulo", camada: activeLayer, x, y, largura, altura });
          }
          setPontoRascunho(null);
        }
        return;
      }

      if (ferramenta === "viewport") {
        // MV/MVIEW: 2 cliques definem o retângulo na folha, igual ao
        // "retangulo" -- repete até Esc (não volta sozinho pra
        // "selecionar"), permitindo inserir vários viewports em
        // sequência. Nasce com `modelScale: 1` (1mm de papel = 1mm de
        // mundo) e a câmera local mostrando, a partir do canto
        // superior-esquerdo do retângulo, o MESMO ponto do mundo que
        // ocupa aquele canto na folha -- o usuário ajusta o enquadramento
        // de fato depois, via ZOOM WINDOW (Z/W) dentro do viewport. Com
        // uma Prancha ativa (Iteração 12g), insere na LISTA DELA
        // (`Prancha.viewports`) em vez de `projeto.geometria` -- é o
        // botão "preciso do botao viewport dentro da prancha" pedido pelo
        // usuário.
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
        } else {
          const x = Math.min(pontoRascunho.x, ponto.x);
          const y = Math.min(pontoRascunho.y, ponto.y);
          const largura = Math.abs(ponto.x - pontoRascunho.x);
          const altura = Math.abs(ponto.y - pontoRascunho.y);
          if (largura > 0 && altura > 0) {
            if (prenchaAtivaId) {
              const novoId = adicionarViewportPrancha(prenchaAtivaId, x, y, largura, altura);
              selecionarViewportPrancha(novoId);
            } else {
              addGeometria({
                tipo: "viewport",
                camada: activeLayer,
                x,
                y,
                largura,
                altura,
                modelScale: 1,
                modelOffsetX: x,
                modelOffsetY: y,
                bordaVisivel: true,
              });
            }
          }
          setPontoRascunho(null);
        }
        return;
      }

      if (ferramenta === "zoomWindow") {
        // ZOOM WINDOW (Z -> W): 2 cliques definem um retângulo de seleção
        // em coordenadas de PAPEL (mesmo sistema em que as ferramentas de
        // desenho sempre operam, mesmo com um viewport em Model Ativo --
        // ver comentário de escopo em `ViewportGeometria`, types.ts). Se
        // houver um viewport ativo (do Desenho OU de uma Prancha), a
        // seleção é primeiro convertida pra coordenadas de MUNDO através
        // da câmera atual desse viewport (a mesma fórmula do wheel-zoom
        // acima) e o enquadramento é recalculado só dentro dele; senão,
        // ajusta o zoom/pan principal da PÁGINA (Stage) -- funciona tanto
        // no Desenho quanto numa Prancha sem viewport em foco (Iteração
        // 12g, "zoom window so funciona na tela de desenho... preciso que
        // ele funcione é nas pranchas"). Sempre volta pra "selecionar" ao
        // concluir -- é um comando de VISUALIZAÇÃO, não de desenho (não
        // faz sentido encadear vários ZOOM WINDOW sem re-selecionar a
        // ferramenta).
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
        } else {
          const selMinX = Math.min(pontoRascunho.x, ponto.x);
          const selMinY = Math.min(pontoRascunho.y, ponto.y);
          const selMaxX = Math.max(pontoRascunho.x, ponto.x);
          const selMaxY = Math.max(pontoRascunho.y, ponto.y);
          const selW = selMaxX - selMinX;
          const selH = selMaxY - selMinY;
          if (selW > 0 && selH > 0) {
            if (viewportAtivoId) {
              const { projeto } = useCadStore.getState();
              const vp: ViewportGeometria | undefined = prenchaAtivaId
                ? projeto.pranchas.find((pr) => pr.id === prenchaAtivaId)?.viewports.find((v) => v.id === viewportAtivoId)
                : projeto.geometria.find((g): g is ViewportGeometria => g.id === viewportAtivoId && g.tipo === "viewport");
              if (vp) {
                const toModel = (p: { x: number; y: number }) => ({
                  x: vp.modelOffsetX + (p.x - vp.x) * vp.modelScale,
                  y: vp.modelOffsetY + (p.y - vp.y) * vp.modelScale,
                });
                const m1 = toModel({ x: selMinX, y: selMinY });
                const m2 = toModel({ x: selMaxX, y: selMaxY });
                const modelMinX = Math.min(m1.x, m2.x);
                const modelMinY = Math.min(m1.y, m2.y);
                const modelW = Math.abs(m2.x - m1.x);
                const modelH = Math.abs(m2.y - m1.y);
                // Fit-and-contain (a seleção inteira precisa caber): a
                // dimensão mais restritiva (largura OU altura) manda.
                const novaEscala = clamp(
                  Math.max(modelW / vp.largura, modelH / vp.altura),
                  MODEL_SCALE_MIN,
                  MODEL_SCALE_MAX
                );
                const centroX = modelMinX + modelW / 2;
                const centroY = modelMinY + modelH / 2;
                const patch = {
                  modelScale: novaEscala,
                  modelOffsetX: centroX - (vp.largura / 2) * novaEscala,
                  modelOffsetY: centroY - (vp.altura / 2) * novaEscala,
                };
                if (prenchaAtivaId) atualizarViewportDaPrancha(prenchaAtivaId, viewportAtivoId, patch);
                else atualizarViewport(viewportAtivoId, patch);
              }
            } else {
              const novaEscala = clamp(Math.min(size.width / selW, size.height / selH), ZOOM_MIN, ZOOM_MAX);
              const centroX = (selMinX + selMaxX) / 2;
              const centroY = (selMinY + selMaxY) / 2;
              // Sem viewport em foco: ajusta a página em si -- a página da
              // PRANCHA tem seu próprio zoom/pan (`pranchaViewports[id]`,
              // Iteração 12t), nunca mais o `viewport` do Desenho.
              const patchPagina = {
                scale: novaEscala,
                x: size.width / 2 - centroX * novaEscala,
                y: size.height / 2 - centroY * novaEscala,
              };
              if (prenchaAtivaId) setPranchaViewport(prenchaAtivaId, patchPagina);
              else setViewport(patchPagina);
            }
          }
          cancelarDesenho();
        }
        return;
      }

      if (ferramenta === "poligono") {
        // Cada clique crava mais um vértice (ver `adicionarPontoPoligono`
        // no store); o fechamento só acontece com Enter (>= 3 vértices),
        // tratado no listener de teclado acima -- não aqui, para não
        // fechar o polígono sem querer no meio de um clique normal.
        adicionarPontoPoligono(ponto);
        return;
      }

      if (ferramenta === "polilinha") {
        // Igual ao polígono acima, mas o fechamento (Enter) resulta num
        // elemento ABERTO -- ver `fecharPolilinha` no store/listener de
        // teclado.
        adicionarPontoPolilinha(ponto);
        return;
      }

      if (ferramenta === "carimbar" && blocoParaCarimbar) {
        addGeometria({ tipo: "bloco", camada: activeLayer, nome: blocoParaCarimbar, x: ponto.x, y: ponto.y });
        return;
      }

      if (ferramenta === "concessionaria") {
        // 1º clique = posição do poste; 2º clique = posição do medidor --
        // o conjunto inteiro (poste + ramal + medidor + textos) é
        // inserido de uma vez no 2º clique (ver `inserirPadraoConcessionaria`
        // no store), como um bloco composto único no histórico de undo.
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
          pushComando("PADRÃO DE ENTRADA: clique a posição do medidor.");
        } else {
          inserirPadraoConcessionaria(pontoRascunho, ponto);
          cancelarDesenho();
        }
        return;
      }

      if (ferramenta === "mover") {
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
        } else {
          moverGeometria(selecionadoIds, ponto.x - pontoRascunho.x, ponto.y - pontoRascunho.y);
          cancelarDesenho();
        }
        return;
      }

      if (ferramenta === "copiar") {
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
        } else {
          copiarGeometria(selecionadoIds, ponto.x - pontoRascunho.x, ponto.y - pontoRascunho.y);
          // Mantém o ponto-base armado: permite "carimbar" várias cópias
          // em sequência (como o COPY multiplo do AutoCAD), até Esc.
        }
        return;
      }

      if (ferramenta === "texto") {
        // Só crava o ponto de inserção aqui -- o conteúdo é digitado
        // logo em seguida na linha de comando (sub-prompt interceptado
        // em CommandLine.tsx, que faz o addGeometria de fato).
        if (!pontoRascunho) {
          setPontoRascunho(ponto);
          pushComando("TEXTO: digite o conteúdo -- Enter quebra linha, clique em \"✓ Inserir\" (ou Ctrl+Enter) confirma, Esc cancela.");
        }
        return;
      }

      if (ferramenta === "cota") {
        // 1º e 2º clique gravam os pontos medidos (mostra a distância ao
        // vivo no preview, ver GeometryLayer); o 3º clique -- em
        // QUALQUER ponto do canvas, para posicionar a linha de cota --
        // já insere o elemento definitivo via `confirmarCota`.
        if (!cotaP1) {
          registrarPontoCota(ponto);
          pushComando("COTA: clique no ponto final da medição.");
        } else if (!cotaP2) {
          registrarPontoCota(ponto);
          pushComando("COTA: clique para posicionar a linha de cota.");
        } else {
          const resultado = confirmarCota(ponto);
          if (!resultado.ok && resultado.erro) pushComando(resultado.erro);
        }
        return;
      }

      if (ferramenta === "calibrar") {
        // Usa `mundo` cru (sem snap/OSNAP): o usuário está clicando em
        // feições da imagem de fundo (ex.: pontas da barra de escala do
        // mapa), não em pontos do grid de desenho.
        registrarPontoCalibracao(mundo);
        return;
      }

      if (ferramenta === "aparar") {
        const resultado = aplicarTrim();
        if (!resultado.ok && resultado.erro) pushComando(resultado.erro);
        return;
      }

      // OFFSET: o 1º clique (escolher a linha alvo) é tratado em
      // GeometryLayer.handleShapeClick (só quando o alvo bate numa
      // forma); este 2º clique -- em QUALQUER ponto do canvas, para
      // definir de que lado a cópia paralela deve aparecer -- é tratado
      // aqui, já que não precisa (nem deve) acertar uma forma específica.
      if (ferramenta === "deslocar" && offsetAlvoId) {
        const resultado = aplicarOffset(ponto);
        if (!resultado.ok && resultado.erro) pushComando(resultado.erro);
        return;
      }

      if (ferramenta === "selecionar") {
        // Clique em vazio: limpa a seleção normal (Desenho) e/ou a
        // seleção de Viewport de Prancha (Iteração 12g) -- clicar EM CIMA
        // de um Viewport nunca chega até aqui (o próprio Rect do
        // Viewport marca `cancelBubble`, ver `PranchaLayer.tsx`). Iteração
        // 12u: mesma lógica pro XREF selecionado (`xrefSelecionadoId`) --
        // clicar em cima da imagem também nunca chega até aqui, ver
        // `XrefLayer.tsx`.
        limparSelecao();
        if (prenchaAtivaId) selecionarViewportPrancha(null);
        if (xrefSelecionadoId) selecionarXref(null);
      }
    },
    [
      viewportAtual,
      snapAtivo,
      orthoAtivo,
      poligonoPontos,
      polilinhaPontos,
      gridSize,
      ferramenta,
      pontoRascunho,
      activeLayer,
      blocoParaCarimbar,
      selecionadoIds,
      addGeometria,
      moverGeometria,
      copiarGeometria,
      setPontoRascunho,
      limparSelecao,
      cancelarDesenho,
      registrarPontoCalibracao,
      adicionarPontoPoligono,
      aplicarTrim,
      offsetAlvoId,
      aplicarOffset,
      pushComando,
      cotaP1,
      cotaP2,
      registrarPontoCota,
      confirmarCota,
      gripAlvo,
      aplicarStretch,
      adicionarPontoPolilinha,
      inserirPadraoConcessionaria,
      size,
      viewportAtivoId,
      atualizarViewport,
      atualizarViewportDaPrancha,
      prenchaAtivaId,
      setViewport,
      setPranchaViewport,
      adicionarViewportPrancha,
      selecionarViewportPrancha,
      xrefSelecionadoId,
      selecionarXref,
    ]
  );

  // MV/ZOOM WINDOW (Sprint 5): duplo clique DENTRO do retângulo de um
  // Viewport entra em "Model Ativo" (`setViewportAtivo`) -- a partir daí a
  // roda do mouse e o pan passam a controlar a câmera local desse
  // viewport (ver `handleWheel`/`handleMouseMove` acima) -- até um duplo
  // clique FORA de qualquer viewport devolver o foco à prancha. Só ativo
  // com a ferramenta "selecionar" (evita interferir com o 2º clique de um
  // desenho em andamento, que também poderia cair dentro de um duplo
  // clique acidental). O teste usa coordenadas de PAPEL (mesmo sistema
  // dos cliques normais do Stage) porque o retângulo do viewport em si
  // sempre vive na folha, independente do que a câmera local dele está
  // mostrando por dentro.
  const handleDblClick = useCallback(
    () => {
      if (ferramenta !== "selecionar") return;
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const paperPoint = screenToWorld(pointer, viewportAtual);
      const { projeto } = useCadStore.getState();
      // Duplo clique DENTRO de um retângulo de Viewport entra em "Model
      // Ativo" (zoom/pan passam a controlar a câmera local dele, ver
      // `handleWheel`/`handleMouseMove`); duplo clique FORA de qualquer
      // viewport sai (re-trava a página) -- igual ao MVIEW real do
      // AutoCAD. Com uma Prancha ativa (Iteração 12g), procura em
      // `pranchaAtiva.viewports`; no Desenho, no viewport MV clássico
      // (`projeto.geometria`, Sprint 5).
      if (prenchaAtivaId) {
        const prancha = projeto.pranchas.find((pr) => pr.id === prenchaAtivaId);
        const alvo = prancha
          ? [...prancha.viewports]
              .reverse()
              .find((v) => paperPoint.x >= v.x && paperPoint.x <= v.x + v.largura && paperPoint.y >= v.y && paperPoint.y <= v.y + v.altura)
          : undefined;
        setViewportAtivo(alvo ? alvo.id : null);
        return;
      }
      const alvo = [...projeto.geometria].reverse().find(
        (g) =>
          g.tipo === "viewport" &&
          paperPoint.x >= g.x &&
          paperPoint.x <= g.x + g.largura &&
          paperPoint.y >= g.y &&
          paperPoint.y <= g.y + g.altura
      );
      setViewportAtivo(alvo ? alvo.id : null);
    },
    [ferramenta, viewportAtual, setViewportAtivo, prenchaAtivaId]
  );

  // Drag&drop de blocos a partir da `BlockLibraryPanel` (barra lateral):
  // alternativa ao fluxo de clique-para-armar-carimbo já existente
  // (`armarCarimbo`/ferramenta "carimbar") -- solta o bloco exatamente
  // nas coordenadas do cursor, passando pelo mesmo `resolverPontoAlvo`
  // (OSNAP + snap de grid) usado por qualquer clique de desenho, então o
  // ponto de inserção "gruda" igual a um carimbo normal.
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(BLOCO_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const blocoId = e.dataTransfer.getData(BLOCO_DRAG_MIME);
      if (!blocoId) return;
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const mundo = screenToWorld(pointer, viewportAtual);
      const { projeto } = useCadStore.getState();
      const { ponto } = resolverPontoAlvo(pointer, mundo, projeto.geometria, projeto.camadas, viewportAtual, gridSize, snapAtivo);
      addGeometria({ tipo: "bloco", camada: activeLayer, nome: blocoId, x: ponto.x, y: ponto.y });
    },
    [viewportAtual, gridSize, snapAtivo, activeLayer, addGeometria]
  );

  // Iteração 17: cursor "pickbox" (quadradinho, estilo AutoCAD) na
  // ferramenta Deslocar/OFFSET -- pedido explícito do usuário, já que o
  // fluxo do OFFSET é justamente "escolher" (pick) uma linha existente
  // antes de indicar o lado, e o crosshair genérico não dava esse
  // feedback visual de que o clique seguinte é uma SELEÇÃO, não um novo
  // ponto de desenho. SVG inline como data URI (cursor customizado via
  // CSS não tem um "quadrado" nativo) -- 16x16 com o quadrado de 8x8
  // centrado, hotspot em (8,8) pra o centro do quadrado cair exatamente
  // sob a posição real do ponteiro; `crosshair` como fallback caso o
  // navegador não suporte o cursor customizado.
  const PICKBOX_CURSOR =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><rect x='4' y='4' width='8' height='8' fill='white' fill-opacity='0.35' stroke='black' stroke-width='1.3'/></svg>\") 8 8, crosshair";

  const cursor = panejando
    ? "grabbing"
    : ferramenta === "apagar"
    ? "not-allowed"
    : ferramenta === "selecionar"
    ? "default"
    : ferramenta === "deslocar"
    ? PICKBOX_CURSOR
    : "crosshair";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-slate-100"
      style={{ cursor }}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={viewportAtual.x}
          y={viewportAtual.y}
          scaleX={viewportAtual.scale}
          scaleY={viewportAtual.scale}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleStageClick}
          onDblClick={handleDblClick}
        >
          {pranchaAtiva ? (
            // Prancha ativa (Layout, Iteração 12e): "janela(s)" pro
            // Desenho, somente-leitura -- ver `PranchaLayer.tsx`. NÃO
            // renderiza GridLayer/XrefLayer/GeometryLayer (que são
            // editáveis e pertencem só ao Desenho); o carimbo é sempre o
            // COMPARTILHADO `projeto.carimbo` (Iteração 12g -- ver
            // comentário em `types.ts#Projeto.carimbo`), não mais um por
            // Prancha.
            <>
              <PranchaLayer scale={viewportAtual.scale} />
              <TitleBlockLayer formato={pranchaAtiva.formato} orientacao={pranchaAtiva.orientacao} carimbo={carimboProjeto} />
            </>
          ) : (
            <>
              <GridLayer
                viewport={viewportAtual}
                stageWidth={size.width}
                stageHeight={size.height}
                gridSize={gridSize}
              />
              <XrefLayer />
              <GeometryLayer viewport={viewportAtual} />
            </>
          )}
        </Stage>
      )}
      <VertexContextMenu />
    </div>
  );
}
