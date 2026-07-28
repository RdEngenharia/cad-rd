/**
 * cargasEletricas.ts
 * -----------------------------------------------------------------------
 * Iteração 30 -- gerador "Dimensionamento de cargas elétricas (NBR 5410)"
 * pedido pelo usuário: dado o nome dos ambientes de uma casa (sala,
 * quarto, banheiro...), a quantidade de tomadas de cada um e os
 * equipamentos de uso específico (TUE -- chuveiro, forno, ar
 * condicionado...), calcula a carga instalada, agrupa tudo em circuitos
 * respeitando a NBR 5410, dimensiona disjuntor/condutor de cada circuito
 * e do disjuntor geral, e desenha automaticamente a tabela de cargas +
 * o diagrama unifilar do quadro de distribuição (QDC). Função pura (mesmo
 * princípio arquitetural de `lib/diagramaFv.ts`/`lib/sistemaSolo.ts`): só
 * calcula e devolve geometria + um resumo, sem depender de Zustand/React/
 * Konva. Quem insere de fato no projeto é `store.ts#gerarDimensionamentoCargas`.
 *
 * ESCOPO EXPLICITAMENTE PEDIDO PELO USUÁRIO -- diferente do restante do
 * app: `diagramaFv.ts` documenta a decisão de produto de NUNCA calcular
 * disjuntor/bitola sozinho ("o app nunca inventa um número de fusível/
 * DPS, o usuário sempre informa o valor real do projeto", Iteração 13).
 * Esta iteração é uma exceção deliberada e explícita a essa regra -- o
 * usuário pediu especificamente um "gerador automático" que calcule e
 * dimensione ele mesmo, "considerando sempre os fatores de potência e
 * demanda da NBR5410". Por isso todo resultado calculado aqui é rotulado
 * como PRELIMINAR no resumo/desenho (mesma convenção já usada em
 * `sistemaSolo.ts`), reforçando que não substitui a assinatura de um
 * responsável técnico.
 *
 * REGRAS NORMATIVAS APLICADAS (pesquisadas e conferidas nesta sessão,
 * não só de memória -- ver comentários pontuais abaixo de onde cada uma
 * é usada):
 *  - Carga mínima de ILUMINAÇÃO por ambiente: 100VA para área <= 6m²;
 *    acima disso, 100VA para os primeiros 6m² + 60VA para cada 4m²
 *    inteiros ou fração excedente (NBR 5410, 9.5.3).
 *  - Carga mínima de TOMADAS (TUG) em cozinha/copa/área de serviço/
 *    lavanderia (áreas "molhadas", com maior probabilidade de
 *    equipamentos de maior corrente -- liquidificador, cafeteira etc.):
 *    600VA para cada uma das 3 primeiras tomadas, 100VA para as demais
 *    (NBR 5410, 9.5.2.2).
 *  - Carga mínima de TOMADAS nos demais ambientes (sala, quarto,
 *    corredor, varanda, banheiro, escritório etc.): 100VA por tomada,
 *    sem a regra dos "3 primeiros pontos" (essa é exclusiva de
 *    cozinha/área de serviço).
 *  - TUE (tomada de uso específico -- chuveiro, torneira elétrica, forno,
 *    ar condicionado, máquina de lavar...): circuito INDIVIDUAL e
 *    EXCLUSIVO por equipamento, nunca dividido com TUG/iluminação (NBR
 *    5410, 9.5.2.1) -- dimensionado pela potência nominal do próprio
 *    equipamento, não por uma tabela de mínimos.
 *  - Circuitos de TUG de áreas molhadas (cozinha/área de serviço) NUNCA
 *    são agrupados com TUG de áreas secas (sala/quarto/etc.) nem com
 *    iluminação -- convenção profissional consolidada, tratada aqui como
 *    regra obrigatória (evita concentrar equipamentos de cozinha/lavanderia
 *    no mesmo circuito de tomadas comuns).
 *  - Seção mínima de condutor: 1,5mm² para iluminação, 2,5mm² para
 *    qualquer circuito de tomada (TUG ou TUE) -- NBR 5410, Tabela 47/uso
 *    corrente na prática de projeto residencial.
 *  - Capacidade de condução de corrente por seção (cobre, isolação PVC,
 *    70°C no condutor, método de referência B1 -- eletroduto embutido em
 *    parede termicamente isolante, 2 condutores carregados): NBR 5410,
 *    Tabela 36. Valores usados (A): 1,5mm²→17,5 / 2,5mm²→24 / 4mm²→32 /
 *    6mm²→41 / 10mm²→57 / 16mm²→76 / 25mm²→101 / 35mm²→125. Método B1 é o
 *    mais comum/conservador para instalação residencial embutida -- outros
 *    métodos (eletroduto aparente, agrupamento de vários circuitos no
 *    mesmo eletroduto, temperatura ambiente distinta) alterariam esses
 *    valores; este gerador NÃO modela agrupamento/temperatura/percurso,
 *    então o condutor sugerido é uma referência de estudo preliminar, a
 *    confirmar pelo projetista responsável (mesmo espírito do texto-
 *    resumo já usado em `sistemaSolo.ts`).
 *  - Fator de potência e fator de demanda: a pesquisa desta sessão NÃO
 *    encontrou uma tabela única e inequívoca de "fator de demanda NBR
 *    5410" citada de forma consistente entre fontes secundárias -- o
 *    fator de demanda aplicado ao disjuntor geral/entrada costuma ser, na
 *    prática, uma exigência da NORMA DE FORNECIMENTO de cada
 *    concessionária, não um valor fixo da NBR 5410 em si (é exatamente
 *    por isso que o usuário pediu um campo editável "conforme a norma de
 *    cada concessionária").
 *  - Iteração 31 (correção pedida pelo usuário): o fator de demanda
 *    ÚNICO aplicado no geral foi SUBSTITUÍDO por fatores POR CATEGORIA,
 *    como as normas de fornecimento fazem: (a) iluminação+TUG por faixa
 *    de carga instalada (`TABELA_FD_ILUMINACAO_TUG` -- 0,86 a 0,24);
 *    (b) aquecimento de água pelo Nº de chuveiros/aquecedores
 *    (`TABELA_FD_AQUECIMENTO`); (c) ar-condicionado pelo Nº de aparelhos
 *    (`TABELA_FD_AR_CONDICIONADO`, base NDU 001/Energisa); (d) demais
 *    TUEs com 100% (conservador). Cada fator pode ser sobrescrito
 *    manualmente no modal (campo em branco = tabela automática).
 *    Circuitos INDIVIDUAIS (ramais) continuam NUNCA sofrendo redução por
 *    fator de demanda -- isso só se aplica ao disjuntor/alimentador
 *    GERAL, nunca a um ramal específico (reduzir um ramal seria
 *    inseguro). `fatorPotencia = 0,92` segue como default editável.
 *  - Iteração 31 também acrescenta: quantidade de tomadas e de lâmpadas
 *    por circuito na tabela de cargas (conferência posterior), lista de
 *    material preliminar desenhada ao lado da tabela (condutores
 *    separados por bitola e por função fase/neutro/terra, disjuntores,
 *    tomadas, pontos de iluminação, QDC, DR, DPS) -- tudo texto editável
 *    do CAD -- e seleção de ar-condicionado por BTUs (split x inverter)
 *    no modal (`OPCOES_BTU_AR_CONDICIONADO`).
 *  - Iteração 32 (pedido do usuário): BALANCEAMENTO DE FASES -- num
 *    sistema bifásico/trifásico, cada circuito monofásico (1P) precisa
 *    ser distribuído entre as fases disponíveis pra não sobrecarregar
 *    uma única fase (prática consolidada de projeto -- a NBR 5410 exige
 *    uma instalação equilibrada mas não fixa uma fórmula/percentual
 *    numérico, pesquisado nesta sessão). Implementado em
 *    `balancearFases`: passo GULOSO que roda depois de TODOS os
 *    circuitos montados, atribuindo cada um à fase (ou par de fases, ou
 *    R+S+T no caso de circuito trifásico) de MENOR carga acumulada até
 *    aquele ponto -- circuitos 2P (fase-fase) contam carga cheia em CADA
 *    fase que usam; 3P conta 1/3 em cada uma (já é intrinsecamente
 *    equilibrado). O resultado (`CircuitoCalculado.fases`) aparece numa
 *    nova coluna FASE na tabela (só quando bifásico/trifásico -- num
 *    sistema monofásico não há o que mostrar) e no DIAGRAMA, que passa a
 *    ser MULTIFILAR nesse caso: em vez de 1 barramento único, desenha 1
 *    barra por fase + 1 de neutro, empilhadas, com cada ramal descendo
 *    um condutor de cada fase que usa (+ neutro, se 1P) até o disjuntor
 *    -- ver o bloco "DIAGRAMA MULTIFILAR" dentro de
 *    `gerarDimensionamentoCargas`. Sistema monofásico mantém o unifilar
 *    de sempre, sem nenhuma mudança (só 1 fase -- nada a separar).
 *  - Iteração 33 (pedido do usuário, ajustes de legibilidade/impressão do
 *    diagrama do QDC):
 *      a) Espaçamento entre disjuntores reduzido -- o ramal deixou de ter
 *         largura "elástica" (do tamanho do texto do rótulo) e passou a
 *         ter largura FIXA (`LARGURA_RAMAL`), bem mais estreita; o espaço
 *         entre ramais também caiu (26mm -> 12mm) e entre fileiras de
 *         disjuntores (20mm -> 14mm). O diagrama "largo sem necessidade"
 *         fica bem mais compacto.
 *      b) Cada fase tem sua própria cor (camada `QDC_FASE_*`) e o NEUTRO
 *         é sempre azul (camada `QDC_NEUTRO`) -- ver `CAMADA_FASE_INFO`
 *         logo abaixo. As barras empilhadas do diagrama multifilar, os
 *         pontos de junção e os condutores de descida de cada ramal usam
 *         a cor da fase que representam.
 *      c) Todo texto desenhado (tabela, resumo, avisos, lista de
 *         material, título/subtítulo e rótulos do diagrama) agora sai em
 *         MAIÚSCULO (`toLocaleUpperCase("pt-BR")`, que trata acentos
 *         corretamente) -- centralizado no closure `textoT`.
 *      d) Fontes aumentadas (título 5.5->7.5, tabela 3.4->4.4, rótulo
 *         4.0->5.4) -- pedido explícito porque "no pdf quando imprimo não
 *         da para ler".
 *      e) Nenhuma legenda/rótulo pode ficar maior que o desenho/tabela a
 *         que pertence: função `quebrarTexto` (quebra de linha gulosa por
 *         palavra) aplicada ao resumo/parâmetros, avisos, título/
 *         subtítulo do diagrama e ao rótulo de cada disjuntor (que agora,
 *         com o ramal estreito, quase sempre quebra em 2-4 linhas em vez
 *         de uma linha só que estouraria por cima do ramal vizinho) --
 *         pedido explícito: "prefiro ter 4 linhas do que uma linha so
 *         gigante" / "a legenda nunca pode ser maior que um desenho ou
 *         tabela ou diagrama".
 *  - Iteração 33b (correção pedida pelo usuário): as cores F2/S usavam
 *    VERDE, mas o usuário apontou que verde só pode representar o
 *    condutor de terra/PE (convenção universal) -- nenhuma fase pode usar
 *    verde. F2/S passaram a ROXO/VIOLETA (`#7c3aed`). Criada também
 *    `CAMADA_TERRA_INFO` (camada `QDC_TERRA`, sempre verde `#16a34a`),
 *    reservando a cor mesmo o diagrama ainda não desenhando um condutor
 *    de terra separado.
 */

import type { NovaGeometria } from "./types";
import { getBlockDef } from "./blocks";

export const CAMADA_QDC_DIAGRAMA = "QDC_DIAGRAMA";
export const CAMADA_QDC_TABELA = "QDC_TABELA";
export const ORIGEM_GERADOR_CARGAS = "cargasEletricas";

const MAX_ELEMENTOS_LEIAUTE = 4000;
const MAX_CIRCUITOS = 80;

// ---------------------------------------------------------------------
// Tipos de entrada (preenchidos pelo modal)
// ---------------------------------------------------------------------

export type TipoAmbiente =
  | "sala"
  | "quarto"
  | "cozinha"
  | "area_servico"
  | "banheiro"
  | "varanda"
  | "corredor"
  | "garagem"
  | "escritorio"
  | "outro";

export const ROTULO_TIPO_AMBIENTE: Record<TipoAmbiente, string> = {
  sala: "Sala",
  quarto: "Quarto",
  cozinha: "Cozinha / Copa",
  area_servico: "Área de Serviço / Lavanderia",
  banheiro: "Banheiro",
  varanda: "Varanda",
  corredor: "Corredor / Hall",
  garagem: "Garagem",
  escritorio: "Escritório",
  outro: "Outro",
};

/** Ambientes onde a regra de tomadas é a "molhada" (600VA/100VA) -- NBR 5410, 9.5.2.2. */
const TIPOS_AMBIENTE_MOLHADOS: TipoAmbiente[] = ["cozinha", "area_servico"];

