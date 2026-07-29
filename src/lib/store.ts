/**
 * store.ts
 * -----------------------------------------------------------------------
 * Estado global do editor (Zustand). Concentra:
 *   - O projeto ativo (o mesmo JSON que vai para o Firestore) --
 *     incluindo geometria, XREFs e agora também o dicionário de camadas.
 *   - Estado de interação: ferramenta ativa, viewport (zoom/pan), grid,
 *     OSNAP, seleção (múltipla), ponto em construção de uma
 *     linha/círculo/mover/copiar, bloco armado para carimbo.
 *   - Histórico de eco da linha de comando.
 *
 * Mantido como um único store (sem slices) porque o domínio é pequeno o
 * bastante para o MVP; se o projeto crescer, é natural quebrar em slices
 * (geometriaSlice, viewportSlice, uiSlice...).
 * -----------------------------------------------------------------------
 */

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
  carregarPerfilTecnicoSalvo,
  salvarPerfilTecnico,
  type PerfilResponsavelTecnico,
} from "./perfilTecnico";
import type {
  BlocoGeometria,
  Camada,
  Carimbo,
  Ferramenta,
  FormatoFolha,
  Geometria,
  HachuraConfig,
  HachuraTipo,
  NovaGeometria,
  PoligonoGeometria,
  Prancha,
  PosicaoToolbar,
  Projeto,
  ProjetoResumo,
  RetanguloGeometria,
  TextoGeometria,
  ViewportGeometria,
  XRef,
} from "./types";
import { camadasIniciais, carimboVazio, dimensoesCarimbo, dimensoesFolhaOrientada, FORMATOS_FOLHA, MARGENS_ABNT } from "./types";
import { construirGeometriaDiagramaFv, type DadosDiagramaFv, type RetanguloMm } from "./diagramaFv";
import {
  gerarLeiauteSistemaSolo,
  ORIGEM_GERADOR_SISTEMA_SOLO,
  type DadosSistemaSolo,
  type ResumoSistemaSolo,
} from "./sistemaSolo";
import {
  gerarDimensionamentoCargas as construirGeometriaCargasEletricas,
  ORIGEM_GERADOR_CARGAS,
  CAMADA_FASE_INFO,
  CAMADA_TERRA_INFO,
  type DadosCargasEletricas,
  type ResumoCargasEletricas,
} from "./cargasEletricas";
import type { Viewport } from "./snap";
import type { TipoOsnap } from "./osnap";
import { arestasDe, segmentosDeCorte, todasArestasVisiveis, type SegmentoCorte } from "./trim";
import {
  distanciaAoSegmento,
  intersecaoRetas,
  normalizar,
  normalizarAngulo,
  normalizarAnguloGraus,
  produtoEscalar,
  rotacionarPonto,
  somar,
  subtrair,
  escalar,
} from "./geom";
import { resolverCamada } from "./layers";
import { segmentoOffsetAlvo, type SegmentoOffset } from "./offset";
import { bboxCombinada, caixaContida, caixaEnvolvente, caixasSeCruzam, type CaixaEnvolvente } from "./selection";
import { aplicarStretchNaGeometria, aplicarStretchArestaNaGeometria } from "./grips";
import { getBlockDef } from "./blocks";
import type { UnidadeDesenho } from "./unidades";
import { detectarComodos, extrairSegmentosDeParede, type ProblemaComodo } from "./roomDetection";
import {
  gerarPontosEletricos,
  gerarLegendaEletrica,
  ORIGEM_GERADOR_LANCAMENTO_ELETRICO,
  CAMADAS_LANCAMENTO_ELETRICO,
  type ResumoLancamentoEletrico,
} from "./lancamentoEletrico";

interface Ponto {
  x: number;
  y: number;
}

interface CadState {
  projeto: Projeto;
  ferramenta: Ferramenta;
  /**
   * Iteração 37 -- contador que incrementa TODA VEZ que `setFerramenta`
   * roda, mesmo quando a ferramenta escolhida já é a mesma de antes
   * (ex.: clicar de novo no botão "Deslocar" já ativo). Existe só pra dar
   * um "sinal de ativação" que o `useEffect` de auto-foco da linha de
   * comando (`CommandLine.tsx`) consiga captar via array de dependências
   * -- sem ele, reclicar a MESMA ferramenta sem nenhum outro campo do
   * store mudar de valor (ex.: `offsetDistancia` já `null`) não dispara
   * o efeito de novo, e o campo de digitar não reganha o foco. Bug real
   * relatado pelo usuário: "estou tendo dificuldade as vezes porque
   * quando clico no botao deslocar o campo de digitar o comando da
   * distancia nao ativa sozinho".
   */
  ferramentaAtivacaoSeq: number;
  /**
   * Iteração 38 -- último comando/ferramenta REAL que o usuário escolheu
   * (qualquer valor exceto "selecionar", que é só o estado "ocioso"/de
   * seleção, não um comando em si). Atualizado em `setFerramenta` toda
   * vez que `f !== "selecionar"`. Usado pela tecla Espaço (ver
   * `CanvasStage.tsx`) pra repetir o último comando -- igual ao
   * Enter/Espaço do AutoCAD, que reexecuta o último comando quando
   * nenhum está em andamento. Pedido do usuário: "configure a tecla
   * space para repetir o ultimo comando, o ultimo botao, exemplo se usei
   * cotas ao apertar a tecla space ele seleciona novamente o botao cotas
   * igual o autocad" -- útil sobretudo pros comandos que voltam sozinhos
   * pra "selecionar" depois de UM uso (Cota, Texto), já que Linha/
   * Círculo/Retângulo/Fillet/Deslocar etc. já continuam ativos até Esc.
   */
  ultimoComandoRepetivel: Ferramenta | null;
  activeLayer: string;
  blocoParaCarimbar: string | null;
  viewport: Viewport;
  /**
   * Iteração 12t -- zoom/pan da PÁGINA de cada Prancha, um estado PRÓPRIO
   * por Prancha (chave = `Prancha.id`), independente de `viewport` (que
   * pertence só ao Desenho). Antes os dois usavam o MESMO campo
   * `viewport`, então dar zoom no Desenho (pra desenhar com precisão)
   * também bagunçava o enquadramento das Pranchas -- relatado pelo
   * usuário: "quando eu aumento o zoom na tela de desenho a tela da
   * prancha diminue o zoom". Preenchido sob demanda por `CanvasStage.tsx`
   * (fit-to-page automático na 1ª vez que a Prancha é vista numa sessão,
   * dali em diante guarda o zoom/pan manual do usuário); nunca persistido
   * junto do projeto (mesmo precedente de `viewport`).
   */
  pranchaViewports: Record<string, Viewport>;
  /**
   * Iteração 29h -- bbox (mundo) de geometria recém-gerada por um dos
   * geradores automáticos ("Gerar diagrama fotovoltaico" / "Dimensionar
   * sistema no solo"), aguardando ser enquadrada na tela pelo
   * `useEffect` de `CanvasStage.tsx`. Motivo: um diagrama recém-gerado
   * podia nascer fora da área visível atual (zoom/pan não relacionados),
   * obrigando o usuário a procurar manualmente onde ele apareceu (bug
   * relatado: "ficou tao pequeno o diagrama que deu trabalho para
   * encontrar"). `null` quando não há enquadramento pendente. Setado por
   * `gerarDiagramaFotovoltaico`/`gerarSistemaSolo` (via `bboxCombinada` da
   * geometria recém-criada) e consumido/limpo pelo `useEffect` assim que
   * aplicado -- não é persistido junto do projeto (efêmero, como
   * `viewport`).
   */
  enquadramentoPendente: CaixaEnvolvente | null;
  gridSize: number;
  snapAtivo: boolean;
  /** Iteração 12s -- unidade de exibição/digitação (mm/cm/m); geometria continua em mm internamente, ver `lib/unidades.ts`. */
  unidadeDesenho: UnidadeDesenho;
  /**
   * Iteração 12s -- ORTHO (igual ao F8 do AutoCAD): trava o 2º+ ponto de
   * Linha/Polígono/Polilinha na horizontal/vertical em relação ao ponto
   * anterior, sem deixar o grid "torcer" a direção. Nasce DESLIGADO (ver
   * `orthoAtivo: false` no estado inicial) -- igual ao AutoCAD de
   * verdade, onde ORTHO é opt-in via F8, nunca o padrão. Nascer LIGADO
   * (bug corrigido na Iteração 20) travava toda linha nova em ângulo
   * reto sem o usuário ter pedido isso nem saber que o modo existia --
   * relatado como "o cursor do mouse não aplica a linha exatamente aonde
   * eu quero desenhar" ao tentar contornar uma rua em diagonal por cima
   * de uma imagem de referência (XREF), quando na real causa raiz era o
   * ORTHO forçando toda linha a sair reta.
   */
  orthoAtivo: boolean;
  activeSheet: FormatoFolha;
  /** Primeiro ponto já capturado de uma linha/círculo/mover/copiar em andamento. */
  pontoRascunho: Ponto | null;
  /** Posição atual do cursor (mundo, já com OSNAP/snap resolvido), para preview em tempo real. */
  ponteiroMundo: Ponto | null;
  /** Ponto de OSNAP ativo (vértice/ponto médio "grudado"), só para desenhar o indicador verde. */
  osnapAlvo: Ponto | null;
  /** Tipo do OSNAP ativo -- define o desenho do indicador (quadrado = endpoint, triângulo = midpoint). */
  osnapTipo: TipoOsnap | null;
  historicoComandos: string[];
  /** Ids selecionados (seleção múltipla: clique substitui, Shift+clique alterna). */
  selecionadoIds: string[];
  /** Vértices já cravados do polígono em construção (ferramenta "poligono"); null = nada em andamento. */
  poligonoPontos: Ponto[] | null;

  /**
   * Configuração ATIVA da ferramenta de hachura (Hatch Tool): tipo de
   * padrão, escala (espaçamento do ladrilho) e cor. É o que é aplicado
   * ao elemento clicado pela ferramenta "hachurar" -- ver
   * `lib/hachura.ts` para o motor de renderização do padrão.
   */
  activeHatch: HachuraTipo;
  hatchScale: number;
  hatchColor: string;

  /**
   * TRIM (Aparar): preview ao vivo, recalculado a cada mousemove --
   * qual ARESTA está sob o cursor (Iteração 40: qualquer geometria com
   * contorno reto -- "linha" solta OU uma aresta de "retangulo"/
   * "poligono"/"polilinha", identificada por `geometriaId` +
   * `indiceAresta` --, não só "linha" como antes; ver `lib/trim.ts`), em
   * quais sub-segmentos ela fica dividida pelas interseções com as
   * demais arestas visíveis, e qual desses segmentos está "em mira" (o
   * que seria removido num clique agora).
   */
  trimPreview: { geometriaId: string; indiceAresta: number; segmentos: SegmentoCorte[]; indiceAlvo: number } | null;

  /**
   * TRIM (Aparar) -- "quebra manual" (Iteração 39, igual ao BREAK do
   * AutoCAD). Pedido do usuário (verbatim): "estou tentando abrir uma
   * vao de porta em uma planta baixa com o comando de aparar e nao esta
   * funcionando" -- o Aparar de sempre só corta uma aresta nos pontos
   * onde ela CRUZA outra aresta (`segmentosDeCorte`), então uma parede
   * reta sem nenhuma linha cruzando (o caso normal de abrir um vão de
   * porta no meio de uma parede) não tinha como ser cortada. Este fluxo
   * é ADITIVO -- só entra em ação quando a aresta sob o cursor NÃO tem
   * nenhuma interseção (nada pra `aplicarTrim` de qualquer forma);
   * nunca muda o comportamento já existente de 1 clique corta no cruzamento.
   * Fluxo: 1º clique na aresta sem cruzamento arma `trimQuebraA` (ponto A,
   * já projetado ON a aresta); o preview ao vivo mostra o vão entre A e o
   * cursor (projetado na MESMA aresta); 2º clique confirma e substitui a
   * aresta original por até 2 pedaços (o que sobra de cada lado do vão).
   * Iteração 40: `linhaId` virou `geometriaId` + `indiceAresta`, mesma
   * generalização do `trimPreview` acima -- funciona em qualquer aresta
   * reta, não só numa "linha" solta.
   */
  trimQuebraA: { geometriaId: string; indiceAresta: number; t: number; ponto: Ponto } | null;
  /** Antes do 1º clique: aresta sob o cursor SEM nenhuma interseção (candidata a "abrir vão"), recalculado a cada mousemove -- alimenta o hover de destaque em `GeometryLayer.tsx`. */
  trimQuebraCandidata: { geometriaId: string; indiceAresta: number; t: number; ponto: Ponto } | null;
  /** Depois do 1º clique (`trimQuebraA` armado): ponto B ao vivo (projetado na MESMA aresta), pro preview do vão antes do 2º clique. */
  trimQuebraPreviewB: Ponto | null;

  /**
   * OFFSET (Deslocar): distância informada pelo usuário (mm) e a linha
   * alvo já selecionada (aguardando o clique que define o lado). Ambos
   * voltam a `null` ao trocar de ferramenta -- cada OFFSET começa do
   * zero (o comando "O" sempre repergunta a distância, como o fluxo
   * pedido).
   */
  offsetDistancia: number | null;
  offsetAlvoId: string | null;
  /**
   * Segmento (2 pontos) que será de fato deslocado -- resolvido no
   * momento do 1º clique (`selecionarAlvoOffset`), independente do TIPO
   * do objeto clicado: pra uma "linha" solta é o próprio x1/y1/x2/y2; pra
   * um "retangulo"/"poligono"/"polilinha" fechado é a ARESTA mais
   * próxima do clique (usuário: "o botao ofsset ou deslocar precisar
   * conseguir duplicar qualquer linha dos 4 cantos de um retangulo ou
   * quadrado fechado, atualmente ele só funciona em linhas soltas"). Ter
   * essa cópia resolvida aqui (em vez de `aplicarOffset` reler `g.tipo`)
   * é o que permite `aplicarOffset` continuar simples: sempre gera uma
   * NOVA "linha" paralela a este segmento, sem precisar saber de onde
   * ele veio.
   */
  offsetAlvoSegmento: SegmentoOffset | null;

  /**
   * Iteração 37 -- destaque ao vivo da linha/aresta que SERIA escolhida
   * se o usuário clicasse agora, recalculado a cada mousemove enquanto
   * `offsetAlvoId` ainda não foi definido (ver `CanvasStage.tsx` +
   * `lib/offset.ts#geometriaSobCursorOffset`). Pedido do usuário: "o
   * botao deslocar precisa mostrar que está ativo quando encostar por
   * cima da linha, faça ele selecionar a linha que vai ser duplicada
   * para o usuario ver que esta funcionando". Some (`null`) assim que o
   * 1º clique arma `offsetAlvoId` -- a partir daí quem mostra feedback
   * visual é o preview da linha paralela (`offsetAlvoSegmento` + ghost
   * em `GeometryLayer.tsx`), não mais este destaque de "candidato".
   */
  offsetHover: { id: string; segmento: SegmentoOffset } | null;

  /**
   * FILLET (Concordância): raio "lembrado" entre usos (como o AutoCAD
   * de fato faz -- só muda quando o usuário digita R + um novo valor),
   * a primeira linha já selecionada (aguardando a segunda) e um
   * sinalizador de que a linha de comando está esperando o número do
   * novo raio (depois de "R").
   */
  filletRaio: number;
  filletAlvo1Id: string | null;
  filletAguardandoRaio: boolean;

  /**
   * Calibração de imagem por referência (Scale by Reference), estilo o
   * comando SCALE/Reference do AutoCAD. `calibrationMode` é o sinalizador
   * de que a ferramenta "calibrar" está com um XREF-alvo armado;
   * `calibXrefId` guarda qual XREF está sendo calibrado; `calibPoint1`/
   * `calibPoint2` são os dois pontos clicados pelo usuário (em
   * coordenadas de mundo, sem snap de grid/OSNAP -- o usuário está
   * medindo feições da imagem, não do grid de desenho).
   */
  calibrationMode: boolean;
  calibXrefId: string | null;
  calibPoint1: Ponto | null;
  calibPoint2: Ponto | null;

  /**
   * Seleção por caixa (Window vs. Crossing Select): os dois cantos
   * (mundo) do retângulo sendo arrastado agora. `null` quando não há
   * arraste em andamento. O sentido do arraste (inicio.x <= atual.x =
   * Window; senão Crossing) é decidido em `confirmarSelecaoBox`.
   */
  selecaoBox: { inicio: Ponto; atual: Ponto } | null;

  /** Posição da régua de ferramentas (TOP/LEFT/RIGHT), configurável no painel de Configurações. */
  toolbarPosicao: PosicaoToolbar;

  /**
   * Tamanho de fonte (mm de mundo) usado para o PRÓXIMO texto inserido --
   * "lembrado" entre usos, no mesmo espírito do `filletRaio`. Editável na
   * barra de propriedades mesmo sem nada selecionado.
   */
  textoFontSizeAtivo: number;

  /**
   * COTA (Dimension/Ruler): 1º e 2º clique (pontos medidos). O 3º clique
   * (posição da linha de cota) não precisa de estado próprio -- é
   * consumido na hora por `confirmarCota`.
   */
  cotaP1: Ponto | null;
  cotaP2: Ponto | null;

  /**
   * Undo/Redo: pilhas de snapshots do array de geometria. `past` guarda
   * o estado ANTES de cada mutação (adicionar/mover/copiar/apagar/trim/
   * offset/fillet/stretch); `future` só é preenchido por `desfazer` (e
   * limpo por qualquer mutação nova, como em qualquer editor real -- não
   * dá pra "refazer" depois de uma ação diferente ter acontecido).
   * Limitado a `HISTORICO_MAX` entradas para não crescer sem limite numa
   * sessão de desenho longa.
   */
  past: Geometria[][];
  future: Geometria[][];

  /**
   * Grip em arrasto (STRETCH): qual elemento e qual índice de vértice
   * (ver `lib/grips.ts`) está sendo editado agora. `null` = nenhum grip
   * ativo. Só é setado por `iniciarStretch` (clique num grip) e
   * consumido por `aplicarStretch` (próximo clique no canvas confirma).
   *
   * `modo` (Iteração 22, pedido do usuário -- "no autocad tambem tenho a
   * opcao no centro das linhas dos quadrados ou retangulos"): distingue um
   * grip de CANTO (`"vertice"`, o comportamento de sempre desde a
   * Iteração 7 -- `indice` é o índice do vértice, mexe nas duas dimensões)
   * de um grip de MEIO-DE-ARESTA (`"aresta"`, novo -- `indice` é o índice
   * do SEGMENTO de `GripIntermediario`, mexe só na dimensão perpendicular
   * à aresta, ver `aplicarStretchArestaNaGeometria`). Omitido/`undefined`
   * equivale a `"vertice"`, preservando o único call site pré-existente.
   */
  gripAlvo: { id: string; indice: number; modo?: "vertice" | "aresta" } | null;

  /** Vértices já cravados da polilinha em construção (ferramenta "polilinha", comando PL); null = nada em andamento. */
  polilinhaPontos: Ponto[] | null;

