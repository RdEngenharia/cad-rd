/**
 * types.ts
 * -----------------------------------------------------------------------
 * Modelo de dados do editor. A estrutura espelha exatamente o schema do
 * Firestore descrito na especificação do produto: um "Projeto" contém uma
 * lista de XRefs (referências externas de imagem/PDF, apenas metadados) e
 * uma lista de "geometria" (linhas, círculos e blocos).
 *
 * Mantemos os nomes de campo em português (id_projeto, nome, camada, etc.)
 * porque é o contrato de dados que será persistido no Firestore.
 * -----------------------------------------------------------------------
 */

/** Tipos de geometria suportados pelo MVP. */
export type TipoGeometria =
  | "linha"
  | "circulo"
  | "bloco"
  | "retangulo"
  | "poligono"
  | "arco"
  | "texto"
  | "cota"
  | "polilinha"
  | "viewport";

/** Unidade de trabalho do desenho. 1 unidade = 1 milímetro (escala real). */
export const UNIDADE = "mm";

export interface GeometriaBase {
  id: string;
  tipo: TipoGeometria;
  /** Nome da camada (layer). Ex.: "barramento", "anotacoes", "0". */
  camada: string;
  /**
   * Iteração 29h -- marca opcional de PROVENIÊNCIA: qual gerador
   * automático criou este elemento (ex.: "sistemaSolo"), se algum.
   * `undefined` para tudo desenhado manualmente pelo usuário (a grande
   * maioria da geometria). Usado por `store.ts` pra decidir o que
   * REMOVER antes de inserir uma nova rodada do MESMO gerador (evita
   * acumular cópias antigas quando o usuário clica "Gerar leiaute" de
   * novo no mesmo projeto -- bug relatado: texto/geometria antiga de uma
   * rodada anterior continuava visível, sobreposta à nova) -- sem nunca
   * apagar nada que o usuário tenha desenhado ou editado manualmente,
   * mesmo que esteja na mesma camada.
   */
  origemGeradorId?: string;
}