/**
 * Categoria do TUE -- Iteração 31: usada pra aplicar o fator de demanda
 * CORRETO por categoria (o usuário apontou que um único fator de demanda
 * geral no disjuntor deixa o cálculo errado: existe FD próprio pra
 * aquecimento de água conforme o Nº de chuveiros, FD próprio pra ar-
 * condicionado conforme o Nº de aparelhos, e FD de iluminação+TUG por
 * faixa de carga).
 */
export type CategoriaTue = "chuveiro" | "ar_condicionado" | "outro";

export const ROTULO_CATEGORIA_TUE: Record<CategoriaTue, string> = {
  chuveiro: "Chuveiro / aquecimento de água",
  ar_condicionado: "Ar-condicionado",
  outro: "Outro equipamento",
};

export interface TueInput {
  nome: string;
  potenciaW: number;
  tensaoV: number;
  /**
   * Categoria do equipamento (Iteração 31) -- define qual tabela de fator
   * de demanda se aplica no cálculo do disjuntor geral. Quando ausente
   * (dados de uma geração antiga), é inferida pelo nome (ver
   * `inferirCategoriaTue`).
   */
  categoria?: CategoriaTue;
  /** true = carga trifásica (motores grandes, raro em residência) -- default false (monofásica/bifásica). */
  trifasico?: boolean;
  /** Override opcional do fator de potência SÓ deste equipamento (ex.: motor com cosφ pior que o padrão geral). */
  fatorPotencia?: number;
}

export interface AmbienteInput {
  nome: string;
  tipo: TipoAmbiente;
  areaM2: number;
  quantidadeTomadas: number;
  /**
   * Quantidade de lâmpadas/pontos de iluminação do ambiente (Iteração 31)
   * -- informativa: a CARGA de iluminação continua sendo a mínima
   * normativa por área (NBR 5410, 9.5.3), mas a quantidade entra na
   * tabela de cargas (conferência posterior) e na lista de material.
   * Default 1 quando ausente (dados antigos).
   */
  quantidadeLampadas?: number;
  tues: TueInput[];
}

export interface ConfiguracaoCargasEletricas {
  /** Tensão fase-neutro (V) -- circuitos de iluminação/TUG comuns. Default 127. */
  tensaoFaseV: number;
  /** Tensão fase-fase/entrada (V) -- referência dos TUEs bifásicos e do disjuntor geral. Default 220. */
  tensaoEntradaV: number;
  /** Nº de fases da entrada de serviço: 1 (monofásico), 2 (bifásico 127/220V) ou 3 (trifásico). Default 2. */
  numeroFases: 1 | 2 | 3;
  /** Fator de potência (cosφ) usado para converter potência (W) de TUE em corrente. Editável conforme a concessionária. Default 0,92. */
  fatorPotencia: number;
  /**
   * Override manual do fator de demanda de ILUMINAÇÃO + TUG. Quando
   * `undefined` (padrão), usa a tabela por faixa de carga instalada
   * (`TABELA_FD_ILUMINACAO_TUG` -- 0,86 até 1kW ... 0,24 acima de 10kW).
   * Editável conforme a norma da concessionária local.
   */
  fatorDemandaIlumTug?: number;
  /**
   * Override manual do fator de demanda de AQUECIMENTO DE ÁGUA
   * (chuveiros/torneiras/aquecedores). Quando `undefined`, usa a tabela
   * por Nº de aparelhos (`TABELA_FD_AQUECIMENTO` -- 1,00 com 1 aparelho,
   * decrescendo com a quantidade).
   */
  fatorDemandaChuveiro?: number;
  /**
   * Override manual do fator de demanda de AR-CONDICIONADO. Quando
   * `undefined`, usa a tabela por Nº de aparelhos
   * (`TABELA_FD_AR_CONDICIONADO` -- NDU 001/Energisa, 1,00 com 1 aparelho).
   */
  fatorDemandaArCondicionado?: number;
  /**
   * Comprimento médio estimado de CADA circuito (m), usado SÓ pra estimar
   * os metros de condutor (fase/neutro/terra) na lista de material
   * preliminar -- nunca entra no cálculo elétrico. Default 25m. A lista
   * desenhada é texto normal do CAD, então cada quantidade pode ser
   * ajustada manualmente depois.
   */
  comprimentoMedioCircuitoM?: number;
}

export interface DadosCargasEletricas {
  nomeProjeto?: string;
  ambientes: AmbienteInput[];
  config: ConfiguracaoCargasEletricas;
}

// ---------------------------------------------------------------------
// Tipos de saída (resumo mostrado no modal + usado na tabela desenhada)
// ---------------------------------------------------------------------

export type TipoCircuito = "iluminacao" | "tug_seco" | "tug_molhado" | "tue";

export const ROTULO_TIPO_CIRCUITO: Record<TipoCircuito, string> = {
  iluminacao: "Iluminação",
  tug_seco: "TUG",
  tug_molhado: "TUG (área molhada)",
  tue: "TUE (circuito exclusivo)",
};

/**
 * Fase(s) elétrica(s) do quadro (Iteração 32) -- "F1"/"F2" identificam as 2
 * fases de um sistema BIFÁSICO (127/220V, a nomenclatura mais comum de
 * campo pra esse padrão brasileiro); "R"/"S"/"T" identificam as 3 fases de
 * um sistema TRIFÁSICO. Um sistema MONOFÁSICO só tem "F1" (não há o que
 * balancear -- mantido só por uniformidade de tipo).
 */
export type FaseEletrica = "F1" | "F2" | "R" | "S" | "T";

export const ROTULO_FASE: Record<FaseEletrica, string> = { F1: "F1", F2: "F2", R: "R", S: "S", T: "T" };

/**
 * Camada (layer) + cor de cada condutor no diagrama MULTIFILAR (Iteração
 * 33 -- pedido do usuário: "quero que cada fase tenha uma cor digerente e
 * o neutro a cor azul"). Cada fase ganha sua própria camada (criada por
 * `store.ts#gerarDimensionamentoCargas`, mesmo padrão de `QDC_DIAGRAMA`/
 * `QDC_TABELA`) só pra poder ter uma cor própria -- o modelo de dados do
 * app não tem cor por elemento individual, só por camada (`Camada.cor`),
 * então "1 camada por fase" é o jeito de conseguir cores diferentes sem
 * mudar o schema de geometria. Cores escolhidas por CONTRASTE visual
 * entre si (não é o código de cores da NBR 5410 pra condutores físicos --
 * essa tabela é sobre a REPRESENTAÇÃO no desenho, não sobre a cor do fio
 * a comprar); neutro sempre AZUL, conforme pedido explícito.
 *
 * Ajuste (Iteração 33b -- pedido do usuário: "verde só pode para
 * aterramento, nao pode usar verde em fase"): VERDE fica RESERVADO pro
 * condutor de proteção/terra (PE) -- convenção universal de instalações
 * elétricas -- e nunca é usado em nenhuma fase. F2/S, que antes eram
 * verdes, passaram a ROXO/VIOLETA (`#7c3aed`), distinto do vermelho
 * (F1/R), do âmbar (T) e do azul do neutro.
 */
export const CAMADA_FASE_INFO: Record<FaseEletrica | "N", { camada: string; cor: string }> = {
  F1: { camada: "QDC_FASE_F1", cor: "#dc2626" }, // vermelho
  F2: { camada: "QDC_FASE_F2", cor: "#7c3aed" }, // roxo/violeta -- NUNCA verde (reservado pro terra/PE)
  R: { camada: "QDC_FASE_R", cor: "#dc2626" }, // vermelho
  S: { camada: "QDC_FASE_S", cor: "#7c3aed" }, // roxo/violeta -- NUNCA verde (reservado pro terra/PE)
  T: { camada: "QDC_FASE_T", cor: "#f59e0b" }, // âmbar
  N: { camada: "QDC_NEUTRO", cor: "#2563eb" }, // azul -- pedido explícito do usuário
};

/**
 * Cor/camada do condutor de proteção (terra/PE) -- Iteração 33b. VERDE é
 * reservado EXCLUSIVAMENTE pro terra (nunca usado em nenhuma fase, ver
 * `CAMADA_FASE_INFO` acima); ainda não há um condutor de terra desenhado
 * no diagrama multifilar (só aparece na lista de material), mas a camada
 * já existe pronta caso um traço de PE seja desenhado no futuro.
 */
export const CAMADA_TERRA_INFO = { camada: "QDC_TERRA", cor: "#16a34a" } as const; // verde

export interface CircuitoCalculado {
  nome: string;
  descricao: string;
  tipoCircuito: TipoCircuito;
  cargaVA: number;
  tensaoV: number;
  correnteA: number;
  disjuntorA: number;
  polos: 1 | 2 | 3;
  bitolaMm2: number;
  ambientesOrigem: string[];
  /** Nº de tomadas atendidas pelo circuito (TUG; TUE conta como 1 ponto) -- Iteração 31, pra conferência e lista de material. */
  quantidadeTomadas: number;
  /** Nº de lâmpadas/pontos de iluminação atendidos pelo circuito -- Iteração 31. */
  quantidadeLampadas: number;
  /** Categoria do TUE (só quando tipoCircuito === "tue") -- define a tabela de fator de demanda aplicada. */
  categoriaTue?: CategoriaTue;
  /**
   * Fase(s) do circuito no quadro (Iteração 32) -- preenchido pelo passo
   * de balanceamento (`balancearFases`), SEMPRE após todos os circuitos
   * estarem montados. 1 elemento pra circuito 1P (monofásico -- F1/F2/R/S/T,
   * a fase de menor carga acumulada até aquele ponto), 2 elementos pro
   * circuito 2P (fase-fase, bifásico sempre F1+F2; trifásico o PAR de
   * fases de menor carga acumulada -- R-S, S-T ou T-R), 3 elementos pro
   * circuito 3P (trifásico equilibrado -- sempre R,S,T). Inicializado
   * vazio; nunca fica vazio depois de `calcularDimensionamentoCargas`.
   */
  fases: FaseEletrica[];
}

/** Um item da lista de material preliminar (Iteração 31) -- desenhada como tabela editável ao lado da tabela de cargas. */
export interface ItemMaterial {
  descricao: string;
  quantidade: number;
  unidade: string;
  observacao?: string;
}

export interface ResumoCargasEletricas {
  circuitos: CircuitoCalculado[];
  cargaIluminacaoTotalVA: number;
  cargaTugTotalVA: number;
  cargaTueTotalVA: number;
  cargaInstaladaTotalVA: number;
  /** Iteração 31 -- demanda POR CATEGORIA (fatores separados, como a norma/concessionárias fazem), não mais um fator único. */
  numChuveiros: number;
  numArCondicionados: number;
  totalTomadas: number;
  totalLampadas: number;
  fatorDemandaIlumTugAplicado: number;
  fatorDemandaChuveiroAplicado: number;
  fatorDemandaArCondAplicado: number;
  demandaIlumTugVA: number;
  demandaChuveirosVA: number;
  demandaArCondVA: number;
  demandaOutrasTuesVA: number;
  /** Razão demanda total / carga instalada -- só informativa (equivale ao "FD geral efetivo" resultante). */
  fatorDemandaGeralEfetivo: number;
  demandaCalculadaVA: number;
  correnteGeralA: number;
  disjuntorGeralA: number;
  polosGeral: 1 | 2 | 3;
  /**
   * Iteração 32 -- carga acumulada (VA) por fase, resultado do
   * balanceamento (`balancearFases`). Só tem 1 chave em sistema
   * monofásico ("F1"); 2 chaves em bifásico ("F1"/"F2"); 3 chaves em
   * trifásico ("R"/"S"/"T"). Circuitos 2P/3P contam em MAIS de uma chave
   * (sua carga sustenta corrente em cada fase que usam -- ver
   * `balancearFases`).
   */
  cargaPorFaseVA: Partial<Record<FaseEletrica, number>>;
  /** Diferença percentual entre a fase mais carregada e a menos carregada, relativa à média -- só informativo (sem sistema com 1 única fase disponível). */
  desequilibrioFasesPercentual: number;
  /** Lista de material preliminar (condutores fase/neutro/terra por bitola, disjuntores, tomadas, lâmpadas, quadro...). */
  listaMaterial: ItemMaterial[];
  avisos: string[];
}

// ---------------------------------------------------------------------
// Tabelas normativas / comerciais
// ---------------------------------------------------------------------

/**
 * NBR 5410, Tabela 36 -- capacidade de condução de corrente (A), cobre,
 * isolação PVC, temperatura no condutor 70°C, método de referência B1
 * (eletroduto embutido em parede termicamente isolante), 2 condutores
 * carregados (circuito monofásico fase+neutro ou fase+fase). Valores
 * conferidos via pesquisa nesta sessão (ver cabeçalho do arquivo).
 */
const TABELA_36_B1_2CC: { bitolaMm2: number; ampacidadeA: number }[] = [
  { bitolaMm2: 1.5, ampacidadeA: 17.5 },
  { bitolaMm2: 2.5, ampacidadeA: 24 },
  { bitolaMm2: 4, ampacidadeA: 32 },
  { bitolaMm2: 6, ampacidadeA: 41 },
  { bitolaMm2: 10, ampacidadeA: 57 },
  { bitolaMm2: 16, ampacidadeA: 76 },
  { bitolaMm2: 25, ampacidadeA: 101 },
  { bitolaMm2: 35, ampacidadeA: 125 },
];

