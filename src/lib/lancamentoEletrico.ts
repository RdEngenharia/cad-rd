/**
 * lancamentoEletrico.ts
 * -----------------------------------------------------------------------
 * Iteração 35 -- gerador automático de tomadas/interruptores/iluminação a
 * partir da planta baixa já desenhada, conforme NBR 5410 (item 9.5.2 --
 * pontos de tomada de uso geral -- e 9.5.3 -- pontos de iluminação).
 * Pedido original do usuário: ver cabeçalho de `lib/roomDetection.ts`
 * (mesma Iteração) para o texto verbatim completo.
 *
 * REGRAS NORMATIVAS aplicadas (mínimos da NBR 5410, não um ótimo estético
 * -- um projeto real pode e deve acrescentar tomadas além do mínimo por
 * conveniência/funcionalidade, o que este gerador NÃO tenta adivinhar):
 *  - 9.5.2.1 (ambientes SECOS -- salas, quartos, corredores, escritório,
 *    "outro" não classificado): 1 tomada a cada 5m (ou fração) de
 *    perímetro, mínimo 1.
 *  - 9.5.2.2 (cozinha/copa e área de serviço -- ambientes molhados de
 *    bancada): 1 tomada a cada 3,5m (ou fração) de perímetro,
 *    INDEPENDENTE da área. NÃO inclui automaticamente o ponto obrigatório
 *    "acima da bancada" (posição da bancada não é detectável a partir da
 *    geometria) -- ver observação gerada pro usuário.
 *  - Banheiro: mínimo 1 tomada (a norma exige posição >= 60cm de
 *    qualquer área de chuveiro/box -- posição do box não é detectável a
 *    partir do nome do ambiente, então SEMPRE gera uma observação pedindo
 *    conferência manual da distância).
 *  - Varanda/garagem: mínimo 1 tomada.
 *  - Iluminação: sempre 1 ponto de luz de teto + 1 interruptor por
 *    cômodo (simplificação -- não modela salas muito grandes que
 *    precisariam de mais de 1 luminária, nem interruptores paralelos/
 *    three-way para corredores compridos com 2 entradas).
 *
 * SEGURANÇA -- o bloco "tomada_chuveiro" NUNCA é lançado automaticamente
 * (mesmo em ambientes tipo "banheiro"): a existência e a posição real de
 * um chuveiro elétrico não são dedutíveis do nome do cômodo. Fica
 * disponível na biblioteca de blocos só para posicionamento manual do
 * projetista.
 * -----------------------------------------------------------------------
 */

import type { ComodoDetectado, ProblemaComodo } from "./roomDetection";
import { distribuirPontosNoContorno, anguloFaceandoParede, pontoDentroDoPoligono } from "./roomDetection";
import type { TipoAmbiente, TueInput } from "./cargasEletricas";
import { ROTULO_TIPO_AMBIENTE } from "./cargasEletricas";
import { getBlockDef, type BlockDef } from "./blocks";
import type { Geometria, NovaGeometria } from "./types";
import { distanciaAoSegmento } from "./geom";

export const ORIGEM_GERADOR_LANCAMENTO_ELETRICO = "lancamentoEletrico";

export const CAMADA_TOMADAS = "ELETRICA_TOMADAS";
export const CAMADA_ILUMINACAO = "ELETRICA_ILUMINACAO";
export const CAMADA_LEGENDA_ELETRICA = "ELETRICA_LEGENDA";

export const CAMADAS_LANCAMENTO_ELETRICO: { camada: string; cor: string }[] = [
  { camada: CAMADA_TOMADAS, cor: "#b45309" },
  { camada: CAMADA_ILUMINACAO, cor: "#ca8a04" },
  { camada: CAMADA_LEGENDA_ELETRICA, cor: "#334155" },
];

/** Ambientes "molhados de bancada" -- regra de tomada a cada 3,5m de perímetro (NBR 5410, 9.5.2.2). */
const TIPOS_BANCADA: TipoAmbiente[] = ["cozinha", "area_servico"];
/** Ambientes com mínimo FIXO de 1 tomada, sem escalar por perímetro. */
const TIPOS_MINIMO_FIXO: TipoAmbiente[] = ["banheiro", "varanda", "garagem"];

const ESPACAMENTO_TOMADA_SECO_MM = 5000;
const ESPACAMENTO_TOMADA_BANCADA_MM = 3500;