  /**
   * Viewport em "Model Ativo" (Sprint 5): id do elemento `tipo: "viewport"`
   * que está com o foco de pan/zoom, ou `null` quando o foco está na
   * prancha (Paper Space) normal. Setado por duplo clique dentro/fora de
   * um retângulo de viewport (ver `CanvasStage.tsx#handleDblClick`). Só
   * redireciona a roda do mouse (zoom) e o arraste de pan -- as
   * ferramentas de desenho continuam sempre operando no sistema de
   * coordenadas principal do Stage, independente deste estado (ver
   * comentário de escopo em `ViewportGeometria`, types.ts).
   */
  viewportAtivoId: string | null;

  /**
   * Prancha (Layout) ativa -- Iteração 12e. `null` = editando o Desenho
   * (Model Space: `projeto.geometria`, comportamento de sempre, ferramentas
   * de desenho todas ativas). Um id válido = visualizando aquela
   * `Prancha`: as ferramentas de desenho ficam desativadas (só
   * Selecionar/Zoom Window/pan), o Stage mostra a moldura+carimbo da
   * prancha e espelha `projeto.geometria` somente-leitura através da
   * câmera própria dela (`Prancha.viewport`) -- ver `CanvasStage.tsx`.
   * Estado de UI efêmero (como `selecionadoIds`), não persistido -- ao
   * reabrir um projeto salvo, pousa na 1ª prancha se houver alguma, senão
   * no Desenho (ver `carregarProjeto`).
   */
  prenchaAtivaId: string | null;

  /**
   * Viewport de PRANCHA selecionado (Iteração 12g) -- clique num
   * retângulo de `Prancha.viewports` enquanto `prenchaAtivaId` está
   * setado. Estado próprio (não reaproveita `selecionadoIds`, que só
   * endereça `projeto.geometria`) porque a interação de um Viewport de
   * Prancha é mais simples (mover/redimensionar por `draggable`
   * nativo do Konva, sem grips/stretch genéricos) -- ver
   * `PranchaLayer.tsx`. `null` quando nenhum está selecionado.
   */
  viewportPranchaSelecionadoId: string | null;

  /**
   * XREF selecionado no Desenho (Iteração 12u): pedido do usuário --
   * "nao consigo selecionar e mover uma imagem que importei, [...] ela
   * preciza ter um retangulo em volta que mostre a quina quando eu for
   * mover ela, assim como no autocad". Estado próprio (não reaproveita
   * `selecionadoIds`, que só endereça `projeto.geometria` -- um XREF vive
   * em `projeto.xrefs`, uma lista separada), mesmo espírito de
   * `viewportPranchaSelecionadoId`: clique seleciona, um retângulo azul
   * com "quinas" (grips de canto) aparece em volta, arrastar o corpo move
   * (`draggable` nativo do Konva) e arrastar um canto redimensiona
   * (escala uniforme, já que `XRef.escala` é um único fator pros dois
   * eixos) -- ver `XrefLayer.tsx`. `null` quando nenhum está selecionado.
   */
  xrefSelecionadoId: string | null;

  /**
   * Área de transferência (Ctrl+C/Ctrl+V, Iteração 12c): cópia "congelada"
   * (deep clone, sem alias com `projeto.geometria`) dos elementos
   * selecionados no momento do Ctrl+C -- ver `copiarSelecaoParaAreaDeTransferencia`/
   * `colarAreaDeTransferencia`. Fica vazia por padrão; sobrevive a trocas
   * de ferramenta/seleção (só muda com um novo Ctrl+C), mas não é
   * persistida no projeto salvo (só em memória, como `selecionadoIds`).
   */
  areaTransferencia: Geometria[];

  // Ações -----------------------------------------------------------
  setFerramenta: (f: Ferramenta) => void;
  armarCarimbo: (blocoId: string) => void;
  setActiveLayer: (nome: string) => void;
  addGeometria: (g: NovaGeometria) => void;
  removeGeometria: (id: string) => void;
  moverGeometria: (ids: string[], dx: number, dy: number) => void;
  copiarGeometria: (ids: string[], dx: number, dy: number) => void;
  apagarSelecionados: () => void;
  selecionarUnico: (id: string) => void;
  alternarSelecao: (id: string) => void;
  limparSelecao: () => void;
  setViewport: (v: Partial<Viewport>) => void;
  /** Iteração 12t -- atualiza o zoom/pan de PÁGINA de UMA Prancha específica (`pranchaViewports[pranchaId]`), sem afetar `viewport` (Desenho) nem a página de qualquer outra Prancha. */
  setPranchaViewport: (pranchaId: string, v: Partial<Viewport>) => void;
  /** Iteração 29h -- limpa `enquadramentoPendente` depois que `CanvasStage.tsx` aplica o enquadramento automático (ou decide que não há o que enquadrar). */
  limparEnquadramentoPendente: () => void;
  setGridSize: (n: number) => void;
  toggleSnap: () => void;
  setUnidadeDesenho: (u: UnidadeDesenho) => void;
  toggleOrtho: () => void;
  setActiveSheet: (f: FormatoFolha) => void;
  setPontoRascunho: (p: Ponto | null) => void;
  setPonteiroMundo: (p: Ponto | null) => void;
  setOsnapAlvo: (p: Ponto | null, tipo?: TipoOsnap | null) => void;
  cancelarDesenho: () => void;
  addXref: (x: Omit<XRef, "id">) => string;
  removeXref: (id: string) => void;
  updateXref: (id: string, patch: Partial<XRef>) => void;
  /** Iteração 12u -- ver `xrefSelecionadoId`. */
  selecionarXref: (id: string | null) => void;
  setNomeProjeto: (nome: string) => void;
  pushComando: (linha: string) => void;
  carregarProjeto: (p: Projeto) => void;
  novoProjeto: () => void;
  garantirIdProjeto: () => void;

  // Camadas -----------------------------------------------------------
  criarCamada: (nome: string, cor?: string) => void;
  alternarVisibilidadeCamada: (nome: string) => void;
  atualizarCamada: (nome: string, patch: Partial<Omit<Camada, "nome">>) => void;
  removerCamada: (nome: string) => void;

  // Calibração de XREF (Scale by Reference) ----------------------------
  iniciarCalibracao: (xrefId: string) => void;
  registrarPontoCalibracao: (p: Ponto) => void;
  confirmarCalibracao: (distanciaRealMetros: number) => { ok: boolean; erro?: string };
  cancelarCalibracao: () => void;

  // Polígono (multi-clique + Enter fecha) ------------------------------
  adicionarPontoPoligono: (p: Ponto) => void;
  fecharPoligono: () => { ok: boolean };

  // Hachura (Hatch Tool) ------------------------------------------------
  setActiveHatch: (t: HachuraTipo) => void;
  setHatchScale: (n: number) => void;
  setHatchColor: (c: string) => void;
  /** Clique único (ferramenta "hachurar"): aplica a config ativa, ou remove se o elemento já tiver hachura. */
  alternarHachura: (id: string) => void;
  /** Via linha de comando com seleção prévia: aplica a config ativa a todos os ids que forem retângulo/polígono/círculo. */
  aplicarHachuraSelecionados: (ids: string[]) => number;
  /** Painel de propriedades: edita tipo/escala/cor da hachura de um único objeto já hachurado (não mexe na geometria). */
  atualizarHachuraObjeto: (id: string, patch: Partial<HachuraConfig>) => void;

  // TRIM (Aparar) --------------------------------------------------------
  setTrimPreview: (p: CadState["trimPreview"]) => void;
  aplicarTrim: () => { ok: boolean; erro?: string };

  // TRIM (Aparar) -- quebra manual / abrir vão (Iteração 39, ver `trimQuebraA`) --
  iniciarQuebraTrim: (geometriaId: string, indiceAresta: number, t: number, ponto: Ponto) => void;
  cancelarQuebraTrim: () => void;
  aplicarQuebraTrim: (pontoB: Ponto) => { ok: boolean; erro?: string };
  setTrimQuebraCandidata: (c: CadState["trimQuebraCandidata"]) => void;
  setTrimQuebraPreviewB: (p: Ponto | null) => void;

  // OFFSET (Deslocar) ------------------------------------------------------
  setOffsetDistancia: (n: number) => void;
  /** Recalculado a cada mousemove ANTES do 1º clique -- ver `offsetHover`. */
  setOffsetHover: (h: CadState["offsetHover"]) => void;
  /** `ponto` (clique original, coordenadas de mundo) decide QUAL aresta usar quando `id` é um retângulo/polígono/polilinha fechado (ver `offsetAlvoSegmento`). */
  selecionarAlvoOffset: (id: string, ponto: Ponto) => void;
  aplicarOffset: (ponto: Ponto) => { ok: boolean; erro?: string };

  // FILLET (Concordância) ---------------------------------------------------
  setFilletRaio: (n: number) => void;
  setFilletAguardandoRaio: (b: boolean) => void;
  selecionarAlvo1Fillet: (id: string) => void;
  aplicarFillet: (id2: string) => { ok: boolean; erro?: string };

  // Seleção por caixa (Window/Crossing Select) --------------------------------
  setSelecaoBox: (b: CadState["selecaoBox"]) => void;
  /** Confirma o arraste em andamento: decide Window/Crossing pelo sentido, computa a seleção e limpa `selecaoBox`. */
  confirmarSelecaoBox: (aditivo: boolean) => void;

  // Régua de ferramentas reposicionável --------------------------------------
  setToolbarPosicao: (p: PosicaoToolbar) => void;

  // Texto -----------------------------------------------------------------
  setTextoFontSizeAtivo: (n: number) => void;
  /** Edita conteúdo/tamanho/rotação de um elemento "texto" já existente (barra de propriedades). */
  atualizarTexto: (id: string, patch: Partial<Pick<TextoGeometria, "conteudo" | "fontSize" | "rotacao">>) => void;

  // COTA (Dimension/Ruler) ---------------------------------------------------
  /** Registra o 1º e o 2º clique (pontos medidos); sem efeito depois que ambos já estão setados. */
  registrarPontoCota: (p: Ponto) => void;
  /** 3º clique: posiciona a linha de cota e insere o elemento "cota" definitivo. */
  confirmarCota: (p3: Ponto) => { ok: boolean; erro?: string };

  // Undo/Redo -----------------------------------------------------------
  desfazer: () => void;
  refazer: () => void;

  // Grips & Stretch -------------------------------------------------------
  /**
   * Clique num grip azul: arma o vértice/aresta `indice` do elemento `id`
   * para arrasto. `modo` (Iteração 22) diferencia grip de canto
   * (`"vertice"`, padrão) de grip de meio-de-aresta (`"aresta"`).
   */
  iniciarStretch: (id: string, indice: number, modo?: "vertice" | "aresta") => void;
  /** Próximo clique no canvas: confirma o novo ponto do vértice/aresta em arrasto. */
  aplicarStretch: (ponto: Ponto) => { ok: boolean };
  cancelarStretch: () => void;

  // Polilinha (PLINE aberta, multi-clique + Enter fecha) -------------------
  adicionarPontoPolilinha: (p: Ponto) => void;
  fecharPolilinha: () => { ok: boolean };

  // Carimbo / legenda ABNT (Sprint 2) --------------------------------------
  /** Atualiza qualquer subconjunto dos campos de texto/visibilidade do carimbo. */
  atualizarCarimbo: (patch: Partial<Omit<Carimbo, "logoDataUrl" | "assinaturaDataUrl">>) => void;
  /** `null` remove o logo. */
  setLogoCarimbo: (dataUrl: string | null) => void;
  /** Iteração 19: `null` remove a assinatura -- mesmo padrão de `setLogoCarimbo`. */
  setAssinaturaCarimbo: (dataUrl: string | null) => void;

  // Rotação/Escala de blocos + rotação de texto (Sprint 3) -------------------
  /** Edita rotação/escala de um bloco já existente (barra de propriedades) -- ao vivo, sem entrar no histórico (mesmo espírito de `atualizarTexto`). */
  atualizarBloco: (id: string, patch: Partial<Pick<BlocoGeometria, "rotacao" | "escalaX" | "escalaY">>) => void;
  /**
   * Gira TODOS os elementos selecionados (delta em graus) em volta do
   * centro da bounding box combinada da seleção -- equivalente ao ROTATE
   * do AutoCAD com múltiplos objetos e ponto-base = centro da seleção.
   * Blocos/textos também somam o delta ao próprio ângulo (giram "no
   * lugar" além de orbitar). Ação discreta (entra no histórico de undo).
   */
  girarSelecao: (anguloGraus: number) => { ok: boolean };
  /**
   * Escala TODOS os elementos selecionados por `fatorX`/`fatorY` em
   * volta do centro da bounding box combinada da seleção -- equivalente
   * ao SCALE do AutoCAD com múltiplos objetos e ponto-base = centro da
   * seleção. Passar `fatorX === fatorY` dá uma escala PROPORCIONAL
   * (uniforme, ex.: 2 dobra, 0.5 reduz pela metade); valores diferentes
   * esticam/comprimem cada eixo de forma independente -- opção
   * "Proporcional (automático)" do painel decide qual dos dois modos a
   * UI oferece (ver `PropertiesPanel.tsx`). Blocos também multiplicam a
   * própria `escalaX`/`escalaY` (cada eixo com seu próprio fator, já que
   * o bloco já suporta escala não-uniforme desde a Sprint 3); círculos,
   * arcos e textos não têm um "eixo X" e "eixo Y" de tamanho separados
   * (raio/fontSize são escalares) -- usam a média de `fatorX`/`fatorY`
   * pra crescer/encolher de forma consistente mesmo numa escala não-
   * uniforme (não criam uma elipse, que este app não modela). Ação
   * discreta (entra no histórico de undo). `fatorX`/`fatorY` precisam
   * ser finitos e > 0 (SCALE não espelha); um no-op (ambos === 1) não
   * gera uma entrada de undo.
   */
  escalarSelecao: (fatorX: number, fatorY: number) => { ok: boolean };
  /**
   * Iteração 17: reatribui a CAMADA de todos os elementos selecionados de
   * uma vez -- até aqui, a única forma de mudar a camada de algo já
   * desenhado era apagar e redesenhar com outra `activeLayer` ativa (a
   * camada só era gravada na CRIAÇÃO do elemento, nunca editável depois).
   * Equivalente ao dropdown de camada da barra de propriedades do
   * AutoCAD com uma seleção ativa. Funciona com 1 ou vários elementos de
   * qualquer tipo (todo `Geometria` tem `camada`) e com QUALQUER camada
   * existente no projeto, mesmo que não seja a `activeLayer` atual. Ação
   * discreta (entra no histórico de undo); nome de camada inexistente ou
   * seleção vazia não faz nada.
   */
  atualizarCamadaSelecao: (nomeCamada: string) => void;
  /**
   * Preview AO VIVO da Escala (Iteração 12p): enquanto o usuário digita
   * um fator no painel de propriedades (antes de clicar "Aplicar"), a
   * geometria de verdade (`projeto.geometria`) NÃO é tocada -- só este
   * campo é atualizado, e é a camada de renderização (`GeometryLayer`)
   * que calcula, na hora de desenhar, como cada elemento selecionado
   * ficaria com esse fator (usando a mesma `escalarGeometria` de
   * `escalarSelecao`, mas sem mutar o store nem entrar no histórico de
   * undo). `null` = nenhum preview ativo (renderiza a geometria real,
   * sem transformação nenhuma).
   */
  escalaPreview: { fatorX: number; fatorY: number } | null;
  setEscalaPreview: (p: { fatorX: number; fatorY: number } | null) => void;

  // Edição de vértices de polígono/retângulo fechado (Sprint 3) --------------
  /**
   * Insere um vértice novo no meio do segmento `indiceSegmento` (ver
   * `GripIntermediario` em `lib/grips.ts`). Um retângulo é promovido a
   * polígono na hora (deixa de ser eixo-alinhado a partir daí -- ver
   * `promoverRetanguloParaPoligono`).
   */
  inserirVerticeNoMeio: (id: string, indiceSegmento: number) => { ok: boolean; erro?: string };
  /** Remove o vértice `indice`. Recusa (erro) se isso deixasse a forma com menos vértices que o mínimo (3 num polígono fechado, 2 numa polilinha). */
  removerVertice: (id: string, indice: number) => { ok: boolean; erro?: string };
  /** Menu de contexto (botão direito) de um grip de vértice -- `x`/`y` em coordenadas de TELA (client), para posicionar o menu flutuante. */
  menuVerticeContexto: { id: string; indice: number; x: number; y: number } | null;
  abrirMenuVertice: (id: string, indice: number, x: number, y: number) => void;
  fecharMenuVertice: () => void;

  // Autenticação + Gerenciador de Projetos na nuvem (Sprint 3) ---------------
  /** Usuário logado (mock local ou Firebase Auth de verdade -- ver `lib/auth.ts`); `null` = ninguém logado. */
  usuario: { uid: string; email: string } | null;
  setUsuario: (u: { uid: string; email: string } | null) => void;
  /** Lista (resumo) dos projetos salvos do usuário logado -- alimenta o Gerenciador de Projetos. */
  projetosSalvos: ProjetoResumo[];
  setProjetosSalvos: (lista: ProjetoResumo[]) => void;
  /**
   * Controle do modal "Meus Projetos" (Iteração 34 -- pedido do usuário:
   * "precisamos de um modal para abrir projetos salvos igual do autocad
   * que tem a opcao de criar novo ou abrir um existente"). Fica no store
   * (em vez de estado local só do botão da Toolbar) porque agora TAMBÉM
   * abre sozinho ao carregar o app (ver `Editor.tsx`), então precisa ser
   * controlado de mais de um lugar (o botão "📁 Meus Projetos" da
   * `AuthPanel` e o efeito de montagem do `Editor`).
   */
  gerenciadorProjetosAberto: boolean;
  abrirGerenciadorProjetos: () => void;
  fecharGerenciadorProjetos: () => void;

  // Padrão de Entrada/Concessionária (leva não-numerada) ----------------------
  /**
   * Insere, num único passo de undo, o conjunto vetorial completo do
   * "Padrão de Entrada": poste + linha de ramal + caixa de medidor + 2
   * textos editáveis (tipo de ramal e cota de afastamento). `posteXY` e
   * `medidorXY` são o 1º e o 2º clique da ferramenta "concessionaria"
   * (ver `CanvasStage.tsx`).
   */
  inserirPadraoConcessionaria: (posteXY: Ponto, medidorXY: Ponto) => void;

  // Gerador de diagrama unifilar fotovoltaico (Iteração 12b; reformulado
  // na Iteração 13 -- botão + modal estruturado, ver `DiagramaFvModal.tsx`,
  // substituindo por completo o antigo comando GERAR_PROJETO_FV da IA) ------
  /**
   * Insere, num único passo de undo, o diagrama unifilar fotovoltaico
   * completo (rede BT -> medição -> distribuição -> proteção CA -> N
   * inversores lado a lado, cada um com sua proteção CC + colunas de
   * MPPT/módulos) calculado por `lib/diagramaFv.ts#construirGeometriaDiagramaFv`.
   * Ancorado automaticamente no canto superior-esquerdo útil da folha
   * ativa (dentro das margens ABNT) -- `DiagramaFvModal.tsx` só fornece os
   * DADOS do projeto, não coordenadas. Devolve o retângulo (mm de mundo)
   * reservado ao quadro "Padrão de Entrada Representativo", pra quem
   * chamou poder encaixar ali a foto real do padrão, se o usuário anexou
   * uma no modal.
   */
  gerarDiagramaFotovoltaico: (dados: DadosDiagramaFv) => { boxPadraoEntradaRepresentativo: RetanguloMm };