/** Disjuntores termomagnéticos de linha comercial padrão (A), série comum no Brasil. */
const DISJUNTORES_PADRAO_A = [10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125];

// ---------------------------------------------------------------------
// Iteração 31 -- Tabelas de FATOR DE DEMANDA POR CATEGORIA (pesquisadas
// nesta sessão; ver changelog). A NBR 5410 remete o cálculo de demanda à
// prática/norma de fornecimento -- as tabelas abaixo são as consagradas
// nas normas de concessionárias e na literatura de projeto residencial,
// e TODAS podem ser sobrescritas manualmente no modal (campo em branco =
// automático pela tabela).
// ---------------------------------------------------------------------

/**
 * Fator de demanda de ILUMINAÇÃO + TUG residencial, por faixa de carga
 * instalada da categoria (kVA) -- tabela clássica usada pelas
 * concessionárias (CEMIG ND-5.1 e equivalentes; confirmada em 2 fontes
 * independentes nesta sessão, inclusive o exemplo canônico "3-4kW →
 * 0,59").
 */
export const TABELA_FD_ILUMINACAO_TUG: { ateKVA: number; fator: number }[] = [
  { ateKVA: 1, fator: 0.86 },
  { ateKVA: 2, fator: 0.75 },
  { ateKVA: 3, fator: 0.66 },
  { ateKVA: 4, fator: 0.59 },
  { ateKVA: 5, fator: 0.52 },
  { ateKVA: 6, fator: 0.45 },
  { ateKVA: 7, fator: 0.4 },
  { ateKVA: 8, fator: 0.35 },
  { ateKVA: 9, fator: 0.31 },
  { ateKVA: 10, fator: 0.27 },
  { ateKVA: Infinity, fator: 0.24 },
];

export function fatorDemandaIlumTugTabela(cargaVA: number): number {
  const kva = cargaVA / 1000;
  const faixa = TABELA_FD_ILUMINACAO_TUG.find((f) => kva <= f.ateKVA);
  return faixa ? faixa.fator : 0.24;
}

/**
 * Fator de demanda de AQUECIMENTO DE ÁGUA (chuveiro, torneira elétrica,
 * aquecedor, ducha) por Nº de aparelhos -- índice 0 = 1 aparelho.
 * Base: tabela de aparelhos de aquecimento das normas de concessionária
 * (Enel-RJ IT-263 e equivalentes), com o 1º aparelho mantido em 1,00
 * (postura conservadora: com um único chuveiro, que costuma ser a maior
 * carga da casa, nenhuma redução é segura). Acima de 10 aparelhos: 0,45.
 */
export const TABELA_FD_AQUECIMENTO: number[] = [1.0, 0.75, 0.7, 0.66, 0.62, 0.59, 0.56, 0.53, 0.51, 0.49];

export function fatorDemandaAquecimentoTabela(numAparelhos: number): number {
  if (numAparelhos <= 0) return 1;
  return TABELA_FD_AQUECIMENTO[Math.min(numAparelhos, TABELA_FD_AQUECIMENTO.length) - 1] ?? 0.45;
}

/**
 * Fator de demanda de AR-CONDICIONADO por Nº de aparelhos -- índice 0 =
 * 1 aparelho. Base: NDU 001 (Energisa), Anexo I -- 1:1,00 / 2:0,88 /
 * 3:0,82 / 4:0,78 / 5:0,76; de 6 a 10 aparelhos, extrapolação
 * conservadora (decréscimo suave até 0,70); acima de 10: 0,70.
 */
export const TABELA_FD_AR_CONDICIONADO: number[] = [1.0, 0.88, 0.82, 0.78, 0.76, 0.74, 0.72, 0.71, 0.7, 0.7];

export function fatorDemandaArCondicionadoTabela(numAparelhos: number): number {
  if (numAparelhos <= 0) return 1;
  return TABELA_FD_AR_CONDICIONADO[Math.min(numAparelhos, TABELA_FD_AR_CONDICIONADO.length) - 1] ?? 0.7;
}

/**
 * Potência elétrica típica de ar-condicionado por BTUs (Iteração 31) --
 * o usuário escolhe os BTUs e o tipo (split convencional x inverter) no
 * modal e a potência já vem preenchida (editável). Valores típicos de
 * catálogo, ligeiramente conservadores pra dimensionamento (o inverter
 * usa a potência MÁXIMA de placa, não a média de consumo -- pra circuito
 * o que importa é o pico).
 */
export const OPCOES_BTU_AR_CONDICIONADO: { btus: number; splitW: number; inverterW: number }[] = [
  { btus: 7500, splitW: 900, inverterW: 750 },
  { btus: 9000, splitW: 950, inverterW: 820 },
  { btus: 12000, splitW: 1250, inverterW: 1090 },
  { btus: 18000, splitW: 1900, inverterW: 1720 },
  { btus: 22000, splitW: 2250, inverterW: 2000 },
  { btus: 24000, splitW: 2500, inverterW: 2100 },
  { btus: 30000, splitW: 3150, inverterW: 2900 },
  { btus: 36000, splitW: 3700, inverterW: 3300 },
  { btus: 48000, splitW: 4900, inverterW: 4400 },
  { btus: 60000, splitW: 6000, inverterW: 5400 },
];

/**
 * Inferência de categoria pra dados antigos (gerados antes da Iteração
 * 31, sem o campo `categoria`) -- por palavras-chave no nome do
 * equipamento. Um TUE novo sempre chega com a categoria explícita do
 * modal; isto é só rede de segurança.
 */
export function inferirCategoriaTue(nome: string): CategoriaTue {
  const n = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/chuveiro|ducha|aquecedor|torneira\s*eletrica|boiler/.test(n)) return "chuveiro";
  if (/ar[\s-]*cond|split|inverter|climatizador/.test(n)) return "ar_condicionado";
  return "outro";
}

const BITOLA_MINIMA_ILUMINACAO_MM2 = 1.5;
const BITOLA_MINIMA_TOMADA_MM2 = 2.5;

/** Corrente máxima admitida por circuito de ILUMINAÇÃO antes de abrir um novo circuito (prática usual, sob o piso de 1,5mm²/17,5A). */
const CORRENTE_MAX_CIRCUITO_ILUMINACAO_A = 16;
/** Corrente máxima admitida por circuito de TUG (seco ou molhado) antes de abrir um novo circuito (sob o piso de 2,5mm²/24A). */
const CORRENTE_MAX_CIRCUITO_TUG_A = 20;

function selecionarBitola(correnteProjetoA: number, bitolaMinimaMm2: number): { bitolaMm2: number; ampacidadeA: number } {
  const candidata = TABELA_36_B1_2CC.find((f) => f.bitolaMm2 >= bitolaMinimaMm2 && f.ampacidadeA >= correnteProjetoA);
  if (candidata) return candidata;
  // Corrente de projeto maior que a maior bitola tabelada (35mm²) -- devolve a maior mesmo assim (aviso é emitido por quem chama).
  return TABELA_36_B1_2CC[TABELA_36_B1_2CC.length - 1];
}

function selecionarDisjuntor(correnteProjetoA: number, ampacidadeMaximaA: number): number {
  // Coordenação básica disjuntor/condutor: In do disjuntor >= corrente de projeto E <= ampacidade do condutor.
  const candidato = DISJUNTORES_PADRAO_A.find((d) => d >= correnteProjetoA && d <= ampacidadeMaximaA);
  if (candidato) return candidato;
  // Nenhum disjuntor padrão cabe sob a ampacidade encontrada (corrente de projeto muito alta) -- devolve o próximo
  // valor comercial acima da corrente mesmo assim; quem chama já terá emitido um aviso pra revisão manual do condutor.
  return DISJUNTORES_PADRAO_A.find((d) => d >= correnteProjetoA) ?? DISJUNTORES_PADRAO_A[DISJUNTORES_PADRAO_A.length - 1];
}

/** Dimensiona disjuntor + condutor de um circuito, respeitando a bitola mínima do tipo de circuito. */
function dimensionarCircuito(correnteProjetoA: number, bitolaMinimaMm2: number): { disjuntorA: number; bitolaMm2: number } {
  const fio = selecionarBitola(correnteProjetoA, bitolaMinimaMm2);
  const disjuntorA = selecionarDisjuntor(correnteProjetoA, fio.ampacidadeA);
  // Se o disjuntor escolhido excedeu a ampacidade do fio inicialmente selecionado (corrente de projeto muito alta
  // pra essa bitola), sobe de bitola de novo até achar uma que aguente o próprio disjuntor escolhido.
  const fioFinal = fio.ampacidadeA >= disjuntorA ? fio : selecionarBitola(disjuntorA, bitolaMinimaMm2);
  return { disjuntorA, bitolaMm2: fioFinal.bitolaMm2 };
}

// ---------------------------------------------------------------------
// Cálculo de cargas mínimas por ambiente (NBR 5410, 9.5)
// ---------------------------------------------------------------------

/** Carga mínima de iluminação (VA) -- NBR 5410, 9.5.3: 100VA até 6m², +60VA a cada 4m² inteiros ou fração excedente. */
export function cargaIluminacaoVA(areaM2: number): number {
  if (areaM2 <= 6) return 100;
  const excedente = areaM2 - 6;
  const incrementos = Math.ceil(excedente / 4);
  return 100 + incrementos * 60;
}

/** Carga mínima de TUG (VA) de um ambiente -- regra "molhada" (600/100) ou "seca" (100 fixo), NBR 5410, 9.5.2.2. */
export function cargaTugVA(tipo: TipoAmbiente, quantidadeTomadas: number): number {
  if (quantidadeTomadas <= 0) return 0;
  if (TIPOS_AMBIENTE_MOLHADOS.includes(tipo)) {
    const primeiras = Math.min(3, quantidadeTomadas);
    const demais = Math.max(0, quantidadeTomadas - 3);
    return primeiras * 600 + demais * 100;
  }
  return quantidadeTomadas * 100;
}

// ---------------------------------------------------------------------
// Agrupamento em circuitos
// ---------------------------------------------------------------------

interface ItemAgrupavel {
  origem: string;
  cargaVA: number;
  /** Nº de tomadas que o item representa (Iteração 31) -- carregado até o circuito pra tabela/lista de material. */
  tomadas?: number;
  /** Nº de lâmpadas/pontos de iluminação que o item representa (Iteração 31). */
  lampadas?: number;
}

/** Agrupamento guloso ("first fit"): nunca ultrapassa `cargaMaxVA` por circuito -- sempre seguro, ainda que não seja o agrupamento ótimo. */
function agruparEmCircuitos(itens: ItemAgrupavel[], cargaMaxVA: number): { itens: ItemAgrupavel[]; cargaVA: number }[] {
  const circuitos: { itens: ItemAgrupavel[]; cargaVA: number }[] = [];
  for (const item of itens) {
    if (item.cargaVA <= 0) continue;
    let alvo = circuitos.find((c) => c.cargaVA + item.cargaVA <= cargaMaxVA);
    if (!alvo) {
      alvo = { itens: [], cargaVA: 0 };
      circuitos.push(alvo);
    }
    alvo.itens.push(item);
    alvo.cargaVA += item.cargaVA;
  }
  return circuitos;
}

// ---------------------------------------------------------------------
// Iteração 32 -- Balanceamento de fases (pedido do usuário: "uma rede
// trifasica ou bifasica vai precisar separar os circuitos por fases
// conforme a norma nbr5410"). A NBR 5410 não prescreve uma fórmula fixa
// de balanceamento, mas exige uma instalação tecnicamente equilibrada
// (prática consolidada: distribuir os circuitos monofásicos entre as
// fases disponíveis de modo que a corrente fique o mais parecida
// possível entre elas -- pesquisado nesta sessão, ver changelog).
// ---------------------------------------------------------------------

/** Fases disponíveis conforme o sistema de entrada -- ordem também usada pra desenhar as barras do diagrama multifilar (topo -> base). */
export function fasesDisponiveis(numeroFases: 1 | 2 | 3): FaseEletrica[] {
  if (numeroFases === 1) return ["F1"];
  if (numeroFases === 2) return ["F1", "F2"];
  return ["R", "S", "T"];
}

/** Todos os pares adjacentes de fases possíveis pra um circuito 2P (fase-fase) num sistema trifásico. */
const PARES_TRIFASICO: [FaseEletrica, FaseEletrica][] = [
  ["R", "S"],
  ["S", "T"],
  ["T", "R"],
];

/**
 * Distribui cada circuito já calculado entre as fases disponíveis,
 * SEMPRE de forma gulosa: cada circuito vai pra fase (ou par/trio de
 * fases) com a MENOR carga acumulada até aquele ponto -- minimiza o
 * desequilíbrio final sem precisar de otimização combinatória (troca de
 * posição de circuito já definida não é feita; é o mesmo espírito
 * "seguro, não necessariamente ótimo" do agrupamento em circuitos acima).
 * Circuito 3P (trifásico equilibrado) sempre usa as 3 fases -- contribui
 * cargaVA/3 em cada uma (ele já é intrinsecamente balanceado, então
 * conta 1/3 do total em cada fase pra fins de comparação com os
 * circuitos monofásicos). Circuito 2P conta a carga CHEIA em cada uma
 * das 2 fases que usa (ambos os condutores efetivamente conduzem a
 * mesma corrente do circuito -- não se divide entre eles).
 * Muta `c.fases` de cada circuito recebido e devolve a carga final
 * acumulada por fase (usada no resumo e no diagrama multifilar).
 */