export interface LinhaGeometria extends GeometriaBase {
  tipo: "linha";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CirculoGeometria extends GeometriaBase {
  tipo: "circulo";
  x: number;
  y: number;
  raio: number;
  /** Iteração 14: círculo agora é hachurável (forma fechada), mesmo campo de retângulo/polígono. */
  hachura?: HachuraConfig;
}

export interface BlocoGeometria extends GeometriaBase {
  tipo: "bloco";
  /** Chave do símbolo na biblioteca de blocos (ex.: "disjuntor"). */
  nome: string;
  x: number;
  y: number;
  /** Ângulo em graus (0-360), sentido horário -- gira em volta do ponto de inserção (x,y). */
  rotacao?: number;
  /**
   * @deprecated Substituído por `escalaX`/`escalaY` (Sprint 3, controle
   * independente por eixo). Mantido só para ler blocos salvos antes dessa
   * mudança -- `escalaX`/`escalaY` sempre têm prioridade quando presentes
   * (ver fallback em `BlocoShape.tsx`).
   */
  escala?: number;
  escalaX?: number;
  escalaY?: number;
}

/**
 * Padrão de preenchimento (Hatch Tool, equivalente simplificado do
 * comando HATCH do AutoCAD). Se aplica a qualquer forma FECHADA
 * (retângulo, polígono -- inclui triângulo, que é só um polígono de 3
 * pontos -- e, desde a Iteração 14, círculo também) -- ver
 * `lib/hachura.ts` para o motor que gera o padrão em canvas a partir
 * dessa configuração. Continua NÃO se aplicando a formas abertas por
 * natureza (linha, polilinha, arco).
 */
export type HachuraTipo =
  | "SOLID"
  | "ANSI31_DIAGONAL"
  | "PONTILHADO"
  | "CONCRETO"
  | "TERRA"
  | "CRUZADO"
  | "BLOCO";

export interface HachuraConfig {
  tipo: HachuraTipo;
  /** Escala do padrão (1 = ladrilho-base de ~10mm de mundo). */
  escala: number;
  /** Cor do padrão em hexadecimal (ex.: "#334155"). */
  cor: string;
}

export interface RetanguloGeometria extends GeometriaBase {
  tipo: "retangulo";
  /** Canto superior-esquerdo (já normalizado: sempre o menor x/y dos dois cliques). */
  x: number;
  y: number;
  /** Sempre >= 0. */
  largura: number;
  altura: number;
  hachura?: HachuraConfig;
  /**
   * Iteração 16: traço tracejado PRÓPRIO do retângulo, independente do
   * `estiloLinha` da camada -- pedido pra reproduzir as caixas de
   * agrupamento tracejadas do gerador de diagrama FV (`lib/diagramaFv.ts`)
   * sem precisar que a camada inteira ("0", usada por todo o resto do
   * diagrama) vire tracejada. `undefined`/`false` = sólido (comportamento
   * de sempre, só cai no `estiloLinha` da camada); `true` força tracejado
   * mesmo numa camada de traço contínuo. Não existe um "false explícito
   * força sólido mesmo com camada tracejada" -- se precisar disso no
   * futuro, é só inverter a prioridade na hora de resolver o dash final.
   */
  tracejado?: boolean;
}

export interface PoligonoGeometria extends GeometriaBase {
  tipo: "poligono";
  /** Vértices do polígono (>= 3), sempre renderizado fechado. */
  pontos: { x: number; y: number }[];
  hachura?: HachuraConfig;
}

/**
 * Arco circular -- só é criado automaticamente pelo comando FILLET
 * (concordância) quando o raio é > 0; não tem ferramenta de desenho
 * manual própria no MVP.
 */
export interface ArcoGeometria extends GeometriaBase {
  tipo: "arco";
  /** Centro do arco. */
  x: number;
  y: number;
  raio: number;
  /** Ângulos em graus. `anguloFinal` sempre > `anguloInicial` (varre no sentido padrão do Canvas 2D, ver lib/geom.ts). */
  anguloInicial: number;
  anguloFinal: number;
}

/**
 * Texto (label) livre no desenho. `fontSize` é definido em milímetros de
 * MUNDO (não em pixels de tela) -- de propósito: como a exportação PDF já
 * mapeia 1 unidade de mundo = 1mm de papel na prancha ativa (ver
 * `pdfExport.ts`), um `fontSize` em mm automaticamente "respeita a escala
 * da prancha ativa" sem precisar de nenhuma lógica extra de conversão --
 * o mesmo texto aparece do mesmo tamanho físico em qualquer formato A1-A4.
 */
export interface TextoGeometria extends GeometriaBase {
  tipo: "texto";
  x: number;
  y: number;
  conteudo: string;
  /** Tamanho da fonte em mm de mundo. */
  fontSize: number;
  /** Ângulo em graus (0-360), sentido horário -- gira em volta do ponto de inserção (x,y). */
  rotacao?: number;
}

/**
 * Cota (Dimension): mede a distância entre dois pontos e "congela" o
 * texto calculado no momento da criação (não recalcula se a geometria
 * medida for editada depois -- igual a uma cota "explodida" do AutoCAD).
 * `px`/`py` é o 3º clique do usuário (posição da linha de cota/extensão);
 * a linha de cota em si é derivada disso via `lib/geom.ts#linhaDeCota`.
 */
export interface CotaGeometria extends GeometriaBase {
  tipo: "cota";
  /** Ponto inicial medido (1º clique). */
  x1: number;
  y1: number;
  /** Ponto final medido (2º clique). */
  x2: number;
  y2: number;
  /** Ponto do 3º clique -- define o deslocamento perpendicular da linha de cota. */
  px: number;
  py: number;
  /** Distância formatada (ex.: "123.4 mm"), calculada e congelada na criação -- fallback pra cotas salvas antes da Iteração 12s (sem `distanciaMm`). */
  texto: string;
  /**
   * Distância real em mm de mundo (Iteração 12s), sem formatação nenhuma
   * -- ao contrário de `texto` (congelado pra sempre na unidade em que
   * foi criado), este valor permite reformatar o rótulo exibido na tela
   * (e no PDF) na unidade de exibição ATUAL (`unidadeDesenho`) sempre que
   * o usuário trocar mm/cm/m, sem precisar re-medir a cota. Opcional só
   * por compatibilidade com projetos salvos antes desta iteração.
   */
  distanciaMm?: number;
  /**
   * Tamanho da fonte do rótulo, em mm de MUNDO (Iteração 29d) -- mesma
   * convenção/unidade de `TextoGeometria.fontSize`. Opcional: quando
   * ausente (todas as cotas criadas manualmente pela ferramenta "Cota" no
   * `CommandLine`/`GeometryLayer`, e qualquer projeto salvo antes desta
   * iteração), os renderizadores caem no tamanho fixo de sempre (9pt no
   * PDF, 3mm no DXF -- ver `pdfExport.ts`/`dxfExport.ts`), sem nenhuma
   * mudança de comportamento. Passou a existir porque o fixo de sempre
   * fica ilegível quando a cota mede uma distância em ESCALA BEM MAIOR
   * que o diagrama elétrico típico (ex.: o gerador de sistema fotovoltaico
   * no solo, `lib/sistemaSolo.ts`, mede dezenas de metros) -- ali o
   * gerador agora define esse campo proporcional ao tamanho do terreno,
   * igual já fazia com o texto-resumo/seta do norte.
   */
  fontSize?: number;
}

/**
 * Polilinha (PLINE aberta, estilo AutoCAD): sequência de vértices unidos
 * como UM ÚNICO elemento, mas -- ao contrário de "poligono" -- NÃO fecha
 * automaticamente nem é hachurável. Distinta do "poligono" (que sempre
 * nasce fechado, pensado para regiões de hachura) por design: o comando
 * `PL` é o PLINE genérico do AutoCAD, o `POL` continua sendo o atalho
 * "forma fechada pronta pra hachurar" que já existia.
 */
export interface PolilinhaGeometria extends GeometriaBase {
  tipo: "polilinha";
  /** Vértices (>= 2), unidos em sequência, SEM fechar entre o último e o primeiro. */
  pontos: { x: number; y: number }[];
}

/**
 * Viewport (Sprint 5, comando MV/MVIEW): um retângulo eixo-alinhado
 * colocado sobre a prancha (Paper Space) que funciona como uma "janela"
 * pra uma vista independente do MESMO espaço de geometria compartilhado
 * do projeto (não existe um "Model Space" fisicamente separado nesta
 * versão do app -- todo elemento sempre viveu num único sistema de
 * coordenadas em mm; um Viewport é uma vista recortada/reescalada DESSE
 * mesmo mundo, não uma cópia). `x/y/largura/altura` são a posição e o
 * tamanho do RETÂNGULO na folha (mm de papel) -- igual a um retângulo
 * normal. `modelScale`/`modelOffsetX`/`modelOffsetY` descrevem a "câmera
 * local" desse viewport: quantos mm do mundo (`modelScale`) equivalem a
 * 1mm de papel dentro do retângulo, e qual ponto do mundo (`modelOffsetX/
 * Y`) aparece no canto superior-esquerdo do retângulo -- exatamente o
 * par escala+pan que define o que a janela mostra. `modelScale` É a
 * escala de impressão (`1:modelScale`), calculada/editável direto (ver
 * `PropertiesPanel.tsx`). Duplo clique DENTRO do retângulo entra no modo
 * "Model Ativo" (`viewportAtivoId` no store): a partir daí, a roda do
 * mouse e o pan com o botão do meio/direito passam a alterar
 * `modelScale`/`modelOffsetX/Y` DESTE viewport em vez do zoom/pan
 * principal da prancha -- até um duplo clique FORA de qualquer viewport
 * devolver o foco à prancha.
 */
export interface ViewportGeometria extends GeometriaBase {
  tipo: "viewport";
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** mm de mundo por mm de papel dentro do retângulo -- é a escala de impressão "1:modelScale". */
  modelScale: number;
  /** Ponto do mundo (mm) que aparece no canto superior-esquerdo do retângulo. */
  modelOffsetX: number;
  modelOffsetY: number;
  /** `false` esconde a borda do retângulo no PDF exportado (o conteúdo continua saindo normalmente). */
  bordaVisivel: boolean;
}

export type Geometria =
  | LinhaGeometria
  | CirculoGeometria
  | BlocoGeometria
  | RetanguloGeometria
  | PoligonoGeometria
  | ArcoGeometria
  | TextoGeometria
  | CotaGeometria
  | PolilinhaGeometria
  | ViewportGeometria;

/**
 * Omit "distributivo": aplicado a uma união discriminada, preserva os
 * membros individuais (ao contrário do `Omit` padrão, que colapsa a
 * união para as chaves em comum antes de remover `K`). Usado para
 * tipar a criação de uma nova geometria sem o campo `id` (gerado pelo
 * store), mantendo `tipo` como discriminante de cada variante.
 */
export type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type NovaGeometria = DistributiveOmit<Geometria, "id">;

/**
 * XRef (eXternal REFerence): conceito equivalente ao IMAGEATTACH/XREF do
 * AutoCAD. Nunca sobe o binário da imagem/PDF para o Firestore -- apenas
 * metadados de posicionamento. O binário em si vive só no navegador
 * (Blob/Object URL) e, opcionalmente, em IndexedDB para sobreviver a
 * reloads da página.
 */
export interface XRef {
  id: string;
  nome_arquivo: string;
  tipo: "imagem" | "pdf";
  x: number;
  y: number;
  escala: number;
  largura_px: number;
  altura_px: number;
  /** true depois que a ferramenta "Calibrar" (Scale by Reference) ajustou a escala. */
  calibrado?: boolean;
  /**
   * Controla se a imagem/PDF de fundo é desenhada no canvas e exportada no
   * PDF (Iteração 12c: botão "fundo ligado/desligado" por XREF, pedido do
   * usuário) -- útil pra esconder temporariamente a referência e ver só o
   * desenho por cima, sem precisar apagar o XREF. Ausente (undefined,
   * XREFs importados antes deste campo existir) é tratado como visível
   * (true) em todo lugar que lê este campo -- sem precisar de migração.
   */
  visivel?: boolean;
  /** Preenchido apenas em runtime (não é salvo no Firestore). */
  objectUrl?: string;
}

/**
 * Camada (layer) de desenho -- controla como a geometria associada a ela
 * é renderizada: cor do traço, espessura e visibilidade. Guardada como
 * dicionário (chave = nome da camada) tanto no store quanto no projeto
 * persistido, para que cores/visibilidade sejam preservadas ao
 * salvar/carregar do Firestore.
 */
export interface Camada {
  nome: string;
  /** Cor do traço em hexadecimal (ex.: "#f59e0b"). */
  cor: string;
  /** Espessura do traço em pixels de tela (na exportação PDF é convertida para mm). */
  espessuraDaLinha: number;
  visible: boolean;
  /**
   * Estilo do traço da camada -- "continua" (padrão) ou "tracejada".
   * Ausente (undefined) é tratado como "continua" em todo lugar que lê
   * este campo (camadas antigas salvas antes deste campo existir
   * continuam contínuas, sem precisar de migração). Aplica-se ao
   * desenho de linha/polilinha/retângulo/polígono/arco/cota tanto no
   * canvas (Konva `dash`) quanto na exportação PDF
   * (`doc.setLineDashPattern`) -- blocos (símbolos SVG) e hachuras NÃO
   * são afetados, só o traço/contorno dos elementos "de linha".
   */
  estiloLinha?: "continua" | "tracejada";
}

/**
 * Padrão de traço tracejado, em mm de MUNDO -- usado tanto pelo `dash` do
 * Konva (`components/GeometryLayer.tsx` e afins) quanto por
 * `doc.setLineDashPattern` no export PDF (`lib/pdfExport.ts`), para que o
 * tracejado do PDF "bata" visualmente com o tracejado mostrado no editor.
 * Traço de 6mm / vão de 4mm -- proporção visualmente próxima do tracejado
 * padrão do AutoCAD (`DASHED`) em escala de prancha.
 */
export const PADRAO_TRACEJADO_MM: [number, number] = [6, 4];

/**
 * Carimbo / legenda ABNT (quadro de título), desenhado automaticamente
 * no canto inferior direito da prancha ativa -- equivalente ao bloco de
 * título de um template profissional do AutoCAD. Todos os campos de
 * texto são livres (strings), preenchidos pelo usuário no painel
 * "Carimbo" da barra lateral; `logoDataUrl` é opcional (logo pequeno,
 * embutido como data-URL -- vai direto no JSON do projeto, sem precisar
 * de um sistema de blob separado como o dos XREFs, já que o tamanho
 * esperado é pequeno o bastante para caber num documento do Firestore).
 */
/**
 * Tipo de ligação/classe de consumo junto à concessionária de energia
 * (nomenclatura ANEEL/concessionárias distribuidoras) -- exigido no
 * carimbo dos diagramas de padrão de entrada/projeto fotovoltaico
 * enviados pelo usuário como referência (Iteração 12c). Os 3 valores
 * cobrem os casos citados pelo usuário; `""` significa "não preenchido"
 * (carimbo novo/em branco).
 */
export type TipoLigacaoConcessionaria = "" | "B1_RESIDENCIAL" | "B1_RURAL" | "B3_COMERCIAL";

/** Rótulo legível de cada `TipoLigacaoConcessionaria`, para UI e para o carimbo (canvas/PDF). */
export const ROTULOS_TIPO_LIGACAO: Record<TipoLigacaoConcessionaria, string> = {
  "": "",
  B1_RESIDENCIAL: "B1 Residencial",
  B1_RURAL: "B1 Rural",
  B3_COMERCIAL: "B3 Comercial",
};

export interface Carimbo {
  /** Quando falso, o carimbo não é desenhado no canvas nem exportado no PDF. */
  visivel: boolean;
  cliente: string;
  /**
   * Iteração 46 -- CPF do cliente (pessoa física), pedido do usuário:
   * "falta o campo de digitar o cpf do cliente". Exibido numa 2ª linha
   * logo abaixo do nome do cliente (mesmo padrão já usado pelo CREA
   * abaixo do responsável técnico -- ver `campoClienteComCpf` em
   * `TitleBlockLayer.tsx`/`pdfExport.ts`/`dxfExport.ts`), só quando
   * preenchido.
   */
  cpfCliente: string;
  titulo: string;
  responsavel: string;
  /** Registro CREA/CFT do responsável técnico. */
  crea: string;
  /** Texto livre (ex.: "1:50", "S/ESCALA") -- independente do formato de folha (`activeSheet`). */
  escala: string;
  /** Texto livre (ex.: "20/07/2026"). */
  data: string;
  /** Numeração da prancha (ex.: "01/03"). */
  prancha: string;
  /** Logo opcional, já redimensionado/comprimido em `data:image/...;base64,...`. */
  logoDataUrl?: string;
  /**
   * Endereço completo do cliente (rua, número, bairro, cidade/UF) --
   * campo em texto livre (Iteração 12c), exigido pelo usuário conforme os
   * diagramas de referência da concessionária.
   */
  enderecoCliente: string;
  /**
   * Número da conta contrato junto à concessionária de energia (Iteração
   * 12c) -- campo exigido pela concessionária nos diagramas de padrão de
   * entrada/fotovoltaico enviados como referência.
   */
  contaContrato: string;
  /** Classe de ligação junto à concessionária (Iteração 12c) -- ver `TipoLigacaoConcessionaria`. */
  tipoLigacao: TipoLigacaoConcessionaria;
  /**
   * Fator multiplicador (1 a 1.8) aplicado sobre as dimensões "padrão" do
   * carimbo (ver `dimensoesCarimbo`) -- Iteração 12c, pedido do usuário
   * para poder "crescer a escala" do carimbo quando os valores dos campos
   * (endereço, cliente, etc.) ficam cortados (reticências) no tamanho
   * padrão. Ausente (undefined, projetos salvos antes deste campo
   * existir) é tratado como 1 (tamanho padrão) em todo lugar que lê este
   * campo -- sem precisar de migração.
   */
  escalaCarimbo?: number;
  /**
   * Iteração 19: notas técnicas do projeto (texto livre, MULTILINHA --
   * cada `\n` quebra parágrafo, e cada parágrafo quebra automaticamente
   * dentro da largura do carimbo) -- pedido do usuário com base no PDF de
   * referência dele, que tem uma caixa "NOTAS:" com uma lista numerada
   * (seção transversal dos condutores, isolação dos cabos, etc.) sempre
   * posicionada logo ACIMA do carimbo. Muda de projeto pra projeto, por
   * isso é um campo editável (não hardcoded) -- ver `TitleBlockPanel.tsx`.
   */
  notas?: string;
  /**
   * Iteração 19: imagem da assinatura/rubrica do responsável técnico
   * (mesmo pipeline de compressão do `logoDataUrl`), desenhada por cima
   * de uma linha de assinatura, ao lado do nome + CREA/CFT -- pedido do
   * usuário ("tenho rubrica em imagem png e sempre uso"). Sem imagem, a
   * linha de assinatura ainda aparece (pra assinar à mão numa impressão
   * física), só sem a rubrica sobreposta.
   */
  assinaturaDataUrl?: string;
}

/**
 * Iteração 46 -- texto padrão do campo "Notas" para projetos fotovoltaicos
 * (pedido do usuário: "vou te mandar o texto real que usamos padrao para
 * projetos fotovoltaicos voce ja pode deixar ele padrao e ajustavel").
 * Preenche o campo automaticamente em todo projeto NOVO (`carimboVazio`)
 * -- continua um campo de texto livre normal, o usuário pode editar/
 * apagar/trocar à vontade a qualquer momento (não é fixo). Projetos já
 * salvos ANTES desta mudança mantêm o que já estiver gravado (mesmo que
 * vazio) -- ver o merge com `carimboVazio()` em `store.ts` (carregamento/
 * migração), que só usa este padrão quando o campo está *ausente*, nunca
 * sobrescrevendo um valor (incl. string vazia) já salvo.
 *
 * Em maiúsculas -- pedido do usuário: "preciso que todo o texto digitado
 * fique maiusculo" (ver também o `.toUpperCase()` aplicado a cada campo em
 * `TitleBlockPanel.tsx`).
 */
export const NOTAS_PADRAO_FOTOVOLTAICO = [
  "* A seção transversal dos condutores foram dimensionados em função da corrente máxima e capacidade de condução de corrente, permitindo-se utilizar até uma faixa acima da descrita em cada trecho dessa planta (exceto no padrão de medição);",
  "* Cabos em corrente contínua, na tensão elétrica máxima de 1.8KV, isolação em XLPE e cobertura em XLPE (termofixo) com UV;",
  "* Cabos em corrente alternada, na tensão máxima de 1KV, isolação e cobertura em PVC;",
  "* Cada string será protegida individualmente através das proteções internas do inversor ou por fusível e DPS CC;",
  "* A seção transversal dos condutores foram dimensionados em função da corrente máxima de saída e capacidade de condução de corrente, permitindo-se utilizar até uma faixa acima da descrita em cada trecho dessa planta (exceto no padrão de medição).",
]
  .join("\n")
  .toUpperCase();

export function carimboVazio(): Carimbo {
  return {
    visivel: true,
    cliente: "",
    cpfCliente: "",
    titulo: "",
    responsavel: "",
    crea: "",
    escala: "",
    data: "",
    prancha: "01/01",
    enderecoCliente: "",
    contaContrato: "",
    tipoLigacao: "",
    escalaCarimbo: 1,
    notas: NOTAS_PADRAO_FOTOVOLTAICO,
  };
}

/** Limites do fator `escalaCarimbo` -- ver `Carimbo.escalaCarimbo` e `dimensoesCarimbo`. */
export const ESCALA_CARIMBO_MIN = 1;
export const ESCALA_CARIMBO_MAX = 1.8;

/**
 * Dimensões (mm) do carimbo para um formato de folha -- "reajuste
 * proporcional ao trocar formato de folha": a largura acompanha a
 * largura útil (dentro das margens ABNT) da folha, dentro de limites
 * (nunca menor que 120mm nem maior que 210mm, pra continuar legível e
 * proporcional mesmo entre A4 e A1); a altura segue uma proporção fixa
 * (~4.3:1), próxima de um quadro de título ABNT NBR 10068 real.
 */
export function dimensoesCarimbo(
  formato: FormatoFolha,
  fatorEscala: number = 1,
  orientacao?: "paisagem" | "retrato"
): { largura: number; altura: number } {
  const folha = dimensoesFolhaOrientada(formato, orientacao);
  const larguraUtil = folha.largura - MARGENS_ABNT.esquerda - MARGENS_ABNT.direita;
  const largura = Math.min(210, Math.max(120, larguraUtil * 0.5));
  // Proporção 73/190 (antes 44/190, Iteração 12c): o carimbo cresceu de 3
  // para 5 linhas de conteúdo (título / endereço do cliente / cliente+
  // responsável / conta contrato+tipo de ligação / escala+data+prancha,
  // ver TitleBlockLayer.tsx e pdfExport.ts#desenharCarimboPdf) -- a altura
  // acompanha proporcionalmente (~1.66x) pra cada linha continuar legível
  // em vez de espremer os campos novos no mesmo espaço de antes.
  const altura = largura * (73 / 190);

  // `fatorEscala` (Carimbo.escalaCarimbo, Iteração 12c): multiplicador
  // adicional que o usuário controla no painel "Carimbo" pra crescer o
  // quadro inteiro (e, junto, os tamanhos de fonte -- que são frações da
  // altura, ver TitleBlockLayer.tsx/pdfExport.ts) quando os valores dos
  // campos ficam cortados no tamanho padrão. Clampado defensivamente aqui
  // também (não só na UI) para blindar contra valores inválidos vindos de
  // um projeto salvo editado à mão.
  const fator = clampFatorEscalaCarimbo(fatorEscala);
  return { largura: largura * fator, altura: altura * fator };
}

function clampFatorEscalaCarimbo(fator: number): number {
  if (!Number.isFinite(fator)) return 1;
  return Math.min(ESCALA_CARIMBO_MAX, Math.max(ESCALA_CARIMBO_MIN, fator));
}

/**
 * Prancha (Layout, Iteração 12e): uma "folha de plotagem" nomeada, com seu
 * próprio formato ABNT e carimbo, que mostra o `Projeto.geometria`
 * (equivalente ao Model Space do AutoCAD -- ver comentário em `Projeto`)
 * através de uma Viewport DE PÁGINA INTEIRA própria (`viewport` abaixo) --
 * não uma cópia dos dados, só uma re-projeção com zoom/pan independentes.
 * Igual ao par Model/Layout do AutoCAD: você desenha uma vez no Desenho
 * (`prenchaAtivaId === null`) e cada Prancha só ENQUADRA esse desenho, num
 * formato/escala/carimbo próprios, pronta pra imprimir/exportar.
 *
 * Deliberadamente SEM lista de geometria própria nesta versão (uma Prancha
 * não tem anotações soltas que só existem nela, como um texto de nota de
 * plotagem) -- decisão de escopo pra não precisar tornar toda ferramenta
 * de desenho "ciente de página"; só a Viewport de página inteira + o
 * carimbo. Ver `criarPrancha`/`selecionarPrancha`/`atualizarViewportPrancha`
 * em `store.ts`.
 */
export interface Prancha {
  id: string;
  /** Nome livre editável (ex.: "Prancha 1", "Detalhe do QDC"). */
  nome: string;
  formato: FormatoFolha;
  /**
   * Orientação da folha (Iteração 12g, pedido do usuário -- "quero ter a
   * opcao de folha em pe tambem"). Ausente = `"paisagem"` (comportamento
   * de sempre, sem migração necessária para Pranchas salvas antes deste
   * campo existir). `"retrato"` inverte largura/altura de `FORMATOS_FOLHA`
   * na hora de desenhar/exportar -- ver `dimensoesFolhaOrientada`.
   */
  orientacao?: "paisagem" | "retrato";
  /**
   * Viewports (janelas) desta Prancha (Iteração 12g -- antes, cada
   * Prancha tinha só 1 "câmera" única cobrindo a página inteira; agora
   * pode ter VÁRIAS, cada uma enquadrando um pedaço/escala diferente do
   * Desenho, exatamente como o Layout + MVIEW real do AutoCAD, pedido
   * explícito do usuário: "preciso do botao viewport dentro da prancha
   * [...] abrir outras viewports dentro da mesma prancha"). Cada item é
   * um `ViewportGeometria` completo (mesmo tipo usado pelo antigo MV/
   * MVIEW do Desenho, Sprint 5) -- `x/y/largura/altura` em coordenadas de
   * PAPEL desta prancha (mesmo sistema usado pela moldura/margem ABNT,
   * `PranchaLayer.tsx`), não coordenadas de mundo. Pode ser `[]` (folha
   * em branco, sem nenhuma janela ainda) -- `criarPrancha` já semeia 1
   * viewport padrão cobrindo a área útil inteira, enquadrando o Desenho
   * atual, pra manter a sensação de "já vem pronta pra imprimir" de
   * antes.
   */
  viewports: ViewportGeometria[];
}

export interface Projeto {
  id_projeto: string;
  nome: string;
  xrefs: XRef[];
  /**
   * Geometria do "Desenho" -- equivalente ao Model Space do AutoCAD:
   * espaço de desenho único, sem limite de folha, onde todas as
   * ferramentas de desenho sempre operam (isso NÃO mudou com as Pranchas,
   * Iteração 12e -- só o que é MOSTRADO/exportado através de uma Prancha
   * mudou). Uma Prancha nunca tem sua própria lista de geometria; ela só
   * enquadra esta aqui através da câmera em `Prancha.viewport`.
   */
  geometria: Geometria[];
  /** Dicionário de camadas do projeto (chave = nome da camada). */
  camadas: Record<string, Camada>;
  /**
   * Carimbo/legenda ABNT do projeto -- ÚNICO e COMPARTILHADO entre TODAS
   * as Pranchas (Iteração 12g, revertendo a decisão da Iteração 12e de
   * um carimbo independente por Prancha; pedido explícito do usuário:
   * "preciso que ao preencher o carimbo ele apareça automaticamente em
   * todas as pranchas ao mesmo tempo, se ajustando ao tamanho da
   * prancha"). Preenchido uma vez em `TitleBlockPanel.tsx`, desenhado em
   * TODA Prancha através de `dimensoesCarimbo(prancha.formato, ...)` --
   * cada uma escala o MESMO conteúdo pro seu próprio tamanho de folha,
   * nunca duplica o texto. Migração: um projeto salvo DURANTE a janela
   * 12e (carimbo por Prancha) tem esse valor recuperado a partir do
   * carimbo da 1ª Prancha ao carregar (ver `carregarProjeto`).
   */
  carimbo: Carimbo;
  /**
   * Pranchas (Layouts) deste projeto -- ver `Prancha` acima. Pode ser
   * vazio (projeto que só usa o Desenho, sem nenhuma prancha criada
   * ainda) -- `[]` por padrão em `projetoVazio()`, migrado
   * automaticamente a partir de `carimbo` na 1ª vez que um projeto salvo
   * ANTES da Iteração 12e é carregado (ver `carregarProjeto`).
   */
  pranchas: Prancha[];
  /**
   * uid do usuário dono do projeto (Sprint 3: Auth + Gestão de Projetos na
   * Nuvem) -- preenchido só quando salvo com um usuário logado (mock ou
   * Firebase Auth de verdade); usado para filtrar "Meus Projetos" no
   * Gerenciador. Projetos salvos sem login (fluxo antigo, por id manual)
   * não têm esse campo e não aparecem na lista -- continuam acessíveis
   * pelo id, como sempre.
   */
  owner_uid?: string;
  /**
   * Iteração 31 -- última entrada do gerador "Dimensionar cargas
   * elétricas (NBR 5410)" (ambientes, tomadas, lâmpadas, TUEs, fatores).
   * Guardada junto do projeto para o usuário poder REABRIR o modal já
   * preenchido e só ajustar/acrescentar um item, sem redigitar tudo
   * (pedido explícito). Tipo estrutural duplicado como `unknown` aqui
   * evitaria a dependência de `cargasEletricas.ts`, mas o import de tipo
   * é leve e mantém o dado tipado de ponta a ponta.
   */
  dadosCargasEletricas?: import("./cargasEletricas").DadosCargasEletricas;
}

/**
 * Resumo de um projeto salvo, usado só para listar no "Gerenciador de
 * Projetos" (Sprint 3) -- não carrega a geometria inteira, só o
 * suficiente pra exibir/ordenar a lista.
 */
export interface ProjetoResumo {
  id_projeto: string;
  nome: string;
  /** Epoch ms da última gravação (mock: `Date.now()` local; Firestore: `serverTimestamp()` convertido). */
  atualizado_em: number;
}

/** Conjunto de camadas com que todo projeto novo começa. */
export function camadasIniciais(): Record<string, Camada> {
  return {
    "0": { nome: "0", cor: "#475569", espessuraDaLinha: 1, visible: true },
    BARRAMENTO: { nome: "BARRAMENTO", cor: "#f59e0b", espessuraDaLinha: 1.6, visible: true },
    COMANDO: { nome: "COMANDO", cor: "#38bdf8", espessuraDaLinha: 1, visible: true },
    TEXTOS: { nome: "TEXTOS", cor: "#0f172a", espessuraDaLinha: 0.6, visible: true },
    MOLDURA: { nome: "MOLDURA", cor: "#64748b", espessuraDaLinha: 0.6, visible: true },
  };
}

/** Estilo de fallback usado quando um elemento referencia uma camada que não existe mais. */
export const CAMADA_FALLBACK: Camada = {
  nome: "?",
  cor: "#94a3b8",
  espessuraDaLinha: 1,
  visible: true,
};

/** Formatos de folha suportados (em milímetros), estilo AutoCAD layout. */
export const FORMATOS_FOLHA = {
  A4: { largura: 297, altura: 210 }, // paisagem
  A3: { largura: 420, altura: 297 },
  A2: { largura: 594, altura: 420 },
  A1: { largura: 841, altura: 594 },
} as const;

export type FormatoFolha = keyof typeof FORMATOS_FOLHA;

/**
 * Dimensões (mm) de um formato de folha considerando a orientação
 * (Iteração 12g). `FORMATOS_FOLHA` guarda sempre a versão PAISAGEM (largura
 * > altura); `"retrato"` simplesmente inverte largura/altura. A margem
 * ABNT (`MARGENS_ABNT`) continua aplicada do mesmo jeito nos dois casos
 * (esquerda sempre 25mm, de encadernação) -- só o retângulo externo da
 * folha gira.
 */
export function dimensoesFolhaOrientada(
  formato: FormatoFolha,
  orientacao: "paisagem" | "retrato" = "paisagem"
): { largura: number; altura: number } {
  const base = FORMATOS_FOLHA[formato];
  return orientacao === "retrato" ? { largura: base.altura, altura: base.largura } : { largura: base.largura, altura: base.altura };
}

/**
 * Margens internas de desenho estilo ABNT NBR 10068: 10mm nas bordas
 * superior/direita/inferior e 25mm na esquerda (reserva para
 * encadernação/dobra). Aplicada uniformemente a A1-A4 nesta MVP; a
 * norma varia ligeiramente por formato em projetos profissionais.
 */
export const MARGENS_ABNT = {
  superior: 10,
  direita: 10,
  inferior: 10,
  esquerda: 25,
} as const;

/** Ferramentas ativas na área de desenho. */
export type Ferramenta =
  | "selecionar"
  | "linha"
  | "circulo"
  | "retangulo"
  | "poligono"
  | "apagar"
  | "carimbar"
  | "mover"
  | "copiar"
  | "hachurar"
  | "aparar"
  | "deslocar"
  | "concordancia"
  | "calibrar"
  | "texto"
  | "cota"
  | "polilinha"
  | "concessionaria"
  | "viewport"
  | "zoomWindow";

/**
 * Posição da "régua de ferramentas" (o componente que reúne os botões de
 * atalho de cada ferramenta -- ver `components/ToolRuler.tsx`) na tela.
 * Configurável no painel de Configurações da barra lateral.
 */
export type PosicaoToolbar = "TOP" | "LEFT" | "RIGHT";
