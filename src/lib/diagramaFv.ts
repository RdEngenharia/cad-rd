/**
 * diagramaFv.ts
 * -----------------------------------------------------------------------
 * Gerador do "molde" de diagrama unifilar fotovoltaico. Nasceu na
 * Iteração 12b (comando de IA em linguagem natural, `GERAR_PROJETO_FV`) e
 * foi reformulado por completo na Iteração 13, a pedido do usuário: um
 * BOTÃO abre um MODAL estruturado (`components/DiagramaFvModal.tsx`) que
 * pergunta os dados na ordem do diagrama -- padrão de entrada, depois
 * inversor(es), depois placas --, substituindo por completo o antigo
 * fluxo por IA (decisão explícita do usuário: "substituir completamente
 * o gerador por IA" quando perguntado). O usuário anexou 2 novos PDFs de
 * referência (1 monofásico 7,56 kWp, 1 trifásico 380V 11,78 kWp com 2
 * MPPTs) pedindo que o resultado seja "idêntico" a eles, ignorando só o
 * carimbo (que já é preenchido pelo painel "Carimbo" existente).
 *
 * DECISÃO DE ARQUITETURA (mantida da 12b, só a origem dos dados mudou):
 * esta função pura calcula 100% das posições/coordenadas a partir de
 * DADOS estruturados -- ninguém "desenha" o diagrama peça por peça, nem
 * a IA (removida) nem o modal (só coleta os dados). Mesmo princípio do
 * "Padrão de Entrada/Concessionária" (`store.ts#inserirPadraoConcessionaria`),
 * numa escala maior. Sem dependência de Zustand/React/Konva -- só monta e
 * devolve geometria pura, testável isoladamente. Quem insere de fato no
 * projeto (com snapshot de undo/redo) é `store.ts#gerarDiagramaFotovoltaico`.
 *
 * DECISÃO DE PRODUTO (confirmada com o usuário via AskUserQuestion antes
 * de implementar): disjuntores/bitolas de cabo em cada trecho (padrão de
 * medição, quadro de distribuição, proteção CA, proteção CC) e as
 * especificações de DPS NÃO são calculados/sugeridos por nenhuma tabela
 * de norma de concessionária -- o modal só pede pra digitar esses valores
 * diretamente (o usuário confirmou: "Só digitar, sem cálculo automático").
 * Evita a ferramenta "inventar" um valor de segurança elétrica sem uma
 * fonte confiável por trás -- cada concessionária brasileira tem sua
 * própria norma de padrão de entrada, e um erro aqui tem consequência
 * real (risco elétrico), não é só um desenho errado.
 *
 * MÚLTIPLOS INVERSORES (novo na 13, decisão confirmada com o usuário):
 * cada inversor entra como uma coluna própria, lado a lado, cada uma com
 * sua própria "Quadro de proteção CC" + colunas de MPPT/módulos embaixo
 * -- mesmo padrão do diagrama trifásico de referência (2 MPPTs lado a
 * lado sob 1 inversor), só que generalizado pra N inversores lado a lado.
 *
 * CORREÇÃO DE CONECTIVIDADE (Iteração 15, a pedido do usuário -- anexou o
 * PDF exportado pela ferramenta ao lado do PDF de referência dele mesmo e
 * relatou "o diagrama nao ficou igual o modelo... está todo quebrado...
 * As linhas nao estao se encaichando perteitamente nos blocos"):
 * investigação encontrou 3 causas raiz concretas, todas corrigidas nesta
 * iteração --
 *  1) `store.ts#gerarDiagramaFotovoltaico` gravava o diagrama inteiro na
 *     `activeLayer` (camada selecionada na hora, arbitrária) em vez de
 *     numa camada fixa -- o valor inicial do projeto é "BARRAMENTO"
 *     (âmbar), daí o diagrama sair todo amarelo/laranja em vez de preto.
 *     Corrigido: a ação agora sempre usa a camada "0" (cinza-escuro).
 *  2) Várias conexões linha->bloco tinham pequenos desencontros (2-8mm)
 *     entre onde a linha terminava e o ponto de conexão real do bloco
 *     (`pontosConexao`, ver blocks.ts) -- aritmética manual acumulava
 *     erro. Corrigido com o helper `criarCursorVertical` abaixo: em vez
 *     de calcular coordenadas de bloco "no olho", o cursor SEMPRE deriva
 *     o centro do bloco a partir da altura real declarada em
 *     `getBlockDef`, garantindo por construção que o topo do bloco cai
 *     exatamente onde a linha anterior termina, e a próxima linha começa
 *     exatamente onde o bloco termina.
 *  3) Os blocos "DPS" nos quadros de distribuição/proteção CA/proteção CC
 *     ficavam plantados do lado do barramento principal SEM NENHUMA linha
 *     ligando os dois (flutuando, exatamente como o usuário descreveu).
 *     Corrigido com o novo bloco `dps_lateral` (ramal em T, ver
 *     blocks.ts) + um ponto (nó) preenchido marcando a derivação no
 *     barramento -- mesma convenção do PDF de referência do usuário.
 *     Também foram criados o bloco `terra` (símbolo de aterramento após
 *     cada módulo fotovoltaico, ausente antes) e adicionados
 *     `pontosConexao` verticais ao bloco `inversor` e ao
 *     `modulo_fotovoltaico` (o triângulo agora tem o ápice encostando em
 *     y=0 do viewBox, eliminando outro gap visual).
 *
 * SIMPLIFICAÇÕES CONHECIDAS (documentadas, não são bugs):
 *  - (Resolvida na Iteração 16) As caixas de agrupamento eram desenhadas
 *    como retângulo de traço fino sólido, sem replicar o traço tracejado
 *    dos PDFs de referência -- agora saem tracejadas via o campo
 *    `tracejado` do próprio retângulo (`lib/types.ts`), independente do
 *    `estiloLinha` da camada.
 *  - A legenda, o detalhe da placa de advertência e o quadro "Padrão de
 *    Entrada Representativo" são desenhados de forma fiel à ESTRUTURA dos
 *    diagramas de referência (mesmos títulos/símbolos/proporção), mas não
 *    são réplicas pixel a pixel -- é uma aproximação vetorial equivalente,
 *    não uma cópia direta do PDF.
 *  - Não há tabela embutida de bitola/disjuntor por norma de
 *    concessionária (ver decisão de produto acima) -- todo valor desse
 *    tipo é o que o usuário digitou no modal, sempre editável depois
 *    direto no canvas (todo texto gerado é `tipo: "texto"` normal).
 *  - Todas as peças entram numa única camada (a `activeLayer` no momento
 *    do pedido), mesmo padrão do Padrão de Entrada/Concessionária.
 *  - O diagrama pode ficar mais largo que a folha A1 em cenários extremos
 *    (muitos inversores x muitos MPPTs cada) -- não há quebra de página
 *    automática; o usuário precisa reorganizar manualmente nesse caso raro.
 * -----------------------------------------------------------------------
 */
import type { NovaGeometria } from "./types";
import { getBlockDef } from "./blocks";

/**
 * Iteração 41 -- ver `layoutAutomatico.ts` (cabeçalho) e `store.ts#gerarDiagramaFotovoltaico`:
 * marca toda geometria produzida por este gerador, pro store poder (a)
 * substituir uma geração anterior dele mesmo em vez de acumular cópias, e
 * (b) nunca posicionar uma geração nova por cima da saída de OUTRO
 * gerador automático (mesmo padrão já usado por `ORIGEM_GERADOR_SISTEMA_SOLO`/
 * `ORIGEM_GERADOR_CARGAS`/`ORIGEM_GERADOR_LANCAMENTO_ELETRICO` -- este
 * gerador, inexplicavelmente, era o único dos 4 sem essa marca).
 */
export const ORIGEM_GERADOR_DIAGRAMA_FV = "diagramaFv";

export type TipoRedeFv = "monofasico" | "bifasico" | "trifasico";