export function balancearFases(
  circuitos: CircuitoCalculado[],
  numeroFases: 1 | 2 | 3
): { cargaPorFaseVA: Partial<Record<FaseEletrica, number>>; avisos: string[] } {
  const fases = fasesDisponiveis(numeroFases);
  const acumulado = new Map<FaseEletrica, number>(fases.map((f) => [f, 0]));
  const somaPar = (par: [FaseEletrica, FaseEletrica]) => (acumulado.get(par[0]) ?? 0) + (acumulado.get(par[1]) ?? 0);
  const avisos: string[] = [];

  // Processa do MAIOR pro MENOR circuito (heurística clássica de
  // balanceamento -- "longest processing time first"): decidir a fase de
  // um chuveiro de 6kVA de olho só no que já foi colocado ANTES dele é o
  // que mais pesa no resultado final, então os maiores circuitos entram
  // primeiro, enquanto ainda há mais liberdade de escolha; os pequenos
  // (iluminação, tomada) entram por último e só ajustam fino o
  // desequilíbrio residual. Muda apenas a ORDEM em que este laço decide
  // `c.fases` -- a ordem/numeração dos circuitos (C1, C2...) na tabela e
  // no diagrama não é afetada (`circuitos` original não é reordenado).
  const ordemBalanceamento = [...circuitos].sort((a, b) => b.cargaVA - a.cargaVA);

  for (const c of ordemBalanceamento) {
    // Guarda defensiva (Iteração 32): um TUE marcado "trifásico" (3 polos) ou
    // ligado em 220V fase-fase (2 polos) só faz sentido se o SISTEMA tiver
    // fases o bastante pra sustentar isso -- um TUE trifásico dentro de um
    // projeto bifásico/monofásico, ou um TUE 220V dentro de um monofásico
    // puro, é uma inconsistência de cadastro (o app não bloqueia essa
    // combinação no modal hoje). Em vez de inventar fases R/S/T que não
    // existem no sistema escolhido, o balanceamento usa só as fases
    // REALMENTE disponíveis (dividindo a carga entre elas) e avisa.
    if (c.polos > fases.length) {
      avisos.push(
        `"${c.nome} - ${c.descricao}" está ligado como ${c.polos}P, mas o sistema escolhido só tem ${fases.length} fase(s) disponível(is) -- confira se a tensão/opção "trifásico" deste equipamento está correta para um sistema ${
          numeroFases === 1 ? "monofásico" : "bifásico"
        }.`
      );
    }
    const fasesDoCircuito = c.polos >= 3 && fases.length >= 3 ? (["R", "S", "T"] as FaseEletrica[]) : undefined;

    if (fasesDoCircuito) {
      // Trifásico equilibrado -- sempre as 3 fases, sem escolha a fazer.
      c.fases = fasesDoCircuito;
      for (const f of c.fases) acumulado.set(f, (acumulado.get(f) ?? 0) + c.cargaVA / 3);
      continue;
    }
    if (c.polos >= 2) {
      if (fases.length >= 3) {
        // Trifásico: escolhe o PAR (dentre R-S, S-T, T-R) com menor carga acumulada.
        c.fases = [...PARES_TRIFASICO.reduce((a, b) => (somaPar(a) <= somaPar(b) ? a : b))];
      } else {
        // Bifásico (usa as 2 únicas fases, sem escolha) OU monofásico
        // (caso defensivo acima -- só 1 fase existe; ambos os
        // "condutores" do circuito referenciam essa mesma fase).
        c.fases = [...fases];
      }
      for (const f of c.fases) acumulado.set(f, (acumulado.get(f) ?? 0) + c.cargaVA);
      continue;
    }
    // Circuito 1P (monofásico -- iluminação, TUG, TUE 127V): escolhe a fase de menor carga acumulada.
    let melhorFase = fases[0];
    for (const f of fases) {
      if ((acumulado.get(f) ?? 0) < (acumulado.get(melhorFase) ?? 0)) melhorFase = f;
    }
    c.fases = [melhorFase];
    acumulado.set(melhorFase, (acumulado.get(melhorFase) ?? 0) + c.cargaVA);
  }

  return { cargaPorFaseVA: Object.fromEntries(acumulado), avisos };
}

// ---------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------