/**
 * Iteração 35b (bugfix -- usuário: "quero as simbologias faceando com a
 * parede da planta baixa"): o deslocamento pra dentro do cômodo era um
 * valor FIXO (60mm), sem relação com o tamanho de cada bloco -- com os
 * blocos pequenos originais (20-24mm) isso já deixava o símbolo "flutuando"
 * torto da parede; depois de aumentar os blocos pra um tamanho visível
 * (ver `blocks.ts`), um inset fixo de 60mm deixaria o símbolo bem mais
 * "solto" ainda, longe da parede. Em vez de um valor fixo, o inset agora é
 * PROPORCIONAL à altura de cada bloco, calculado a partir da distância (no
 * viewBox 0-100 do bloco, ver `blocks.ts`) do CENTRO do símbolo até a base
 * que deve encostar na parede:
 *  - Tomadas (triângulo): base em y=82 => (82-50)/100 = 0.32 da altura.
 *  - Interruptor (círculo r=30 num viewBox de 100): 30/100 = 0.30 da altura.
 * Isso faz a BORDA do símbolo (não o centro) ficar encostada na linha da
 * parede, qualquer que seja o tamanho do bloco.
 */
const FATOR_INSET_POR_BLOCO: Record<string, number> = {
  tomada_baixa: 0.32,
  tomada_media: 0.32,
  tomada_alta: 0.32,
  tomada_chuveiro: 0.32,
  tomada_tue: 0.32,
  interruptor_simples: 0.3,
};

/** Nomes de bloco (`BlocoGeometria.nome`) considerados "tomada de uso geral" (TUG) pra fins de contagem -- ver `contarBlocosNoComodo`. NÃO inclui `tomada_chuveiro`/`tomada_tue` (essas são TUE, circuito exclusivo, contadas à parte). */
const BLOCOS_TOMADA_TUG = ["tomada_baixa", "tomada_media", "tomada_alta"];

/** Distância (mm) da linha de parede até o CENTRO do bloco `nomeBloco`, calculada a partir da altura real do bloco (ver `FATOR_INSET_POR_BLOCO`) -- ver comentário acima. */
function insetParaBloco(nomeBloco: string): number {
  const def = getBlockDef(nomeBloco);
  const fator = FATOR_INSET_POR_BLOCO[nomeBloco] ?? 0.32;
  return (def?.altura ?? 300) * fator;
}

/** Escolhe o bloco de tomada (altura de instalação) por tipo de ambiente -- ver cabeçalho para o raciocínio de cada escolha. */
function blocoTomadaPorTipo(tipo: TipoAmbiente): string {
  if (TIPOS_BANCADA.includes(tipo)) return "tomada_media";
  if (tipo === "banheiro") return "tomada_alta";
  return "tomada_baixa";
}

/** Quantidade mínima de tomadas (NBR 5410) para um cômodo, por tipo + perímetro. */
export function quantidadeTomadasNBR(tipo: TipoAmbiente, perimetroM: number): number {
  if (TIPOS_MINIMO_FIXO.includes(tipo)) return 1;
  const espacamentoMm = TIPOS_BANCADA.includes(tipo) ? ESPACAMENTO_TOMADA_BANCADA_MM : ESPACAMENTO_TOMADA_SECO_MM;
  return Math.max(1, Math.ceil((perimetroM * 1000) / espacamentoMm));
}

/**
 * Conta quantos blocos com `nome` em `nomesBloco` caem DENTRO do contorno
 * de `comodo` -- usado por `contarTomadasELampadasReais` pra saber quantas
 * tomadas/pontos de luz JÁ EXISTEM de fato na planta baixa (lançadas
 * automaticamente OU adicionadas/removidas manualmente pelo projetista
 * depois), em vez de só estimar pela fórmula da NBR 5410. Devolve `null`
 * quando o cômodo não tem contorno confiável (`contornoConfiavel` falso) --
 * quem chama decide o fallback (ver comentário em `contarTomadasELampadasReais`).
 */
export function contarBlocosNoComodo(comodo: ComodoDetectado, geometriaCompleta: Geometria[], nomesBloco: string[]): number | null {
  if (!comodo.contornoConfiavel || !comodo.contorno) return null;
  const contorno = comodo.contorno;
  let total = 0;
  for (const g of geometriaCompleta) {
    if (g.tipo !== "bloco" || !nomesBloco.includes(g.nome)) continue;
    if (pontoDentroDoPoligono({ x: g.x, y: g.y }, contorno)) total++;
  }
  return total;
}