/** Retângulo em mm de mundo -- usado para devolver a área reservada ao quadro "Padrão de Entrada Representativo" (ver `boxPadraoEntradaRepresentativo` no retorno de `construirGeometriaDiagramaFv`). */
export interface RetanguloMm {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface DadosDiagramaFvPadraoEntrada {
  tipoRede: TipoRedeFv;
  /** Fios do ramal de ligação da concessionária, ex.: "1x10+1x10mm²". */
  ramalLigacao: string;
  /** Corrente do disjuntor do padrão de medição, em ampères. */
  correnteDisjuntorPadraoA: number;
  /** Cabo entre o padrão de medição e o quadro de distribuição, ex.: "1#10(10)MM²". */
  caboPadraoAteDistribuicao: string;
  /** Corrente do disjuntor do quadro de distribuição, em ampères. */
  correnteDisjuntorDistribuicaoA: number;
  /** Especificação do DPS CA (mesmo texto usado no quadro de distribuição E no quadro de proteção CA), ex.: "classe II\nIn:10KA Imax:20KA 275Vca". */
  especificacaoDpsCa: string;
  /** Cabo entre o quadro de distribuição e o quadro de proteção CA. */
  caboDistribuicaoAteProtecaoCa: string;
  /** Corrente do disjuntor do quadro de proteção CA, em ampères. */
  correnteDisjuntorProtecaoCaA: number;
  /** Cabo entre o quadro de proteção CA e o(s) inversor(es), conforme a corrente de saída do datasheet do inversor. */
  caboProtecaoCaAteInversor: string;
}

export interface DadosDiagramaFvMppt {
  /** Número de strings em paralelo ligadas a esta entrada MPPT. */
  numeroStrings: number;
  /** Módulos em série por string. */
  modulosPorString: number;
  /**
   * Corrente da proteção CC (fusível) deste ramo, em ampères -- SEMPRE
   * digitada pelo usuário no modal (ver decisão de produto no cabeçalho
   * do arquivo; `estimarCorrenteFusivel` só aparece como sugestão/hint no
   * modal, nunca é aplicada automaticamente aqui).
   */
  correnteProtecaoCcA: number;
}

export interface DadosDiagramaFvInversor {
  modelo: string;
  potenciaW: number;
  tensaoEntradaMinV: number;
  tensaoEntradaMaxV: number;
  /** Tensão CC máxima de entrada admissível (Voc/tensão de curto-circuito máxima suportada), em volts -- distinta da faixa de operação MPPT acima. */
  tensaoMaxCcV: number;
  /** Corrente máxima admissível por entrada MPPT (Isc máxima suportada), em ampères. */
  correnteMaxPorMpptA: number;
  tensaoSaidaV: number;
  correnteSaidaA: number;
  /**
   * Iteração 24: corrente do disjuntor de SAÍDA deste inversor específico,
   * em ampères -- SEMPRE digitada pelo usuário (mesma filosofia de nunca
   * calcular/sugerir automaticamente um valor de proteção, ver decisão de
   * produto no cabeçalho do arquivo). Usada para desenhar 1 disjuntor
   * individual por inversor, entre o barramento CA compartilhado e o
   * símbolo do inversor -- antes só existia 1 disjuntor no diagrama
   * inteiro (no Quadro de Proteção CA, protegendo a saída CA combinada de
   * TODOS os inversores), o que o usuário relatou como incorreto ao
   * simular 2 inversores ("precisamos ter um disjuntor para cada
   * inversor... só aparece um disjuntor no quadro de proteção").
   */
  correnteDisjuntorSaidaA: number;
  /** Bitola dos condutores CC (positivo/negativo/proteção, mesmo valor pros 3), conforme o datasheet do inversor e dos módulos -- ex.: "4mm²". */
  caboCcMm2: string;
  /** Especificação do DPS CC deste inversor, ex.: "classe II\nIn:18KA Imax:400KA 600/1040v". */
  especificacaoDpsCc: string;
  /** Um item por entrada MPPT deste inversor -- a ordem do array define a ordem das colunas (esquerda -> direita) sob ele. */
  mppts: DadosDiagramaFvMppt[];
}

export interface DadosDiagramaFvModulo {
  marca: string;
  modelo: string;
  potenciaWp: number;
  vmp: number;
  voc: number;
  imp: number;
  eficiencia: number;
}

export interface DadosDiagramaFv {
  padraoEntrada: DadosDiagramaFvPadraoEntrada;
  /** Carga instalada do imóvel (aparece no Quadro de distribuição), em kW -- opcional. */
  cargaInstaladaKw?: number;
  /** Um item por inversor -- a ordem do array define a ordem das colunas (esquerda -> direita) no diagrama. */
  inversores: DadosDiagramaFvInversor[];
  /** Módulo único usado no projeto inteiro (mesmo modelo em todas as strings, como em todos os diagramas de referência do usuário). */
  modulo: DadosDiagramaFvModulo;
  /**
   * Iteração 18: `true` quando o usuário anexou uma foto real do padrão
   * de entrada no modal (`DiagramaFvModal.tsx` sabe isso ANTES de chamar
   * o gerador -- é só o `File` já selecionado no formulário). Sem foto
   * nenhuma, o quadro "PADRÃO DE ENTRADA REPRESENTATIVO" saía vazio, só
   * com o texto "(anexe a foto real...)" -- pedido do usuário: usar em
   * vez disso um desenho representativo (bloco `padrao_entrada_detalhe`,
   * ver `blocks.ts`), baseado no PDF de referência dele. Com foto, o
   * comportamento de sempre continua (o modal encaixa a foto real por
   * cima, via XREF, no retângulo devolvido em `boxPadraoEntradaRepresentativo`).
   */
  temFotoPadraoEntrada?: boolean;
}

const REDE_POR_TIPO: Record<TipoRedeFv, { disjuntor: string; tensao: string; fiosPadrao: string }> = {
  monofasico: { disjuntor: "MONOPOLAR", tensao: "220V", fiosPadrao: "1x10+1x10mm²" },
  bifasico: { disjuntor: "BIPOLAR", tensao: "220V", fiosPadrao: "2x10+1x10mm²" },
  trifasico: { disjuntor: "TRIPOLAR", tensao: "220/380V", fiosPadrao: "3x16+1x16mm²" },
};

/** Valor inicial sugerido pro campo "Ramal de ligação" do modal, conforme o tipo de rede -- só um ponto de partida, sempre editável. */
export function ramalLigacaoPadrao(tipoRede: TipoRedeFv): string {
  return REDE_POR_TIPO[tipoRede].fiosPadrao;
}

/**
 * Iteração 19: escolhe o bloco de disjuntor (ver `blocks.ts`) com a
 * quantidade certa de traços pro rótulo MONOPOLAR/BIPOLAR/TRIPOLAR já
 * calculado em `rede.disjuntor` -- antes o texto do rótulo mudava mas o
 * SÍMBOLO desenhado era sempre o mesmo (gap relatado pelo usuário: "os
 * blocos de disjuntores precisam ter diferença entre monopolar, bipolar e
 * tripolar", confirmado comparando os PDFs de referência monofásico vs.
 * trifásico dele -- lá o símbolo é sempre a mesma "mola", só o número de
 * tracinhos cruzando ela muda: 1/2/3).
 */
function blocoDisjuntorPorPolos(rotulo: string): string {
  if (rotulo === "BIPOLAR") return "disjuntor_bipolar";
  if (rotulo === "TRIPOLAR") return "disjuntor_tripolar";
  return "disjuntor";
}

// Iteração 19: aumentados a pedido do usuário ("O texto no diagrama ainda
// está muito pequeno... eu testei o tamanho 4,5 e 5 e ficou bom aqui na
// escala de texto") -- antes iam de 2.3 a 5 (uma faixa larga, com a
// maioria bem abaixo do que o usuário achou confortável); ficaram entre
// 3.2 (só o bloco de specs mais denso, que fica espremido em colunas
// estreitas) e 5.5.
//
// Iteração 22: pedido novo do usuário, depois de ver o resultado renderizado
// -- "deixe todos os textos do diagrama igual o tamanho do Quadro de
// protecao cc, ou rede de baixa tensao, esses nomes especificos estao com
// uma escala boa para leitura, os outros ficam pequenos". `FS_CORPO` (texto
// de corpo -- specs de disjuntor/DPS/cabos/cargas) e `FS_SPEC` (o bloco mais
// denso -- specs de inversor/MPPT/módulo) estavam abaixo de `FS_LABEL` (o
// tamanho usado pelos títulos de caixa, incl. "QUADRO DE PROTEÇÃO CC"), a
// causa raiz concreta do "os outros ficam pequenos" -- unificados aqui em
// `FS_LABEL` (4.2mm), o mesmo tamanho já usado pelos títulos de caixa que o
// usuário citou como bons. `FS_TITULO` (5.5mm, "REDE BAIXA TENSÃO"/
// "ATENÇÃO", o outro exemplo citado como bom) continua distinto e maior --
// é o único título de nível mais alto do diagrama inteiro, sem nenhuma
// reclamação de tamanho pequeno associada a ele. Como a altura de cada
// bloco de texto (via `criarCursorVertical`/`avancar`) já deriva do próprio
// `fontSize`, o espaçamento VERTICAL se ajustou sozinho com o aumento; só a
// LARGURA das colunas de MPPT/inversor (fixa) precisou de alívio manual
// proporcional (ver `LARGURA_COLUNA_MPPT`/`LARGURA_MINIMA_COLUNA_INVERSOR`/
// `ESPACO_ENTRE_INVERSORES` logo abaixo) pra não colidir horizontalmente com
// a coluna vizinha -- verificado renderizando um diagrama real (2
// inversores, 2 MPPTs no 1º) e inspecionando o PDF exportado, mesma técnica
// de verificação já usada desde a Iteração 13/18/19.
const FS_TITULO = 5.5;
/**
 * Iteração 27: era 4.2 (Iteração 22) -- novo pedido do usuário, de novo
 * quase palavra por palavra o mesmo da Iteração 22 ("os nomes que consigo
 * ler são os que estao em maiusculos, tome isso como base e corrija"):
 * mesmo com `FS_CORPO`/`FS_SPEC` já unificados a `FS_LABEL` desde então,
 * quando a prancha é exportada reduzida pra caber numa A4 física
 * (`boostTextoParaA4`, capado em 1.15x) o texto ainda fica pequeno demais
 * pra ler confortavelmente numa impressão física -- um aumento adicional
 * na base (~10%) dá mais folga em cima do boost. NOTA IMPORTANTE: este
 * valor só afeta diagramas inseridos DAQUI PRA FRENTE -- o tamanho de
 * fonte é gravado dentro de cada objeto de geometria no momento da
 * inserção (ferramenta "Padrão Entrada"), não recalculado depois; um
 * diagrama já inserido num projeto salvo ANTES desta mudança continua
 * com o tamanho antigo até ser apagado e reinserido.
 */
const FS_LABEL = 4.6;
/** Iteração 22: era 3.8, unificado com `FS_LABEL` -- ver comentário acima. */
const FS_CORPO = FS_LABEL;
const FS_LEGENDA = 3.4;
/** Iteração 22: era 3.2 (menor que todo o resto, o "os outros ficam pequenos" mais notável), unificado com `FS_LABEL` -- ver comentário acima. */
const FS_SPEC = FS_LABEL;
/**
 * Iteração 21: título dos 3 quadros da "coluna direita" (LEGENDA, DETALHE
 * PLACA DE ADVERTÊNCIA, PADRÃO DE ENTRADA REPRESENTATIVO) -- pedido
 * explícito do usuário após anexar um PDF exportado onde esses títulos
 * saíam do contorno das caixas ("erro nos nomes que saem para fora do
 * contorno... aumente o tamanho do texto para 2 vezes o tamanho atual"):
 * exatamente 2x `FS_LABEL` (o tamanho usado antes por esses mesmos
 * títulos). Ver `LEGENDA_ITENS_FS` abaixo pro mesmo tratamento nos rótulos
 * de cada item da legenda ("os nomes" -- mesma palavra usada pelo
 * usuário). Os textos MIÚDOS dentro da placa de advertência (linhas de
 * "RISCO DE CHOQUE ELÉTRICO" etc.) e a legenda de medida ("25 cm (L)...")
 * não entram nesse 2x -- ver comentário mais abaixo, junto de onde são
 * desenhados.
 */
const FS_TITULO_COLUNA = FS_LABEL * 2;
/** Iteração 21: mesmo pedido de "aumente 2x" acima, aplicado ao rótulo de cada item da legenda (eram os "nomes" comprimidos demais pro tamanho da caixa antiga). */
const FS_LEGENDA_ITEM = FS_LEGENDA * 2;
// Iteração 22: alargadas proporcionalmente ao aumento de `FS_SPEC` (3.2 ->
// 4.2, fator ~1.31) que passou a ser usado pelos blocos de texto densos
// destas colunas (specs de inversor/MPPT/módulo) -- sem isso, o mesmo texto
// antigo numa fonte maior estouraria a largura calibrada pra `FS_SPEC=3.2`
// e colidiria com a coluna vizinha (mesma classe de bug já documentada nas
// Iterações 13/19). Valor final confirmado por inspeção visual do PDF
// exportado de um diagrama real (2 inversores, 2 MPPTs no 1º).
// Iteração 27: alargadas de novo, pelo mesmo motivo/técnica da Iteração 22
// -- proporcional ao novo aumento de `FS_LABEL`/`FS_SPEC` (4.2 -> 4.6,
// fator ~1.1), pra não colidir horizontalmente com a coluna vizinha.
const LARGURA_COLUNA_MPPT = 112;
const LARGURA_MINIMA_COLUNA_INVERSOR = 153;
const ESPACO_ENTRE_INVERSORES = 48;
/** Espaço vertical reservado entre o rótulo do cabo (logo abaixo de uma caixa) e o título da PRÓXIMA caixa -- grande o bastante pra não colidir (Iteração 13, corrigido após inspeção visual do PDF exportado). */
const GAP_ENTRE_CAIXAS = 22;
/** Altura aproximada de 1 linha de texto (múltiplo do fontSize -- Konva usa lineHeight=1 por padrão). */
const ALTURA_LINHA = 1.25;
/**
 * Estimativa de largura de 1 linha de texto em mm (mesma proporção usada
 * por `caixaEnvolvente` em `selection.ts` -- não há medição real de glifo
 * fora do canvas do navegador, mas é suficiente pra CENTRALIZAR/decidir
 * "cabe ou não cabe" na hora de gerar o diagrama, sem esperar o
 * usuário reportar um estouro visual pra só então corrigir).
 */
function larguraEstimadaTexto(texto: string, fontSize: number): number {
  return texto.length * fontSize * 0.6;
}

function fmt(n: number, casas = 2): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

/**
 * Estimativa conservadora (25% de margem, arredondada pra cima) -- só
 * para ser mostrada como SUGESTÃO/placeholder no modal (nunca aplicada
 * automaticamente à geometria, ver decisão de produto no cabeçalho do
 * arquivo). O usuário sempre confirma/digita o valor final.
 */
export function estimarCorrenteFusivel(impModulo: number, numeroStrings: number): number {
  return Math.ceil(impModulo * numeroStrings * 1.25);
}

const LEGENDA_ITENS: { nomeBloco?: string; label: string }[] = [
  { nomeBloco: "disjuntor", label: "Disjuntor termomagnético" },
  { nomeBloco: "medidor_kwh", label: "Medidor de energia KWh" },
  { nomeBloco: "dps", label: "DPS CC / CA" },
  { nomeBloco: "fusivel", label: "Fusível cc" },
  { label: "Barramento" },
  { nomeBloco: "transformador", label: "Transformador / Autotransformador" },
  { nomeBloco: "inversor", label: "Inversor / Microinversor" },
  { nomeBloco: "modulo_fotovoltaico", label: "Módulo fotovoltaico" },
];

/**
 * Monta a geometria completa do diagrama unifilar fotovoltaico, ancorada
 * em `(origemX, origemY)` (mm de mundo -- tipicamente o canto superior-
 * esquerdo útil da prancha ativa, dentro das margens ABNT). Todas as
 * peças entram na `camada` informada. Devolve também os retângulos
 * reservados aos quadros "Padrão de Entrada Representativo" e "Detalhe
 * Placa de Advertência" -- quem chama (ver `store.ts#gerarDiagramaFotovoltaico`
 * e `DiagramaFvModal.tsx`) usa esses retângulos pra encaixar, via XREF, a
 * foto real do padrão de entrada importada pelo usuário (se houver) e a
 * imagem padrão da placa de advertência (Iteração 46 -- SEMPRE inserida
 * automaticamente, ver `lib/placaAdvertenciaPadrao.ts`).
 */
export function construirGeometriaDiagramaFv(
  dados: DadosDiagramaFv,
  origemX: number,
  origemY: number,
  camada: string
): { geometria: NovaGeometria[]; boxPadraoEntradaRepresentativo: RetanguloMm; boxDetalhePlaca: RetanguloMm } {
  const g: NovaGeometria[] = [];
  const pe = dados.padraoEntrada;
  const rede = REDE_POR_TIPO[pe.tipoRede];
  const inversores = dados.inversores.length > 0 ? dados.inversores : [];

  const texto = (x: number, y: number, conteudo: string, fontSize = FS_CORPO) =>
    g.push({ tipo: "texto", camada, x, y, conteudo, fontSize });
  /**
   * Iteração 21: título CENTRALIZADO (1 ou mais linhas, separadas por
   * `\n`) cuja ÚLTIMA linha fica com a base em `yBaseUltimaLinha` -- as
   * linhas anteriores sobem a partir dela (`ALTURA_LINHA` por linha).
   * Usado pelos 3 quadros da "coluna direita" (ver mais abaixo): resolve
   * ao mesmo tempo o pedido de centralizar (como no PDF de referência do
   * usuário) e o de nunca estourar a largura da caixa -- cada LINHA é
   * centralizada usando sua própria largura estimada (`larguraEstimadaTexto`),
   * em vez de centralizar o bloco inteiro pela linha mais longa.
   */
  const tituloCentralizado = (centroX: number, yBaseUltimaLinha: number, conteudo: string, fontSize: number) => {
    const linhas = conteudo.split("\n");
    linhas.forEach((linhaTxto, i) => {
      const y = yBaseUltimaLinha - (linhas.length - 1 - i) * fontSize * ALTURA_LINHA;
      const largura = larguraEstimadaTexto(linhaTxto, fontSize);
      texto(centroX - largura / 2, y, linhaTxto, fontSize);
    });
  };
  /**
   * Iteração 22: texto ANCORADO NA ALTURA de um bloco já colocado (ex.: o
   * símbolo do disjuntor) -- pedido do usuário: "preciso que o texto
   * especificando sobre o disjuntos no diagrama fique centralizado na
   * frente do bloco do disjuntor". Antes, o texto de especificação de cada
   * disjuntor (Padrão de Medição/Quadro de Distribuição/Proteção CA) usava
   * um deslocamento vertical FIXO a partir do topo da caixa (ex.: `medY +
   * 30`), sem nenhuma relação com a posição Y REAL do símbolo do disjuntor
   * dentro dela -- coincidência visual em alguns casos, descolado em
   * outros. Agora `colocarBloco()` (que já devolve o centro Y do bloco
   * colocado) alimenta esta função, que centraliza o bloco de texto
   * INTEIRO (1 ou mais linhas) na mesma altura Y do CENTRO do símbolo --
   * "na frente dele", não acima nem abaixo.
   */
  const textoNaAlturaDoBloco = (x: number, centroYBloco: number, conteudo: string, fontSize: number) => {
    const linhasTxt = conteudo.split("\n");
    const alturaTotal = linhasTxt.length * fontSize * ALTURA_LINHA;
    texto(x, centroYBloco - alturaTotal / 2, conteudo, fontSize);
  };
  const linha = (x1: number, y1: number, x2: number, y2: number) => g.push({ tipo: "linha", camada, x1, y1, x2, y2 });
  const bloco = (nome: string, x: number, y: number, escala?: number) =>
    g.push({ tipo: "bloco", camada, nome, x, y, ...(escala !== undefined ? { escalaX: escala, escalaY: escala } : {}) });
  // Iteração 16: caixas de agrupamento (Padrão de Medição, Quadro de
  // Distribuição/Proteção CA/Proteção CC, Legenda etc.) agora saem
  // tracejadas -- pedido do usuário depois de comparar com o PDF de
  // referência dele, que usa traço tracejado em toda caixa de agrupamento.
  // Usa o `tracejado` PRÓPRIO do retângulo (`lib/types.ts`), não o
  // `estiloLinha` da camada -- a camada "0" usada por todo o resto do
  // diagrama continua de traço contínuo (ver comentário no cabeçalho do
  // arquivo, "SIMPLIFICAÇÕES CONHECIDAS", atualizado).
  const caixa = (x: number, y: number, largura: number, altura: number) =>
    g.push({ tipo: "retangulo", camada, x, y, largura, altura, tracejado: true });
  /** Ponto/nó de conexão (derivação em T num barramento) -- círculo pequeno preenchido, mesma convenção do PDF de referência do usuário (Iteração 15). */
  const ponto = (x: number, y: number) =>
    g.push({ tipo: "circulo", camada, x, y, raio: 1.3, hachura: { tipo: "SOLID", escala: 1, cor: "#0f172a" } });

  /**
   * Símbolo de aterramento do GABINETE/quadro metálico (Iteração 16) --
   * anotação na lateral direita, fora da caixa: ponto na borda -> traço
   * horizontal curto -> traço vertical curto -> hachura de terra (3
   * traços decrescentes, mesma convenção do bloco `terra`). É uma
   * anotação isolada (não é um nó do circuito propriamente, não conecta a
   * mais nada) -- mesma convenção do PDF de referência do usuário, que
   * mostra isso só no Padrão de Medição e no Quadro de Distribuição.
   */
  const aterramentoGabinete = (xBorda: number, yAltura: number) => {
    ponto(xBorda, yAltura);
    linha(xBorda, yAltura, xBorda + 14, yAltura);
    linha(xBorda + 14, yAltura, xBorda + 14, yAltura + 8);
    linha(xBorda + 7, yAltura + 8, xBorda + 21, yAltura + 8);
    linha(xBorda + 9, yAltura + 11, xBorda + 19, yAltura + 11);
    linha(xBorda + 11, yAltura + 14, xBorda + 17, yAltura + 14);
  };

  /**
   * Setinha única, apontando pra baixo (Iteração 16) -- usada em grupos de
   * 3 pra representar os circuitos de carga saindo do Quadro de
   * Distribuição, igual ao PDF de referência do usuário ("Cargas 3KW" com
   * 3 setas).
   */
  const setaCarga = (x: number, yTopo: number) => {
    const yFim = yTopo + 7;
    linha(x, yTopo, x, yFim);
    linha(x, yFim, x - 2.2, yFim - 3.2);
    linha(x, yFim, x + 2.2, yFim - 3.2);
  };

  /**
   * Cursor de desenho vertical (Iteração 15) -- resolve a causa raiz dos
   * "gaps" entre linha e bloco relatados pelo usuário. Em vez de cada
   * chamador calcular manualmente onde o CENTRO de um bloco deve ficar
   * pra que seu `pontosConexao` de cima bata com o fim da linha anterior
   * (aritmética fácil de errar, e que de fato errou em vários pontos do
   * gerador original), o cursor mantém a posição Y "corrente" do
   * barramento e:
   *  - `avancar(dy)`: desenha um trecho de linha de `dy` mm e avança;
   *  - `pular(dy)`: só avança `dy` mm SEM desenhar linha (usado quando o
   *    próximo trecho de fiação fica "atrás" de um bloco de texto, não
   *    encostado nele -- mesmo padrão do gerador original);
   *  - `colocarBloco(nome, escala)`: centraliza o bloco de forma que seu
   *    topo (viewBox y=0) fique exatamente na posição corrente do cursor
   *    -- todo bloco vertical simétrico da biblioteca (disjuntor,
   *    fusível, medidor, inversor, módulo fotovoltaico, terra...) já
   *    desenha internamente o próprio traço de "entrada" até a borda do
   *    viewBox, então NENHUMA linha externa precisa ser desenhada ali:
   *    a continuidade visual vem de dentro do próprio SVG do bloco.
   *    Avança o cursor para o ponto de conexão de baixo do bloco.
   */
  function criarCursorVertical(xCol: number, yInicial: number) {
    let y = yInicial;
    return {
      posicao: () => y,
      avancar(dy: number): number {
        if (dy > 0) linha(xCol, y, xCol, y + dy);
        y += dy;
        return y;
      },
      pular(dy: number): number {
        y += dy;
        return y;
      },
      colocarBloco(nome: string, escala = 1): number {
        const def = getBlockDef(nome);
        const alturaMundo = (def?.altura ?? 0) * escala;
        const centroY = y + alturaMundo / 2;
        bloco(nome, xCol, centroY, escala === 1 ? undefined : escala);
        y += alturaMundo;
        return centroY;
      },
    };
  }

  /**
   * Posiciona um bloco de ramal LATERAL (ex.: `dps_lateral`) à ESQUERDA de
   * um barramento vertical em `(xBus, yBus)`, calculando o deslocamento em
   * X a partir do próprio `pontosConexao` declarado do bloco (em vez de um
   * número fixo "no olho") -- assim o terminal do bloco cai exatamente em
   * cima de `xBus`, pronto para o `ponto()` (nó) marcar a derivação sem
   * nenhum gap. Assume um bloco com 1 único `pontosConexao` do lado
   * direito (x perto de 100, y=50), que é o caso do `dps_lateral`.
   */
  function colocarRamalLateralEsquerda(nome: string, xBus: number, yBus: number) {
    const def = getBlockDef(nome);
    const p = def?.pontosConexao?.[0];
    const larguraMundo = def?.largura ?? 0;
    const offsetX = p ? ((p.x - 50) / 100) * larguraMundo : larguraMundo / 2;
    bloco(nome, xBus - offsetX, yBus);
  }

  // Largura de cada coluna de inversor = espaço pras colunas de MPPT dele
  // (lado a lado embaixo), com um piso mínimo pro bloco+texto do inversor
  // caberem mesmo com só 1 MPPT.
  const larguraColunaInversor = inversores.map((inv) =>
    Math.max(LARGURA_MINIMA_COLUNA_INVERSOR, inv.mppts.length * LARGURA_COLUNA_MPPT)
  );
  const larguraTotalInversores =
    larguraColunaInversor.reduce((a, b) => a + b, 0) + ESPACO_ENTRE_INVERSORES * Math.max(0, inversores.length - 1);
  const larguraCaixa = Math.max(90, larguraTotalInversores + 20);
  const centroX = origemX + larguraCaixa / 2;

  let y = origemY;

  // 1) Rede de baixa tensão ---------------------------------------------
  texto(origemX, y, "REDE BAIXA TENSÃO", FS_TITULO);
  y += FS_TITULO * 2.4;
  texto(origemX, y, `Ponto de Entrega — Ramal de Ligação ${pe.ramalLigacao}`, FS_CORPO);
  y += 10;

  // Iteração 17: nó preenchido marcando o Ponto de Entrega -- antes o
  // barramento principal simplesmente "começava" em pleno espaço em
  // branco, sem nenhum símbolo indicando a origem da linha (reportado
  // pelo usuário como uma linha "sem finalizar"/solta no topo do
  // diagrama). Mesma convenção visual já usada em toda derivação/nó do
  // gerador (`ponto()`), agora também no início do próprio tronco.
  ponto(centroX, y);

  // Cursor do barramento principal (Iteração 15) -- ver `criarCursorVertical`
  // acima. Toda linha/bloco do tronco principal (medição -> distribuição ->
  // proteção CA) passa a ser desenhada através dele, garantindo zero gap.
  const cursor = criarCursorVertical(centroX, y);
  cursor.avancar(14);

  // 2) Padrão de medição --------------------------------------------------
  // Iteração 16: caixa cresceu de 40 -> 68mm pra caber o bloco do
  // disjuntor de fato (símbolo de mola) logo abaixo do medidor -- antes
  // só existia o TEXTO "Disjuntor..." aqui, sem o símbolo correspondente
  // desenhado (gap encontrado na comparação com o PDF de referência do
  // usuário, que mostra os dois símbolos -- medidor e disjuntor -- em
  // sequência dentro do Padrão de Medição, exatamente como no Quadro de
  // Distribuição logo abaixo).
  const medY = cursor.posicao();
  const ALTURA_PADRAO_MEDICAO = 70;
  caixa(origemX, medY, larguraCaixa, ALTURA_PADRAO_MEDICAO);
  texto(origemX + 2, medY - 4, "PADRÃO DE MEDIÇÃO", FS_LABEL);
  cursor.avancar(2);
  cursor.colocarBloco("medidor_kwh");
  cursor.avancar(2);
  const centroDisjuntorMedicao = cursor.colocarBloco(blocoDisjuntorPorPolos(rede.disjuntor));
  textoNaAlturaDoBloco(
    centroX + 16,
    centroDisjuntorMedicao,
    `Disjuntor ${rede.disjuntor}\n${fmt(pe.correnteDisjuntorPadraoA, 0)}A · ${rede.tensao}`,
    FS_CORPO
  );
  aterramentoGabinete(origemX + larguraCaixa, medY + 38);
  cursor.avancar(Math.max(0, medY + ALTURA_PADRAO_MEDICAO - cursor.posicao()));
  texto(origemX, cursor.posicao() + 6, pe.caboPadraoAteDistribuicao, FS_CORPO);
  cursor.avancar(GAP_ENTRE_CAIXAS);

  // 3) Quadro de distribuição ----------------------------------------------
  // Iteração 15: o DPS deixou de "flutuar" solto ao lado do disjuntor --
  // agora sai como ramal em T (`dps_lateral`) do próprio barramento
  // principal, com um `ponto()` marcando a derivação (nó), igual ao PDF
  // de referência do usuário.
  const distY = cursor.posicao();
  // Iteração 16: altura ampliada de 40 -> 52mm pra abrir espaço pras
  // setas de "Cargas" (7mm de seta + respiro) sem estourar a caixa.
  const ALTURA_QUADRO_DISTRIBUICAO = 52;
  caixa(origemX, distY, larguraCaixa, ALTURA_QUADRO_DISTRIBUICAO);
  texto(origemX + 2, distY - 4, "QUADRO DE DISTRIBUIÇÃO", FS_LABEL);
  cursor.avancar(10);
  const yRamalDist = cursor.posicao();
  ponto(centroX, yRamalDist);
  colocarRamalLateralEsquerda("dps_lateral", centroX, yRamalDist);
  const centroDisjuntorDist = cursor.colocarBloco(blocoDisjuntorPorPolos(rede.disjuntor));
  const cargaTxt =
    dados.cargaInstaladaKw !== undefined ? `Cargas: ${fmt(dados.cargaInstaladaKw)} kW` : "Cargas: a definir";
  textoNaAlturaDoBloco(
    centroX + 16,
    centroDisjuntorDist,
    `DPS CA ${pe.especificacaoDpsCa}\nDisjuntor ${rede.disjuntor} ${fmt(pe.correnteDisjuntorDistribuicaoA, 0)}A\n${cargaTxt}`,
    FS_CORPO
  );
  aterramentoGabinete(origemX + larguraCaixa, distY + 20);
  // Iteração 16: 3 setas de "Cargas" derivando do barramento logo abaixo
  // do disjuntor -- igual ao PDF de referência do usuário (setas
  // representando os circuitos de carga que saem deste quadro).
  const yCargas = cursor.posicao();
  ponto(centroX, yCargas);
  linha(centroX - 22, yCargas, centroX, yCargas);
  setaCarga(centroX - 18, yCargas);
  setaCarga(centroX - 11, yCargas);
  setaCarga(centroX - 4, yCargas);
  cursor.avancar(Math.max(0, distY + ALTURA_QUADRO_DISTRIBUICAO - cursor.posicao()));
  texto(origemX, cursor.posicao() + 6, pe.caboDistribuicaoAteProtecaoCa, FS_CORPO);
  cursor.avancar(GAP_ENTRE_CAIXAS);

  // 4) Quadro de proteção CA -----------------------------------------------
  const protCaY = cursor.posicao();
  caixa(origemX, protCaY, larguraCaixa, 40);
  texto(origemX + 2, protCaY - 4, "QUADRO DE PROTEÇÃO CA", FS_LABEL);
  cursor.avancar(10);
  const yRamalProtCa = cursor.posicao();
  ponto(centroX, yRamalProtCa);
  colocarRamalLateralEsquerda("dps_lateral", centroX, yRamalProtCa);
  // Disjuntor de saída do inversor: mesmo raciocínio de sempre (rede
  // monofásica ainda assim usa um disjuntor de 2 polos aqui, já que o
  // inversor precisa desligar fase+neutro) -- agora o SÍMBOLO acompanha
  // esse rótulo em vez de ficar sempre monopolar.
  const rotuloDisjuntorProtecaoCa = rede.disjuntor === "MONOPOLAR" ? "BIPOLAR" : rede.disjuntor;
  const centroDisjuntorProtecaoCa = cursor.colocarBloco(blocoDisjuntorPorPolos(rotuloDisjuntorProtecaoCa));
  textoNaAlturaDoBloco(
    centroX + 16,
    centroDisjuntorProtecaoCa,
    `DPS CA ${pe.especificacaoDpsCa}\nDisjuntor ${rotuloDisjuntorProtecaoCa} ${fmt(pe.correnteDisjuntorProtecaoCaA, 0)}A`,
    FS_CORPO
  );
  cursor.avancar(Math.max(0, protCaY + 40 - cursor.posicao()));
  texto(origemX, cursor.posicao() + 6, pe.caboProtecaoCaAteInversor, FS_CORPO);
  cursor.avancar(16);

  // 5) Barramento CA distribuindo pros N inversores (lado a lado) ---------
  const inicioInversoresX = centroX - larguraTotalInversores / 2;
  const centrosInversores: number[] = [];
  {
    let cursorX = inicioInversoresX;
    for (const w of larguraColunaInversor) {
      centrosInversores.push(cursorX + w / 2);
      cursorX += w + ESPACO_ENTRE_INVERSORES;
    }
  }
  const yBarramentoCa = cursor.posicao();
  if (centrosInversores.length > 1) {
    linha(centrosInversores[0], yBarramentoCa, centrosInversores[centrosInversores.length - 1], yBarramentoCa);
    ponto(centroX, yBarramentoCa);
    centrosInversores.forEach((cx) => ponto(cx, yBarramentoCa));
  }

  // 6) Um bloco de inversor por coluna, cada um com sua Quadro de Proteção
  //    CC + colunas de MPPT/módulos embaixo -----------------------------
  const mod = dados.modulo;
  let yFimMaisBaixo = yBarramentoCa;

  inversores.forEach((inv, idxInversor) => {
    const centroXInv = centrosInversores[idxInversor];
    const larguraColInv = larguraColunaInversor[idxInversor];
    // Borda esquerda da coluna deste inversor -- todo texto denso abaixo
    // (specs do inversor, condutores CC) é ancorado aqui, usando a
    // LARGURA INTEIRA da coluna, em vez de espremido ao lado do ícone
    // (causa raiz da colisão horizontal entre inversores vizinhos
    // encontrada na inspeção visual do PDF exportado, Iteração 13).
    const xColEsquerda = centroXInv - larguraColInv / 2;
    const curInv = criarCursorVertical(centroXInv, yBarramentoCa);

    // Iteração 24: disjuntor de saída INDIVIDUAL deste inversor, entre o
    // barramento CA compartilhado (acima) e o símbolo do inversor (abaixo)
    // -- antes o único disjuntor de saída do sistema era o do Quadro de
    // Proteção CA, protegendo a saída CA já combinada de todos os
    // inversores de uma vez. Pedido do usuário depois de simular 2
    // inversores: "precisamos ter um disjuntor para cada inversor... só
    // aparece um disjuntor no quadro de proteção". Mesmo rótulo de polos
    // do disjuntor de Proteção CA (`rotuloDisjuntorProtecaoCa`, calculado
    // uma única vez antes deste loop) -- mesmo raciocínio de sempre: um
    // inversor monofásico ainda assim usa um disjuntor de 2 polos pra
    // poder desligar fase+neutro de uma vez.
    curInv.avancar(8);
    const centroDisjuntorInversor = curInv.colocarBloco(blocoDisjuntorPorPolos(rotuloDisjuntorProtecaoCa));
    textoNaAlturaDoBloco(
      xColEsquerda + 3,
      centroDisjuntorInversor,
      `Disjuntor ${rotuloDisjuntorProtecaoCa}\n${fmt(inv.correnteDisjuntorSaidaA, 0)}A`,
      FS_CORPO
    );
    curInv.avancar(4);
    // Iteração 17: "inversor_vertical" em vez de "inversor" -- variante sem
    // os 2 estirões horizontais do bloco genérico, que aqui (fluxo 100%
    // vertical do diagrama gerado) não conectavam a nada e apareciam como
    // linhas soltas/inacabadas nos dois lados do símbolo (ver `blocks.ts`).
    curInv.colocarBloco("inversor_vertical");
    // Iteração 15: pequeno trecho VISÍVEL logo abaixo do inversor -- garante
    // que o ponto de conexão de baixo do bloco (`pontosConexao` {50,100})
    // também fica encostado numa linha, e não só o de cima.
    curInv.avancar(2);

    const numMpptsInv = inv.mppts.length;
    const linhasInversor = [
      inversores.length > 1 ? `INVERSOR ${idxInversor + 1}` : "INVERSOR",
      `Modelo: ${inv.modelo}`,
      `Potência: ${fmt(inv.potenciaW, 0)} W`,
      `Tensão de entrada: ${fmt(inv.tensaoEntradaMinV, 0)}v - ${fmt(inv.tensaoEntradaMaxV, 0)}v`,
      `Entrada: ${numMpptsInv} MPPT${numMpptsInv > 1 ? "'s" : ""}`,
      `Tensão CC máx.: ${fmt(inv.tensaoMaxCcV, 0)}V`,
      `Corrente máx./MPPT: ${fmt(inv.correnteMaxPorMpptA)}A`,
      `Tensão de saída: ${fmt(inv.tensaoSaidaV, 0)}V`,
      `Corrente de saída: ${fmt(inv.correnteSaidaA)}A`,
    ];
    texto(xColEsquerda + 3, curInv.posicao(), linhasInversor.join("\n"), FS_SPEC);
    // Iteração 20: era `pular()` (o condutor "sumia" atrás do bloco de
    // texto sem nenhuma linha desenhada ali) -- relatado pelo usuário como
    // "a linha não é contínua" (lia como um trecho de fiação faltando/em
    // aberto, um problema sério de legibilidade num diagrama elétrico).
    // Trocado por `avancar()`: o condutor agora é desenhado por baixo do
    // bloco de texto (mesma convenção real de desenho técnico -- o
    // condutor É contínuo, o texto é só uma anotação ao lado/por cima
    // dele). O texto continua ancorado na borda esquerda usando a largura
    // TOTAL da coluna (necessário pra não colidir com a coluna do inversor
    // vizinho, causa raiz original da Iteração 13) -- o traço vertical no
    // centro da coluna (`centroXInv`) fica visível nos trechos sem texto
    // e, no pior caso de uma linha de texto muito longa, cruza por baixo
    // de parte do texto (verificado visualmente: não ocorre com os
    // valores típicos do formulário).
    curInv.avancar(linhasInversor.length * FS_SPEC * ALTURA_LINHA + 6);

    // Condutores CC (positivo/negativo/proteção) + Quadro de proteção CC --
    curInv.avancar(10);
    const linhasCondutores = [
      "CONDUTORES CC",
      `Positivo ${inv.caboCcMm2}`,
      `Negativo ${inv.caboCcMm2}`,
      `Proteção ${inv.caboCcMm2}`,
    ];
    texto(xColEsquerda + 3, curInv.posicao() + 2, linhasCondutores.join("\n"), FS_SPEC);
    curInv.avancar(2 + linhasCondutores.length * FS_SPEC * ALTURA_LINHA + 6);

    // Quadro de proteção CC -- mesma correção da causa raiz #3: o DPS CC
    // era plantado do lado sem NENHUMA linha ligando ao tronco principal
    // (bug relatado pelo usuário). Agora o tronco atravessa a caixa de
    // ponta a ponta e o DPS sai em ramal lateral com nó marcado.
    const protCcY = curInv.posicao();
    caixa(xColEsquerda, protCcY, larguraColInv, 26);
    texto(xColEsquerda + 2, protCcY - 4, "QUADRO DE PROTEÇÃO CC", FS_LABEL);
    curInv.avancar(13);
    const yRamalProtCc = curInv.posicao();
    ponto(centroXInv, yRamalProtCc);
    colocarRamalLateralEsquerda("dps_lateral", centroXInv, yRamalProtCc);
    texto(xColEsquerda + 2, yRamalProtCc + 6, `DPS CC ${inv.especificacaoDpsCc}`, FS_SPEC);
    curInv.avancar(Math.max(0, protCcY + 26 - curInv.posicao()));

    // Barramento CC local distribuindo pros MPPTs deste inversor ----------
    const inicioMpptsX = centroXInv - (numMpptsInv * LARGURA_COLUNA_MPPT) / 2 + LARGURA_COLUNA_MPPT / 2;
    curInv.avancar(8);
    const yBarramentoCc = curInv.posicao();
    if (numMpptsInv > 1) {
      linha(inicioMpptsX, yBarramentoCc, inicioMpptsX + (numMpptsInv - 1) * LARGURA_COLUNA_MPPT, yBarramentoCc);
      ponto(centroXInv, yBarramentoCc);
      for (let i = 0; i < numMpptsInv; i++) ponto(inicioMpptsX + i * LARGURA_COLUNA_MPPT, yBarramentoCc);
    }

    let yFimColuna = yBarramentoCc;
    inv.mppts.forEach((mppt, i) => {
      const colX = inicioMpptsX + i * LARGURA_COLUNA_MPPT;
      const colXEsquerda = colX - LARGURA_COLUNA_MPPT / 2 + 3;
      const curM = criarCursorVertical(colX, yBarramentoCc);

      curM.avancar(14);
      texto(colX + 2, curM.posicao() - 11, `MPPT ${i + 1}`, FS_CORPO);

      // Proteção CC (fusível) deste ramo -------------------------------
      curM.avancar(2);
      const centroFusivel = curM.colocarBloco("fusivel");
      texto(colX + 10, centroFusivel - 10, `Fusível CC\n${fmt(mppt.correnteProtecaoCcA, 0)}A / 1KV`, FS_SPEC);
      curM.avancar(12);

      // Módulos fotovoltaicos deste ramo -- texto ancorado na borda
      // ESQUERDA da própria coluna de MPPT (não ao lado do ícone), pra
      // usar a largura inteira da coluna e não invadir a vizinha (causa
      // raiz da colisão MPPT-a-MPPT encontrada na inspeção visual). ----
      curM.colocarBloco("modulo_fotovoltaico");
      // Iteração 15: aterramento do ramo (ausente antes) -- curto trecho
      // de fio + símbolo de terra, igual ao PDF de referência do usuário.
      curM.avancar(3);
      const centroTerra = curM.colocarBloco("terra");

      const vmpTotal = mod.vmp * mppt.modulosPorString;
      const vocTotal = mod.voc * mppt.modulosPorString;
      const modulosTotal = mppt.modulosPorString * mppt.numeroStrings;
      const potenciaTotalKwp = (mod.potenciaWp * modulosTotal) / 1000;
      texto(
        colXEsquerda,
        centroTerra + 12,
        [
          `${mppt.numeroStrings} STRING${mppt.numeroStrings > 1 ? "S" : ""}`,
          `Módulos: ${modulosTotal} un. (${mppt.modulosPorString}/string)`,
          `Vmp: ${fmt(mod.vmp)}×${mppt.modulosPorString}=${fmt(vmpTotal)}V`,
          `Voc: ${fmt(mod.voc)}×${mppt.modulosPorString}=${fmt(vocTotal)}V`,
          `Imp: ${fmt(mod.imp)}A`,
          `Potência: ${fmt(mod.potenciaWp, 0)}Wp×${modulosTotal}=${fmt(potenciaTotalKwp)}kWp`,
        ].join("\n"),
        FS_SPEC
      );
      yFimColuna = Math.max(yFimColuna, centroTerra + 12 + 6 * FS_SPEC * ALTURA_LINHA);
    });

    yFimMaisBaixo = Math.max(yFimMaisBaixo, yFimColuna);
  });

  // Rótulo com os dados do módulo (marca/modelo/eficiência), uma vez só,
  // logo ABAIXO do fim de todas as colunas de MPPT (os números por MPPT já
  // saem na coluna de cada um). Iteração 15: era `yFimMaisBaixo - 4` --
  // como o bloco de specs da ÚLTIMA coluna (6 linhas) termina exatamente
  // em `yFimMaisBaixo`, esse "-4" colocava este rótulo ainda POR CIMA da
  // última linha daquele bloco (texto sobreposto/ilegível, visível na
  // inspeção do PDF exportado). Corrigido pra um pequeno respiro abaixo.
  if (inversores.length > 0) {
    const larguraColInv0 = larguraColunaInversor[0];
    const inicioMppts0X = centrosInversores[0] - (inversores[0].mppts.length * LARGURA_COLUNA_MPPT) / 2 + LARGURA_COLUNA_MPPT / 2;
    // Iteração 46 -- pedido do usuário: "inclua tambem na descrição de
    // modulos fotovoltaico a quantidade total... mostra no diagrama a
    // quantidade total e a potencia total em kwp, exemplo 52 paineis de
    // 585w = 30.42kwp". A quantidade por MPPT já existia (linha "Módulos:
    // X un." dentro de cada coluna) -- esta é a SOMA de todas elas (todos
    // os MPPTs de todos os inversores), somada uma vez só aqui, no rótulo
    // final que já reúne marca/modelo/eficiência do módulo único do
    // projeto.
    const modulosTotalSistema = inversores.reduce(
      (soma, inv) => soma + inv.mppts.reduce((s, m) => s + m.modulosPorString * m.numeroStrings, 0),
      0
    );
    const potenciaTotalSistemaKwp = (mod.potenciaWp * modulosTotalSistema) / 1000;
    texto(
      Math.min(origemX, inicioMppts0X - larguraColInv0 / 2),
      yFimMaisBaixo + 6,
      [
        "MÓDULOS FOTOVOLTAICOS",
        `Marca: ${mod.marca}`,
        `Modelo: ${mod.modelo}`,
        `Eficiência: ${fmt(mod.eficiencia)}%`,
        `Quantidade total: ${modulosTotalSistema} painéis de ${fmt(mod.potenciaWp, 0)}W = ${fmt(potenciaTotalSistemaKwp)}kWp`,
      ].join("\n"),
      FS_CORPO
    );
  }

  // 7) Coluna direita: Legenda (coluna própria A) + Detalhe da placa de
  //    advertência/Padrão de entrada representativo (empilhados na coluna
  //    própria B, ao lado de A) -- sempre presentes, independentes dos
  //    dados do projeto (ver simplificações conhecidas no cabeçalho) ----
  //
  // Iteração 21 (bug relatado pelo usuário, anexando print + PDF quebrado
  // + o PDF de referência do AutoCAD): o afastamento fixo de 50mm entre o
  // desenho principal e esta coluna já "nascia colado" nos cenários mais
  // largos (vários inversores) -- aumentado pra 100mm (`GAP_COLUNA_DIREITA`),
  // avaliado visualmente contra o PDF de referência (lá o vão é bem maior
  // que a largura de qualquer caixa da coluna).
  const GAP_COLUNA_DIREITA = 100;
  const xColunaDireita = origemX + Math.max(larguraCaixa, larguraTotalInversores + 20) + GAP_COLUNA_DIREITA;
  /**
   * Espaço vertical entre uma caixa e a PRÓXIMA (dentro da MESMA coluna) --
   * precisa caber o título de 2 linhas (`FS_TITULO_COLUNA`) que fica ACIMA
   * da próxima caixa (ver `tituloCentralizado`), não mais espremido pra
   * dentro dela. Calculado a partir do próprio tamanho de fonte em vez de
   * um número fixo "no olho" -- se `FS_TITULO_COLUNA` mudar de novo no
   * futuro, este espaço acompanha sozinho.
   */
  const GAP_ENTRE_CAIXAS_COLUNA = 4 + 2 * FS_TITULO_COLUNA * ALTURA_LINHA;

  // Legenda (coluna A) ---------------------------------------------------------
  // Iteração 21: reestruturada como uma TABELA de verdade (cabeçalho +
  // divisórias entre ícone/rótulo e entre linhas), igual ao PDF de
  // referência do AutoCAD anexado pelo usuário ("quero desse mesmo jeito
  // e tamanhos") -- antes era só um título solto + ícones/textos soltos
  // sem nenhuma linha divisória.
  //
  // Iteração 22 -- 2 correções pedidas pelo usuário depois de ver o
  // resultado renderizado:
  //  1) "na legenda o nome transformador / autotransformador sai para fora
  //     do contorno" -- o rótulo mais longo da tabela (34 caracteres) numa
  //     largura de coluna calibrada só pros rótulos mais curtos (a antiga
  //     `LARGURA_LEGENDA = 150`, ver Iteração 21) estourava a borda direita
  //     da caixa por ~29mm (`larguraEstimadaTexto` confirma: 34 × 6.8 ×
  //     0.6 ≈ 139mm de texto contra só ~116mm de área útil disponível).
  //     Corrigido alargando a tabela pra `LARGURA_LEGENDA = 200`, calculado
  //     pra caber esse rótulo (o mais longo de todos, por uma boa margem)
  //     mais uma folga confortável -- os demais rótulos, todos mais curtos,
  //     ficam com ainda mais respiro.
  //  2) restauração do layout em 2 COLUNAS lado a lado do PDF de referência
  //     do AutoCAD (Legenda numa coluna própria à esquerda; Detalhe da
  //     Placa + Padrão de Entrada empilhados numa coluna própria à
  //     direita), em vez da única coluna vertical empilhada usada desde a
  //     Iteração 13 -- simplificação que ficou documentada como fora de
  //     escopo em todas as iterações anteriores (13/21), até este pedido
  //     explícito do usuário ("FAÇA ESSA CORREÇAO", respondendo à opção que
  //     eu tinha descrito como "próximo passo natural" na entrega da
  //     Iteração 21). Ver `xColunaB`/`ALTURA_DETALHE`/`ALTURA_FOTO` abaixo --
  //     como as 2 colunas correm em paralelo (não mais empilhadas 3-a-3),
  //     o "orçamento vertical até o carimbo" documentado na Iteração 21
  //     (que motivou reduzir as alturas de Detalhe/Padrão de Entrada pra
  //     caber) ficou bem mais folgado -- a coluna B agora só empilha 2
  //     caixas, não 3, então a altura TOTAL da coluna direita encolheu
  //     bastante mesmo com caixas individualmente do mesmo tamanho.
  const LARGURA_LEGENDA = 200;
  const ALTURA_CABECALHO_LEGENDA = 16;
  const ALTURA_LINHA_LEGENDA = 16;
  const alturaLegenda = ALTURA_CABECALHO_LEGENDA + LEGENDA_ITENS.length * ALTURA_LINHA_LEGENDA;
  const yColunaA = origemY;
  caixa(xColunaDireita, yColunaA, LARGURA_LEGENDA, alturaLegenda);
  linha(xColunaDireita, yColunaA + ALTURA_CABECALHO_LEGENDA, xColunaDireita + LARGURA_LEGENDA, yColunaA + ALTURA_CABECALHO_LEGENDA);
  tituloCentralizado(xColunaDireita + LARGURA_LEGENDA / 2, yColunaA + ALTURA_CABECALHO_LEGENDA - 5, "LEGENDA", FS_TITULO_COLUNA);
  const xDivisorLegenda = xColunaDireita + 34;
  linha(xDivisorLegenda, yColunaA + ALTURA_CABECALHO_LEGENDA, xDivisorLegenda, yColunaA + alturaLegenda);
  LEGENDA_ITENS.forEach((item, i) => {
    const linhaTopo = yColunaA + ALTURA_CABECALHO_LEGENDA + i * ALTURA_LINHA_LEGENDA;
    const centroLinhaY = linhaTopo + ALTURA_LINHA_LEGENDA / 2;
    const iconX = xColunaDireita + 17;
    if (item.nomeBloco) {
      bloco(item.nomeBloco, iconX, centroLinhaY, 0.5);
    } else {
      linha(iconX - 9, centroLinhaY, iconX + 9, centroLinhaY);
    }
    if (i > 0) linha(xColunaDireita, linhaTopo, xColunaDireita + LARGURA_LEGENDA, linhaTopo);
    texto(xDivisorLegenda + 6, centroLinhaY - 0.35 * FS_LEGENDA_ITEM, item.label, FS_LEGENDA_ITEM);
  });

  // Coluna B: Detalhe da placa de advertência + Padrão de entrada
  // representativo, empilhados um embaixo do outro, ao LADO da Legenda
  // (Iteração 22 -- ver comentário grande acima). Largura compartilhada
  // pelas 2 caixas (`LARGURA_COLUNA_B`) pra ficarem alinhadas uma sobre a
  // outra, igual ao PDF de referência do AutoCAD.
  const GAP_ENTRE_COLUNAS_DIREITA = 20;
  const xColunaB = xColunaDireita + LARGURA_LEGENDA + GAP_ENTRE_COLUNAS_DIREITA;
  const LARGURA_COLUNA_B = 130;
  let yColunaB = origemY;

  // Detalhe da placa de advertência -----------------------------------------
  // Iteração 21: título movido pra CIMA da caixa (mesma convenção já usada
  // pelo resto do diagrama -- "PADRÃO DE MEDIÇÃO", "QUADRO DE
  // DISTRIBUIÇÃO" etc. sempre ficaram acima da própria caixa, só esta
  // coluna direita tinha ficado pra trás/pra dentro, causa raiz do "nomes
  // que saem para fora do contorno" relatado) e em 2 linhas centralizadas
  // (`tituloCentralizado`) -- no tamanho de fonte 2x pedido, a versão em 1
  // linha só (29 caracteres) não caberia nem numa caixa bem mais larga que
  // esta.
  const ALTURA_DETALHE = 70;
  caixa(xColunaB, yColunaB, LARGURA_COLUNA_B, ALTURA_DETALHE);
  tituloCentralizado(xColunaB + LARGURA_COLUNA_B / 2, yColunaB - 4, "DETALHE PLACA\nDE ADVERTÊNCIA", FS_TITULO_COLUNA);
  /**
   * Iteração 46 -- pedido do usuário: trocar o desenho VETORIAL da placa
   * (retângulo amarelo + textos "ATENÇÃO"/"RISCO DE CHOQUE ELÉTRICO"/
   * "GERAÇÃO PRÓPRIA" desenhados à mão) pela IMAGEM REAL da placa padrão
   * que ele anexou na conversa ("ja deixe tambem o campo da placa com
   * essa imagem padrao"), confirmado por ele (AskUserQuestion) como
   * "substituir o desenho da placa no gerador de diagrama". Mantidas as
   * mesmas dimensões (50mm x 18/25, proporção real 25cm x 18cm) e a
   * legenda de medida abaixo -- só o preenchimento amarelo com texto
   * desenhado sai, dando lugar a este retângulo RESERVADO (sem desenhar
   * nada aqui): `DiagramaFvModal.tsx` encaixa a imagem padrão (embutida em
   * `lib/placaAdvertenciaPadrao.ts`) exatamente aqui dentro, via XREF,
   * automaticamente, logo depois de chamar este gerador -- mesmo mecanismo
   * já usado pela foto do "Padrão de Entrada Representativo" abaixo, só
   * que sem precisar de nenhum upload do usuário (é sempre a mesma placa,
   * ao contrário da foto do padrão de entrada, que muda de projeto pra
   * projeto).
   */
  const placaLargura = 50;
  const placaAltura = placaLargura * (18 / 25);
  const placaX = xColunaB + (LARGURA_COLUNA_B - placaLargura) / 2;
  const placaY = yColunaB + 10;
  const boxDetalhePlaca: RetanguloMm = { x: placaX, y: placaY, largura: placaLargura, altura: placaAltura };
  texto(placaX - 2, placaY + placaAltura + 7, "25 cm (L) × 18 cm (A)", 4.2);
  yColunaB += ALTURA_DETALHE + GAP_ENTRE_CAIXAS_COLUNA;

  // Padrão de entrada representativo (recebe a foto importada pelo
  // usuário, se houver -- ver `boxPadraoEntradaRepresentativo` no retorno) --
  // Iteração 21: mesmo tratamento do quadro acima -- título de 2 linhas
  // centralizado ACIMA da caixa.
  const LARGURA_FOTO = LARGURA_COLUNA_B;
  const ALTURA_FOTO = 90;
  caixa(xColunaB, yColunaB, LARGURA_FOTO, ALTURA_FOTO);
  tituloCentralizado(xColunaB + LARGURA_FOTO / 2, yColunaB - 4, "PADRÃO DE ENTRADA\nREPRESENTATIVO", FS_TITULO_COLUNA);
  const boxPadraoEntradaRepresentativo: RetanguloMm = {
    x: xColunaB + 2,
    y: yColunaB + 8,
    largura: LARGURA_FOTO - 4,
    altura: ALTURA_FOTO - 10,
  };
  if (dados.temFotoPadraoEntrada) {
    // Foto real anexada pelo usuário -- o MODAL (`DiagramaFvModal.tsx`)
    // encaixa a imagem via XREF exatamente neste retângulo logo depois
    // de chamar este gerador, então não desenha nada aqui (evita
    // desenhar por baixo da foto à toa).
  } else {
    // Iteração 18: sem foto, desenha um esquema representativo (bloco
    // `padrao_entrada_detalhe`, baseado no PDF de referência do usuário)
    // em vez do texto vazio "(anexe a foto real...)" de antes -- o
    // bloco é centralizado e escalado (fit-and-contain, mesma técnica
    // usada pelo modal pra foto real) dentro do MESMO retângulo
    // reservado, então o resultado ocupa a área do jeito que a foto real
    // ocuparia depois.
    const def = getBlockDef("padrao_entrada_detalhe");
    const larguraNativa = def?.largura ?? 60;
    const alturaNativa = def?.altura ?? 78;
    const escalaBloco = Math.min(
      boxPadraoEntradaRepresentativo.largura / larguraNativa,
      boxPadraoEntradaRepresentativo.altura / alturaNativa
    );
    bloco(
      "padrao_entrada_detalhe",
      boxPadraoEntradaRepresentativo.x + boxPadraoEntradaRepresentativo.largura / 2,
      boxPadraoEntradaRepresentativo.y + boxPadraoEntradaRepresentativo.altura / 2,
      escalaBloco
    );
  }

  const geometriaMarcada = g.map((el) => ({ ...el, origemGeradorId: ORIGEM_GERADOR_DIAGRAMA_FV }));
  return { geometria: geometriaMarcada, boxPadraoEntradaRepresentativo, boxDetalhePlaca };
}