export function calcularDimensionamentoCargas(dados: DadosCargasEletricas): ResumoCargasEletricas {
  const { ambientes, config } = dados;
  if (!ambientes || ambientes.length === 0) {
    throw new Error("Informe ao menos 1 ambiente (ex.: Sala, Quarto, Cozinha) antes de gerar o dimensionamento.");
  }
  for (const amb of ambientes) {
    if (!amb.nome || !amb.nome.trim()) {
      throw new Error("Todo ambiente precisa de um nome (ex.: \"Quarto 1\").");
    }
    if (!(amb.areaM2 > 0)) {
      throw new Error(`Ambiente "${amb.nome}": informe uma área maior que zero (m²).`);
    }
    if (amb.quantidadeTomadas < 0) {
      throw new Error(`Ambiente "${amb.nome}": a quantidade de tomadas não pode ser negativa.`);
    }
    for (const tue of amb.tues) {
      if (!tue.nome || !tue.nome.trim()) {
        throw new Error(`Ambiente "${amb.nome}": todo equipamento de uso específico (TUE) precisa de um nome.`);
      }
      if (!(tue.potenciaW > 0)) {
        throw new Error(`Ambiente "${amb.nome}", equipamento "${tue.nome}": informe uma potência maior que zero (W).`);
      }
      if (!(tue.tensaoV > 0)) {
        throw new Error(`Ambiente "${amb.nome}", equipamento "${tue.nome}": informe uma tensão maior que zero (V).`);
      }
    }
  }
  if (!(config.tensaoFaseV > 0) || !(config.tensaoEntradaV > 0)) {
    throw new Error("Informe tensões maiores que zero para fase e entrada.");
  }
  if (!(config.fatorPotencia > 0 && config.fatorPotencia <= 1)) {
    throw new Error("O fator de potência deve ser maior que zero e no máximo 1 (ex.: 0,92).");
  }
  for (const [rotulo, fd] of [
    ["iluminação + TUG", config.fatorDemandaIlumTug],
    ["chuveiros/aquecimento", config.fatorDemandaChuveiro],
    ["ar-condicionado", config.fatorDemandaArCondicionado],
  ] as const) {
    if (fd !== undefined && !(fd > 0 && fd <= 1)) {
      throw new Error(`O fator de demanda de ${rotulo} deve ser maior que zero e no máximo 1 (deixe em branco para usar a tabela automática).`);
    }
  }
  if (config.comprimentoMedioCircuitoM !== undefined && !(config.comprimentoMedioCircuitoM > 0)) {
    throw new Error("O comprimento médio por circuito (m) deve ser maior que zero (usado só na lista de material).");
  }

  const avisos: string[] = [];
  const circuitos: CircuitoCalculado[] = [];
  let numero = 1;
  const proximoNome = () => `C${numero++}`;

  // --- 1) Iluminação: um único "pool" (a regra de área molhada/seca não se aplica à iluminação, só ao TUG). ---
  // Iteração 31: a quantidade de lâmpadas informada acompanha cada item (é
  // informativa -- a CARGA continua sendo a mínima normativa por área).
  const itensIluminacao: ItemAgrupavel[] = ambientes.map((a) => ({
    origem: a.nome,
    cargaVA: cargaIluminacaoVA(a.areaM2),
    lampadas: Math.max(1, Math.round(a.quantidadeLampadas ?? 1)),
  }));
  const cargaMaxIluminacaoVA = CORRENTE_MAX_CIRCUITO_ILUMINACAO_A * config.tensaoFaseV;
  for (const grupo of agruparEmCircuitos(itensIluminacao, cargaMaxIluminacaoVA)) {
    const correnteA = grupo.cargaVA / config.tensaoFaseV;
    const { disjuntorA, bitolaMm2 } = dimensionarCircuito(correnteA, BITOLA_MINIMA_ILUMINACAO_MM2);
    const origens = grupo.itens.map((i) => i.origem);
    circuitos.push({
      nome: proximoNome(),
      descricao: `Iluminação (${origens.join(", ")})`,
      tipoCircuito: "iluminacao",
      cargaVA: grupo.cargaVA,
      tensaoV: config.tensaoFaseV,
      correnteA,
      disjuntorA,
      polos: 1,
      bitolaMm2,
      ambientesOrigem: origens,
      quantidadeTomadas: 0,
      quantidadeLampadas: grupo.itens.reduce((s, i) => s + (i.lampadas ?? 0), 0),
      fases: [],
    });
  }

  // --- 2) TUG "seco" (sala, quarto, banheiro, varanda, corredor, garagem, escritório, outro) ---
  const ambientesSecos = ambientes.filter((a) => !TIPOS_AMBIENTE_MOLHADOS.includes(a.tipo));
  const itensTugSeco: ItemAgrupavel[] = ambientesSecos.map((a) => ({
    origem: a.nome,
    cargaVA: cargaTugVA(a.tipo, a.quantidadeTomadas),
    tomadas: Math.max(0, Math.round(a.quantidadeTomadas)),
  }));
  const cargaMaxTugVA = CORRENTE_MAX_CIRCUITO_TUG_A * config.tensaoFaseV;
  for (const grupo of agruparEmCircuitos(itensTugSeco, cargaMaxTugVA)) {
    const correnteA = grupo.cargaVA / config.tensaoFaseV;
    const { disjuntorA, bitolaMm2 } = dimensionarCircuito(correnteA, BITOLA_MINIMA_TOMADA_MM2);
    const origens = grupo.itens.map((i) => i.origem);
    circuitos.push({
      nome: proximoNome(),
      descricao: `TUG (${origens.join(", ")})`,
      tipoCircuito: "tug_seco",
      cargaVA: grupo.cargaVA,
      tensaoV: config.tensaoFaseV,
      correnteA,
      disjuntorA,
      polos: 1,
      bitolaMm2,
      ambientesOrigem: origens,
      quantidadeTomadas: grupo.itens.reduce((s, i) => s + (i.tomadas ?? 0), 0),
      quantidadeLampadas: 0,
      fases: [],
    });
  }

  // --- 3) TUG "molhado" (cozinha/copa, área de serviço/lavanderia) -- SEMPRE em circuito(s) exclusivo(s), nunca junto do seco. ---
  const ambientesMolhados = ambientes.filter((a) => TIPOS_AMBIENTE_MOLHADOS.includes(a.tipo));
  // Cada ambiente molhado forma seu próprio grupo de agrupamento (cozinha não divide circuito com área de serviço),
  // reforçando a separação por ambiente, não só por "tipo".
  for (const amb of ambientesMolhados) {
    const itens: ItemAgrupavel[] = [
      {
        origem: amb.nome,
        cargaVA: cargaTugVA(amb.tipo, amb.quantidadeTomadas),
        tomadas: Math.max(0, Math.round(amb.quantidadeTomadas)),
      },
    ];
    for (const grupo of agruparEmCircuitos(itens, cargaMaxTugVA)) {
      const correnteA = grupo.cargaVA / config.tensaoFaseV;
      const { disjuntorA, bitolaMm2 } = dimensionarCircuito(correnteA, BITOLA_MINIMA_TOMADA_MM2);
      circuitos.push({
        nome: proximoNome(),
        descricao: `TUG área molhada (${amb.nome})`,
        tipoCircuito: "tug_molhado",
        cargaVA: grupo.cargaVA,
        tensaoV: config.tensaoFaseV,
        correnteA,
        disjuntorA,
        polos: 1,
        bitolaMm2,
        ambientesOrigem: [amb.nome],
        quantidadeTomadas: grupo.itens.reduce((s, i) => s + (i.tomadas ?? 0), 0),
        quantidadeLampadas: 0,
        fases: [],
      });
    }
  }

  // --- 4) TUE: 1 circuito exclusivo por equipamento, sem exceção. ---
  for (const amb of ambientes) {
    for (const tue of amb.tues) {
      const cosphi = tue.fatorPotencia ?? config.fatorPotencia;
      const tensaoRef = tue.tensaoV;
      const correnteA = tue.trifasico
        ? tue.potenciaW / (Math.sqrt(3) * tensaoRef * cosphi)
        : tue.potenciaW / (tensaoRef * cosphi);
      const { disjuntorA, bitolaMm2 } = dimensionarCircuito(correnteA, BITOLA_MINIMA_TOMADA_MM2);
      if (disjuntorA > TABELA_36_B1_2CC[TABELA_36_B1_2CC.length - 1].ampacidadeA) {
        avisos.push(
          `"${tue.nome}" (${amb.nome}) exige corrente muito alta (${correnteA.toFixed(1)}A) -- confirme manualmente o condutor com um projetista (acima da faixa de referência deste gerador).`
        );
      }
      circuitos.push({
        nome: proximoNome(),
        descricao: `${tue.nome} (${amb.nome})`,
        tipoCircuito: "tue",
        cargaVA: tue.potenciaW / cosphi,
        tensaoV: tensaoRef,
        correnteA,
        disjuntorA,
        polos: tue.trifasico ? 3 : tensaoRef === config.tensaoFaseV ? 1 : 2,
        bitolaMm2,
        ambientesOrigem: [amb.nome],
        quantidadeTomadas: 1, // ponto de força/tomada exclusiva do equipamento
        quantidadeLampadas: 0,
        categoriaTue: tue.categoria ?? inferirCategoriaTue(tue.nome),
        fases: [],
      });
    }
    if (amb.quantidadeTomadas <= 0 && amb.tipo !== "garagem" && amb.tipo !== "outro") {
      avisos.push(`Ambiente "${amb.nome}" foi informado sem nenhuma tomada -- a NBR 5410 exige ao menos 1 ponto de tomada na maioria dos cômodos.`);
    }
  }

  if (circuitos.length > MAX_CIRCUITOS) {
    throw new Error(
      `Esse dimensionamento geraria ${circuitos.length} circuitos -- acima do limite de segurança (${MAX_CIRCUITOS}) para não travar o navegador. Reduza o número de ambientes/equipamentos ou divida em mais de um projeto.`
    );
  }

  // --- Iteração 32: balanceamento de fases -- só depois de TODOS os
  // circuitos montados (a ordem de criação -- iluminação, TUG seco, TUG
  // molhado, TUE -- é a ordem em que cada um concorre pela fase menos
  // carregada até aquele ponto). Sistema monofásico usa "F1" pra todos
  // (nenhum balanceamento real a fazer -- só 1 fase disponível).
  const { cargaPorFaseVA, avisos: avisosBalanceamento } = balancearFases(circuitos, config.numeroFases);
  avisos.push(...avisosBalanceamento);
  const valoresFase = Object.values(cargaPorFaseVA).filter((v): v is number => typeof v === "number");
  const mediaFaseVA = valoresFase.length > 0 ? valoresFase.reduce((s, v) => s + v, 0) / valoresFase.length : 0;
  const desequilibrioFasesPercentual =
    mediaFaseVA > 0 ? ((Math.max(...valoresFase) - Math.min(...valoresFase)) / mediaFaseVA) * 100 : 0;
  // A NBR 5410 não fixa um percentual numérico de desequilíbrio tolerado
  // entre fases (confirmado nesta sessão) -- é prática de projeto, não
  // cláusula da norma. 20% é um limiar conservador de referência (acima
  // disso, o desequilíbrio já costuma ser visível na prática); ajustável
  // manualmente reagrupando os TUEs/ambientes entre si, se necessário.
  if (config.numeroFases > 1 && desequilibrioFasesPercentual > 20) {
    avisos.push(
      `Desequilíbrio entre fases de ${desequilibrioFasesPercentual.toFixed(0)}% (carga por fase: ${Object.entries(cargaPorFaseVA)
        .map(([f, v]) => `${f}=${(v ?? 0).toFixed(0)}VA`)
        .join(", ")}) -- acima de um limiar conservador de referência (a NBR 5410 não fixa um percentual, mas um desequilíbrio grande sobrecarrega o neutro e desperdiça capacidade das fases mais leves); revise manualmente a distribuição de TUEs/ambientes se possível.`
    );
  }

  // --- Totais + disjuntor geral ---
  const cargaIluminacaoTotalVA = circuitos.filter((c) => c.tipoCircuito === "iluminacao").reduce((s, c) => s + c.cargaVA, 0);
  const cargaTugTotalVA = circuitos
    .filter((c) => c.tipoCircuito === "tug_seco" || c.tipoCircuito === "tug_molhado")
    .reduce((s, c) => s + c.cargaVA, 0);
  const cargaTueTotalVA = circuitos.filter((c) => c.tipoCircuito === "tue").reduce((s, c) => s + c.cargaVA, 0);
  const cargaInstaladaTotalVA = cargaIluminacaoTotalVA + cargaTugTotalVA + cargaTueTotalVA;

  // --- Iteração 31: DEMANDA POR CATEGORIA (correção pedida pelo usuário:
  // um único fator de demanda geral estava errado -- a norma/concessionárias
  // aplicam fatores SEPARADOS: iluminação+TUG por faixa de carga,
  // aquecimento de água pelo Nº de chuveiros, ar-condicionado pelo Nº de
  // aparelhos; demais TUEs entram com 100% -- conservador). Cada fator
  // pode ser sobrescrito manualmente no modal (campo em branco = tabela).
  const circuitosTue = circuitos.filter((c) => c.tipoCircuito === "tue");
  const tuesChuveiro = circuitosTue.filter((c) => c.categoriaTue === "chuveiro");
  const tuesArCond = circuitosTue.filter((c) => c.categoriaTue === "ar_condicionado");
  const tuesOutros = circuitosTue.filter((c) => c.categoriaTue !== "chuveiro" && c.categoriaTue !== "ar_condicionado");

  const numChuveiros = tuesChuveiro.length;
  const numArCondicionados = tuesArCond.length;

  const cargaIlumTugVA = cargaIluminacaoTotalVA + cargaTugTotalVA;
  const cargaChuveirosVA = tuesChuveiro.reduce((s, c) => s + c.cargaVA, 0);
  const cargaArCondVA = tuesArCond.reduce((s, c) => s + c.cargaVA, 0);
  const cargaOutrasTuesVA = tuesOutros.reduce((s, c) => s + c.cargaVA, 0);

  const fatorDemandaIlumTugAplicado = config.fatorDemandaIlumTug ?? fatorDemandaIlumTugTabela(cargaIlumTugVA);
  const fatorDemandaChuveiroAplicado = config.fatorDemandaChuveiro ?? fatorDemandaAquecimentoTabela(numChuveiros);
  const fatorDemandaArCondAplicado = config.fatorDemandaArCondicionado ?? fatorDemandaArCondicionadoTabela(numArCondicionados);

  const demandaIlumTugVA = cargaIlumTugVA * fatorDemandaIlumTugAplicado;
  const demandaChuveirosVA = cargaChuveirosVA * fatorDemandaChuveiroAplicado;
  const demandaArCondVA = cargaArCondVA * fatorDemandaArCondAplicado;
  const demandaOutrasTuesVA = cargaOutrasTuesVA; // FD 1,00 -- conservador (forno, micro-ondas, bomba etc.)

  const demandaCalculadaVA = demandaIlumTugVA + demandaChuveirosVA + demandaArCondVA + demandaOutrasTuesVA;
  const fatorDemandaGeralEfetivo = cargaInstaladaTotalVA > 0 ? demandaCalculadaVA / cargaInstaladaTotalVA : 1;

  // Tensão de referência do disjuntor geral: monofásico usa a própria tensão de fase; bifásico/trifásico usam a
  // tensão de entrada (fase-fase) informada -- trifásico usa ainda o fator √3 (potência trifásica equilibrada).
  const polosGeral: 1 | 2 | 3 = config.numeroFases === 1 ? 1 : config.numeroFases === 3 ? 3 : 2;
  const tensaoReferenciaGeral = config.numeroFases === 1 ? config.tensaoFaseV : config.tensaoEntradaV;
  const correnteGeralA =
    config.numeroFases === 3
      ? demandaCalculadaVA / (Math.sqrt(3) * tensaoReferenciaGeral)
      : demandaCalculadaVA / tensaoReferenciaGeral;

  const maiorDisjuntorRamalA = circuitos.reduce((max, c) => Math.max(max, c.disjuntorA), 0);
  let disjuntorGeralA = DISJUNTORES_PADRAO_A.find((d) => d >= correnteGeralA) ?? DISJUNTORES_PADRAO_A[DISJUNTORES_PADRAO_A.length - 1];
  // O disjuntor geral nunca pode ser menor que o maior disjuntor de ramal (senão desarmaria antes de qualquer ramal individual).
  if (disjuntorGeralA < maiorDisjuntorRamalA) {
    disjuntorGeralA = DISJUNTORES_PADRAO_A.find((d) => d >= maiorDisjuntorRamalA) ?? maiorDisjuntorRamalA;
    avisos.push(
      "O disjuntor geral foi ajustado para não ficar menor que o maior disjuntor de ramal individual -- confirme o dimensionamento do alimentador de entrada com a concessionária local."
    );
  }
  if (correnteGeralA > DISJUNTORES_PADRAO_A[DISJUNTORES_PADRAO_A.length - 1]) {
    avisos.push(
      `A corrente geral calculada (${correnteGeralA.toFixed(1)}A) excede a faixa de referência deste gerador -- este é um caso de carga muito alta (ex.: múltiplos TUEs de grande porte); dimensione o alimentador geral com um projetista.`
    );
  }

  // --- Iteração 31: totais de pontos + lista de material preliminar ---
  const totalTomadas = circuitos.reduce((s, c) => s + c.quantidadeTomadas, 0);
  const totalLampadas = circuitos.reduce((s, c) => s + c.quantidadeLampadas, 0);
  const listaMaterial = montarListaMaterial(dados, circuitos, disjuntorGeralA, polosGeral, config.numeroFases);

  return {
    circuitos,
    cargaIluminacaoTotalVA,
    cargaTugTotalVA,
    cargaTueTotalVA,
    cargaInstaladaTotalVA,
    numChuveiros,
    numArCondicionados,
    totalTomadas,
    totalLampadas,
    fatorDemandaIlumTugAplicado,
    fatorDemandaChuveiroAplicado,
    fatorDemandaArCondAplicado,
    demandaIlumTugVA,
    demandaChuveirosVA,
    demandaArCondVA,
    demandaOutrasTuesVA,
    fatorDemandaGeralEfetivo,
    demandaCalculadaVA,
    correnteGeralA,
    disjuntorGeralA,
    polosGeral,
    cargaPorFaseVA,
    desequilibrioFasesPercentual,
    listaMaterial,
    avisos,
  };
}

// ---------------------------------------------------------------------
// Iteração 31 -- Lista de material preliminar
// ---------------------------------------------------------------------

/**
 * Monta a lista de material preliminar a partir dos circuitos calculados
 * -- com destaque pros CONDUTORES separados por bitola E por função
 * (fase / neutro / terra), como o usuário pediu. Regras adotadas:
 *  - Nº de condutores FASE por circuito = nº de polos do disjuntor (1P =
 *    1 fase, 2P = 2 fases p.ex. chuveiro 220V bifásico, 3P = 3 fases).
 *  - NEUTRO: 1 por circuito de 1 polo (fase+neutro); circuitos 2P
 *    fase-fase não levam neutro; 3P segue sem neutro (carga trifásica
 *    equilibrada) -- ajuste manualmente se o equipamento exigir neutro.
 *  - TERRA (PE): sempre 1 por circuito, na MESMA bitola do condutor de
 *    fase (regra prática pra seções <= 16mm², NBR 5410 Tabela 58).
 *  - Metragem = comprimento médio por circuito (config, default 25m) ×
 *    nº de condutores da função -- ESTIMATIVA de estudo preliminar; a
 *    tabela desenhada é texto editável do CAD, ajuste após medir os
 *    percursos reais.
 *  - Alimentador geral: entra com o dobro do comprimento médio (percurso
 *    medidor → QDC costuma ser maior), na bitola do disjuntor geral pela
 *    própria Tabela 36.
 */