/**
 * Iteração 44 -- pedido do usuário: "se depois eu resolver lançar mais
 * tomadas na planta baixa manualmente o botao deve atualizar o quadro de
 * cargas e tabelas". Quantidade de tomadas (TUG)/pontos de luz "reais" de
 * um cômodo: conta os blocos DE FATO presentes na planta (via
 * `contarBlocosNoComodo`) -- reflete qualquer tomada/luminária que o
 * projetista tenha adicionado ou removido manualmente depois do
 * lançamento automático. Cai de volta pra estimativa normativa (NBR 5410)
 * só quando a contagem real vier zerada (planta ainda sem nenhum ponto
 * lançado -- ex.: antes do 1º "Lançar tomadas/iluminação") ou sem contorno
 * confiável, pra não regredir o preenchimento inicial de
 * `CargasEletricasModal.tsx` (que sempre teve um valor default sensato,
 * mesmo sem nenhum bloco ainda desenhado).
 */
export function contarTomadasELampadasReais(
  comodo: ComodoDetectado,
  geometriaCompleta: Geometria[]
): { quantidadeTomadas: number; quantidadeLampadas: number } {
  const tomadasReais = contarBlocosNoComodo(comodo, geometriaCompleta, BLOCOS_TOMADA_TUG);
  const lampadasReais = contarBlocosNoComodo(comodo, geometriaCompleta, ["ponto_luz_teto"]);
  return {
    quantidadeTomadas: tomadasReais && tomadasReais > 0 ? tomadasReais : quantidadeTomadasNBR(comodo.tipo, comodo.perimetroM),
    quantidadeLampadas: lampadasReais && lampadasReais > 0 ? lampadasReais : 1,
  };
}

/** Ambiente pronto pra alimentar `CargasEletricasModal.tsx` -- pré-preenchimento inicial OU sincronização manual (ver `montarAmbientesPreenchimento`). */
export interface AmbientePreenchimento {
  nome: string;
  tipo: TipoAmbiente;
  areaM2: number;
  quantidadeTomadas: number;
  quantidadeLampadas: number;
}

/**
 * Constrói a lista de ambientes pronta pra `CargasEletricasModal.tsx` a
 * partir dos cômodos detectados na planta baixa -- nome/tipo/área vêm
 * direto da detecção; quantidade de tomadas/lâmpadas vem da contagem REAL
 * de blocos já lançados (`contarTomadasELampadasReais`), com fallback pra
 * estimativa da NBR 5410 quando ainda não há nenhum bloco na planta.
 * Usada tanto no PRIMEIRO preenchimento do modal quanto no botão "🔄
 * Sincronizar com a planta baixa" (Iteração 44) -- mesma fonte de dados
 * pros 2 casos, só muda o que quem chama faz com o resultado (substituir
 * tudo vs. mesclar preservando TUEs/ambientes manuais já digitados).
 */
export function montarAmbientesPreenchimento(comodos: ComodoDetectado[], geometriaCompleta: Geometria[]): AmbientePreenchimento[] {
  return comodos.map((c) => {
    const { quantidadeTomadas, quantidadeLampadas } = contarTomadasELampadasReais(c, geometriaCompleta);
    return { nome: c.nome, tipo: c.tipo, areaM2: c.areaM2, quantidadeTomadas, quantidadeLampadas };
  });
}

export interface ResumoComodoLancamento {
  nome: string;
  tipoRotulo: string;
  areaM2: number;
  perimetroM: number;
  quantidadeTomadas: number;
  blocoTomada: string;
  /** `false` quando o contorno não pôde ser traçado com segurança -- só o ponto de luz foi lançado automaticamente (ver cabeçalho do módulo/`roomDetection.ts`). */
  pontosAutomaticos: boolean;
  observacao?: string;
  /**
   * Iteração 44 -- nomes dos equipamentos de uso específico (TUE, ex.:
   * "Ar-condicionado", "Fogão de indução") cadastrados no Dimensionamento
   * de Cargas (`dadosCargasEletricas`) pra este cômodo e cujo símbolo
   * (`tomada_tue`) foi lançado automaticamente aqui. Vazio quando o
   * cômodo não tem nenhum TUE cadastrado ainda, ou quando o contorno não
   * é confiável (mesma limitação das tomadas/interruptor comuns).
   */
  nomesTuesLancados: string[];
}

export interface ResumoLancamentoEletrico {
  comodosProcessados: number;
  totalTomadas: number;
  /** Iteração 44 -- total de símbolos `tomada_tue` lançados (soma de `nomesTuesLancados` de todos os cômodos). */
  totalTues: number;
  totalPontosLuz: number;
  totalInterruptores: number;
  porComodo: ResumoComodoLancamento[];
  observacoesGerais: string[];
}