  // Gerador de sistema fotovoltaico no solo (Iteração 29) --------------------
  /**
   * Insere, num único passo de undo, o leiaute 2D completo (contorno do
   * terreno + fileiras de módulos + lastros + seta norte + resumo)
   * calculado por `lib/sistemaSolo.ts#gerarLeiauteSistemaSolo`. Cria as
   * camadas dedicadas (TERRENO/MODULOS_FV/LASTROS/ANOTACOES_SOLO) se
   * ainda não existirem no projeto. Ancorado com o canto superior-
   * esquerdo do terreno em (0,0) do MUNDO (`SistemaSoloModal.tsx` não
   * fornece coordenadas, só os dados do terreno/painel/lastro). Devolve o
   * resumo (nº de fileiras/módulos, potência total, afastamento e ângulo
   * usados) pro modal poder mostrar pro usuário depois de gerar. Lança
   * `Error` (repassado de `gerarLeiauteSistemaSolo`) se os parâmetros não
   * permitirem nenhuma fileira/módulo -- quem chama deve tratar com
   * try/catch (mesmo padrão de validação do `DiagramaFvModal.tsx`, só que
   * a validação geométrica aqui só é conhecida depois de calcular).
   */
  gerarSistemaSolo: (dados: DadosSistemaSolo) => ResumoSistemaSolo;
  /** Iteração 30 -- gerador de dimensionamento de cargas elétricas (NBR 5410), ver `lib/cargasEletricas.ts`. */
  gerarDimensionamentoCargas: (dados: DadosCargasEletricas) => ResumoCargasEletricas;

  /**
   * Iteração 35 -- lançamento automático de tomadas/interruptores/
   * iluminação (NBR 5410) a partir da planta baixa já desenhada. Recebe
   * os ids da SELEÇÃO atual (a "casa" -- paredes + textos de nome de
   * ambiente); `ferramenta`/UI gate o botão em `selecionadoIds.length > 0`,
   * ver `LancamentoEletricoButton.tsx`. Nunca lança geometria nova se
   * houver QUALQUER problema (cômodo aberto/mesclado/sem nome) -- devolve
   * a lista de problemas pro usuário corrigir e clicar de novo (ver
   * `lib/roomDetection.ts` para o porquê dessa política "tudo ou nada":
   * gerar parcialmente, com alguns cômodos silenciosamente pulados, seria
   * exatamente o tipo de "informação errada" que o usuário pediu pra
   * evitar).
   */
  gerarLancamentoEletrico: (idsSelecionados: string[]) => {
    ok: boolean;
    resumo: ResumoLancamentoEletrico | null;
    problemas: ProblemaComodo[];
  };

  // Viewport / MVIEW + ZOOM WINDOW (Sprint 5) --------------------------------
  /** Entra ("Model Ativo") ou sai (`null`) do foco de pan/zoom de um viewport -- ver `viewportAtivoId`. */
  setViewportAtivo: (id: string | null) => void;
  /** Edita campos de um viewport já existente (escala/pan da câmera local, borda) -- ao vivo, sem entrar no histórico (mesmo espírito de `atualizarBloco`/`atualizarTexto`). */
  atualizarViewport: (
    id: string,
    patch: Partial<Pick<ViewportGeometria, "modelScale" | "modelOffsetX" | "modelOffsetY" | "bordaVisivel">>
  ) => void;

  // Pranchas / Layouts (Iteração 12e; múltiplas viewports + orientação, 12g) ---
  /** Cria uma Prancha nova no formato dado, já com 1 Viewport enquadrando o Desenho existente, e a torna ativa. Devolve o id criado. */
  criarPrancha: (formato: FormatoFolha) => string;
  /** Troca a página ativa -- `null` volta pro Desenho (Model Space). */
  selecionarPrancha: (id: string | null) => void;
  /** Remove uma Prancha (não afeta `projeto.geometria` -- ela nunca teve elementos próprios). Se era a ativa, cai pra outra prancha restante ou pro Desenho. */
  removerPrancha: (id: string) => void;
  renomearPrancha: (id: string, nome: string) => void;
  /** Muda o formato ABNT de uma prancha já existente (não recalcula as câmeras dos viewports automaticamente -- o usuário reenquadra com Zoom Window se precisar). */
  redefinirFormatoPrancha: (id: string, formato: FormatoFolha) => void;
  /** Muda a orientação (paisagem/retrato) de uma prancha -- "quero ter a opcao de folha em pe tambem" (Iteração 12g). */
  redefinirOrientacaoPrancha: (id: string, orientacao: "paisagem" | "retrato") => void;
  /** Insere um novo Viewport (MV) na Prancha indicada -- ferramenta "viewport" com uma Prancha ativa (Iteração 12g, "preciso do botao viewport dentro da prancha"). Devolve o id criado. */
  adicionarViewportPrancha: (pranchaId: string, x: number, y: number, largura: number, altura: number) => string;
  /** Edita (patch) um Viewport específico de uma Prancha -- câmera local (pan/zoom/Zoom Window), geometria (mover/redimensionar o retângulo) ou bordaVisivel. Ao vivo, sem entrar no histórico de undo (mesmo espírito de `atualizarViewport`). */
  atualizarViewportDaPrancha: (pranchaId: string, viewportId: string, patch: Partial<ViewportGeometria>) => void;
  /** Remove um Viewport de uma Prancha. */
  removerViewportDaPrancha: (pranchaId: string, viewportId: string) => void;
  /** Seleciona (clique) ou limpa (`null`) o Viewport de Prancha em foco -- ver `viewportPranchaSelecionadoId`. */
  selecionarViewportPrancha: (id: string | null) => void;
  /** Recalcula a câmera de um Viewport de Prancha pra enquadrar todo o Desenho atual (mesmo cálculo de um viewport recém-criado) -- botão "Auto-ajuste" (Iteração 12g). */
  autoAjustarViewportPrancha: (pranchaId: string, viewportId: string) => void;

  // Área de transferência / Ctrl+C+Ctrl+V (Iteração 12c) -----------------------
  /**
   * Ctrl+C: guarda uma cópia congelada dos elementos selecionados em
   * `areaTransferencia`. Também tenta gravar no clipboard de VERDADE do
   * sistema operacional (`navigator.clipboard`, best-effort -- funciona só
   * em contexto seguro/com permissão) como texto JSON, o que permite
   * colar entre abas/janelas diferentes deste mesmo app.
   */
  copiarSelecaoParaAreaDeTransferencia: () => void;
  /**
   * Ctrl+V: cola os elementos de `areaTransferencia` (ou, se não houver
   * nada copiado internamente ainda mas o clipboard do sistema tiver um
   * JSON reconhecível colado de outra aba, esses) como cópias novas
   * (ids novos), deslocadas para que o centro do grupo colado caia em
   * `pontoDestino` (posição atual do cursor) -- se não houver ponto (ex.:
   * cursor fora do canvas), usa um deslocamento fixo em diagonal, como o
   * "paste offset" do AutoCAD, pra cada Ctrl+V sucessivo não empilhar tudo
   * exatamente em cima do original.
   */
  colarAreaDeTransferencia: (pontoDestino?: Ponto | null) => void;
  /**
   * Cola texto vindo de FORA deste app (ex.: copiado do AutoCAD, do
   * Windows/bloco de notas, de uma planilha) que não é um JSON reconhecido
   * de `areaTransferencia` -- não há como reconstruir entidades CAD reais
   * a partir do clipboard proprietário do AutoCAD (não é exposto a
   * páginas web), então o texto colado vira um elemento "texto" normal na
   * camada ativa, no ponto informado, editável dali em diante como
   * qualquer texto do desenho.
   */
  colarTextoExterno: (texto: string, ponto: Ponto) => void;
}

// IMPORTANTE: o id do projeto não pode ser gerado aqui (module/estado
// inicial), porque este arquivo roda tanto no primeiro render no
// servidor (Next.js pré-renderiza componentes "use client" para o HTML
// inicial) quanto no cliente durante a hidratação -- um uuidv4()
// aleatório em cada lado causaria um mismatch de hidratação. Por isso o
// projeto nasce com id vazio e o id real só é sorteado depois de montado
// no navegador (ver `garantirIdProjeto`, chamado pelo <Editor/>).
/**
 * Iteração 27: preenche `responsavel`/`crea`/`logoDataUrl`/`assinaturaDataUrl`
 * a partir do perfil técnico salvo (`perfilTecnico.ts`) -- SÓ nos campos
 * que ainda estão vazios/ausentes no carimbo recebido, nunca sobrescrevendo
 * um valor que já exista (ex.: um projeto salvo/carregado que já tem seus
 * próprios dados de responsável). Chamado só no cliente (`garantirIdProjeto`,
 * `novoProjeto`), nunca em `projetoVazio()` (que roda também no servidor --
 * ver comentário grande logo abaixo sobre o id do projeto).
 */
function aplicarPerfilTecnicoNoCarimbo(carimbo: Carimbo): Carimbo {
  const perfil: PerfilResponsavelTecnico | null = carregarPerfilTecnicoSalvo();
  if (!perfil) return carimbo;
  const responsavel = carimbo.responsavel ? carimbo.responsavel : (perfil.responsavel ?? carimbo.responsavel);
  const crea = carimbo.crea ? carimbo.crea : (perfil.crea ?? carimbo.crea);
  const logoDataUrl = carimbo.logoDataUrl ?? perfil.logoDataUrl;
  const assinaturaDataUrl = carimbo.assinaturaDataUrl ?? perfil.assinaturaDataUrl;
  // Só cria um objeto novo (nova referência) se algum campo de fato mudou --
  // evita disparar re-render/`set()` desnecessário quando o carimbo já
  // tinha tudo preenchido (ex.: projeto salvo restaurado antes deste efeito).
  if (
    responsavel === carimbo.responsavel &&
    crea === carimbo.crea &&
    logoDataUrl === carimbo.logoDataUrl &&
    assinaturaDataUrl === carimbo.assinaturaDataUrl
  ) {
    return carimbo;
  }
  return { ...carimbo, responsavel, crea, logoDataUrl, assinaturaDataUrl };
}

function projetoVazio(): Projeto {
  return {
    id_projeto: "",
    nome: "Diagrama Unifilar Sem Título",
    xrefs: [],
    geometria: [],
    camadas: camadasIniciais(),
    carimbo: carimboVazio(),
    pranchas: [],
  };
}

/**
 * Cria o Viewport (MV) inicial de uma prancha nova -- Iteração 12e,
 * generalizado pra `ViewportGeometria` completo na 12g (múltiplas
 * viewports por prancha). Cobre a área útil inteira do formato (dentro
 * da margem ABNT, já considerando `orientacao`) e, se já existir
 * geometria no Desenho, enquadra a bounding box inteira dela (com ~10%
 * de folga), centralizada -- começa cada prancha nova já mostrando
 * alguma coisa em vez de abrir "vazia" só por causa de onde a câmera
 * nasceu. Sem geometria ainda: cai no mesmo fallback do Desenho -- mundo
 * (0,0) centralizado na área útil, escala 1:1.
 */
/**
 * Calcula a câmera (`modelScale`/`modelOffsetX/Y`) que enquadra a
 * bounding box inteira de `geometria` dentro de uma janela de
 * `larguraJanela` x `alturaJanela` mm de papel (com ~10% de folga),
 * centralizada -- núcleo compartilhado por `criarViewportInicialPrancha`
 * (viewport novo) e `autoAjustarViewportPrancha` (botão "Auto-ajuste" num
 * viewport já existente, Iteração 12g -- "quero... o auto ajuste").
 * Sem geometria: cai no fallback de mundo (0,0) centralizado na janela,
 * escala 1:1.
 */