export function montarListaMaterial(
  dados: DadosCargasEletricas,
  circuitos: CircuitoCalculado[],
  disjuntorGeralA: number,
  polosGeral: 1 | 2 | 3,
  numeroFases: 1 | 2 | 3
): ItemMaterial[] {
  const compCircuitoM = dados.config.comprimentoMedioCircuitoM ?? 25;
  const itens: ItemMaterial[] = [];

  // --- Condutores por bitola × função (fase/neutro/terra) ---
  type Funcao = "fase" | "neutro" | "terra";
  const metros = new Map<string, { bitolaMm2: number; funcao: Funcao; m: number }>();
  const somar = (bitolaMm2: number, funcao: Funcao, m: number) => {
    const chave = `${bitolaMm2}|${funcao}`;
    const atual = metros.get(chave) ?? { bitolaMm2, funcao, m: 0 };
    atual.m += m;
    metros.set(chave, atual);
  };
  for (const c of circuitos) {
    const fases = c.polos;
    const neutros = c.polos === 1 ? 1 : 0;
    somar(c.bitolaMm2, "fase", fases * compCircuitoM);
    if (neutros > 0) somar(c.bitolaMm2, "neutro", neutros * compCircuitoM);
    somar(c.bitolaMm2, "terra", compCircuitoM);
  }
  // Alimentador geral (medidor → QDC): bitola pela ampacidade do disjuntor geral.
  const bitolaGeral = TABELA_36_B1_2CC.find((f) => f.ampacidadeA >= disjuntorGeralA)?.bitolaMm2 ?? TABELA_36_B1_2CC[TABELA_36_B1_2CC.length - 1].bitolaMm2;
  const compAlimentadorM = compCircuitoM * 2;
  somar(bitolaGeral, "fase", polosGeral * compAlimentadorM);
  // Entrada residencial SEMPRE leva neutro (mono F+N, bifásico 2F+N,
  // trifásico 3F+N) -- é dele que saem os circuitos de 127V; só RAMAIS
  // 2P fase-fase (chuveiro 220V etc.) é que não levam neutro.
  somar(bitolaGeral, "neutro", compAlimentadorM);
  somar(bitolaGeral, "terra", compAlimentadorM);

  const ROTULO_FUNCAO: Record<Funcao, string> = { fase: "FASE", neutro: "NEUTRO", terra: "TERRA (PE)" };
  const ordenados = [...metros.values()].sort((a, b) => a.bitolaMm2 - b.bitolaMm2 || a.funcao.localeCompare(b.funcao));
  for (const linha of ordenados) {
    itens.push({
      descricao: `Cabo flexível 750V ${fmt(linha.bitolaMm2, 1)}mm² -- ${ROTULO_FUNCAO[linha.funcao]}`,
      quantidade: Math.ceil(linha.m),
      unidade: "m",
      observacao: "estimativa: ajuste após medir percursos",
    });
  }

  // --- Disjuntores (ramais agrupados por corrente × polos + geral) ---
  const contagemDisjuntores = new Map<string, number>();
  for (const c of circuitos) {
    const chave = `${c.disjuntorA}A ${c.polos}P`;
    contagemDisjuntores.set(chave, (contagemDisjuntores.get(chave) ?? 0) + 1);
  }
  const chavesOrdenadas = [...contagemDisjuntores.keys()].sort((a, b) => parseInt(a) - parseInt(b));
  for (const chave of chavesOrdenadas) {
    itens.push({ descricao: `Disjuntor termomagnético ${chave} (ramal)`, quantidade: contagemDisjuntores.get(chave)!, unidade: "un" });
  }
  itens.push({ descricao: `Disjuntor termomagnético ${disjuntorGeralA}A ${polosGeral}P (geral)`, quantidade: 1, unidade: "un" });

  // --- Pontos: tomadas e lâmpadas (Iteração 31 -- pra conferência/compra) ---
  const tomadasMolhadas = dados.ambientes
    .filter((a) => TIPOS_AMBIENTE_MOLHADOS.includes(a.tipo))
    .reduce((s, a) => s + Math.max(0, Math.round(a.quantidadeTomadas)), 0);
  const tomadasSecas = dados.ambientes
    .filter((a) => !TIPOS_AMBIENTE_MOLHADOS.includes(a.tipo))
    .reduce((s, a) => s + Math.max(0, Math.round(a.quantidadeTomadas)), 0);
  if (tomadasSecas > 0) {
    itens.push({ descricao: "Tomada 2P+T 10A (áreas secas)", quantidade: tomadasSecas, unidade: "un" });
  }
  if (tomadasMolhadas > 0) {
    itens.push({ descricao: "Tomada 2P+T 20A (cozinha/área de serviço)", quantidade: tomadasMolhadas, unidade: "un" });
  }
  const totalLampadas = dados.ambientes.reduce((s, a) => s + Math.max(1, Math.round(a.quantidadeLampadas ?? 1)), 0);
  itens.push({ descricao: "Ponto de iluminação (luminária + interruptor)", quantidade: totalLampadas, unidade: "un" });
  const numTues = circuitos.filter((c) => c.tipoCircuito === "tue").length;
  if (numTues > 0) {
    itens.push({ descricao: "Ponto de força p/ TUE (tomada/conexão exclusiva)", quantidade: numTues, unidade: "un" });
  }

  // --- Quadro + proteções complementares (recomendações NBR 5410) ---
  const numCircuitos = circuitos.length;
  itens.push({ descricao: `Quadro de distribuição (QDC) p/ ${numCircuitos + 2}+ disjuntores`, quantidade: 1, unidade: "un" });
  itens.push({
    descricao: `Interruptor DR 30mA ${polosGeral === 3 ? "4P" : "2P"} (proteção adicional -- NBR 5410, 5.1.3.2.2)`,
    quantidade: 1,
    unidade: "un",
    observacao: "confirmar divisão por grupos de circuitos",
  });
  itens.push({ descricao: "DPS classe II (proteção contra surtos)", quantidade: numeroFases + 1, unidade: "un", observacao: "1 por fase + 1 no neutro" });

  return itens;
}

// ---------------------------------------------------------------------
// Geração da geometria (tabela de cargas + diagrama unifilar do QDC)
// ---------------------------------------------------------------------

function fmt(n: number, casas = 1): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function larguraEstimadaTexto(texto: string, fontSize: number): number {
  return texto.length * fontSize * 0.6;
}

/**
 * Quebra um texto em várias linhas curtas, cada uma com no máximo
 * `larguraMaximaMm` de largura estimada (Iteração 33 -- pedido do
 * usuário: "sempre quebre uma legenda se ela ficar muito grande para nao
 * sobrepor outro desenho ou tabela, prefiro ter 4 linhas do que uma
 * linha so gigante, a legenda nunca pode ser maior que um desenho ou
 * tabela ou diagrama"). Quebra gulosa por PALAVRA (nunca no meio de uma
 * palavra) -- se uma única palavra já for mais larga que o limite
 * (raro: nome de ambiente/equipamento muito longo sem espaços), ela
 * ainda assim ocupa sua própria linha (evita loop infinito; é a mesma
 * postura "seguro, não necessariamente perfeito" do resto deste arquivo).
 */
function quebrarTexto(texto: string, fontSize: number, larguraMaximaMm: number): string[] {
  const palavras = texto.split(" ").filter(Boolean);
  if (palavras.length === 0) return [texto];
  const linhas: string[] = [];
  let atual = palavras[0];
  for (let i = 1; i < palavras.length; i++) {
    const tentativa = `${atual} ${palavras[i]}`;
    if (larguraEstimadaTexto(tentativa, fontSize) <= larguraMaximaMm) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = palavras[i];
    }
  }
  linhas.push(atual);
  return linhas;
}

// Iteração 33 -- fontes aumentadas (pedido do usuário: "no pdf quando
// imprimo não da para ler, aumente o zoom") -- este gerador desenha em
// mm de MUNDO na folha A1 (ver `store.ts#gerarDimensionamentoCargas`,
// que troca pra A1 automaticamente); quando o app reduz a A1 pra caber
// numa impressão A4 ("Ajustar para impressão em A4"), todo texto encolhe
// junto -- por isso o texto de origem precisa ser generosamente maior do
// que pareceria necessário olhando só a tela.
const FS_TITULO = 7.5;
const FS_TABELA = 4.4;
const FS_LABEL = 5.4;
const ALTURA_LINHA = 1.25;

function blocoDisjuntorPorPolos(polos: 1 | 2 | 3): string {
  if (polos === 2) return "disjuntor_bipolar";
  if (polos === 3) return "disjuntor_tripolar";
  return "disjuntor";
}

/**
 * `origemX`/`origemY` -- MESMA convenção de `construirGeometriaDiagramaFv`
 * (`lib/diagramaFv.ts`): canto superior-esquerdo da área útil da folha
 * ativa (dentro das margens ABNT), calculado por quem chama
 * (`store.ts#gerarDimensionamentoCargas`). Usar sempre `(0,0)` aqui
 * (como uma 1ª versão desta função fazia) é um bug real -- o mundo é
 * centrado em `(0,0)` na ORIGEM da folha (Iteração 12b em diante), então
 * `(0,0)` cai no meio da página, não no canto -- um diagrama largo o
 * bastante (muitos circuitos) cresce pra dentro do carimbo no canto
 * inferior direito. Corrigido nesta mesma iteração, achado na verificação
 * visual antes da entrega (ver changelog).
 */