export interface ResultadoLancamentoEletrico {
  ok: boolean;
  geometria: NovaGeometria[];
  resumo: ResumoLancamentoEletrico | null;
  /** Preenchido só quando `ok === false` -- ver `roomDetection.ts#ProblemaComodo`. */
  problemas: ProblemaComodo[];
}

/**
 * Ponto na aresta do contorno mais próximo de `alvo` -- usado para
 * aproximar a posição do interruptor (perto da parede mais próxima do
 * centro do cômodo, ver observação de limitação no resumo) -- devolve
 * junto a normal INTERNA da parede naquele ponto (`nx,ny`, unitária,
 * sempre apontando pra dentro do polígono -- mesmo critério de
 * `roomDetection.ts#distribuirPontosNoContorno`) e os 2 vértices do
 * trecho (`segA`/`segB`), que permitem deslizar o ponto ao LONGO da
 * parede (ver `FATOR_INSET_POR_BLOCO`/conflito de posição abaixo) sem
 * perder a normal/ângulo corretos -- ao contrário de recalcular a direção
 * "ponto -> centroide" (só é igual à normal da parede exatamente no pé da
 * perpendicular; desliza pro lado e o cálculo por centroide passaria a
 * apontar ligeiramente torto).
 */
function pontoDoContornoMaisProximo(
  contorno: { x: number; y: number }[],
  alvo: { x: number; y: number }
): { ponto: { x: number; y: number }; nx: number; ny: number; segA: { x: number; y: number }; segB: { x: number; y: number } } {
  let melhorDist = Infinity;
  let resultado = {
    ponto: contorno[0],
    nx: 0,
    ny: 0,
    segA: contorno[0],
    segB: contorno[1 % contorno.length],
  };
  const n = contorno.length;
  for (let i = 0; i < n; i++) {
    const a = contorno[i];
    const b = contorno[(i + 1) % n];
    const { dist, pontoMaisProximo } = distanciaAoSegmento(alvo, a, b);
    if (dist < melhorDist) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const comprimento = Math.hypot(dx, dy) || 1;
      const nx1 = -dy / comprimento;
      const ny1 = dx / comprimento;
      const paraAlvoX = alvo.x - pontoMaisProximo.x;
      const paraAlvoY = alvo.y - pontoMaisProximo.y;
      const mesmoSentido = nx1 * paraAlvoX + ny1 * paraAlvoY >= 0;
      melhorDist = dist;
      resultado = {
        ponto: pontoMaisProximo,
        nx: mesmoSentido ? nx1 : -nx1,
        ny: mesmoSentido ? ny1 : -ny1,
        segA: a,
        segB: b,
      };
    }
  }
  return resultado;
}

/**
 * Desloca `ponto` (que está EM CIMA do contorno, ou deslizado ao longo da
 * mesma parede -- ver conflito de posição em `gerarPontosEletricos`)
 * `insetMm` para dentro, na direção da normal `(nx,ny)` já calculada por
 * `pontoDoContornoMaisProximo`, e devolve junto o `anguloGraus` (ver
 * `roomDetection.ts#anguloFaceandoParede`) que orienta o bloco de frente
 * pra essa mesma parede.
 */
function deslocarAoLongoDaNormal(
  ponto: { x: number; y: number },
  nx: number,
  ny: number,
  insetMm: number
): { x: number; y: number; anguloGraus: number } {
  return { x: ponto.x + nx * insetMm, y: ponto.y + ny * insetMm, anguloGraus: anguloFaceandoParede(nx, ny) };
}

/**
 * Normaliza o nome de um cômodo para comparação (remove acentos, corta
 * espaços nas pontas, minúsculas) -- usado pra casar `ComodoDetectado.nome`
 * (da planta baixa) com `AmbienteInput.nome` (do Dimensionamento de
 * Cargas), que podem divergir em maiúsculas/espaços mesmo representando o
 * mesmo cômodo (ex.: "Cozinha" vs "cozinha "). Ver `gerarPontosEletricos`.
 */