function calcularCameraAjustada(larguraJanela: number, alturaJanela: number, geometria: Geometria[]) {
  if (geometria.length === 0) {
    return { modelScale: 1, modelOffsetX: -larguraJanela / 2, modelOffsetY: -alturaJanela / 2 };
  }
  const bbox = geometria.reduce(
    (acc, g) => {
      const b = caixaEnvolvente(g);
      return {
        minX: Math.min(acc.minX, b.minX),
        minY: Math.min(acc.minY, b.minY),
        maxX: Math.max(acc.maxX, b.maxX),
        maxY: Math.max(acc.maxY, b.maxY),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
  const larguraDesenho = Math.max(1, bbox.maxX - bbox.minX);
  const alturaDesenho = Math.max(1, bbox.maxY - bbox.minY);
  // modelScale = mm de MUNDO por mm de PAPEL (mesma convenção de
  // ViewportGeometria/"Model Ativo") -- maior modelScale = mais mundo
  // cabendo na mesma área de papel = mais afastado. 1.1x de folga pra o
  // desenho não encostar exatamente na margem.
  const modelScale = Math.max(larguraDesenho / larguraJanela, alturaDesenho / alturaJanela, 0.001) * 1.1;
  return {
    modelScale,
    modelOffsetX: bbox.minX - (larguraJanela * modelScale - larguraDesenho) / 2,
    modelOffsetY: bbox.minY - (alturaJanela * modelScale - alturaDesenho) / 2,
  };
}

function criarViewportInicialPrancha(
  formato: FormatoFolha,
  orientacao: "paisagem" | "retrato" | undefined,
  geometria: Geometria[]
): ViewportGeometria {
  const folha = dimensoesFolhaOrientada(formato, orientacao);
  const utilX = -folha.largura / 2 + MARGENS_ABNT.esquerda;
  const utilY = -folha.altura / 2 + MARGENS_ABNT.superior;
  const larguraUtil = folha.largura - MARGENS_ABNT.esquerda - MARGENS_ABNT.direita;
  const alturaUtil = folha.altura - MARGENS_ABNT.superior - MARGENS_ABNT.inferior;

  const base = { id: uuidv4(), tipo: "viewport" as const, camada: "0", x: utilX, y: utilY, largura: larguraUtil, altura: alturaUtil, bordaVisivel: true };
  return { ...base, ...calcularCameraAjustada(larguraUtil, alturaUtil, geometria) };
}

/**
 * Migra uma Prancha salva em formato ANTERIOR (Iteração 12e: 1 câmera
 * única em `viewport` + carimbo próprio em `carimbo`) pro formato atual
 * (Iteração 12g: lista `viewports` + carimbo sempre compartilhado em
 * `projeto.carimbo`, ver `carregarProjeto`). Uma Prancha já no formato
 * atual (tem `viewports`) passa direto, só garantindo os campos novos.
 * Recebe `pr` como `unknown`/JSON puro (não pelo tipo `Prancha` atual)
 * porque vem de um projeto salvo em disco/Firestore -- pode ser de
 * qualquer versão anterior.
 */
function migrarPranchaSeNecessario(pr: unknown, geometriaAtual: Geometria[]): Prancha {
  const p = pr as {
    id: string;
    nome: string;
    formato: FormatoFolha;
    orientacao?: "paisagem" | "retrato";
    viewports?: ViewportGeometria[];
    viewport?: { modelScale: number; modelOffsetX: number; modelOffsetY: number };
  };
  if (Array.isArray(p.viewports)) {
    // Já no formato 12g.
    return { id: p.id, nome: p.nome, formato: p.formato, orientacao: p.orientacao, viewports: p.viewports };
  }
  // Formato 12e: 1 câmera única em `p.viewport` -- vira 1 Viewport
  // cobrindo a área útil inteira, preservando a mesma câmera
  // (modelScale/modelOffset) que o usuário já tinha ajustado. Sem
  // `p.viewport` nenhum (projeto ainda mais antigo/corrompido), cai no
  // mesmo fallback de uma prancha nova (usa a geometria atual do Desenho
  // pra já enquadrar algo).
  if (!p.viewport) {
    return { id: p.id, nome: p.nome, formato: p.formato, orientacao: p.orientacao, viewports: [criarViewportInicialPrancha(p.formato, p.orientacao, geometriaAtual)] };
  }
  const folha = dimensoesFolhaOrientada(p.formato, p.orientacao);
  const utilX = -folha.largura / 2 + MARGENS_ABNT.esquerda;
  const utilY = -folha.altura / 2 + MARGENS_ABNT.superior;
  const larguraUtil = folha.largura - MARGENS_ABNT.esquerda - MARGENS_ABNT.direita;
  const alturaUtil = folha.altura - MARGENS_ABNT.superior - MARGENS_ABNT.inferior;
  return {
    id: p.id,
    nome: p.nome,
    formato: p.formato,
    orientacao: p.orientacao,
    viewports: [
      {
        id: uuidv4(),
        tipo: "viewport",
        camada: "0",
        x: utilX,
        y: utilY,
        largura: larguraUtil,
        altura: alturaUtil,
        modelScale: p.viewport.modelScale ?? 1,
        modelOffsetX: p.viewport.modelOffsetX ?? 0,
        modelOffsetY: p.viewport.modelOffsetY ?? 0,
        bordaVisivel: true,
      },
    ],
  };
}

/** Translada uma geometria (imutável -- devolve uma cópia) por (dx, dy). */
function transladar(g: Geometria, dx: number, dy: number): Geometria {
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
 * "Promove" um retângulo (x/y/largura/altura, sempre eixo-alinhado) para
 * um polígono de 4 vértices soltos -- usada tanto pela edição de
 * vértices (Sprint 3: inserir/remover) quanto pela rotação de grupo, já
 * que nenhuma das duas operações é representável no schema rígido de
 * `RetanguloGeometria` (um retângulo girado ou com um vértice a mais
 * deixa de ser "eixo-alinhado com 4 cantos implícitos"). Mesmo
 * comportamento do PEDIT do AutoCAD ao editar o vértice de um retângulo:
 * ele vira uma polilinha/polígono editável ponto a ponto. Preserva id/
 * camada/hachura -- só o `tipo` e a representação dos pontos mudam.
 */
function promoverRetanguloParaPoligono(g: RetanguloGeometria): PoligonoGeometria {
  return {
    id: g.id,
    tipo: "poligono",
    camada: g.camada,
    pontos: [
      { x: g.x, y: g.y },
      { x: g.x + g.largura, y: g.y },
      { x: g.x + g.largura, y: g.y + g.altura },
      { x: g.x, y: g.y + g.altura },
    ],
    hachura: g.hachura,
  };
}

/**
 * `segmentoOffsetAlvo` (usada logo abaixo por `selecionarAlvoOffset`) e o
 * hover ao vivo da linha alvo (`geometriaSobCursorOffset`, usada por
 * `CanvasStage.tsx`) agora moraram pra `lib/offset.ts` (Iteração 37) --
 * módulo puro compartilhado entre o store e os componentes de canvas,
 * espelhando o papel de `lib/trim.ts` pro TRIM. Ver lá pro histórico/
 * comentário completo de por que existem.
 */

/**
 * Gira uma geometria em volta de `centro` por `anguloGraus` (delta) --
 * usada por `girarSelecao` (rotação de grupo, Sprint 3). Retângulos são
 * promovidos a polígono primeiro (ver `promoverRetanguloParaPoligono`),
 * já que um retângulo girado deixa de ser eixo-alinhado. Blocos e textos
 * também somam o delta ao próprio campo `rotacao` -- além de orbitar em
 * volta do centro do grupo, giram "no lugar" (senão pareceriam só se
 * mover, sem virar, o que ficaria visualmente errado para qualquer
 * ângulo que não seja múltiplo de 360°).
 */
function girarGeometria(g: Geometria, centro: Ponto, anguloGraus: number): Geometria {
  switch (g.tipo) {
    case "linha": {
      const p1 = rotacionarPonto({ x: g.x1, y: g.y1 }, centro, anguloGraus);
      const p2 = rotacionarPonto({ x: g.x2, y: g.y2 }, centro, anguloGraus);
      return { ...g, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    case "circulo": {
      const c = rotacionarPonto({ x: g.x, y: g.y }, centro, anguloGraus);
      return { ...g, x: c.x, y: c.y };
    }
    case "bloco": {
      const c = rotacionarPonto({ x: g.x, y: g.y }, centro, anguloGraus);
      return { ...g, x: c.x, y: c.y, rotacao: normalizarAnguloGraus((g.rotacao ?? 0) + anguloGraus) };
    }
    case "retangulo":
      return girarGeometria(promoverRetanguloParaPoligono(g), centro, anguloGraus);
    case "poligono":
      return { ...g, pontos: g.pontos.map((p) => rotacionarPonto(p, centro, anguloGraus)) };
    case "arco": {
      const c = rotacionarPonto({ x: g.x, y: g.y }, centro, anguloGraus);
      return {
        ...g,
        x: c.x,
        y: c.y,
        anguloInicial: g.anguloInicial + anguloGraus,
        anguloFinal: g.anguloFinal + anguloGraus,
      };
    }
    case "texto": {
      const p = rotacionarPonto({ x: g.x, y: g.y }, centro, anguloGraus);
      return { ...g, x: p.x, y: p.y, rotacao: normalizarAnguloGraus((g.rotacao ?? 0) + anguloGraus) };
    }
    case "cota": {
      const p1 = rotacionarPonto({ x: g.x1, y: g.y1 }, centro, anguloGraus);
      const p2 = rotacionarPonto({ x: g.x2, y: g.y2 }, centro, anguloGraus);
      const p3 = rotacionarPonto({ x: g.px, y: g.py }, centro, anguloGraus);
      return { ...g, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, px: p3.x, py: p3.y };
    }
    case "polilinha":
      return { ...g, pontos: g.pontos.map((p) => rotacionarPonto(p, centro, anguloGraus)) };
    case "viewport":
      // Rotação de viewport (VPROTATEASSOC do AutoCAD) não é suportada
      // nesta versão -- passthrough sem efeito. O retângulo na folha
      // continua eixo-alinhado; girar a seleção que inclua um viewport
      // gira os demais elementos normalmente e deixa o viewport parado.
      return g;
  }
}

/**
 * Escala `p` em volta de `centro` por `fatorX`/`fatorY` -- cada eixo
 * independente (mesma ideia de `rotacionarPonto`, mas escala em vez de
 * girar). Chamar com `fatorX === fatorY` dá a escala PROPORCIONAL usual.
 */
function escalarPonto(p: Ponto, centro: Ponto, fatorX: number, fatorY: number): Ponto {
  return { x: centro.x + (p.x - centro.x) * fatorX, y: centro.y + (p.y - centro.y) * fatorY };
}

/** Nunca deixa raio/tamanho colapsar a zero ou virar negativo por um fator bem pequeno. */
const TAMANHO_MINIMO_MM = 0.01;

/**
 * Escala uma geometria em volta de `centro` por `fatorX`/`fatorY` -- usada
 * por `escalarSelecao` (SCALE de grupo). Espelha a estrutura de
 * `girarGeometria`: retângulo permanece eixo-alinhado sem precisar
 * promover a polígono, já que escalar cada eixo (mundo) independentemente
 * em volta de qualquer centro preserva o alinhamento aos eixos -- só
 * translada o canto e multiplica largura/altura, cada um pelo seu próprio
 * fator. Blocos também multiplicam a própria `escalaX`/`escalaY` (cada
 * eixo com seu fator correspondente, já que o bloco já suporta escala
 * não-uniforme desde a Sprint 3) -- além de orbitar em volta do centro do
 * grupo, crescem/encolhem "no lugar" (senão pareceriam só se mover, sem
 * mudar de tamanho). Círculo/arco (raio) e texto (`fontSize`) não têm um
 * "eixo X" e "eixo Y" de tamanho separados -- usam a MÉDIA de
 * `fatorX`/`fatorY` pra crescer/encolher de forma consistente mesmo numa
 * escala não-uniforme, já que este app não modela elipse (um círculo
 * "esticado" não-uniformemente viraria uma elipse, forma que não existe
 * aqui).
 */
export function escalarGeometria(g: Geometria, centro: Ponto, fatorX: number, fatorY: number): Geometria {
  const fatorMedio = (fatorX + fatorY) / 2;
  switch (g.tipo) {
    case "linha": {
      const p1 = escalarPonto({ x: g.x1, y: g.y1 }, centro, fatorX, fatorY);
      const p2 = escalarPonto({ x: g.x2, y: g.y2 }, centro, fatorX, fatorY);
      return { ...g, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    case "circulo": {
      const c = escalarPonto({ x: g.x, y: g.y }, centro, fatorX, fatorY);
      return { ...g, x: c.x, y: c.y, raio: Math.max(TAMANHO_MINIMO_MM, g.raio * fatorMedio) };
    }
    case "bloco": {
      const c = escalarPonto({ x: g.x, y: g.y }, centro, fatorX, fatorY);
      const escalaXAtual = g.escalaX ?? g.escala ?? 1;
      const escalaYAtual = g.escalaY ?? g.escala ?? 1;
      return {
        ...g,
        x: c.x,
        y: c.y,
        escalaX: Math.max(TAMANHO_MINIMO_MM, escalaXAtual * fatorX),
        escalaY: Math.max(TAMANHO_MINIMO_MM, escalaYAtual * fatorY),
      };
    }
    case "retangulo": {
      const canto = escalarPonto({ x: g.x, y: g.y }, centro, fatorX, fatorY);
      return {
        ...g,
        x: canto.x,
        y: canto.y,
        largura: Math.max(TAMANHO_MINIMO_MM, g.largura * fatorX),
        altura: Math.max(TAMANHO_MINIMO_MM, g.altura * fatorY),
      };
    }
    case "poligono":
      return { ...g, pontos: g.pontos.map((p) => escalarPonto(p, centro, fatorX, fatorY)) };
    case "arco": {
      const c = escalarPonto({ x: g.x, y: g.y }, centro, fatorX, fatorY);
      return { ...g, x: c.x, y: c.y, raio: Math.max(TAMANHO_MINIMO_MM, g.raio * fatorMedio) };
    }
    case "texto": {
      const p = escalarPonto({ x: g.x, y: g.y }, centro, fatorX, fatorY);
      return { ...g, x: p.x, y: p.y, fontSize: Math.max(0.5, g.fontSize * fatorMedio) };
    }
    case "cota": {
      // Reformata o texto congelado (`texto`) com a nova distância --
      // ao contrário da rotação (que preserva distância), escalar MUDA
      // a distância medida de verdade, então manter o texto antigo
      // mostraria um valor errado para a própria cota que acabou de ser
      // escalada (distinto do caso "geometria medida editada depois",
      // que continua congelado por design -- ver comentário do tipo).
      const p1 = escalarPonto({ x: g.x1, y: g.y1 }, centro, fatorX, fatorY);
      const p2 = escalarPonto({ x: g.x2, y: g.y2 }, centro, fatorX, fatorY);
      const p3 = escalarPonto({ x: g.px, y: g.py }, centro, fatorX, fatorY);
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      return { ...g, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, px: p3.x, py: p3.y, texto: `${dist.toFixed(1)} mm`, distanciaMm: dist };
    }
    case "polilinha":
      return { ...g, pontos: g.pontos.map((p) => escalarPonto(p, centro, fatorX, fatorY)) };
    case "viewport":
      // Redimensionar a "janela" de impressão via SCALE não é suportado
      // nesta versão -- passthrough sem efeito, mesma decisão de escopo
      // da rotação de viewport acima (ver `girarGeometria`).
      return g;
  }
}

/** Máximo de entradas guardadas nas pilhas de undo/redo (ver `past`/`future`). */
const HISTORICO_MAX = 50;

export const useCadStore = create<CadState>((set, get) => {
  // Empilha um snapshot do array de geometria ANTES de uma mutação,
  // limpando o futuro (redo) -- exatamente como qualquer editor real:
  // uma ação nova invalida qualquer "refazer" pendente. Não é exposta
  // como ação pública do store (não faz parte de `CadState`) -- é só um
  // detalhe de implementação chamado no início de toda ação que muta
  // `projeto.geometria` diretamente.
  function snapshot() {
    set((state) => ({
      past: [...state.past, state.projeto.geometria].slice(-HISTORICO_MAX),
      future: [],
    }));
  }

  return {
  projeto: projetoVazio(),
  ferramenta: "selecionar",
  ferramentaAtivacaoSeq: 0,
  ultimoComandoRepetivel: null,
  activeLayer: "BARRAMENTO",
  blocoParaCarimbar: null,
  viewport: { scale: 1, x: 0, y: 0 },
  pranchaViewports: {},
  enquadramentoPendente: null,
  gridSize: 10,
  snapAtivo: true,
  unidadeDesenho: "mm",
  orthoAtivo: false,
  activeSheet: "A4",
  pontoRascunho: null,
  ponteiroMundo: null,
  osnapAlvo: null,
  osnapTipo: null,
  historicoComandos: ["Digite um comando (L, C, E, M, CO...) e pressione Enter."],
  selecionadoIds: [],
  poligonoPontos: null,

  activeHatch: "ANSI31_DIAGONAL",
  hatchScale: 1,
  hatchColor: "#334155",

  trimPreview: null,
  trimQuebraA: null,
  trimQuebraCandidata: null,
  trimQuebraPreviewB: null,
  offsetDistancia: null,
  offsetAlvoId: null,
  offsetAlvoSegmento: null,
  offsetHover: null,
  filletRaio: 0,
  filletAlvo1Id: null,
  filletAguardandoRaio: false,
  escalaPreview: null,

  calibrationMode: false,
  calibXrefId: null,
  calibPoint1: null,
  calibPoint2: null,

  selecaoBox: null,
  toolbarPosicao: "TOP",
  // Iteração 36 (usuário: "corrija o texto sempre deve ter um tamanho
  // proporcional inicial ao desenho, desenhei um retangulo 3mx3m e ao
  // selecionar o botao texto aparece bem pequeno tive que aumentar para
  // 129mm") -- 10mm era um tamanho ajustado pros diagramas ESQUEMÁTICOS
  // do resto do app (unifilar/FV, sempre vistos bem zoomados), mas esta
  // app também desenha plantas baixas em ESCALA REAL (1 unidade = 1mm,
  // cômodos de milhares de mm) -- nesse contexto, 10mm é praticamente
  // invisível, o mesmo problema de fundo dos blocos de tomada/interruptor
  // já corrigido em `blocks.ts`. Valor padrão elevado pro tamanho que o
  // usuário confirmou funcionar bem numa planta real.
  textoFontSizeAtivo: 129,
  cotaP1: null,
  cotaP2: null,

  menuVerticeContexto: null,
  usuario: null,
  projetosSalvos: [],
  gerenciadorProjetosAberto: false,
  viewportAtivoId: null,
  prenchaAtivaId: null,
  viewportPranchaSelecionadoId: null,
  xrefSelecionadoId: null,
  areaTransferencia: [],

  setFerramenta: (f) =>
    set((state) => ({
      ferramenta: f,
      // Iteração 37 -- incrementa SEMPRE, mesmo reclicando a ferramenta
      // já ativa (ver `CadState.ferramentaAtivacaoSeq`): é o "sinal de
      // ativação" que garante que `CommandLine.tsx` reganhe o foco no
      // campo de digitar mesmo quando nenhum outro campo do store muda
      // de valor entre um clique e o próximo no mesmo botão.
      ferramentaAtivacaoSeq: state.ferramentaAtivacaoSeq + 1,
      // Iteração 38 -- "selecionar" é o estado ocioso/de seleção, não um
      // comando repetível (ver `CadState.ultimoComandoRepetivel`); só
      // grava quando o usuário escolhe um comando de fato.
      ...(f !== "selecionar" ? { ultimoComandoRepetivel: f } : {}),
      pontoRascunho: null,
      poligonoPontos: null,
      polilinhaPontos: null,
      trimPreview: null,
      trimQuebraA: null,
      trimQuebraCandidata: null,
      trimQuebraPreviewB: null,
      offsetDistancia: null,
      offsetAlvoId: null,
      offsetAlvoSegmento: null,
      offsetHover: null,
      filletAlvo1Id: null,
      filletAguardandoRaio: false,
      selecaoBox: null,
      cotaP1: null,
      cotaP2: null,
      gripAlvo: null,
      blocoParaCarimbar: f === "carimbar" ? get().blocoParaCarimbar : null,
      ...(f === "calibrar"
        ? {}
        : { calibrationMode: false, calibXrefId: null, calibPoint1: null, calibPoint2: null }),
    })),

  armarCarimbo: (blocoId) =>
    set({ ferramenta: "carimbar", blocoParaCarimbar: blocoId, pontoRascunho: null }),

  setActiveLayer: (nome) => set({ activeLayer: nome }),

  addGeometria: (g) => {
    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: [...state.projeto.geometria, { ...g, id: uuidv4() } as Geometria],
      },
    }));
  },

  removeGeometria: (id) => {
    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.filter((g) => g.id !== id),
      },
      selecionadoIds: state.selecionadoIds.filter((sid) => sid !== id),
    }));
  },

  moverGeometria: (ids, dx, dy) => {
    if (ids.length === 0 || (dx === 0 && dy === 0)) return;
    snapshot();
    const idSet = new Set(ids);
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) => (idSet.has(g.id) ? transladar(g, dx, dy) : g)),
      },
    }));
  },

  copiarGeometria: (ids, dx, dy) => {
    if (ids.length === 0) return;
    snapshot();
    const idSet = new Set(ids);
    set((state) => {
      const copias = state.projeto.geometria
        .filter((g) => idSet.has(g.id))
        .map((g) => ({ ...transladar(g, dx, dy), id: uuidv4() }));
      return {
        projeto: { ...state.projeto, geometria: [...state.projeto.geometria, ...copias] },
      };
    });
  },

  apagarSelecionados: () => {
    const idSet = new Set(get().selecionadoIds);
    if (idSet.size === 0) return;
    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.filter((g) => !idSet.has(g.id)),
      },
      selecionadoIds: [],
    }));
  },

  selecionarUnico: (id) => set({ selecionadoIds: [id] }),

  alternarSelecao: (id) =>
    set((state) => ({
      selecionadoIds: state.selecionadoIds.includes(id)
        ? state.selecionadoIds.filter((sid) => sid !== id)
        : [...state.selecionadoIds, id],
    })),

  limparSelecao: () => set({ selecionadoIds: [] }),

  setViewport: (v) => set((state) => ({ viewport: { ...state.viewport, ...v } })),

  setPranchaViewport: (pranchaId, v) =>
    set((state) => ({
      pranchaViewports: {
        ...state.pranchaViewports,
        [pranchaId]: { ...(state.pranchaViewports[pranchaId] ?? { scale: 1, x: 0, y: 0 }), ...v },
      },
    })),

  limparEnquadramentoPendente: () => set({ enquadramentoPendente: null }),

  setGridSize: (n) => set({ gridSize: Math.max(1, n) }),

  toggleSnap: () => set((state) => ({ snapAtivo: !state.snapAtivo })),

  setUnidadeDesenho: (u) => set({ unidadeDesenho: u }),

  toggleOrtho: () => set((state) => ({ orthoAtivo: !state.orthoAtivo })),

  setActiveSheet: (f) => set({ activeSheet: f }),

  setPontoRascunho: (p) => set({ pontoRascunho: p }),

  setPonteiroMundo: (p) => set({ ponteiroMundo: p }),

  setOsnapAlvo: (p, tipo = null) => set({ osnapAlvo: p, osnapTipo: p ? tipo : null }),

  cancelarDesenho: () =>
    set({
      pontoRascunho: null,
      poligonoPontos: null,
      polilinhaPontos: null,
      ferramenta: "selecionar",
      blocoParaCarimbar: null,
      osnapAlvo: null,
      osnapTipo: null,
      trimPreview: null,
      trimQuebraA: null,
      trimQuebraCandidata: null,
      trimQuebraPreviewB: null,
      offsetDistancia: null,
      offsetAlvoId: null,
      offsetAlvoSegmento: null,
      offsetHover: null,
      filletAlvo1Id: null,
      filletAguardandoRaio: false,
      calibrationMode: false,
      calibXrefId: null,
      calibPoint1: null,
      calibPoint2: null,
      selecaoBox: null,
      cotaP1: null,
      cotaP2: null,
      gripAlvo: null,
    }),

  addXref: (x) => {
    const id = uuidv4();
    set((state) => ({
      projeto: { ...state.projeto, xrefs: [...state.projeto.xrefs, { ...x, id }] },
    }));
    return id;
  },

  removeXref: (id) =>
    set((state) => ({
      projeto: { ...state.projeto, xrefs: state.projeto.xrefs.filter((x) => x.id !== id) },
      // Iteração 12u: se o XREF removido era o selecionado, limpa a
      // seleção -- evita deixar `xrefSelecionadoId` apontando pra um id
      // que não existe mais em `projeto.xrefs` (que faria os grips de
      // canto em `XrefLayer.tsx` desaparecer silenciosamente na próxima
      // renderização, mas é mais seguro já zerar aqui).
      xrefSelecionadoId: state.xrefSelecionadoId === id ? null : state.xrefSelecionadoId,
    })),

  updateXref: (id, patch) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        xrefs: state.projeto.xrefs.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      },
    })),

  /** Iteração 12u: seleciona (clique) ou limpa (`null`) o XREF em foco no Desenho -- ver `xrefSelecionadoId`. */
  selecionarXref: (id) => set({ xrefSelecionadoId: id }),

  setNomeProjeto: (nome) => set((state) => ({ projeto: { ...state.projeto, nome } })),

  pushComando: (linha) =>
    set((state) => ({
      historicoComandos: [...state.historicoComandos.slice(-49), linha],
    })),

  carregarProjeto: (p) => {
    // Projetos salvos ANTES das Pranchas existirem (Iteração 12e) não têm
    // `pranchas` nenhuma -- migra automaticamente o `carimbo`/formato
    // "legado" (de antes) pra dentro de 1 Prancha nova, na hora, pra o
    // usuário continuar vendo exatamente a mesma folha+carimbo de sempre
    // ao reabrir um projeto antigo, em vez de cair de repente numa tela
    // de Desenho vazia sem moldura. O formato usado é o `activeSheet`
    // ATUAL do store (não persistido no `Projeto` em si, ver `CadState`) --
    // é o melhor palpite disponível de qual formato o usuário via por
    // último nesta sessão.
    //
    // Projetos salvos na Iteração 12e (Pranchas já existiam, mas com 1 só
    // câmera em `Prancha.viewport` e um carimbo PRÓPRIO por Prancha em
    // `Prancha.carimbo`) também precisam de migração pro formato atual
    // (12g: lista `Prancha.viewports`, carimbo sempre compartilhado em
    // `projeto.carimbo`) -- ver `migrarPranchaSeNecessario` abaixo. `p` é
    // JSON puro (Firestore/arquivo), então campos de versões antigas são
    // lidos via `as any`, não pelo tipo `Projeto` atual.
    const pranchasSalvas = (p as { pranchas?: unknown[] }).pranchas;
    const pranchasExistentes = pranchasSalvas && pranchasSalvas.length > 0 ? pranchasSalvas : null;
    const carimboMigrado: Carimbo = { ...carimboVazio(), ...p.carimbo };
    // Se a 1ª prancha salva ainda é do formato 12e (tinha carimbo PRÓPRIO),
    // esse carimbo é a fonte de verdade real do usuário (o `projeto.carimbo`
    // ficou "legado"/não editado durante a 12e) -- promove pro carimbo
    // compartilhado. Projetos já 12g (ou pré-12e, sem Pranchas) usam
    // `p.carimbo` normalmente.
    const carimboDaPranchaAntiga = (pranchasExistentes?.[0] as { carimbo?: Carimbo } | undefined)?.carimbo;
    const carimboFinal: Carimbo = carimboDaPranchaAntiga ? { ...carimboVazio(), ...carimboDaPranchaAntiga } : carimboMigrado;
    const pranchas: Prancha[] =
      pranchasExistentes?.map((pr) => migrarPranchaSeNecessario(pr, p.geometria ?? [])) ??
      [
        {
          id: uuidv4(),
          nome: "Prancha 1",
          formato: get().activeSheet,
          viewports: [criarViewportInicialPrancha(get().activeSheet, undefined, p.geometria ?? [])],
        },
      ];

    set({
      // Projetos salvos antes do sistema de camadas/carimbo existir podem
      // não ter esses campos -- garante valores válidos em qualquer caso.
      // O carimbo é MESCLADO (não só substituído quando ausente): projetos
      // salvos antes de campos novos serem adicionados ao Carimbo (ex.:
      // enderecoCliente/contaContrato/tipoLigacao, Iteração 12c) têm um
      // `carimbo` que EXISTE mas não tem esses campos -- sem o merge, eles
      // ficariam `undefined` no formulário em vez de "" (string vazia).
      projeto: {
        ...p,
        camadas: p.camadas && Object.keys(p.camadas).length > 0 ? p.camadas : camadasIniciais(),
        carimbo: carimboFinal,
        pranchas,
      },
      // Pousa na 1ª prancha (comportamento mais parecido com o "sempre via
      // a folha+carimbo" de antes das Pranchas existirem) -- se por algum
      // motivo o projeto não tiver nenhuma (não deveria acontecer, já que
      // sempre migramos/criamos 1 acima), cai no Desenho.
      prenchaAtivaId: pranchas[0]?.id ?? null,
      selecionadoIds: [],
      viewportPranchaSelecionadoId: null,
      xrefSelecionadoId: null,
      viewportAtivoId: null,
    });
  },

  // Chamado a partir de um clique do usuário (evento), então gerar um
  // uuid aqui é seguro -- não roda durante a renderização inicial. Já
  // nasce com 1 Prancha A4 padrão (Iteração 12e) -- igual ao
  // comportamento de sempre (antes das Pranchas existirem, um projeto
  // novo já mostrava a folha+carimbo na hora); o usuário adiciona mais
  // pranchas pelas abas quando precisar.
  novoProjeto: () => {
    const pranchaInicial: Prancha = {
      id: uuidv4(),
      nome: "Prancha 1",
      formato: "A4",
      viewports: [criarViewportInicialPrancha("A4", undefined, [])],
    };
    const base = projetoVazio();
    set({
      // Iteração 27: um projeto novo já nasce com os dados do responsável
      // técnico (nome/CREA/logo/assinatura) pré-preenchidos, se houver um
      // perfil salvo de um projeto anterior -- ver `aplicarPerfilTecnicoNoCarimbo`.
      projeto: {
        ...base,
        carimbo: aplicarPerfilTecnicoNoCarimbo(base.carimbo),
        id_projeto: uuidv4(),
        pranchas: [pranchaInicial],
      },
      prenchaAtivaId: pranchaInicial.id,
      selecionadoIds: [],
      viewportPranchaSelecionadoId: null,
      xrefSelecionadoId: null,
      viewportAtivoId: null,
    });
  },

  // Roda 1x na montagem do <Editor/> (ver Editor.tsx). Além de garantir o
  // id do projeto (motivo original desta ação -- ver comentário grande
  // acima de `projetoVazio`), também garante que exista pelo menos 1
  // Prancha (Iteração 12e): cobre o boot A FRIO da própria store (estado
  // inicial do Zustand nasce com `pranchas: []`, sem passar por
  // `novoProjeto`/`carregarProjeto`) -- sem isso, a 1ª vez que alguém abre
  // o app cairia direto no Desenho vazio sem moldura nenhuma, em vez de
  // já ver uma folha como sempre foi.
  garantirIdProjeto: () =>
    set((state) => {
      const precisaId = !state.projeto.id_projeto;
      const precisaPranchaInicial = state.projeto.pranchas.length === 0;
      // Iteração 27: mesmo sem precisar de id/prancha novos (ex.: um
      // projeto salvo foi restaurado do localStorage antes deste efeito
      // rodar), ainda vale a pena tentar preencher o responsável técnico
      // se o carimbo restaurado estiver com esses campos vazios.
      const carimboComPerfil = aplicarPerfilTecnicoNoCarimbo(state.projeto.carimbo);
      const carimboMudou = carimboComPerfil !== state.projeto.carimbo;
      if (!precisaId && !precisaPranchaInicial && !carimboMudou) return state;
      const pranchaInicial: Prancha | null = precisaPranchaInicial
        ? {
            id: uuidv4(),
            nome: "Prancha 1",
            formato: "A4",
            viewports: [criarViewportInicialPrancha("A4", undefined, state.projeto.geometria)],
          }
        : null;
      return {
        projeto: {
          ...state.projeto,
          id_projeto: precisaId ? uuidv4() : state.projeto.id_projeto,
          carimbo: carimboComPerfil,
          pranchas: pranchaInicial ? [...state.projeto.pranchas, pranchaInicial] : state.projeto.pranchas,
        },
        prenchaAtivaId: pranchaInicial ? pranchaInicial.id : state.prenchaAtivaId,
      };
    }),

  criarCamada: (nome, cor) => {
    const chave = nome.trim().toUpperCase();
    if (!chave) return;
    set((state) => {
      if (state.projeto.camadas[chave]) return state; // já existe
      const nova: Camada = {
        nome: chave,
        cor: cor ?? "#22c55e",
        espessuraDaLinha: 1,
        visible: true,
      };
      return { projeto: { ...state.projeto, camadas: { ...state.projeto.camadas, [chave]: nova } } };
    });
  },

  alternarVisibilidadeCamada: (nome) =>
    set((state) => {
      const atual = state.projeto.camadas[nome];
      if (!atual) return state;
      return {
        projeto: {
          ...state.projeto,
          camadas: { ...state.projeto.camadas, [nome]: { ...atual, visible: !atual.visible } },
        },
      };
    }),

  atualizarCamada: (nome, patch) =>
    set((state) => {
      const atual = state.projeto.camadas[nome];
      if (!atual) return state;
      return {
        projeto: {
          ...state.projeto,
          camadas: { ...state.projeto.camadas, [nome]: { ...atual, ...patch } },
        },
      };
    }),

  removerCamada: (nome) =>
    set((state) => {
      if (Object.keys(state.projeto.camadas).length <= 1) return state; // mantém ao menos 1 camada
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [nome]: removida, ...resto } = state.projeto.camadas;
      // Reatribui elementos órfãos para a primeira camada restante, para
      // que nada "suma" silenciosamente do desenho.
      const camadaSubstituta = Object.keys(resto)[0];
      return {
        projeto: {
          ...state.projeto,
          camadas: resto,
          geometria: state.projeto.geometria.map((g) =>
            g.camada === nome ? { ...g, camada: camadaSubstituta } : g
          ),
        },
        activeLayer: state.activeLayer === nome ? camadaSubstituta : state.activeLayer,
      };
    }),

  // Arma a ferramenta de calibração para um XREF específico. Suporta
  // vários XREFs no projeto: cada calibração mira exatamente um deles.
  iniciarCalibracao: (xrefId) =>
    set({
      ferramenta: "calibrar",
      calibrationMode: true,
      calibXrefId: xrefId,
      calibPoint1: null,
      calibPoint2: null,
      pontoRascunho: null,
    }),

  // Chamada duas vezes pelo CanvasStage: a 1ª registra o ponto-base (e
  // espelha em `pontoRascunho` para reaproveitar o preview "de borracha"
  // já existente), a 2ª registra o ponto de destino e dispara o modal
  // (que aparece assim que calibPoint1 E calibPoint2 estão preenchidos).
  registrarPontoCalibracao: (p) =>
    set((state) => {
      if (!state.calibPoint1) {
        return { calibPoint1: p, pontoRascunho: p };
      }
      if (!state.calibPoint2) {
        return { calibPoint2: p };
      }
      return state;
    }),

  // Aplica a calibração: reescala o XREF-alvo para que a distância entre
  // calibPoint1 e calibPoint2 passe a corresponder exatamente à
  // distância real informada (em metros).
  //
  // Matemática (equivalente ao SCALE/Reference do AutoCAD):
  //   1) distanciaAtualMundo = distância euclidiana entre os 2 pontos
  //      clicados, JÁ na escala atual do XREF (unidade de mundo = mm).
  //   2) Isso equivale a "distância em pixels da imagem" x "escala
  //      atual": distanciaAtualMundo = distanciaPixels * escalaAtual.
  //   3) A nova escala deve satisfazer:
  //         novaEscala * distanciaPixels = distanciaRealMm
  //      Substituindo distanciaPixels = distanciaAtualMundo / escalaAtual:
  //         novaEscala = escalaAtual * (distanciaRealMm / distanciaAtualMundo)
  //      -- ou seja, a escala atual multiplicada pela razão entre a
  //      distância real desejada e a distância atualmente medida.
  confirmarCalibracao: (distanciaRealMetros) => {
    const state = get();
    const { calibXrefId, calibPoint1, calibPoint2 } = state;
    if (!calibXrefId || !calibPoint1 || !calibPoint2) {
      return { ok: false, erro: "Calibração incompleta (faltam os dois pontos de referência)." };
    }
    if (!Number.isFinite(distanciaRealMetros) || distanciaRealMetros <= 0) {
      return { ok: false, erro: "Informe uma distância real maior que zero." };
    }
    const distanciaAtualMundo = Math.hypot(calibPoint2.x - calibPoint1.x, calibPoint2.y - calibPoint1.y);
    if (distanciaAtualMundo <= 0) {
      return { ok: false, erro: "Os dois pontos clicados são coincidentes -- clique em dois pontos distintos." };
    }
    const xref = state.projeto.xrefs.find((x) => x.id === calibXrefId);
    if (!xref) {
      return { ok: false, erro: "XREF não encontrado (pode ter sido removido)." };
    }

    const distanciaRealMm = distanciaRealMetros * 1000; // projeto trabalha em mm (ver UNIDADE em types.ts)
    const fatorCorrecao = distanciaRealMm / distanciaAtualMundo;
    const novaEscala = xref.escala * fatorCorrecao;

    get().updateXref(calibXrefId, { escala: novaEscala, calibrado: true });
    set({
      ferramenta: "selecionar",
      calibrationMode: false,
      calibXrefId: null,
      calibPoint1: null,
      calibPoint2: null,
      pontoRascunho: null,
    });
    return { ok: true };
  },

  cancelarCalibracao: () =>
    set({
      ferramenta: "selecionar",
      calibrationMode: false,
      calibXrefId: null,
      calibPoint1: null,
      calibPoint2: null,
      pontoRascunho: null,
    }),

  // Cada clique da ferramenta "poligono" crava mais um vértice. O
  // preview "de borracha" (GeometryLayer) desenha os vértices já
  // cravados + o segmento até o cursor; nada é persistido em
  // `projeto.geometria` até `fecharPoligono` (Enter).
  adicionarPontoPoligono: (p) =>
    set((state) => ({
      poligonoPontos: state.poligonoPontos ? [...state.poligonoPontos, p] : [p],
    })),

  // Fecha e persiste o polígono em construção (mínimo 3 vértices --
  // como o PLINE/Close do AutoCAD). Sem efeito (retorna ok:false) se
  // ainda não há vértices suficientes.
  fecharPoligono: () => {
    const { poligonoPontos, activeLayer, addGeometria } = get();
    if (!poligonoPontos || poligonoPontos.length < 3) return { ok: false };
    addGeometria({ tipo: "poligono", camada: activeLayer, pontos: poligonoPontos });
    set({ poligonoPontos: null, ferramenta: "selecionar" });
    return { ok: true };
  },

  setActiveHatch: (t) => set({ activeHatch: t }),

  setHatchScale: (n) => set({ hatchScale: Math.max(0.1, n || 1) }),

  setHatchColor: (c) => set({ hatchColor: c }),

  // Ferramenta "hachurar": clique num retângulo/polígono/círculo aplica
  // a config ativa (activeHatch/hatchScale/hatchColor); clicar de novo
  // no mesmo elemento (que já tem hachura) remove -- um toggle simples,
  // sem precisar de uma opção "nenhuma" separada no seletor. Elementos
  // que não são formas fechadas (linha/bloco/arco/polilinha) são
  // ignorados -- círculo entrou na Iteração 14 (antes só retangulo/
  // poligono).
  alternarHachura: (id) =>
    set((state) => {
      const alvo = state.projeto.geometria.find((g) => g.id === id);
      if (!alvo || (alvo.tipo !== "retangulo" && alvo.tipo !== "poligono" && alvo.tipo !== "circulo")) return state;
      const hachura: HachuraConfig | undefined = alvo.hachura
        ? undefined
        : { tipo: state.activeHatch, escala: state.hatchScale, cor: state.hatchColor };
      return {
        projeto: {
          ...state.projeto,
          geometria: state.projeto.geometria.map((g) =>
            g.id === id ? ({ ...g, hachura } as Geometria) : g
          ),
        },
      };
    }),

  // Via linha de comando (comando "H" com seleção prévia ativa):
  // aplica a config ativa a todos os selecionados que forem retângulo/
  // polígono/círculo de uma vez, ignorando os demais tipos. Devolve
  // quantos elementos receberam a hachura, para o eco de comando.
  aplicarHachuraSelecionados: (ids) => {
    const idSet = new Set(ids);
    let quantidade = 0;
    set((state) => {
      const hachura: HachuraConfig = { tipo: state.activeHatch, escala: state.hatchScale, cor: state.hatchColor };
      const geometria = state.projeto.geometria.map((g) => {
        if (!idSet.has(g.id) || (g.tipo !== "retangulo" && g.tipo !== "poligono" && g.tipo !== "circulo")) return g;
        quantidade++;
        return { ...g, hachura } as Geometria;
      });
      return { projeto: { ...state.projeto, geometria } };
    });
    return quantidade;
  },

  // Painel de propriedades (Iteração 14): edita tipo/escala/cor da
  // hachura de UM objeto já hachurado, sem tocar na geometria dele --
  // permite ajustar o "zoom" do padrão (escala) independente do tamanho
  // da forma. Não faz nada se o alvo não existir, não for um tipo
  // hachurável ou não tiver hachura aplicada ainda.
  atualizarHachuraObjeto: (id, patch) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) => {
          if (g.id !== id) return g;
          if (g.tipo !== "retangulo" && g.tipo !== "poligono" && g.tipo !== "circulo") return g;
          if (!g.hachura) return g;
          return { ...g, hachura: { ...g.hachura, ...patch } } as Geometria;
        }),
      },
    })),

  setTrimPreview: (p) => set({ trimPreview: p }),

  // Confirma o TRIM: recalcula os segmentos de corte NA HORA (em vez de
  // confiar cegamente no preview do último mousemove) e remove o
  // segmento em mira. Iteração 40 (pedido do usuário: "aparar só esta
  // aceitando se for desenho feito apenas com linha [...] preciso que
  // funcione se for em um retangulo e nao apague o desenho todo"): a
  // aresta-alvo pode ser uma "linha" solta OU uma aresta de um
  // "retangulo"/"poligono"/"polilinha" -- nesse caso, só a FORMA-ALVO é
  // "explodida" em linhas soltas (uma por aresta): as arestas que NÃO
  // foram cortadas viram linhas idênticas ao original (a forma continua
  // com a MESMA aparência visual, nada mais do desenho é tocado), e só a
  // aresta clicada é substituída pelos pedaços que sobram do corte. Se
  // não houver pelo menos 2 segmentos (ou seja, nenhuma interseção
  // real), não há nada pra aparar -- não faz nada.
  aplicarTrim: () => {
    const { trimPreview, projeto } = get();
    if (!trimPreview) return { ok: false, erro: "Passe o mouse sobre um segmento antes de clicar." };
    const alvo = projeto.geometria.find((g) => g.id === trimPreview.geometriaId);
    if (!alvo) return { ok: false, erro: "A linha/aresta alvo não existe mais." };
    const arestas = arestasDe(alvo);
    const aresta = arestas[trimPreview.indiceAresta];
    if (!aresta) return { ok: false, erro: "A aresta alvo não existe mais." };

    const outras = todasArestasVisiveis(projeto.geometria, projeto.camadas, alvo.id);
    const segmentosFrescos = segmentosDeCorte(aresta.p1, aresta.p2, outras);
    if (segmentosFrescos.length < 2) {
      return { ok: false, erro: "Essa linha não cruza nenhuma outra -- nada para aparar." };
    }
    const indice = Math.min(trimPreview.indiceAlvo, segmentosFrescos.length - 1);
    if (indice < 0) return { ok: false, erro: "Nada em mira." };

    const restantes = segmentosFrescos.filter((_, i) => i !== indice);
    snapshot();
    set((state) => {
      const semAlvo = state.projeto.geometria.filter((g) => g.id !== alvo.id);
      const novasLinhas: Geometria[] = [];
      // Forma FECHADA/polilinha: preserva todas as OUTRAS arestas (não
      // cortadas) como linhas soltas idênticas ao original -- só uma
      // "linha" solta não tem mais nada a preservar (arestas.length === 1,
      // ela mesma É a aresta cortada).
      if (alvo.tipo !== "linha") {
        arestas.forEach((a, i) => {
          if (i === trimPreview.indiceAresta) return;
          novasLinhas.push({ id: uuidv4(), tipo: "linha", camada: alvo.camada, x1: a.p1.x, y1: a.p1.y, x2: a.p2.x, y2: a.p2.y });
        });
      }
      restantes
        .filter((seg) => Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y) > 1e-6)
        .forEach((seg) => {
          novasLinhas.push({ id: uuidv4(), tipo: "linha", camada: alvo.camada, x1: seg.p1.x, y1: seg.p1.y, x2: seg.p2.x, y2: seg.p2.y });
        });
      return {
        projeto: { ...state.projeto, geometria: [...semAlvo, ...novasLinhas] },
        selecionadoIds: state.selecionadoIds.filter((sid) => sid !== alvo.id),
        trimPreview: null,
      };
    });
    return { ok: true };
  },

  // TRIM (Aparar) -- quebra manual / abrir vão (Iteração 39, ver
  // `trimQuebraA` no cabeçalho da interface pro contexto completo do
  // pedido do usuário). `iniciarQuebraTrim` arma o ponto A (1º clique,
  // já projetado na linha por `CanvasStage`); `aplicarQuebraTrim`
  // confirma com o ponto B (2º clique) e corta o vão.
  iniciarQuebraTrim: (geometriaId, indiceAresta, t, ponto) =>
    set({ trimQuebraA: { geometriaId, indiceAresta, t, ponto }, trimQuebraCandidata: null, trimQuebraPreviewB: null }),

  cancelarQuebraTrim: () => set({ trimQuebraA: null, trimQuebraPreviewB: null }),

  setTrimQuebraCandidata: (c) => set({ trimQuebraCandidata: c }),

  setTrimQuebraPreviewB: (p) => set({ trimQuebraPreviewB: p }),

  // Iteração 40: mesma generalização do `aplicarTrim` acima -- a aresta
  // do vão pode ser uma "linha" solta OU uma aresta de um "retangulo"/
  // "poligono"/"polilinha" (preserva as demais arestas da forma como
  // linhas soltas, só a aresta-alvo vira os pedaços que sobram do vão).
  aplicarQuebraTrim: (pontoB) => {
    const { trimQuebraA, projeto } = get();
    if (!trimQuebraA) return { ok: false, erro: "Clique primeiro no ponto inicial do vão." };
    const alvo = projeto.geometria.find((g) => g.id === trimQuebraA.geometriaId);
    if (!alvo) return { ok: false, erro: "A linha/aresta alvo não existe mais." };
    const arestas = arestasDe(alvo);
    const aresta = arestas[trimQuebraA.indiceAresta];
    if (!aresta) return { ok: false, erro: "A aresta alvo não existe mais." };

    // Projeta o ponto B NA MESMA aresta (nunca busca outra aresta próxima
    // -- o vão é sempre dentro de uma única aresta).
    const a1 = aresta.p1;
    const a2 = aresta.p2;
    const { t: tB } = distanciaAoSegmento(pontoB, a1, a2);
    const tA = trimQuebraA.t;
    const comprimento = Math.hypot(a2.x - a1.x, a2.y - a1.y);
    if (comprimento < 1e-6 || Math.abs(tB - tA) * comprimento < 1) {
      return { ok: false, erro: "Os dois pontos do vão estão muito próximos -- afaste mais o 2º clique." };
    }

    const tMin = Math.min(tA, tB);
    const tMax = Math.max(tA, tB);
    const pontoEm = (t: number): Ponto => ({ x: a1.x + (a2.x - a1.x) * t, y: a1.y + (a2.y - a1.y) * t });

    const pedacos: { p1: Ponto; p2: Ponto }[] = [];
    if (tMin > 1e-6) pedacos.push({ p1: a1, p2: pontoEm(tMin) });
    if (tMax < 1 - 1e-6) pedacos.push({ p1: pontoEm(tMax), p2: a2 });

    snapshot();
    set((state) => {
      const semAlvo = state.projeto.geometria.filter((g) => g.id !== alvo.id);
      const novasLinhas: Geometria[] = [];
      if (alvo.tipo !== "linha") {
        arestas.forEach((a, i) => {
          if (i === trimQuebraA.indiceAresta) return;
          novasLinhas.push({ id: uuidv4(), tipo: "linha", camada: alvo.camada, x1: a.p1.x, y1: a.p1.y, x2: a.p2.x, y2: a.p2.y });
        });
      }
      pedacos.forEach((seg) => {
        novasLinhas.push({ id: uuidv4(), tipo: "linha", camada: alvo.camada, x1: seg.p1.x, y1: seg.p1.y, x2: seg.p2.x, y2: seg.p2.y });
      });
      return {
        projeto: { ...state.projeto, geometria: [...semAlvo, ...novasLinhas] },
        selecionadoIds: state.selecionadoIds.filter((sid) => sid !== alvo.id),
        trimQuebraA: null,
        trimQuebraPreviewB: null,
      };
    });
    return { ok: true };
  },

  setOffsetDistancia: (n) => set({ offsetDistancia: Number.isFinite(n) && n > 0 ? n : null }),

  // Iteração 37: recalculado a cada mousemove em CanvasStage.tsx ANTES do
  // 1º clique (ver `lib/offset.ts#geometriaSobCursorOffset`) -- só
  // controla o destaque visual de "qual linha seria escolhida agora",
  // sem efeito nenhum na lógica de aplicar o offset em si.
  setOffsetHover: (h) => set({ offsetHover: h }),

  // Só arma o alvo se a distância já foi informada e o clique caiu perto
  // de alguma ARESTA de fato (`segmentoOffsetAlvo` cobre linha solta e
  // as arestas de retângulo/polígono/polilinha -- ver comentário lá) --
  // nas outras situações (bloco, texto, círculo...), não faz nada, o
  // clique é simplesmente ignorado, sem quebrar o fluxo.
  selecionarAlvoOffset: (id, ponto) =>
    set((state) => {
      if (state.offsetDistancia === null) return state;
      const g = state.projeto.geometria.find((x) => x.id === id);
      if (!g) return state;
      const segmento = segmentoOffsetAlvo(g, ponto);
      if (!segmento) return state;
      // O destaque de "candidato" (hover) some assim que o alvo é
      // definitivamente escolhido -- a partir daqui quem dá feedback
      // visual é o preview da linha paralela (ver `GeometryLayer.tsx`).
      return { offsetAlvoId: id, offsetAlvoSegmento: segmento, offsetHover: null };
    }),

  // Calcula o vetor perpendicular unitário ao segmento alvo já resolvido
  // (`offsetAlvoSegmento` -- pode ser uma linha inteira ou só a aresta de
  // um retângulo/polígono/polilinha, ver `segmentoOffsetAlvo`) e desloca
  // uma NOVA linha paralela por `offsetDistancia`, no sentido do lado
  // onde `ponto` foi clicado (projeção do vetor "ponto - ponto médio"
  // sobre a normal decide o sinal). O objeto original permanece intacto
  // -- igual ao OFFSET do AutoCAD, que sempre cria um objeto novo (mesmo
  // quando o alvo era só uma aresta de uma forma fechada: isso NUNCA edita
  // o retângulo/polígono original, só desenha uma linha solta nova ao lado).
  aplicarOffset: (ponto) => {
    const { offsetAlvoId, offsetAlvoSegmento, offsetDistancia, projeto } = get();
    if (!offsetAlvoId || !offsetAlvoSegmento || offsetDistancia === null) {
      return { ok: false, erro: "Informe a distância e selecione a linha/aresta alvo primeiro." };
    }
    const original = projeto.geometria.find((g) => g.id === offsetAlvoId);
    if (!original) return { ok: false, erro: "O objeto alvo não existe mais." };

    const seg = offsetAlvoSegmento;
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return { ok: false, erro: "O segmento alvo tem comprimento zero." };

    const nx = -dy / len;
    const ny = dx / len;
    const midx = (seg.x1 + seg.x2) / 2;
    const midy = (seg.y1 + seg.y2) / 2;
    const proj = (ponto.x - midx) * nx + (ponto.y - midy) * ny;
    const sinal = proj >= 0 ? 1 : -1;
    const off = sinal * offsetDistancia;

    get().addGeometria({
      tipo: "linha",
      camada: original.camada,
      x1: seg.x1 + nx * off,
      y1: seg.y1 + ny * off,
      x2: seg.x2 + nx * off,
      y2: seg.y2 + ny * off,
    });
    // Mantém a distância armada (permite deslocar outra linha/aresta em
    // seguida, igual ao AutoCAD) -- só limpa o alvo já usado.
    set({ offsetAlvoId: null, offsetAlvoSegmento: null });
    return { ok: true };
  },

  setFilletRaio: (n) => set({ filletRaio: Number.isFinite(n) && n >= 0 ? n : 0 }),

  setFilletAguardandoRaio: (b) => set({ filletAguardandoRaio: b }),

  selecionarAlvo1Fillet: (id) =>
    set((state) => {
      const g = state.projeto.geometria.find((x) => x.id === id);
      if (!g || g.tipo !== "linha") return state;
      return { filletAlvo1Id: id };
    }),

  // FILLET (concordância): acha o vértice teórico (interseção das duas
  // RETAS INFINITAS que contêm as linhas selecionadas), mantém em cada
  // linha a extremidade mais distante desse vértice, e:
  //   - raio = 0: estica/corta as duas linhas pra se encontrarem
  //     exatamente no vértice (um "V" perfeito, como o FILLET R=0 do
  //     AutoCAD faz na prática de um TRIM/EXTEND combinado);
  //   - raio > 0: calcula os pontos de tangência (distância
  //     `raio / tan(theta/2)` do vértice ao longo de cada linha, onde
  //     theta é o ângulo entre elas) e o centro do arco (na bissetriz, a
  //     `raio / sin(theta/2)` do vértice), corta as duas linhas nos
  //     pontos de tangência e insere um novo elemento "arco" ligando-as.
  aplicarFillet: (id2) => {
    const { filletAlvo1Id, filletRaio, projeto } = get();
    if (!filletAlvo1Id) return { ok: false, erro: "Selecione a primeira linha antes." };
    if (id2 === filletAlvo1Id) return { ok: false, erro: "Selecione uma segunda linha diferente da primeira." };

    const l1 = projeto.geometria.find((g) => g.id === filletAlvo1Id);
    const l2 = projeto.geometria.find((g) => g.id === id2);
    if (!l1 || l1.tipo !== "linha" || !l2 || l2.tipo !== "linha") {
      return { ok: false, erro: "As duas linhas selecionadas precisam ser linhas retas." };
    }

    const p1a = { x: l1.x1, y: l1.y1 };
    const p1b = { x: l1.x2, y: l1.y2 };
    const p2a = { x: l2.x1, y: l2.y1 };
    const p2b = { x: l2.x2, y: l2.y2 };
    const v = intersecaoRetas(p1a, p1b, p2a, p2b);
    if (!v) return { ok: false, erro: "As duas linhas são paralelas -- não há como concordá-las." };

    const distV = (p: Ponto) => Math.hypot(p.x - v.x, p.y - v.y);
    const longe1 = distV(p1a) >= distV(p1b) ? p1a : p1b;
    const longe2 = distV(p2a) >= distV(p2b) ? p2a : p2b;

    if (filletRaio <= 0) {
      snapshot();
      set((state) => ({
        projeto: {
          ...state.projeto,
          geometria: state.projeto.geometria.map((g) => {
            if (g.id === l1.id) return { ...g, x1: longe1.x, y1: longe1.y, x2: v.x, y2: v.y } as Geometria;
            if (g.id === l2.id) return { ...g, x1: longe2.x, y1: longe2.y, x2: v.x, y2: v.y } as Geometria;
            return g;
          }),
        },
        filletAlvo1Id: null,
      }));
      return { ok: true };
    }

    const u1 = normalizar(subtrair(longe1, v));
    const u2 = normalizar(subtrair(longe2, v));
    const cosTheta = Math.max(-1, Math.min(1, produtoEscalar(u1, u2)));
    const theta = Math.acos(cosTheta);
    if (theta < 1e-4 || theta > Math.PI - 1e-4) {
      return { ok: false, erro: "As linhas estão quase colineares -- não dá pra calcular um arco de concordância." };
    }

    const distTangente = filletRaio / Math.tan(theta / 2);
    const tang1 = somar(v, escalar(u1, distTangente));
    const tang2 = somar(v, escalar(u2, distTangente));
    const distCentro = filletRaio / Math.sin(theta / 2);
    const bissetriz = normalizar(somar(u1, u2));
    const centro = somar(v, escalar(bissetriz, distCentro));

    // Ângulos (centro -> ponto de tangência) e escolha do sentido de
    // varredura que dá o arco CURTO (< 180°) entre os dois pontos de
    // tangência -- ver comentário equivalente em ArcoGeometria/types.ts.
    const a1 = Math.atan2(tang1.y - centro.y, tang1.x - centro.x);
    const a2 = Math.atan2(tang2.y - centro.y, tang2.x - centro.x);
    const a1n = normalizarAngulo(a1);
    const a2n = normalizarAngulo(a2);
    const deltaDireto = normalizarAngulo(a2n - a1n);
    let anguloInicial: number;
    let anguloFinal: number;
    if (deltaDireto <= Math.PI) {
      anguloInicial = a1n;
      anguloFinal = a1n + deltaDireto;
    } else {
      anguloInicial = a2n;
      anguloFinal = a2n + (Math.PI * 2 - deltaDireto);
    }

    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: [
          ...state.projeto.geometria.map((g) => {
            if (g.id === l1.id) return { ...g, x1: longe1.x, y1: longe1.y, x2: tang1.x, y2: tang1.y } as Geometria;
            if (g.id === l2.id) return { ...g, x1: longe2.x, y1: longe2.y, x2: tang2.x, y2: tang2.y } as Geometria;
            return g;
          }),
          {
            id: uuidv4(),
            tipo: "arco",
            camada: l1.camada,
            x: centro.x,
            y: centro.y,
            raio: filletRaio,
            anguloInicial: (anguloInicial * 180) / Math.PI,
            anguloFinal: (anguloFinal * 180) / Math.PI,
          } as Geometria,
        ],
      },
      filletAlvo1Id: null,
    }));
    return { ok: true };
  },

  setSelecaoBox: (b) => set({ selecaoBox: b }),

  // Decide Window (arrastou p/ direita: inicio.x <= atual.x) vs Crossing
  // (arrastou p/ esquerda) e aplica o teste de contido/cruzado
  // correspondente (ver lib/selection.ts) a toda a geometria visível.
  // `aditivo` (Shift no mouseup) preserva a seleção anterior em vez de
  // substituí-la -- mesmo espírito do Shift+clique em elemento único.
  confirmarSelecaoBox: (aditivo) => {
    const { selecaoBox, projeto } = get();
    if (!selecaoBox) return;
    const { inicio, atual } = selecaoBox;
    const modoJanela = atual.x >= inicio.x;
    const caixaSelecao = {
      minX: Math.min(inicio.x, atual.x),
      minY: Math.min(inicio.y, atual.y),
      maxX: Math.max(inicio.x, atual.x),
      maxY: Math.max(inicio.y, atual.y),
    };
    const idsNaCaixa = projeto.geometria
      .filter((g) => resolverCamada(projeto.camadas, g.camada).visible)
      .filter((g) => {
        const bbox = caixaEnvolvente(g);
        return modoJanela ? caixaContida(caixaSelecao, bbox) : caixasSeCruzam(caixaSelecao, bbox);
      })
      .map((g) => g.id);
    set((state) => ({
      selecionadoIds: aditivo ? Array.from(new Set([...state.selecionadoIds, ...idsNaCaixa])) : idsNaCaixa,
      selecaoBox: null,
    }));
  },

  setToolbarPosicao: (p) => set({ toolbarPosicao: p }),

  setTextoFontSizeAtivo: (n) => set({ textoFontSizeAtivo: Number.isFinite(n) && n > 0 ? n : 129 }),

  atualizarTexto: (id, patch) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          g.id === id && g.tipo === "texto" ? ({ ...g, ...patch } as Geometria) : g
        ),
      },
    })),

  // COTA: mesmo fluxo de 2 cliques da calibração de XREF (1º clique
  // grava p1, 2º grava p2); o 3º clique -- que de fato insere a
  // geometria -- é tratado por `confirmarCota`, chamado pelo CanvasStage
  // quando `cotaP1` e `cotaP2` já estão preenchidos.
  registrarPontoCota: (p) =>
    set((state) => {
      if (!state.cotaP1) return { cotaP1: p };
      if (!state.cotaP2) return { cotaP2: p };
      return state;
    }),

  confirmarCota: (p3) => {
    const { cotaP1, cotaP2, activeLayer } = get();
    if (!cotaP1 || !cotaP2) return { ok: false, erro: "Marque o ponto inicial e final da medição antes." };
    const dist = Math.hypot(cotaP2.x - cotaP1.x, cotaP2.y - cotaP1.y);
    if (dist < 1e-6) return { ok: false, erro: "Os dois pontos medidos são coincidentes." };
    get().addGeometria({
      tipo: "cota",
      camada: activeLayer,
      x1: cotaP1.x,
      y1: cotaP1.y,
      x2: cotaP2.x,
      y2: cotaP2.y,
      px: p3.x,
      py: p3.y,
      texto: `${dist.toFixed(1)} mm`,
      distanciaMm: dist,
    });
    set({ cotaP1: null, cotaP2: null, ferramenta: "selecionar" });
    return { ok: true };
  },

  past: [],
  future: [],

  desfazer: () => {
    const { past, future, projeto, selecionadoIds } = get();
    if (past.length === 0) return;
    const anterior = past[past.length - 1];
    set({
      projeto: { ...projeto, geometria: anterior },
      past: past.slice(0, -1),
      future: [projeto.geometria, ...future].slice(0, HISTORICO_MAX),
      selecionadoIds: selecionadoIds.filter((id) => anterior.some((g) => g.id === id)),
      gripAlvo: null,
    });
  },

  refazer: () => {
    const { past, future, projeto, selecionadoIds } = get();
    if (future.length === 0) return;
    const proximo = future[0];
    set({
      projeto: { ...projeto, geometria: proximo },
      future: future.slice(1),
      past: [...past, projeto.geometria].slice(-HISTORICO_MAX),
      selecionadoIds: selecionadoIds.filter((id) => proximo.some((g) => g.id === id)),
      gripAlvo: null,
    });
  },

  gripAlvo: null,

  // Só arma o grip se o elemento existir e realmente tiver vértices
  // editáveis (ver `gripsDeGeometria`) -- protege contra cliques
  // "fantasma" em grips de um elemento que tenha sido removido/desfeito
  // entre a renderização e o clique.
  iniciarStretch: (id, indice, modo) =>
    set((state) => {
      const alvo = state.projeto.geometria.find((g) => g.id === id);
      if (!alvo) return state;
      return { gripAlvo: { id, indice, modo } };
    }),

  // Confirma o STRETCH: aplica o novo ponto ao vértice/aresta em arrasto
  // (via `aplicarStretchNaGeometria`/`aplicarStretchArestaNaGeometria`,
  // ambas puras -- Iteração 22 escolhe qual das duas pelo `gripAlvo.modo`)
  // e registra undo ANTES de mutar -- mesmo padrão de TRIM/FILLET, que
  // também mutam `geometria` direto (fora de `addGeometria`/`removeGeometria`).
  aplicarStretch: (ponto) => {
    const { gripAlvo, projeto } = get();
    if (!gripAlvo) return { ok: false };
    const alvo = projeto.geometria.find((g) => g.id === gripAlvo.id);
    if (!alvo) {
      set({ gripAlvo: null });
      return { ok: false };
    }
    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          g.id === alvo.id
            ? gripAlvo.modo === "aresta"
              ? aplicarStretchArestaNaGeometria(g, gripAlvo.indice, ponto)
              : aplicarStretchNaGeometria(g, gripAlvo.indice, ponto)
            : g
        ),
      },
      gripAlvo: null,
    }));
    return { ok: true };
  },

  cancelarStretch: () => set({ gripAlvo: null }),

  // Cada clique da ferramenta "polilinha" (comando PL) crava mais um
  // vértice -- mesmo mecanismo de "poligono", mas o resultado NÃO fecha
  // sozinho nem é hachurável (ver `PolilinhaGeometria` em types.ts).
  adicionarPontoPolilinha: (p) =>
    set((state) => ({
      polilinhaPontos: state.polilinhaPontos ? [...state.polilinhaPontos, p] : [p],
    })),

  // Fecha e persiste a polilinha em construção (mínimo 2 vértices --
  // precisa de pelo menos 1 segmento pra fazer sentido como elemento).
  fecharPolilinha: () => {
    const { polilinhaPontos, activeLayer, addGeometria } = get();
    if (!polilinhaPontos || polilinhaPontos.length < 2) return { ok: false };
    addGeometria({ tipo: "polilinha", camada: activeLayer, pontos: polilinhaPontos });
    set({ polilinhaPontos: null, ferramenta: "selecionar" });
    return { ok: true };
  },

  polilinhaPontos: null,

  // Carimbo/legenda ABNT: edição de texto não entra no histórico de
  // undo/redo (não é "geometria de desenho", é metadado da prancha,
  // mesmo espírito de `setNomeProjeto`/`atualizarCamada`).
  //
  // Iteração 27: sempre que `responsavel`/`crea` mudam, o subconjunto é
  // espelhado no "perfil do responsável técnico" salvo em localStorage
  // (`perfilTecnico.ts`) -- pedido do usuário: "Automatize o carimbo para
  // ficar salvo os dados do tecnico reponsavel logo e assinatura", sem
  // nenhum botão "salvar como padrão", só acontece sozinho a cada edição.
  atualizarCarimbo: (patch) => {
    set((state) => ({ projeto: { ...state.projeto, carimbo: { ...state.projeto.carimbo, ...patch } } }));
    // Só inclui as chaves que de fato vieram no patch -- incluir a outra
    // como `undefined` apagaria ela do perfil salvo (ver `salvarPerfilTecnico`).
    const patchPerfil: PerfilResponsavelTecnico = {};
    if ("responsavel" in patch) patchPerfil.responsavel = patch.responsavel;
    if ("crea" in patch) patchPerfil.crea = patch.crea;
    if (Object.keys(patchPerfil).length > 0) salvarPerfilTecnico(patchPerfil);
  },

  setLogoCarimbo: (dataUrl) => {
    set((state) => ({
      projeto: { ...state.projeto, carimbo: { ...state.projeto.carimbo, logoDataUrl: dataUrl ?? undefined } },
    }));
    salvarPerfilTecnico({ logoDataUrl: dataUrl ?? undefined });
  },

  setAssinaturaCarimbo: (dataUrl) => {
    set((state) => ({
      projeto: { ...state.projeto, carimbo: { ...state.projeto.carimbo, assinaturaDataUrl: dataUrl ?? undefined } },
    }));
    salvarPerfilTecnico({ assinaturaDataUrl: dataUrl ?? undefined });
  },

  // Rotação/Escala de blocos (Sprint 3): mesmo espírito de `atualizarTexto`
  // -- edição ao vivo (cada onChange da barra de propriedades), sem
  // snapshot por tecla (undo granular demais seria péssima UX aqui;
  // ver `girarSelecao` abaixo para a ação discreta que SIM entra no
  // histórico).
  atualizarBloco: (id, patch) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          g.id === id && g.tipo === "bloco" ? ({ ...g, ...patch } as Geometria) : g
        ),
      },
    })),

  girarSelecao: (anguloGraus) => {
    const { selecionadoIds, projeto } = get();
    if (selecionadoIds.length === 0 || !Number.isFinite(anguloGraus) || anguloGraus === 0) {
      return { ok: false };
    }
    const idSet = new Set(selecionadoIds);
    const alvos = projeto.geometria.filter((g) => idSet.has(g.id));
    if (alvos.length === 0) return { ok: false };

    const bbox = alvos.reduce(
      (acc, g) => {
        const b = caixaEnvolvente(g);
        return {
          minX: Math.min(acc.minX, b.minX),
          minY: Math.min(acc.minY, b.minY),
          maxX: Math.max(acc.maxX, b.maxX),
          maxY: Math.max(acc.maxY, b.maxY),
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
    const centro = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };

    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          idSet.has(g.id) ? girarGeometria(g, centro, anguloGraus) : g
        ),
      },
    }));
    return { ok: true };
  },

  escalarSelecao: (fatorX, fatorY) => {
    const { selecionadoIds, projeto } = get();
    if (
      selecionadoIds.length === 0 ||
      !Number.isFinite(fatorX) ||
      !Number.isFinite(fatorY) ||
      fatorX <= 0 ||
      fatorY <= 0 ||
      (fatorX === 1 && fatorY === 1)
    ) {
      return { ok: false };
    }
    const idSet = new Set(selecionadoIds);
    const alvos = projeto.geometria.filter((g) => idSet.has(g.id));
    if (alvos.length === 0) return { ok: false };

    const bbox = alvos.reduce(
      (acc, g) => {
        const b = caixaEnvolvente(g);
        return {
          minX: Math.min(acc.minX, b.minX),
          minY: Math.min(acc.minY, b.minY),
          maxX: Math.max(acc.maxX, b.maxX),
          maxY: Math.max(acc.maxY, b.maxY),
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
    const centro = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };

    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          idSet.has(g.id) ? escalarGeometria(g, centro, fatorX, fatorY) : g
        ),
      },
    }));
    return { ok: true };
  },

  atualizarCamadaSelecao: (nomeCamada) => {
    const { selecionadoIds, projeto } = get();
    if (selecionadoIds.length === 0 || !projeto.camadas[nomeCamada]) return;
    const idSet = new Set(selecionadoIds);
    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          idSet.has(g.id) ? { ...g, camada: nomeCamada } : g
        ),
      },
    }));
  },

  // Preview ao vivo da Escala (Iteração 12p): estado puramente de UI, não
  // entra no histórico de undo (ver comentário do campo na interface
  // `CadState` acima) -- só é lido por `GeometryLayer.tsx` na hora de
  // desenhar, pra mostrar como a seleção ficaria ANTES de "Aplicar".
  setEscalaPreview: (p) => set({ escalaPreview: p }),

  // Edição de vértices de polígono/retângulo fechado (Sprint 3): um
  // retângulo é promovido a polígono na hora do primeiro edit (ver
  // `promoverRetanguloParaPoligono`) -- daí em diante, o elemento vira
  // um `tipo: "poligono"` normal, editável ponto a ponto como qualquer
  // outro (inclusive pelos grips de STRETCH já existentes).
  inserirVerticeNoMeio: (id, indiceSegmento) => {
    const { projeto } = get();
    const original = projeto.geometria.find((g) => g.id === id);
    if (!original) return { ok: false, erro: "Elemento não encontrado." };
    const promovido = original.tipo === "retangulo" ? promoverRetanguloParaPoligono(original) : original;
    if (promovido.tipo !== "poligono" && promovido.tipo !== "polilinha") {
      return { ok: false, erro: "Esse tipo de elemento não tem vértices editáveis." };
    }
    const pontos = promovido.pontos;
    const fechado = promovido.tipo === "poligono";
    const maxIndice = fechado ? pontos.length - 1 : pontos.length - 2;
    if (indiceSegmento < 0 || indiceSegmento > maxIndice) {
      return { ok: false, erro: "Segmento inválido." };
    }
    const p1 = pontos[indiceSegmento];
    const p2 = pontos[(indiceSegmento + 1) % pontos.length];
    const novoPonto = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const novosPontos = [...pontos.slice(0, indiceSegmento + 1), novoPonto, ...pontos.slice(indiceSegmento + 1)];

    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          g.id === id ? ({ ...promovido, pontos: novosPontos } as Geometria) : g
        ),
      },
    }));
    return { ok: true };
  },

  removerVertice: (id, indice) => {
    const { projeto } = get();
    const original = projeto.geometria.find((g) => g.id === id);
    if (!original) return { ok: false, erro: "Elemento não encontrado." };
    const promovido = original.tipo === "retangulo" ? promoverRetanguloParaPoligono(original) : original;
    if (promovido.tipo !== "poligono" && promovido.tipo !== "polilinha") {
      return { ok: false, erro: "Esse tipo de elemento não tem vértices editáveis." };
    }
    const minimo = promovido.tipo === "poligono" ? 3 : 2;
    if (promovido.pontos.length <= minimo) {
      return { ok: false, erro: `Não é possível remover -- mínimo de ${minimo} vértices.` };
    }
    if (indice < 0 || indice >= promovido.pontos.length) {
      return { ok: false, erro: "Vértice inválido." };
    }
    const novosPontos = promovido.pontos.filter((_, i) => i !== indice);

    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          g.id === id ? ({ ...promovido, pontos: novosPontos } as Geometria) : g
        ),
      },
    }));
    return { ok: true };
  },

  abrirMenuVertice: (id, indice, x, y) => set({ menuVerticeContexto: { id, indice, x, y } }),
  fecharMenuVertice: () => set({ menuVerticeContexto: null }),

  // Autenticação + Gerenciador de Projetos na nuvem (Sprint 3) ---------------
  setUsuario: (u) => set({ usuario: u }),
  setProjetosSalvos: (lista) => set({ projetosSalvos: lista }),
  abrirGerenciadorProjetos: () => set({ gerenciadorProjetosAberto: true }),
  fecharGerenciadorProjetos: () => set({ gerenciadorProjetosAberto: false }),

  // Padrão de Entrada/Concessionária (leva não-numerada): insere o
  // conjunto poste+ramal+medidor+textos como UM ÚNICO passo de undo (só
  // um `snapshot()` para as 5 geometrias), como um "bloco composto" do
  // AutoCAD -- Ctrl+Z desfaz o conjunto inteiro de uma vez, não peça por
  // peça. O ramal (linha) conecta o topo do poste ao topo do medidor
  // (dimensões reais da biblioteca, via `getBlockDef`) -- representa por
  // padrão um ramal AÉREO; o texto do tipo é editável depois (dois
  // cliques: selecionar + editar Conteúdo na barra de propriedades, como
  // qualquer outro texto) para trocar por "RAMAL SUBTERRÂNEO" quando for
  // o caso. A cota de afastamento nasce com "0,00 m" -- o usuário edita o
  // valor real depois de medir a distância até o limite do lote.
  inserirPadraoConcessionaria: (posteXY, medidorXY) => {
    const posteDef = getBlockDef("poste_concessionaria");
    const medidorDef = getBlockDef("medidor_concessionaria");
    if (!posteDef || !medidorDef) return;
    const camada = get().activeLayer;
    const fontSize = get().textoFontSizeAtivo;

    const topoPoste = { x: posteXY.x, y: posteXY.y - posteDef.altura / 2 };
    const topoMedidor = { x: medidorXY.x, y: medidorXY.y - medidorDef.altura / 2 };

    snapshot();
    set((state) => {
      const novos: Geometria[] = [
        { id: uuidv4(), tipo: "bloco", camada, nome: "poste_concessionaria", x: posteXY.x, y: posteXY.y },
        { id: uuidv4(), tipo: "bloco", camada, nome: "medidor_concessionaria", x: medidorXY.x, y: medidorXY.y },
        {
          id: uuidv4(),
          tipo: "linha",
          camada,
          x1: topoPoste.x,
          y1: topoPoste.y,
          x2: topoMedidor.x,
          y2: topoMedidor.y,
        },
        {
          id: uuidv4(),
          tipo: "texto",
          camada,
          x: (topoPoste.x + topoMedidor.x) / 2,
          y: Math.min(topoPoste.y, topoMedidor.y) - fontSize * 1.5,
          conteudo: "RAMAL AÉREO",
          fontSize,
        },
        {
          id: uuidv4(),
          tipo: "texto",
          camada,
          x: posteXY.x + posteDef.largura,
          y: posteXY.y + posteDef.altura / 2 + fontSize,
          conteudo: "AFASTAMENTO: 0,00 m",
          fontSize,
        },
      ];
      return { projeto: { ...state.projeto, geometria: [...state.projeto.geometria, ...novos] } };
    });
  },

  // Gerador de diagrama unifilar fotovoltaico (Iteração 12b, reformulado
  // na Iteração 13 -- ver cabeçalho de `lib/diagramaFv.ts`) ------------------
  gerarDiagramaFotovoltaico: (dados) => {
    // Iteração 15: NÃO usar `activeLayer` aqui -- essa é a camada
    // atualmente selecionada na UI para ferramentas de desenho MANUAL
    // (poligono/cota/polilinha/etc.), e o valor inicial do projeto é
    // "BARRAMENTO" (âmbar `#f59e0b`). Um diagrama unifilar "pronto",
    // gerado automaticamente, não deve herdar essa seleção arbitrária --
    // foi exatamente isso que fez o diagrama sair inteiro amarelo/laranja
    // para o usuário (bug relatado: "o diagrama nao ficou igual o modelo
    // ... está todo quebrado"). Usamos sempre a camada "0" (cinza-escuro
    // `#475569`, quase preto), que é a convenção profissional/ABNT vista
    // no modelo de referência do usuário.
    const camada = "0";

    // A folha é centrada na origem (0,0) do MUNDO (mesma convenção de
    // `GridLayer.tsx`/`TitleBlockLayer.tsx`/`pdfExport.ts` -- o canto
    // superior-esquerdo da folha fica em `(-largura/2, -altura/2)`, NÃO em
    // `(0,0)`). Ancorar sem esse deslocamento (bug corrigido na 12b) fazia o
    // diagrama nascer fora da área útil e colidir com o carimbo.
    //
    // O diagrama fica com ~300-450mm de largura/altura total, dependendo do
    // número de inversores/MPPTs (as colunas ficam lado a lado, não
    // empilhadas) -- não cabe numa A4/A3 (área útil bem menor que isso).
    // Como os diagramas de referência do usuário são sempre em A1, trocamos
    // automaticamente para A1 quando a folha ativa for pequena demais, em
    // vez de deixar o diagrama sair cortado/sobrepondo o carimbo.
    const ALTURA_MINIMA_NECESSARIA = 350;
    if (FORMATOS_FOLHA[get().activeSheet].altura < ALTURA_MINIMA_NECESSARIA) {
      get().setActiveSheet("A1");
    }

    const folha = FORMATOS_FOLHA[get().activeSheet];
    const origemX = -folha.largura / 2 + MARGENS_ABNT.esquerda + 8;
    const origemY = -folha.altura / 2 + MARGENS_ABNT.superior + 20;
    const { geometria: novos, boxPadraoEntradaRepresentativo } = construirGeometriaDiagramaFv(
      dados,
      origemX,
      origemY,
      camada
    );

    snapshot();
    set((state) => {
      const comIds = novos.map((n): Geometria => ({ ...n, id: uuidv4() }));
      return {
        projeto: { ...state.projeto, geometria: [...state.projeto.geometria, ...comIds] },
        // Iteração 29h: pede pro CanvasStage centralizar/enquadrar o
        // diagrama recém-gerado, que podia nascer fora da área visível
        // atual (zoom/pan não tinham relação nenhuma com onde o diagrama
        // foi inserido) -- ver comentário em `enquadramentoPendente`.
        enquadramentoPendente: bboxCombinada(comIds),
      };
    });

    // Devolvido pra quem chamou (o modal, `DiagramaFvModal.tsx`) poder
    // encaixar ali dentro a foto real do padrão de entrada que o usuário
    // anexou, se houver -- a criação do XREF em si é responsabilidade do
    // modal (mesmo padrão assíncrono de `XrefImportButton.tsx`: medir a
    // imagem, gerar o Object URL, persistir no IndexedDB), não desta ação
    // síncrona do store.
    return { boxPadraoEntradaRepresentativo };
  },

  // Gerador de sistema fotovoltaico no solo (Iteração 29 -- ver cabeçalho
  // de `lib/sistemaSolo.ts`) --------------------------------------------
  gerarSistemaSolo: (dados) => {
    const { geometria: novos, resumo } = gerarLeiauteSistemaSolo(dados);

    // Garante que as camadas dedicadas existam (com cores distintas),
    // sem duplicar se o usuário já gerou um sistema no solo antes neste
    // mesmo projeto -- `criarCamada` já é um no-op se a chave já existir.
    get().criarCamada("TERRENO", "#a16207");
    get().criarCamada("MODULOS_FV", "#1d4ed8");
    get().criarCamada("LASTROS", "#334155");
    get().criarCamada("ANOTACOES_SOLO", "#0f172a");
    // Iteração 29c: camada própria pras cotas de espaçamento (cor
    // distinta, convenção comum de CAD pra linhas de cota).
    get().criarCamada("COTAS_SOLO", "#dc2626");

    snapshot();
    set((state) => {
      // Iteração 29h: remove qualquer geometria de uma geração ANTERIOR
      // deste mesmo gerador (`origemGeradorId === ORIGEM_GERADOR_SISTEMA_SOLO`)
      // antes de inserir a nova -- evita acumular cópias antigas (texto e
      // geometria sobrepostos) quando o usuário clica "Gerar leiaute" de
      // novo no mesmo projeto (bug relatado indiretamente: o usuário via
      // texto/geometria de uma rodada de testes anterior, ainda visível,
      // colidindo com a rodada nova). Geometria desenhada manualmente pelo
      // usuário nunca tem essa marca (`origemGeradorId === undefined`),
      // então nunca é afetada por este filtro, mesmo estando na mesma
      // camada.
      const geometriaSemGeracaoAnterior = state.projeto.geometria.filter(
        (g) => g.origemGeradorId !== ORIGEM_GERADOR_SISTEMA_SOLO
      );
      const comIds = novos.map((n): Geometria => ({ ...n, id: uuidv4() }));
      return {
        projeto: { ...state.projeto, geometria: [...geometriaSemGeracaoAnterior, ...comIds] },
        // Iteração 29h: mesmo motivo do diagrama fotovoltaico acima --
        // centraliza automaticamente o sistema no solo recém-gerado.
        enquadramentoPendente: bboxCombinada(comIds),
      };
    });

    return resumo;
  },

  // Gerador de dimensionamento de cargas elétricas (Iteração 30 -- ver
  // cabeçalho de `lib/cargasEletricas.ts`) -------------------------------
  gerarDimensionamentoCargas: (dados) => {
    // Mesma lógica de `gerarDiagramaFotovoltaico` -- a tabela de cargas +
    // diagrama do QDC não cabem confortavelmente numa A4 (várias linhas de
    // tabela + N disjuntores), então troca pra A1 automaticamente quando a
    // folha ativa for pequena demais.
    const ALTURA_MINIMA_NECESSARIA = 350;
    if (FORMATOS_FOLHA[get().activeSheet].altura < ALTURA_MINIMA_NECESSARIA) {
      get().setActiveSheet("A1");
    }
    const folha = FORMATOS_FOLHA[get().activeSheet];
    // Canto superior-esquerdo da área útil da folha (dentro das margens
    // ABNT) -- MESMA convenção de `gerarDiagramaFotovoltaico` logo abaixo.
    // Usar (0,0) aqui seria um bug (mundo é centrado na folha, não no
    // canto) -- ver comentário completo em `cargasEletricas.ts`.
    const origemX = -folha.largura / 2 + MARGENS_ABNT.esquerda + 8;
    const origemY = -folha.altura / 2 + MARGENS_ABNT.superior + 20;
    // Espaço horizontal realmente livre à esquerda do carimbo (canto
    // inferior direito da folha) -- usado por `cargasEletricas.ts` pra
    // quebrar o diagrama em várias fileiras de disjuntores em vez de
    // crescer pra dentro do carimbo quando há muitos circuitos.
    const areaCarimbo = dimensoesCarimbo(get().activeSheet, get().projeto.carimbo?.escalaCarimbo ?? 1);
    const larguraMaximaCargas = Math.max(300, folha.largura - MARGENS_ABNT.esquerda - MARGENS_ABNT.direita - areaCarimbo.largura - 20);
    const { geometria: novos, resumo } = construirGeometriaCargasEletricas(dados, origemX, origemY, larguraMaximaCargas);

    get().criarCamada("QDC_DIAGRAMA", "#0f172a");
    get().criarCamada("QDC_TABELA", "#334155");
    // Iteração 33 -- uma camada por fase (+ neutro) do diagrama multifilar,
    // cada uma com sua própria cor (pedido do usuário: "quero que cada fase
    // tenha uma cor digerente e o neutro a cor azul"). `criarCamada` é
    // no-op se a camada já existir, então isso é seguro chamar toda vez.
    Object.values(CAMADA_FASE_INFO).forEach(({ camada, cor }) => get().criarCamada(camada, cor));
    // Iteração 33b -- camada reservada do terra/PE (sempre verde, nunca
    // usada em nenhuma fase -- ver comentário de `CAMADA_TERRA_INFO`).
    get().criarCamada(CAMADA_TERRA_INFO.camada, CAMADA_TERRA_INFO.cor);

    snapshot();
    set((state) => {
      // Mesmo padrão de `gerarSistemaSolo` (Iteração 29h): substitui (não
      // acumula) uma geração anterior deste mesmo gerador, sem tocar em
      // nada desenhado manualmente pelo usuário.
      const geometriaSemGeracaoAnterior = state.projeto.geometria.filter(
        (g) => g.origemGeradorId !== ORIGEM_GERADOR_CARGAS
      );
      const comIds = novos.map((n): Geometria => ({ ...n, id: uuidv4() }));
      return {
        projeto: {
          ...state.projeto,
          geometria: [...geometriaSemGeracaoAnterior, ...comIds],
          // Iteração 31 -- guarda a última entrada do formulário junto do
          // projeto: o modal reabre já preenchido pra ajustar/acrescentar
          // itens sem redigitar tudo (pedido explícito do usuário). Vai
          // junto no salvar/carregar do projeto (Firestore/mock) porque
          // vive dentro de `projeto`.
          dadosCargasEletricas: dados,
        },
        enquadramentoPendente: bboxCombinada(comIds),
      };
    });

    return resumo;
  },

  // Lançamento automático de tomadas/interruptores/iluminação (Iteração 35
  // -- ver cabeçalho de `lib/roomDetection.ts`/`lib/lancamentoEletrico.ts`) ---
  //
  // Iteração 38 (bug reportado pelo usuário -- verbatim: "desenhei um
  // quarto e um banheiro e o lancamento automatico deu erro dizendo que
  // existe comodo sem nomes, porem repare no printe que tem nomes nos
  // dois comodos"): reproduzido via script sintético -- a causa não é o
  // algoritmo de `detectarComodos` (que lida bem com o cômodo em L com os
  // 2 textos presentes), e sim a SELEÇÃO estar incompleta: o gerador só
  // enxerga `idsSelecionados`, então um texto de nome que o usuário vê na
  // tela mas que não entrou na seleção (esquecido, ou excluído por um
  // Window-select cuja caixa estimada de texto -- ver `caixaEnvolvente` em
  // `selection.ts` -- ficou um pouco fora da caixa arrastada) gera
  // silenciosamente um falso "sem_nome".
  //
  // Correção: SÓ QUANDO a 1ª detecção (com a seleção tal como veio)
  // reporta 1+ problema "sem_nome", tenta uma 2ª detecção incluindo
  // também qualquer texto do projeto INTEIRO que esteja dentro (ou bem
  // perto) da bounding box das paredes selecionadas -- e só ADOTA essa
  // 2ª tentativa se ela for ESTRITAMENTE melhor (menos problemas no
  // total) que a 1ª. Isso foi desenhado deliberadamente pra nunca
  // regredir: um teste de regressão pegou que uma versão anterior desta
  // correção, que sempre incluía textos próximos incondicionalmente,
  // podia puxar um texto solto/não relacionado (ex.: uma anotação
  // qualquer perto da casa que não é nome de nenhum cômodo) e criar um
  // problema NOVO ("mesclada") numa área que já estava correta -- por
  // isso a 2ª tentativa só roda quando já existe um "sem_nome" de
  // verdade pra resolver, e só é aceita se realmente reduzir o número de
  // problemas (nunca troca 1 problema por outro).
  gerarLancamentoEletrico: (idsSelecionados) => {
    const geometriaSelecionada = get().projeto.geometria.filter((g) => idsSelecionados.includes(g.id));
    let deteccao = detectarComodos(geometriaSelecionada);

    if (deteccao.problemas.some((p) => p.tipo === "sem_nome")) {
      const segmentosParede = extrairSegmentosDeParede(geometriaSelecionada);
      if (segmentosParede.length > 0) {
        const MARGEM_TEXTO_PROXIMO_MM = 1000;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [a, b] of segmentosParede) {
          minX = Math.min(minX, a.x, b.x);
          minY = Math.min(minY, a.y, b.y);
          maxX = Math.max(maxX, a.x, b.x);
          maxY = Math.max(maxY, a.y, b.y);
        }
        minX -= MARGEM_TEXTO_PROXIMO_MM;
        minY -= MARGEM_TEXTO_PROXIMO_MM;
        maxX += MARGEM_TEXTO_PROXIMO_MM;
        maxY += MARGEM_TEXTO_PROXIMO_MM;
        const idsJaIncluidos = new Set(geometriaSelecionada.map((g) => g.id));
        const textosProximosNaoSelecionados = get().projeto.geometria.filter(
          (g) =>
            g.tipo === "texto" &&
            !idsJaIncluidos.has(g.id) &&
            g.x >= minX &&
            g.x <= maxX &&
            g.y >= minY &&
            g.y <= maxY
        );
        if (textosProximosNaoSelecionados.length > 0) {
          const deteccaoTentativa = detectarComodos([...geometriaSelecionada, ...textosProximosNaoSelecionados]);
          if (deteccaoTentativa.problemas.length < deteccao.problemas.length) {
            deteccao = deteccaoTentativa;
          }
        }
      }
    }

    // Política "tudo ou nada" (ver comentário na declaração da ação,
    // acima): QUALQUER problema (aberta/mesclada/sem_nome) cancela a
    // geração inteira -- nunca lança geometria parcial silenciosamente.
    if (deteccao.problemas.length > 0 || deteccao.comodos.length === 0) {
      return { ok: false, resumo: null, problemas: deteccao.problemas };
    }

    const { geometria: pontosEletricos, resumo } = gerarPontosEletricos(deteccao.comodos);

    // Legenda ancorada à DIREITA da bounding box da própria seleção (a
    // "casa") -- este gerador sobrepõe uma planta já existente em
    // qualquer lugar do mundo, ao contrário dos outros geradores (que
    // desenham do zero a partir do canto da folha ativa), ver comentário
    // em `lancamentoEletrico.ts#gerarLegendaEletrica`.
    const bboxSelecao = bboxCombinada(geometriaSelecionada);
    const nomesBlocosUsados = Array.from(
      new Set(pontosEletricos.filter((g) => g.tipo === "bloco").map((g) => (g as { nome: string }).nome))
    );
    const margem = 400;
    const legenda = bboxSelecao
      ? gerarLegendaEletrica(nomesBlocosUsados, bboxSelecao.maxX + margem, bboxSelecao.minY)
      : gerarLegendaEletrica(nomesBlocosUsados, 0, 0);

    CAMADAS_LANCAMENTO_ELETRICO.forEach(({ camada, cor }) => get().criarCamada(camada, cor));

    snapshot();
    set((state) => {
      // Mesmo padrão de proveniência de `gerarSistemaSolo`/`gerarDimensionamentoCargas`
      // (Iteração 29h): substitui só a geração ANTERIOR deste mesmo
      // gerador, nunca toca em nada desenhado manualmente pelo usuário
      // (nem nas paredes/textos que acabaram de ser SELECIONADOS -- esta
      // ação só ADICIONA geometria nova, nunca remove/edita a seleção).
      const geometriaSemGeracaoAnterior = state.projeto.geometria.filter(
        (g) => g.origemGeradorId !== ORIGEM_GERADOR_LANCAMENTO_ELETRICO
      );
      // `pontosEletricos` já vem marcado por `gerarPontosEletricos` -- a
      // legenda é marcada aqui (mesma constante) pra garantir que os 2
      // sejam substituídos JUNTOS numa próxima geração, mesmo que
      // `gerarLegendaEletrica` (função genérica, reaproveitável por
      // outros geradores no futuro) não marque proveniência sozinha.
      const comIds = [...pontosEletricos, ...legenda].map(
        (n): Geometria => ({ ...n, id: uuidv4(), origemGeradorId: ORIGEM_GERADOR_LANCAMENTO_ELETRICO })
      );
      return {
        projeto: { ...state.projeto, geometria: [...geometriaSemGeracaoAnterior, ...comIds] },
        enquadramentoPendente: bboxCombinada(comIds),
      };
    });

    return { ok: true, resumo, problemas: [] };
  },

  // Viewport / MVIEW + ZOOM WINDOW (Sprint 5) --------------------------------
  setViewportAtivo: (id) => set({ viewportAtivoId: id }),

  atualizarViewport: (id, patch) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: state.projeto.geometria.map((g) =>
          g.id === id && g.tipo === "viewport" ? ({ ...g, ...patch } as Geometria) : g
        ),
      },
    })),

  // Pranchas / Layouts (Iteração 12e; múltiplas viewports + orientação, 12g) ---
  criarPrancha: (formato) => {
    const { projeto } = get();
    const id = uuidv4();
    const nova: Prancha = {
      id,
      nome: `Prancha ${projeto.pranchas.length + 1}`,
      formato,
      viewports: [criarViewportInicialPrancha(formato, undefined, projeto.geometria)],
    };
    // Criar/remover prancha não entra no histórico de undo (Ctrl+Z) -- é
    // gestão de páginas, não edição de desenho, mesmo espírito de
    // add/removerXref. Força a ferramenta pra "Selecionar" (via
    // `setFerramenta`, que também limpa qualquer desenho em andamento) --
    // uma Prancha só permite desenho DENTRO de um Viewport nela (ver
    // guarda em `CanvasStage.tsx#handleStageClick`).
    get().setFerramenta("selecionar");
    set((state) => ({
      projeto: { ...state.projeto, pranchas: [...state.projeto.pranchas, nova] },
      prenchaAtivaId: id,
      viewportPranchaSelecionadoId: null,
      viewportAtivoId: null,
    }));
    return id;
  },

  selecionarPrancha: (id) => {
    if (id) get().setFerramenta("selecionar");
    // Troca de página (Desenho <-> Prancha, ou entre Pranchas) sempre
    // limpa o foco de Model Ativo/seleção de viewport -- `viewportAtivoId`
    // é reaproveitado pelos DOIS contextos (viewport MV do Desenho e
    // viewport de Prancha, ver comentário em `CadState`) então uma troca
    // de contexto sem limpar deixaria um id apontando pro lugar errado.
    // Iteração 12u: `xrefSelecionadoId` também é limpo -- os grips de
    // seleção de um XREF só são desenhados no Desenho (`XrefLayer.tsx`,
    // não renderizado dentro de uma Prancha), então uma seleção deixada
    // pra trás ficaria "presa" sem nenhuma UI pra mostrá-la/limpá-la ao
    // voltar direto pro Desenho de outra forma.
    set({ prenchaAtivaId: id, viewportAtivoId: null, viewportPranchaSelecionadoId: null, xrefSelecionadoId: null });
  },

  removerPrancha: (id) =>
    set((state) => {
      const restantes = state.projeto.pranchas.filter((pr) => pr.id !== id);
      const eraAtiva = state.prenchaAtivaId === id;
      // Iteração 12t: descarta o fit-to-page/zoom manual guardado pra essa
      // Prancha -- se um novo id igual (improvável, são uuids) ou uma
      // Prancha nova reaproveitar o slot, não deve herdar um enquadramento
      // de uma página que já não existe mais.
      const pranchaViewports = Object.fromEntries(
        Object.entries(state.pranchaViewports).filter(([pranchaId]) => pranchaId !== id)
      );
      return {
        projeto: { ...state.projeto, pranchas: restantes },
        prenchaAtivaId: eraAtiva ? restantes[0]?.id ?? null : state.prenchaAtivaId,
        viewportPranchaSelecionadoId: eraAtiva ? null : state.viewportPranchaSelecionadoId,
        viewportAtivoId: eraAtiva ? null : state.viewportAtivoId,
        pranchaViewports,
      };
    }),

  renomearPrancha: (id, nome) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        pranchas: state.projeto.pranchas.map((pr) => (pr.id === id ? { ...pr, nome } : pr)),
      },
    })),

  redefinirFormatoPrancha: (id, formato) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        pranchas: state.projeto.pranchas.map((pr) => (pr.id === id ? { ...pr, formato } : pr)),
      },
    })),

  redefinirOrientacaoPrancha: (id, orientacao) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        pranchas: state.projeto.pranchas.map((pr) => (pr.id === id ? { ...pr, orientacao } : pr)),
      },
    })),

  adicionarViewportPrancha: (pranchaId, x, y, largura, altura) => {
    const id = uuidv4();
    // Iteração 12v: pedido do usuário -- "quando abro uma segunda
    // viewport na mesma prancha ele deve replicar o desenho tambem,
    // atualmente as outras viewport estao vindo vazias". Causa raiz: a
    // câmera inicial de um 2º+ viewport nascia com `modelScale: 1` e
    // `modelOffsetX/Y = x/y` (a posição do PRÓPRIO retângulo em
    // coordenadas de PAPEL) -- numericamente sem nenhuma relação com
    // onde a geometria de verdade está no MUNDO, então na prática
    // mostrava uma área vazia sempre que o Desenho não tivesse, por
    // coincidência, geometria perto desses mesmos números. Corrigido
    // reaproveitando `calcularCameraAjustada` -- a MESMA função que já
    // enquadra automaticamente o 1º viewport de uma Prancha nova
    // (`criarViewportInicialPrancha`) e o botão "Auto-ajuste" de um
    // viewport já existente (`autoAjustarViewportPrancha`, Iteração
    // 12g) -- garantindo que TODO viewport, novo ou não, nasce já
    // enquadrando a geometria atual do Desenho (ou centralizado no
    // mundo (0,0), se o Desenho ainda estiver vazio).
    const { projeto } = get();
    const camera = calcularCameraAjustada(largura, altura, projeto.geometria);
    const novo: ViewportGeometria = {
      id,
      tipo: "viewport",
      camada: "0",
      x,
      y,
      largura,
      altura,
      ...camera,
      bordaVisivel: true,
    };
    set((state) => ({
      projeto: {
        ...state.projeto,
        pranchas: state.projeto.pranchas.map((pr) =>
          pr.id === pranchaId ? { ...pr, viewports: [...pr.viewports, novo] } : pr
        ),
      },
    }));
    return id;
  },

  atualizarViewportDaPrancha: (pranchaId, viewportId, patch) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        pranchas: state.projeto.pranchas.map((pr) =>
          pr.id === pranchaId
            ? { ...pr, viewports: pr.viewports.map((v) => (v.id === viewportId ? { ...v, ...patch } : v)) }
            : pr
        ),
      },
    })),

  removerViewportDaPrancha: (pranchaId, viewportId) =>
    set((state) => ({
      projeto: {
        ...state.projeto,
        pranchas: state.projeto.pranchas.map((pr) =>
          pr.id === pranchaId ? { ...pr, viewports: pr.viewports.filter((v) => v.id !== viewportId) } : pr
        ),
      },
      viewportPranchaSelecionadoId: state.viewportPranchaSelecionadoId === viewportId ? null : state.viewportPranchaSelecionadoId,
      viewportAtivoId: state.viewportAtivoId === viewportId ? null : state.viewportAtivoId,
    })),

  selecionarViewportPrancha: (id) => set({ viewportPranchaSelecionadoId: id }),

  autoAjustarViewportPrancha: (pranchaId, viewportId) => {
    const { projeto } = get();
    const prancha = projeto.pranchas.find((pr) => pr.id === pranchaId);
    const vp = prancha?.viewports.find((v) => v.id === viewportId);
    if (!vp) return;
    const camera = calcularCameraAjustada(vp.largura, vp.altura, projeto.geometria);
    set((state) => ({
      projeto: {
        ...state.projeto,
        pranchas: state.projeto.pranchas.map((pr) =>
          pr.id === pranchaId
            ? { ...pr, viewports: pr.viewports.map((v) => (v.id === viewportId ? { ...v, ...camera } : v)) }
            : pr
        ),
      },
    }));
  },

  // Área de transferência / Ctrl+C+Ctrl+V (Iteração 12c) -----------------------
  copiarSelecaoParaAreaDeTransferencia: () => {
    const { selecionadoIds, projeto } = get();
    if (selecionadoIds.length === 0) return;
    const idSet = new Set(selecionadoIds);
    const copiados = projeto.geometria.filter((g) => idSet.has(g.id));
    if (copiados.length === 0) return;
    // Deep clone (round-trip por JSON) pra não deixar `areaTransferencia`
    // com os MESMOS objetos que estão em `projeto.geometria` -- editar um
    // (ex.: mover o original) não pode mudar o que foi copiado.
    const clone = JSON.parse(JSON.stringify(copiados)) as Geometria[];
    set({ areaTransferencia: clone });
    // Best-effort: também grava no clipboard de verdade do sistema
    // operacional, pra funcionar colar entre abas/janelas diferentes deste
    // app -- ignora silenciosamente qualquer falha (permissão negada,
    // contexto não-seguro, navegador sem suporte), já que
    // `areaTransferencia` sozinha já cobre o caso normal (colar na mesma
    // aba/sessão).
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      const payload = JSON.stringify({ cadUnifilarClipboard: true, itens: clone });
      navigator.clipboard.writeText(payload).catch(() => {});
    }
  },

  colarAreaDeTransferencia: (pontoDestino) => {
    const itens = get().areaTransferencia;
    if (itens.length === 0) return;

    const bbox = itens.reduce(
      (acc, g) => {
        const b = caixaEnvolvente(g);
        return {
          minX: Math.min(acc.minX, b.minX),
          minY: Math.min(acc.minY, b.minY),
          maxX: Math.max(acc.maxX, b.maxX),
          maxY: Math.max(acc.maxY, b.maxY),
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
    const centro = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
    // Com ponto de destino (posição do cursor no momento do Ctrl+V):
    // centraliza o grupo colado ali -- "colar onde o mouse está", como a
    // maioria dos apps de desenho. Sem ponto (ex.: cursor fora da área do
    // canvas no momento do Ctrl+V): desloca 20mm na diagonal a partir da
    // posição original, no mesmo espírito do "paste offset" do AutoCAD,
    // pra Ctrl+V's sucessivos não empilharem tudo exatamente em cima do
    // anterior.
    const destino = pontoDestino ?? { x: centro.x + 20, y: centro.y + 20 };
    const dx = destino.x - centro.x;
    const dy = destino.y - centro.y;

    snapshot();
    const colados = itens.map((g) => ({ ...transladar(g, dx, dy), id: uuidv4() }));
    set((state) => ({
      projeto: { ...state.projeto, geometria: [...state.projeto.geometria, ...colados] },
      // A seleção passa a ser o grupo recém-colado (não o original) --
      // igual à maioria dos editores (Illustrator/Figma/Word): dá pra já
      // arrastar/apagar/mover o que acabou de ser colado sem precisar
      // clicar de novo.
      selecionadoIds: colados.map((g) => g.id),
    }));
  },

  colarTextoExterno: (texto, ponto) => {
    const conteudo = texto.trim();
    if (!conteudo) return;
    const { activeLayer, textoFontSizeAtivo } = get();
    snapshot();
    set((state) => ({
      projeto: {
        ...state.projeto,
        geometria: [
          ...state.projeto.geometria,
          {
            tipo: "texto",
            id: uuidv4(),
            camada: activeLayer,
            x: ponto.x,
            y: ponto.y,
            conteudo,
            fontSize: textoFontSizeAtivo,
          } as Geometria,
        ],
      },
      selecionadoIds: [],
    }));
  },
  };
});