export function gerarDimensionamentoCargas(
  dados: DadosCargasEletricas,
  origemX = 0,
  origemY = 0,
  /**
   * Largura máxima (mm) de UMA fileira de disjuntores no diagrama, antes de
   * quebrar para a fileira seguinte -- calculada por quem chama
   * (`store.ts`) a partir do espaço realmente livre à esquerda do carimbo
   * na folha ativa (`folha.largura - margens - largura do carimbo`), não
   * um valor arbitrário -- ver comentário completo onde é calculada.
   */
  larguraMaximaMm = 500
): { geometria: NovaGeometria[]; resumo: ResumoCargasEletricas } {
  const resumo = calcularDimensionamentoCargas(dados);
  const g: NovaGeometria[] = [];

  // Iteração 33 -- "deixe todas as legendas em maiusculo": maiusculiza
  // TUDO que passa por aqui (título, cabeçalho de tabela, rótulo de
  // circuito, aviso...) num único lugar, em vez de cada chamada precisar
  // lembrar de fazer isso -- `toLocaleUpperCase("pt-BR")` acentua
  // corretamente (á→Á, ç→Ç etc.), diferente do `.toUpperCase()` genérico
  // em alguns ambientes.
  const textoT = (x: number, y: number, conteudo: string, fontSize = FS_LABEL, camada: string) =>
    g.push({ tipo: "texto", camada, x, y, conteudo: conteudo.toLocaleUpperCase("pt-BR"), fontSize });
  const linhaT = (x1: number, y1: number, x2: number, y2: number, camada: string) =>
    g.push({ tipo: "linha", camada, x1, y1, x2, y2 });
  const blocoT = (nome: string, x: number, y: number, camada: string) => g.push({ tipo: "bloco", camada, nome, x, y });
  const pontoT = (x: number, y: number, camada: string, cor = "#0f172a") =>
    g.push({ tipo: "circulo", camada, x, y, raio: 1.3, hachura: { tipo: "SOLID", escala: 1, cor } });

  // ---------------- 1) Tabela de cargas ----------------
  const CAMADA_TAB = CAMADA_QDC_TABELA;
  // Iteração 32 -- coluna FASE só aparece quando há mais de 1 fase
  // disponível (bifásico/trifásico); num sistema monofásico não há o que
  // balancear, então a coluna seria só ruído ("F1" em toda linha).
  const mostrarColunaFase = dados.config.numeroFases > 1;
  const colunas = [
    { chave: "circuito", titulo: "CIRC." },
    { chave: "descricao", titulo: "DESCRIÇÃO" },
    { chave: "tipo", titulo: "TIPO" },
    ...(mostrarColunaFase ? [{ chave: "fase", titulo: "FASE" }] : []),
    { chave: "tomadas", titulo: "TOMADAS (UN)" },
    { chave: "lampadas", titulo: "LÂMPADAS (UN)" },
    { chave: "tensao", titulo: "TENSÃO (V)" },
    { chave: "carga", titulo: "CARGA (VA)" },
    { chave: "corrente", titulo: "CORRENTE (A)" },
    { chave: "disjuntor", titulo: "DISJUNTOR" },
    { chave: "condutor", titulo: "CONDUTOR (mm²)" },
  ];
  // Iteração 31 -- colunas TOMADAS/LÂMPADAS pedidas pelo usuário: servem
  // pra conferência posterior e alimentam a lista de material ao lado.
  // Iteração 32 -- coluna FASE (quando bifásico/trifásico): mostra em
  // qual(is) fase(s) o balanceamento (`balancearFases`) colocou o
  // circuito -- "R", "F1-F2", "R-S-T" etc.
  const linhasTabela: string[][] = resumo.circuitos.map((c) => [
    c.nome,
    c.descricao,
    ROTULO_TIPO_CIRCUITO[c.tipoCircuito],
    ...(mostrarColunaFase ? [c.fases.map((f) => ROTULO_FASE[f]).join("-")] : []),
    c.quantidadeTomadas > 0 ? fmt(c.quantidadeTomadas, 0) : "-",
    c.quantidadeLampadas > 0 ? fmt(c.quantidadeLampadas, 0) : "-",
    fmt(c.tensaoV, 0),
    fmt(c.cargaVA, 0),
    fmt(c.correnteA, 2),
    `${c.disjuntorA}A ${c.polos}P`,
    fmt(c.bitolaMm2, 1),
  ]);
  linhasTabela.push([
    "GERAL",
    "Disjuntor geral (entrada)",
    "-",
    ...(mostrarColunaFase ? [fasesDisponiveis(dados.config.numeroFases).map((f) => ROTULO_FASE[f]).join("-")] : []),
    fmt(resumo.totalTomadas, 0),
    fmt(resumo.totalLampadas, 0),
    fmt(resumo.polosGeral === 1 ? dados.config.tensaoFaseV : dados.config.tensaoEntradaV, 0),
    fmt(resumo.demandaCalculadaVA, 0),
    fmt(resumo.correnteGeralA, 2),
    `${resumo.disjuntorGeralA}A ${resumo.polosGeral}P`,
    "-",
  ]);

  const PAD_CELULA = FS_TABELA * 1.4;
  const larguraColuna = colunas.map((col, idx) => {
    const maiorConteudo = Math.max(
      larguraEstimadaTexto(col.titulo, FS_TABELA),
      ...linhasTabela.map((linha) => larguraEstimadaTexto(linha[idx], FS_TABELA))
    );
    return maiorConteudo + PAD_CELULA * 2;
  });
  const xColunas: number[] = [origemX];
  for (const largura of larguraColuna) xColunas.push(xColunas[xColunas.length - 1] + largura);
  const larguraTabela = xColunas[xColunas.length - 1] - origemX;

  const alturaLinhaTabela = FS_TABELA * ALTURA_LINHA + PAD_CELULA * 1.6;
  const yTituloTabela = origemY;
  textoT(origemX, yTituloTabela, "TABELA DE CARGAS -- DIMENSIONAMENTO PRELIMINAR (NBR 5410)", FS_TITULO, CAMADA_TAB);
  const yTopoTabela = yTituloTabela + FS_TITULO * ALTURA_LINHA + 6;

  const totalLinhasTabela = 1 + linhasTabela.length; // cabeçalho + dados
  const yFundoTabela = yTopoTabela + totalLinhasTabela * alturaLinhaTabela;

  // Linhas horizontais (topo, sob cabeçalho, entre cada linha, base) + verticais entre colunas.
  for (let i = 0; i <= totalLinhasTabela; i++) {
    const y = yTopoTabela + i * alturaLinhaTabela;
    linhaT(origemX, y, origemX + larguraTabela, y, CAMADA_TAB);
  }
  for (const x of xColunas) {
    linhaT(x, yTopoTabela, x, yFundoTabela, CAMADA_TAB);
  }

  // Cabeçalho
  colunas.forEach((col, idx) => {
    const xTexto = xColunas[idx] + PAD_CELULA;
    const yTexto = yTopoTabela + alturaLinhaTabela / 2 + FS_TABELA * 0.35;
    textoT(xTexto, yTexto, col.titulo, FS_TABELA, CAMADA_TAB);
  });
  // Linhas de dados
  linhasTabela.forEach((linha, linhaIdx) => {
    const yBase = yTopoTabela + (linhaIdx + 1) * alturaLinhaTabela;
    linha.forEach((valor, colIdx) => {
      const xTexto = xColunas[colIdx] + PAD_CELULA;
      const yTexto = yBase + alturaLinhaTabela / 2 + FS_TABELA * 0.35;
      textoT(xTexto, yTexto, valor, FS_TABELA, CAMADA_TAB);
    });
  });

  // ---------------- 2) Resumo/parâmetros usados (abaixo da tabela) ----------------
  // Iteração 31 -- mostra os fatores de demanda POR CATEGORIA aplicados
  // (correção pedida pelo usuário: um FD único no geral estava errado).
  const yResumo = yFundoTabela + 8;
  const linhasResumo = [
    `SISTEMA: ${dados.config.numeroFases === 1 ? "MONOFÁSICO" : dados.config.numeroFases === 2 ? "BIFÁSICO" : "TRIFÁSICO"} -- ${dados.config.tensaoFaseV}V (FASE) / ${dados.config.tensaoEntradaV}V (ENTRADA) -- FATOR DE POTÊNCIA (TUE): ${dados.config.fatorPotencia.toFixed(2)}`,
    `CARGA INSTALADA: ILUMINAÇÃO ${fmt(resumo.cargaIluminacaoTotalVA, 0)}VA + TUG ${fmt(resumo.cargaTugTotalVA, 0)}VA + TUE ${fmt(resumo.cargaTueTotalVA, 0)}VA = ${fmt(resumo.cargaInstaladaTotalVA, 0)}VA -- ${fmt(resumo.totalTomadas, 0)} TOMADAS / ${fmt(resumo.totalLampadas, 0)} LÂMPADAS`,
    `FATORES DE DEMANDA POR CATEGORIA (AJUSTÁVEIS CONFORME NORMA DA CONCESSIONÁRIA): ILUM.+TUG ${resumo.fatorDemandaIlumTugAplicado.toFixed(2)} -- AQUECIMENTO/CHUVEIROS (${resumo.numChuveiros} UN) ${resumo.fatorDemandaChuveiroAplicado.toFixed(2)} -- AR-CONDICIONADO (${resumo.numArCondicionados} UN) ${resumo.fatorDemandaArCondAplicado.toFixed(2)} -- DEMAIS TUE 1,00`,
    `DEMANDA: ILUM.+TUG ${fmt(resumo.demandaIlumTugVA, 0)}VA + CHUVEIROS ${fmt(resumo.demandaChuveirosVA, 0)}VA + AR-COND. ${fmt(resumo.demandaArCondVA, 0)}VA + DEMAIS TUE ${fmt(resumo.demandaOutrasTuesVA, 0)}VA = ${fmt(resumo.demandaCalculadaVA, 0)}VA (FD GERAL EFETIVO ${resumo.fatorDemandaGeralEfetivo.toFixed(2)})`,
    `CORRENTE GERAL: ${fmt(resumo.correnteGeralA, 2)}A -- DISJUNTOR GERAL: ${resumo.disjuntorGeralA}A ${resumo.polosGeral}P`,
    // Iteração 32 -- carga por fase + desequilíbrio, só quando há mais de
    // 1 fase disponível (bifásico/trifásico); pedido do usuário pra
    // deixar visível como os circuitos foram balanceados entre as fases.
    ...(mostrarColunaFase
      ? [
          `BALANCEAMENTO DE FASES: ${Object.entries(resumo.cargaPorFaseVA)
            .map(([f, v]) => `${f} ${fmt(v ?? 0, 0)}VA`)
            .join(" -- ")} (DESEQUILÍBRIO ${resumo.desequilibrioFasesPercentual.toFixed(0)}% -- NBR 5410 NÃO FIXA UM LIMITE NUMÉRICO, MAS RECOMENDA-SE O MENOR POSSÍVEL)`,
        ]
      : []),
    "DIMENSIONAMENTO PRELIMINAR -- NÃO SUBSTITUI PROJETO ELÉTRICO ASSINADO POR RESPONSÁVEL TÉCNICO",
  ];
  // Iteração 33 -- nenhuma legenda pode ficar mais larga que a própria
  // TABELA de cargas que ela resume (pedido do usuário) -- linhas de
  // parâmetro que passariam disso quebram em várias linhas curtas.
  let yCursorResumo = yResumo;
  linhasResumo.forEach((linha) => {
    quebrarTexto(linha, FS_LABEL, larguraTabela).forEach((sub) => {
      textoT(origemX, yCursorResumo, sub, FS_LABEL, CAMADA_TAB);
      yCursorResumo += FS_LABEL * ALTURA_LINHA;
    });
  });
  let yProximo = yCursorResumo + 12;
  if (resumo.avisos.length > 0) {
    textoT(origemX, yProximo, "AVISOS:", FS_LABEL, CAMADA_TAB);
    yProximo += FS_LABEL * ALTURA_LINHA;
    resumo.avisos.forEach((aviso) => {
      quebrarTexto(`- ${aviso}`, FS_TABELA, larguraTabela).forEach((sub) => {
        textoT(origemX, yProximo, sub, FS_TABELA, CAMADA_TAB);
        yProximo += FS_TABELA * ALTURA_LINHA * 1.3;
      });
    });
    yProximo += 8;
  }

  // ---------------- 2b) Lista de material preliminar (Iteração 31) ----------------
  // Desenhada AO LADO da tabela de cargas (à direita), como o usuário
  // pediu -- é geometria de texto normal do CAD, então cada célula pode
  // ser editada com a ferramenta de texto (ajustar quantidades medidas,
  // acrescentar itens etc.) sem regenerar o dimensionamento.
  {
    const xMaterial = origemX + larguraTabela + 16;
    const colunasMat = [
      { titulo: "ITEM", valor: (_: ItemMaterial, idx: number) => fmt(idx + 1, 0) },
      { titulo: "DESCRIÇÃO", valor: (m: ItemMaterial) => m.descricao },
      { titulo: "QTD.", valor: (m: ItemMaterial) => fmt(m.quantidade, 0) },
      { titulo: "UN.", valor: (m: ItemMaterial) => m.unidade },
      { titulo: "OBSERVAÇÃO", valor: (m: ItemMaterial) => m.observacao ?? "" },
    ];
    const linhasMat: string[][] = resumo.listaMaterial.map((m, idx) => colunasMat.map((c) => c.valor(m, idx)));
    const larguraColMat = colunasMat.map((col, idx) => {
      const maior = Math.max(
        larguraEstimadaTexto(col.titulo, FS_TABELA),
        ...linhasMat.map((l) => larguraEstimadaTexto(l[idx], FS_TABELA))
      );
      return maior + PAD_CELULA * 2;
    });
    const xColMat: number[] = [xMaterial];
    for (const l of larguraColMat) xColMat.push(xColMat[xColMat.length - 1] + l);
    const larguraMat = xColMat[xColMat.length - 1] - xMaterial;

    textoT(xMaterial, yTituloTabela, "LISTA DE MATERIAL PRELIMINAR (EDITÁVEL)", FS_TITULO, CAMADA_TAB);
    const yTopoMat = yTituloTabela + FS_TITULO * ALTURA_LINHA + 6;
    const totalLinhasMat = 1 + linhasMat.length;
    const yFundoMat = yTopoMat + totalLinhasMat * alturaLinhaTabela;
    for (let i = 0; i <= totalLinhasMat; i++) {
      const y = yTopoMat + i * alturaLinhaTabela;
      linhaT(xMaterial, y, xMaterial + larguraMat, y, CAMADA_TAB);
    }
    for (const x of xColMat) {
      linhaT(x, yTopoMat, x, yFundoMat, CAMADA_TAB);
    }
    colunasMat.forEach((col, idx) => {
      textoT(xColMat[idx] + PAD_CELULA, yTopoMat + alturaLinhaTabela / 2 + FS_TABELA * 0.35, col.titulo, FS_TABELA, CAMADA_TAB);
    });
    linhasMat.forEach((linha, linhaIdx) => {
      const yBase = yTopoMat + (linhaIdx + 1) * alturaLinhaTabela;
      linha.forEach((valor, colIdx) => {
        if (valor) textoT(xColMat[colIdx] + PAD_CELULA, yBase + alturaLinhaTabela / 2 + FS_TABELA * 0.35, valor, FS_TABELA, CAMADA_TAB);
      });
    });
    const yNotaMat = yFundoMat + 5;
    textoT(
      xMaterial,
      yNotaMat,
      `METRAGEM DE CABOS ESTIMADA COM ${fmt(dados.config.comprimentoMedioCircuitoM ?? 25, 0)}m POR CIRCUITO -- TEXTO EDITÁVEL: AJUSTE APÓS MEDIR OS PERCURSOS REAIS`,
      FS_TABELA,
      CAMADA_TAB
    );
    // O diagrama abaixo só começa depois do fim da tabela de cargas E da
    // lista de material (a mais comprida das duas).
    yProximo = Math.max(yProximo, yNotaMat + FS_TABELA * ALTURA_LINHA + 12);
  }

  // ---------------- 3) Diagrama unifilar do QDC ----------------
  const CAMADA_DIAG = CAMADA_QDC_DIAGRAMA;
  // Iteração 33 -- pedido do usuário: "vamos diminuir a distancia entre
  // os dijuntores... está ficando muito largo sem necessidade". Antes,
  // cada ramal era LARGO O SUFICIENTE PRO TEXTO DO RÓTULO INTEIRO caber
  // numa linha só (`descricao` com vários ambientes juntos ficava
  // enorme) -- isso é justamente o que deixava o diagrama largo demais.
  // Agora a largura do ramal é FIXA (só um pouco maior que o próprio
  // símbolo do disjuntor, 20mm -- ver `blocks.ts`) e o rótulo, se não
  // couber nessa largura, QUEBRA em várias linhas (`quebrarTexto`) em vez
  // de alargar o ramal -- exatamente o pedido do usuário ("prefiro ter 4
  // linhas do que uma linha so gigante"). Espaço entre ramais também
  // reduzido (26mm -> 12mm).
  const LARGURA_RAMAL = 30;
  const ESPACO_ENTRE_RAMAIS = 12;
  const larguraRamal = resumo.circuitos.map(() => LARGURA_RAMAL);

  // Largura máxima de UMA linha de ramais -- casas com muitos circuitos (10-20+)
  // não podem crescer pra largura ilimitada: além de sair da folha, cresceria pra
  // dentro do carimbo no canto inferior direito mesmo partindo do canto correto
  // (ver comentário de `origemX`/`origemY` acima). Em vez disso, os ramais
  // "quebram linha" -- várias fileiras de disjuntores, uma abaixo da outra, cada
  // uma alimentada pelo MESMO tronco vertical central (igual a um QDC real de
  // várias fileiras de disjuntores dentro do mesmo quadro).
  const LARGURA_MAXIMA_LINHA_RAMAIS = Math.max(300, larguraMaximaMm);
  const filasRamais: { indices: number[]; larguraFila: number }[] = [];
  {
    let filaAtual: number[] = [];
    let larguraFilaAtual = 0;
    resumo.circuitos.forEach((_, idx) => {
      const larguraComEspaco = larguraRamal[idx] + (filaAtual.length > 0 ? ESPACO_ENTRE_RAMAIS : 0);
      if (filaAtual.length > 0 && larguraFilaAtual + larguraComEspaco > LARGURA_MAXIMA_LINHA_RAMAIS) {
        filasRamais.push({ indices: filaAtual, larguraFila: larguraFilaAtual });
        filaAtual = [];
        larguraFilaAtual = 0;
      }
      filaAtual.push(idx);
      larguraFilaAtual += larguraRamal[idx] + (filaAtual.length > 1 ? ESPACO_ENTRE_RAMAIS : 0);
    });
    if (filaAtual.length > 0) filasRamais.push({ indices: filaAtual, larguraFila: larguraFilaAtual });
  }
  const larguraTotalRamais = Math.max(0, ...filasRamais.map((f) => f.larguraFila));
  // Iteração 30 -- bug real achado na verificação visual (PDF): usar a
  // largura da TABELA aqui (que pode ser bem mais larga que qualquer fileira
  // de ramais, já que soma texto de várias colunas) empurrava o centro do
  // diagrama pra bem mais à direita do que o necessário -- mesmo com cada
  // fileira de ramais respeitando `larguraMaximaMm`, o diagrama INTEIRO
  // acabava centralizado longe o bastante pra ainda invadir o carimbo.
  // O diagrama agora se posiciona só pela SUA PRÓPRIA largura de conteúdo,
  // nunca pela largura da tabela (que fica bem acima e não compartilha
  // centralização com o diagrama).
  const centroXDiagrama = origemX + larguraTotalRamais / 2;

  const yTituloDiagrama = yProximo;
  // Iteração 32 -- título muda pra "MULTIFILAR" em bifásico/trifásico
  // (`mostrarColunaFase`, calculado lá na tabela): reflete que o desenho
  // abaixo mostra cada condutor de fase/neutro separadamente, não mais
  // uma única linha representando "tudo" (pedido do usuário).
  textoT(
    origemX,
    yTituloDiagrama,
    `DIAGRAMA ${mostrarColunaFase ? "MULTIFILAR" : "UNIFILAR"} -- QUADRO DE DISTRIBUIÇÃO (QDC)`,
    FS_TITULO,
    CAMADA_DIAG
  );
  // Iteração 33 -- o subtítulo do diagrama também nunca pode ficar mais
  // largo que o PRÓPRIO diagrama (pedido do usuário) -- usa a largura
  // real das linhas de ramais como teto (com um piso pra não quebrar
  // palavra por palavra num diagrama de 1-2 circuitos só).
  const larguraMaximaLegendaDiagrama = Math.max(120, larguraTotalRamais);
  const linhasSubtituloBrutas: string[] = [];
  if (filasRamais.length > 1) {
    linhasSubtituloBrutas.push(`${resumo.circuitos.length} circuitos, distribuídos em ${filasRamais.length} fileiras de disjuntores`);
  }
  if (mostrarColunaFase) {
    linhasSubtituloBrutas.push(
      `${fasesDisponiveis(dados.config.numeroFases).map((f) => ROTULO_FASE[f]).join("/")} + N -- cada ramal desce um condutor por fase que usa (+ neutro, se 1P), conforme o balanceamento de fases`
    );
  }
  const linhasSubtituloDiagrama = linhasSubtituloBrutas.flatMap((linha) =>
    quebrarTexto(`(${linha})`, FS_TABELA, larguraMaximaLegendaDiagrama)
  );
  linhasSubtituloDiagrama.forEach((linha, i) => {
    textoT(origemX, yTituloDiagrama + FS_TITULO * ALTURA_LINHA + 4 + i * FS_TABELA * ALTURA_LINHA, linha, FS_TABELA, CAMADA_DIAG);
  });

  let yCursor =
    yTituloDiagrama +
    FS_TITULO * ALTURA_LINHA +
    (linhasSubtituloDiagrama.length > 0 ? linhasSubtituloDiagrama.length * FS_TABELA * ALTURA_LINHA + 6 : 0) +
    12;
  // Entrada (representando o ramal de ligação vindo do medidor/padrão de entrada).
  linhaT(centroXDiagrama, yCursor, centroXDiagrama, yCursor + 14, CAMADA_DIAG);
  textoT(centroXDiagrama + 4, yCursor + 8, "ENTRADA (MEDIDOR)", FS_TABELA, CAMADA_DIAG);
  yCursor += 14;

  // Disjuntor geral.
  const defDisjuntorGeral = getBlockDef(blocoDisjuntorPorPolos(resumo.polosGeral));
  const alturaDisjuntorGeral = defDisjuntorGeral?.altura ?? 30;
  blocoT(blocoDisjuntorPorPolos(resumo.polosGeral), centroXDiagrama, yCursor + alturaDisjuntorGeral / 2, CAMADA_DIAG);
  textoT(
    centroXDiagrama + 12,
    yCursor + alturaDisjuntorGeral / 2,
    `DISJUNTOR GERAL: ${resumo.disjuntorGeralA}A ${resumo.polosGeral}P`,
    FS_LABEL,
    CAMADA_DIAG
  );
  yCursor += alturaDisjuntorGeral;

  // Tronco vertical central, descendo por TODAS as fileiras de ramais (uma
  // fileira de disjuntores por vez, de cima pra baixo).
  const alturaMaximaRamalPorFila = filasRamais.map((fila) =>
    Math.max(...fila.indices.map((idx) => getBlockDef(blocoDisjuntorPorPolos(resumo.circuitos[idx].polos))?.altura ?? 30))
  );
  const ESPACO_ENTRE_FILAS = 14; // Iteração 33 -- reduzido de 20 (pedido do usuário de diminuir espaçamento no diagrama)

  // Iteração 32 -- DIAGRAMA MULTIFILAR quando bifásico/trifásico (pedido
  // do usuário: "quando for padrao bifasico ou trifasico o diagrama vai
  // precisar ser multifilar"). Em vez de 1 barramento (uma linha
  // representando "tudo"), desenha 1 barra horizontal POR FASE + 1 barra
  // de NEUTRO, empilhadas, com o tronco geral cruzando todas -- cada
  // ramal desce um condutor (linha) de CADA fase que usa (1 fase + neutro
  // pro circuito 1P; as 2 fases pro 2P fase-fase; R+S+T pro 3P) até o
  // disjuntor, deixando visível no desenho a separação de fases decidida
  // por `balancearFases`. Sistema MONOFÁSICO mantém o unifilar de sempre
  // (só há 1 fase -- nada a separar), sem nenhuma mudança de layout.
  const fasesSistema = fasesDisponiveis(dados.config.numeroFases);
  const ESPACO_BARRA = 5; // mm entre cada barra de fase/neutro empilhada
  const barrasFila: (FaseEletrica | "N")[] = mostrarColunaFase ? [...fasesSistema, "N"] : [];

  let yMaxRamal = yCursor;
  filasRamais.forEach((fila, filaIdx) => {
    const yBarramentoTopo = yCursor + 12;
    // Multifilar: N barras empilhadas (1 por fase + neutro) -- a barra "de
    // baixo" é de onde os ramais efetivamente descem, igual à barra única
    // do unifilar (onde `alturaBarras` é 0 -- topo e base coincidem).
    const alturaBarras = mostrarColunaFase ? (barrasFila.length - 1) * ESPACO_BARRA : 0;
    const yBarramentoBase = yBarramentoTopo + alturaBarras;
    linhaT(centroXDiagrama, yCursor, centroXDiagrama, yBarramentoTopo, CAMADA_DIAG);

    const centrosRamais: number[] = [];
    let xCursorRamal = centroXDiagrama - fila.larguraFila / 2;
    for (const idx of fila.indices) {
      centrosRamais.push(xCursorRamal + larguraRamal[idx] / 2);
      xCursorRamal += larguraRamal[idx] + ESPACO_ENTRE_RAMAIS;
    }

    if (centrosRamais.length > 0) {
      const xBarraIni = Math.min(centrosRamais[0], centroXDiagrama);
      const xBarraFim = Math.max(centrosRamais[centrosRamais.length - 1], centroXDiagrama);
      if (mostrarColunaFase) {
        // Tronco cruzando TODAS as barras empilhadas desta fileira.
        linhaT(centroXDiagrama, yBarramentoTopo, centroXDiagrama, yBarramentoBase, CAMADA_DIAG);
        barrasFila.forEach((rotulo, i) => {
          const y = yBarramentoTopo + i * ESPACO_BARRA;
          // Iteração 33 -- pedido do usuário: "quero que cada fase tenha uma
          // cor digerente e o neutro a cor azul". Cada barra (fase ou
          // neutro) usa sua própria camada/cor (`CAMADA_FASE_INFO`), em vez
          // da camada única `CAMADA_DIAG` -- assim fica visualmente óbvio
          // qual barra é qual fase, e o neutro sempre aparece em azul.
          const infoFase = CAMADA_FASE_INFO[rotulo];
          linhaT(xBarraIni, y, xBarraFim, y, infoFase.camada);
          pontoT(centroXDiagrama, y, infoFase.camada, infoFase.cor);
          textoT(xBarraIni - larguraEstimadaTexto(rotulo, FS_TABELA) - 3, y + FS_TABELA * 0.35, rotulo, FS_TABELA, infoFase.camada);
        });
      } else {
        linhaT(centrosRamais[0], yBarramentoTopo, centrosRamais[centrosRamais.length - 1], yBarramentoTopo, CAMADA_DIAG);
      }
    }

    fila.indices.forEach((idx, posicaoNaFila) => {
      const c = resumo.circuitos[idx];
      const xRamal = centrosRamais[posicaoNaFila];

      if (mostrarColunaFase) {
        // Um condutor (linha) por fase usada + neutro (só em circuito 1P) --
        // pequeno desvio horizontal entre eles pra não desenhar sobrepostos.
        const condutores: (FaseEletrica | "N")[] = c.polos === 1 ? [...c.fases, "N"] : [...c.fases];
        condutores.forEach((rotulo, i) => {
          const iBarra = barrasFila.indexOf(rotulo);
          const yBarra = yBarramentoTopo + iBarra * ESPACO_BARRA;
          const xCondutor = xRamal + (i - (condutores.length - 1) / 2) * 2;
          // Iteração 33 -- condutor de descida também usa a cor/camada da
          // própria fase (ou azul, se neutro), coerente com a barra de onde desce.
          const infoCondutor = CAMADA_FASE_INFO[rotulo];
          pontoT(xCondutor, yBarra, infoCondutor.camada, infoCondutor.cor);
          linhaT(xCondutor, yBarra, xCondutor, yBarramentoBase + 8, infoCondutor.camada);
        });
      } else {
        pontoT(xRamal, yBarramentoBase, CAMADA_DIAG);
        linhaT(xRamal, yBarramentoBase, xRamal, yBarramentoBase + 8, CAMADA_DIAG);
      }

      const defRamal = getBlockDef(blocoDisjuntorPorPolos(c.polos));
      const alturaRamal = defRamal?.altura ?? 30;
      const centroYRamal = yBarramentoBase + 8 + alturaRamal / 2;
      blocoT(blocoDisjuntorPorPolos(c.polos), xRamal, centroYRamal, CAMADA_DIAG);
      const yFimBloco = yBarramentoBase + 8 + alturaRamal;
      // Iteração 33 -- como o ramal agora tem largura FIXA (`LARGURA_RAMAL`,
      // ver comentário acima), o rótulo do disjuntor não pode mais assumir
      // que cabe numa linha só -- em vez de estourar pra fora do ramal (e
      // sobrepor o ramal vizinho), cada linha "crua" é quebrada em várias
      // linhas curtas via `quebrarTexto`, respeitando a largura do próprio
      // ramal (pedido do usuário: "prefiro ter 4 linhas do que uma linha so
      // gigante" / "a legenda nunca pode ser maior que um desenho").
      const larguraMaximaRotulo = larguraRamal[idx] + ESPACO_ENTRE_RAMAIS - 4;
      const linhasRotuloBrutas = [
        `${c.nome} - ${c.descricao}`,
        mostrarColunaFase
          ? `${c.disjuntorA}A ${c.polos}P -- ${fmt(c.bitolaMm2, 1)}mm² -- FASE ${c.fases.map((f) => ROTULO_FASE[f]).join("-")}`
          : `${c.disjuntorA}A ${c.polos}P -- ${fmt(c.bitolaMm2, 1)}mm²`,
      ];
      const linhasRotulo = linhasRotuloBrutas.flatMap((linha) => quebrarTexto(linha, FS_TABELA, larguraMaximaRotulo));
      linhasRotulo.forEach((linhaTxt, i) => {
        textoT(xRamal - larguraRamal[idx] / 2 + 2, yFimBloco + 8 + i * FS_TABELA * ALTURA_LINHA, linhaTxt, FS_TABELA, CAMADA_DIAG);
      });
      yMaxRamal = Math.max(yMaxRamal, yFimBloco + 8 + linhasRotulo.length * FS_TABELA * ALTURA_LINHA);
    });

    // Avança o tronco vertical até o início da PRÓXIMA fileira (se houver),
    // passando "por trás" da fileira atual (pular, sem desenhar por cima dos blocos).
    const yFimFilaAtual = yBarramentoBase + 8 + alturaMaximaRamalPorFila[filaIdx];
    if (filaIdx < filasRamais.length - 1) {
      linhaT(centroXDiagrama, yBarramentoBase, centroXDiagrama, yFimFilaAtual + ESPACO_ENTRE_FILAS, CAMADA_DIAG);
      yCursor = yFimFilaAtual + ESPACO_ENTRE_FILAS;
    }
  });

  // ---------------- Provenance + retorno ----------------
  const geometriaMarcada = g.map((el) => ({ ...el, origemGeradorId: ORIGEM_GERADOR_CARGAS }));

  if (geometriaMarcada.length > MAX_ELEMENTOS_LEIAUTE) {
    throw new Error(
      `Esse dimensionamento geraria ${geometriaMarcada.length} elementos de desenho -- acima do limite de segurança (${MAX_ELEMENTOS_LEIAUTE}). Reduza o número de ambientes/equipamentos.`
    );
  }

  return { geometria: geometriaMarcada, resumo };
}