export function normalizarNomeComodo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Núcleo puro do gerador: recebe os cômodos já detectados (ver
 * `roomDetection.ts#detectarComodos`) e devolve a geometria nova (tomadas,
 * interruptores, pontos de luz -- SEM legenda, ver `gerarLegendaEletrica`
 * separado) + o resumo. Quem chama (o store) decide onde ancorar a
 * legenda e cuida de camadas/undo/provenance -- mesma separação de
 * responsabilidade dos outros geradores (`sistemaSolo.ts`/`cargasEletricas.ts`).
 *
 * `tuesPorComodoNome` (Iteração 44, pedido do usuário: "adicionei umas tue
 * na cozinha como ar condicionado e fogao de inducao, quero que se eu
 * lançar circuitos extras a simbologia dessas tomadas apareçam
 * automaticamente no comodo") -- mapa OPCIONAL nome-normalizado-do-cômodo
 * -> lista de TUEs cadastrados nele no Dimensionamento de Cargas
 * (`dadosCargasEletricas`, ver `store.ts#gerarLancamentoEletrico`). Quando
 * presente e o cômodo tem contorno confiável, lança 1 símbolo
 * `tomada_tue` + 1 texto com o nome do equipamento para CADA TUE do
 * cômodo, distribuídos ao longo do MESMO contorno que as tomadas comuns
 * (mesma chamada de `distribuirPontosNoContorno`, com a quantidade total
 * -- tomadas + TUEs -- pra ficarem uniformemente espaçados sem sobrepor
 * ninguém). Ausente/vazio (comportamento de sempre): nenhum símbolo TUE é
 * lançado, exatamente como antes desta iteração.
 */
export function gerarPontosEletricos(
  comodos: ComodoDetectado[],
  tuesPorComodoNome?: Map<string, TueInput[]>
): { geometria: NovaGeometria[]; resumo: ResumoLancamentoEletrico } {
  const geometria: NovaGeometria[] = [];
  const porComodo: ResumoComodoLancamento[] = [];
  let totalTomadas = 0;
  let totalTues = 0;
  let totalPontosLuz = 0;
  let totalInterruptores = 0;
  const observacoesGerais = new Set<string>();

  for (const comodo of comodos) {
    const quantidade = quantidadeTomadasNBR(comodo.tipo, comodo.perimetroM);
    const blocoTomada = blocoTomadaPorTipo(comodo.tipo);
    const tuesDoComodo = tuesPorComodoNome?.get(normalizarNomeComodo(comodo.nome)) ?? [];
    const nomesTuesLancados: string[] = [];

    // Ponto de luz: sempre seguro de lançar (centroide já garantido dentro
    // do cômodo mesmo sem contorno confiável -- ver `roomDetection.ts`).
    geometria.push(criarBloco("ponto_luz_teto", comodo.centroide.x, comodo.centroide.y, CAMADA_ILUMINACAO));
    totalPontosLuz++;

    let pontosAutomaticos = false;
    let observacao: string | undefined;

    if (comodo.contornoConfiavel && comodo.contorno) {
      const insetTomada = insetParaBloco(blocoTomada);
      const insetTue = insetParaBloco("tomada_tue");
      // Distribui tomadas comuns + TUEs NUMA SÓ chamada (quantidade total)
      // pra ficarem uniformemente espaçados ao longo do contorno inteiro,
      // sem risco de 2 símbolos caírem no mesmo ponto -- os primeiros
      // `quantidade` pontos vão pras tomadas comuns, o restante (se
      // houver TUE cadastrado) pras TUEs, na ordem em que foram
      // cadastradas no modal.
      const pontosTotais = distribuirPontosNoContorno(comodo.contorno, quantidade + tuesDoComodo.length, insetTomada, comodo.centroide);
      const pontosTomadas = pontosTotais.slice(0, quantidade);
      const pontosTues = pontosTotais.slice(quantidade);
      for (const p of pontosTomadas) {
        geometria.push(criarBloco(blocoTomada, p.x, p.y, CAMADA_TOMADAS, p.anguloGraus));
        totalTomadas++;
      }
      // Reajusta o inset de cada ponto de TUE especificamente pro tamanho
      // do bloco `tomada_tue` (pode diferir do `blocoTomada` do cômodo) --
      // a distribuição acima usou `insetTomada` pra todos só pra garantir
      // o espaçamento uniforme; aqui desloca cada ponto de TUE um pouco
      // mais/menos, ao longo da MESMA normal (preservada implicitamente:
      // reconstruída a partir do ângulo já calculado -- ver
      // `anguloFaceandoParede`, cuja transformação inversa é
      // `nx=sen(A), ny=-cos(A)`), pra bater com a altura real do bloco.
      pontosTues.forEach((p, i) => {
        const tue = tuesDoComodo[i];
        const rad = (p.anguloGraus * Math.PI) / 180;
        const nx = Math.sin(rad);
        const ny = -Math.cos(rad);
        const ajuste = insetTue - insetTomada;
        const px = p.x + nx * ajuste;
        const py = p.y + ny * ajuste;
        geometria.push(criarBloco("tomada_tue", px, py, CAMADA_TOMADAS, p.anguloGraus));
        // Texto com o nome do equipamento, um pouco mais pra dentro do
        // cômodo que o próprio símbolo (mesma normal), pra não ficar
        // colado na parede nem sobrepor o símbolo -- só anotação visual,
        // livre pra o projetista arrastar depois (é um `texto` comum).
        const insetRotulo = insetTue + (getBlockDef("tomada_tue")?.altura ?? 200) * 0.75;
        geometria.push({
          tipo: "texto",
          camada: CAMADA_TOMADAS,
          x: p.x + nx * insetRotulo,
          y: p.y + ny * insetRotulo,
          conteudo: tue?.nome?.trim() || "TUE",
          fontSize: 70,
        });
        totalTues++;
        nomesTuesLancados.push(tue?.nome?.trim() || "TUE");
      });
      const maisProximo = pontoDoContornoMaisProximo(comodo.contorno, comodo.centroide);
      const insetInterruptor = insetParaBloco("interruptor_simples");
      let posInterruptor = deslocarAoLongoDaNormal(maisProximo.ponto, maisProximo.nx, maisProximo.ny, insetInterruptor);

      // Iteração 35b (achado ao testar visualmente o bugfix de tamanho/
      // orientação, ver `scripts/playwright-test-lancamento-3x3.js"):
      // em cômodos muito simétricos (ex. quadrados), o ponto médio da
      // parede mais próxima do centroide -- usado pra aproximar a posição
      // do interruptor -- pode coincidir quase exatamente com um dos
      // pontos igualmente espaçados das tomadas na MESMA parede. Com os
      // blocos pequenos originais isso passava despercebido; com os
      // blocos aumentados (visibilidade, ver `blocks.ts`) os 2 símbolos
      // ficavam sobrepostos e ilegíveis -- o oposto do que o usuário
      // pediu. Detecta a sobreposição (distância entre centros menor que
      // a soma dos "raios" dos 2 símbolos) e desliza o interruptor ao
      // longo da MESMA parede (tangente do trecho -- a normal/ângulo não
      // muda, o interruptor continua de frente pra parede) até ficar
      // livre; tenta os 2 sentidos ao longo da parede, mantém a posição
      // original se nenhum dos 2 resolver (caso extremo -- parede muito
      // curta pra caber os 2 símbolos lado a lado).
      const raioTomada = Math.max(getBlockDef(blocoTomada)?.altura ?? 0, getBlockDef(blocoTomada)?.largura ?? 0) / 2;
      const raioInterruptor = Math.max(getBlockDef("interruptor_simples")?.altura ?? 0, getBlockDef("interruptor_simples")?.largura ?? 0) / 2;
      const distanciaMinimaSegura = raioTomada + raioInterruptor + 40;
      const temConflito = (p: { x: number; y: number }) => pontosTomadas.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < distanciaMinimaSegura);
      if (temConflito(posInterruptor)) {
        const tx = maisProximo.segB.x - maisProximo.segA.x;
        const ty = maisProximo.segB.y - maisProximo.segA.y;
        const comprimento = Math.hypot(tx, ty) || 1;
        const passo = Math.min(distanciaMinimaSegura, comprimento * 0.35);
        for (const sinal of [1, -1]) {
          const pontoDeslizado = {
            x: maisProximo.ponto.x + (tx / comprimento) * passo * sinal,
            y: maisProximo.ponto.y + (ty / comprimento) * passo * sinal,
          };
          const candidato = deslocarAoLongoDaNormal(pontoDeslizado, maisProximo.nx, maisProximo.ny, insetInterruptor);
          if (!temConflito(candidato)) {
            posInterruptor = candidato;
            break;
          }
        }
      }

      geometria.push(criarBloco("interruptor_simples", posInterruptor.x, posInterruptor.y, CAMADA_ILUMINACAO, posInterruptor.anguloGraus));
      totalInterruptores++;
      pontosAutomaticos = true;
    } else {
      observacao =
        `Contorno não pôde ser traçado com segurança -- adicione manualmente ${quantidade} tomada(s) (${blocoTomada}) e 1 interruptor` +
        (tuesDoComodo.length > 0
          ? `, além do(s) TUE(s) cadastrado(s) (${tuesDoComodo.map((t) => t.nome).join(", ")} -- bloco "tomada_tue").`
          : ".");
      observacoesGerais.add("1 ou mais cômodos ficaram sem contorno seguro para posicionar tomadas/interruptor automaticamente -- ver observação de cada cômodo.");
    }

    if (TIPOS_BANCADA.includes(comodo.tipo)) {
      observacoesGerais.add(
        "Cozinha/área de serviço: a NBR 5410 exige 1 tomada acima da bancada com potência adequada -- este gerador NÃO detecta a posição da bancada automaticamente, confira/adicione manualmente."
      );
    }
    if (comodo.tipo === "banheiro") {
      observacoesGerais.add(
        "Banheiro: confira manualmente se a tomada respeita a distância mínima de 60cm de qualquer box/chuveiro (NBR 5410) -- a posição do box não é detectada automaticamente."
      );
    }
    observacoesGerais.add(
      "Interruptor posicionado de forma APROXIMADA (parede mais próxima do centro do cômodo) -- a posição real depende do sentido de abertura da porta, não detectado automaticamente. Confira antes de finalizar o projeto."
    );

    porComodo.push({
      nome: comodo.nome,
      tipoRotulo: ROTULO_TIPO_AMBIENTE[comodo.tipo],
      areaM2: comodo.areaM2,
      perimetroM: comodo.perimetroM,
      quantidadeTomadas: quantidade,
      blocoTomada,
      pontosAutomaticos,
      observacao,
      nomesTuesLancados,
    });
  }

  observacoesGerais.add(
    "O bloco de tomada dedicada de chuveiro/aquecedor (circuito exclusivo) nunca é lançado automaticamente -- posicione manualmente onde houver chuveiro elétrico de verdade."
  );
  observacoesGerais.add(
    "Quantidades são o MÍNIMO normativo (NBR 5410, 9.5.2) -- acrescente tomadas extras por conveniência conforme o layout de móveis do projeto, se desejar."
  );
  // Iteração 44 -- só avisa sobre a posição aproximada da TUE quando
  // alguma foi de fato lançada nesta geração (evita ruído/observação
  // irrelevante em projetos que ainda não usam TUE nenhuma).
  if (totalTues > 0) {
    observacoesGerais.add(
      "Símbolo(s) de TUE (tomada de uso específico) posicionado(s) de forma APROXIMADA ao longo do contorno do cômodo -- arraste pra posição exata do equipamento real (ex.: ao lado da unidade de ar-condicionado, atrás do fogão) antes de finalizar o projeto."
    );
  }

  // Marca proveniência (Iteração 29h, mesmo padrão de `sistemaSolo.ts`/
  // `cargasEletricas.ts`) -- permite ao store substituir só a geometria de
  // uma geração ANTERIOR deste mesmo gerador ao clicar de novo, sem tocar
  // em nada desenhado manualmente pelo usuário.
  const geometriaMarcada = geometria.map((g) => ({ ...g, origemGeradorId: ORIGEM_GERADOR_LANCAMENTO_ELETRICO }));

  return {
    geometria: geometriaMarcada,
    resumo: {
      comodosProcessados: comodos.length,
      totalTomadas,
      totalTues,
      totalPontosLuz,
      totalInterruptores,
      porComodo,
      observacoesGerais: Array.from(observacoesGerais),
    },
  };
}

function criarBloco(nome: string, x: number, y: number, camada: string, rotacao?: number): NovaGeometria {
  return {
    tipo: "bloco",
    camada,
    nome,
    x,
    y,
    ...(rotacao !== undefined ? { rotacao } : {}),
  };
}

/**
 * Gera a legenda automática (símbolo + rótulo) dos blocos DE FATO usados
 * na geometria recém-lançada -- ancorada em `(origemX, origemY)` (canto
 * superior-esquerdo da legenda), que quem chama calcula a partir da
 * bounding box da casa processada (este gerador SOBREPÕE uma planta já
 * existente em qualquer lugar do mundo, ao contrário dos outros geradores
 * que desenham a partir do zero numa folha -- não faz sentido ancorar
 * pela folha ativa aqui).
 */
export function gerarLegendaEletrica(nomesBlocosUsados: string[], origemX: number, origemY: number): NovaGeometria[] {
  const geometria: NovaGeometria[] = [];

  // Iteração 36 (pedido explícito do usuário): "o ícone da legenda deve
  // ficar do mesmo tamanho do bloco real na planta" -- deixou de existir
  // uma escala reduzida (`ESCALA_ICONE` de antes): o ícone é o MESMO
  // bloco, no MESMO tamanho (1:1), sem `escalaX`/`escalaY`. Como os
  // blocos desta família são bem maiores que antes (ver `blocks.ts`), o
  // texto da legenda também precisou crescer bem além do tamanho antigo
  // (5mm/3.4mm) -- senão o texto viraria o novo "símbolo invisível" ao
  // lado de um ícone dezenas de vezes maior que ele (o MESMO problema que
  // motivou o bugfix original). Os números abaixo foram escolhidos pra
  // ficarem proporcionalmente legíveis ao lado dos ícones reais, não são
  // um valor arbitrário copiado do texto padrão do resto do app.
  const FONTE_TITULO = 90;
  const FONTE_ITEM = 55;
  const MARGEM = 70; // mm -- respiro interno entre o conteúdo e a borda do retângulo.
  const ESPACO_ICONE_TEXTO = 70; // mm -- respiro horizontal entre a coluna de ícones e a de texto.
  const ESPACO_VERTICAL_LINHA = 60; // mm -- respiro vertical extra entre o ícone/texto de uma linha e o de baixo.
  const ALTURA_TITULO = FONTE_TITULO * 1.8;
  // Estimativa simples de largura de texto (este módulo é puro/roda fora
  // do browser nos testes sintéticos via `npx tsx` -- não dá pra medir
  // texto de verdade no DOM/Canvas aqui) -- fator empírico comum pra
  // fontes sans-serif em maiúsculas/minúsculas misturadas.
  const FATOR_LARGURA_CARACTERE = 0.56;

  const defsUsadas = nomesBlocosUsados
    .map((nome) => ({ nome, def: getBlockDef(nome) }))
    .filter((item): item is { nome: string; def: BlockDef } => !!item.def);

  const larguraColunaIcones = defsUsadas.length > 0 ? Math.max(...defsUsadas.map((item) => item.def.largura)) : 0;
  const tituloTexto = "LEGENDA -- SIMBOLOGIA ELÉTRICA (NBR 5410)";
  const maiorLarguraTexto = defsUsadas.reduce((max, { def }) => {
    const texto = `${def.label} -- ${def.descricao}`;
    return Math.max(max, texto.length * FONTE_ITEM * FATOR_LARGURA_CARACTERE);
  }, 0);
  const larguraConteudo = larguraColunaIcones + (defsUsadas.length > 0 ? ESPACO_ICONE_TEXTO : 0) + maiorLarguraTexto;
  const larguraTitulo = tituloTexto.length * FONTE_TITULO * FATOR_LARGURA_CARACTERE;
  const larguraRetangulo = Math.max(larguraConteudo, larguraTitulo) + MARGEM * 2;

  geometria.push({
    tipo: "texto",
    camada: CAMADA_LEGENDA_ELETRICA,
    x: origemX + MARGEM,
    y: origemY + MARGEM,
    conteudo: tituloTexto,
    fontSize: FONTE_TITULO,
  });

  let cursorY = origemY + MARGEM + ALTURA_TITULO;
  for (const { nome, def } of defsUsadas) {
    const alturaLinha = Math.max(def.altura, FONTE_ITEM * 1.3);
    geometria.push({
      tipo: "bloco",
      camada: CAMADA_LEGENDA_ELETRICA,
      nome,
      x: origemX + MARGEM + def.largura / 2,
      y: cursorY + def.altura / 2,
    });
    geometria.push({
      tipo: "texto",
      camada: CAMADA_LEGENDA_ELETRICA,
      x: origemX + MARGEM + larguraColunaIcones + ESPACO_ICONE_TEXTO,
      y: cursorY + alturaLinha / 2,
      conteudo: `${def.label} -- ${def.descricao}`,
      fontSize: FONTE_ITEM,
    });
    cursorY += alturaLinha + ESPACO_VERTICAL_LINHA;
  }

  const alturaMinima = ALTURA_TITULO + MARGEM * 2;
  const alturaRetangulo = Math.max(cursorY - origemY - ESPACO_VERTICAL_LINHA + MARGEM, alturaMinima);

  // Retângulo contornando toda a legenda (pedido do usuário: "a legenda
  // precisa ter o retangulo contornando") -- SEM preenchimento (só o
  // contorno, mesmo comportamento padrão de qualquer `RetanguloGeometria`
  // sem `hachura`), inserido no INÍCIO da lista (`unshift`) pra desenhar
  // ATRÁS do título/ícones/texto (mesma camada `CAMADA_LEGENDA_ELETRICA`
  // pra todos -- é a ordem no array que decide o empilhamento visual).
  geometria.unshift({
    tipo: "retangulo",
    camada: CAMADA_LEGENDA_ELETRICA,
    x: origemX,
    y: origemY,
    largura: larguraRetangulo,
    altura: alturaRetangulo,
  });

  return geometria;
}
