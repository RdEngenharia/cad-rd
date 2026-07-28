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
import { distribuirPontosNoContorno } from "./roomDetection";
import type { TipoAmbiente } from "./cargasEletricas";
import { ROTULO_TIPO_AMBIENTE } from "./cargasEletricas";
import { getBlockDef } from "./blocks";
import type { NovaGeometria } from "./types";
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

/** Deslocamento (mm) das tomadas/interruptor pra DENTRO do cômodo a partir da linha de parede -- evita o símbolo cair em cima do traço da parede. */
const INSET_PONTO_MM = 60;

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
}

export interface ResumoLancamentoEletrico {
  comodosProcessados: number;
  totalTomadas: number;
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

/** Ponto na aresta do contorno mais próximo de `alvo` -- usado para aproximar a posição do interruptor (perto da parede mais próxima do centro do cômodo, ver observação de limitação no resumo). */
function pontoDoContornoMaisProximo(contorno: { x: number; y: number }[], alvo: { x: number; y: number }): { x: number; y: number } {
  let melhor = contorno[0];
  let melhorDist = Infinity;
  const n = contorno.length;
  for (let i = 0; i < n; i++) {
    const a = contorno[i];
    const b = contorno[(i + 1) % n];
    const { dist, pontoMaisProximo } = distanciaAoSegmento(alvo, a, b);
    if (dist < melhorDist) {
      melhorDist = dist;
      melhor = pontoMaisProximo;
    }
  }
  return melhor;
}

/** Desloca `ponto` (que está EM CIMA do contorno) `insetMm` para dentro, na direção de `centro`. */
function deslocarParaDentro(ponto: { x: number; y: number }, centro: { x: number; y: number }, insetMm: number): { x: number; y: number } {
  const dx = centro.x - ponto.x;
  const dy = centro.y - ponto.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: ponto.x + (dx / d) * insetMm, y: ponto.y + (dy / d) * insetMm };
}

/**
 * Núcleo puro do gerador: recebe os cômodos já detectados (ver
 * `roomDetection.ts#detectarComodos`) e devolve a geometria nova (tomadas,
 * interruptores, pontos de luz -- SEM legenda, ver `gerarLegendaEletrica`
 * separado) + o resumo. Quem chama (o store) decide onde ancorar a
 * legenda e cuida de camadas/undo/provenance -- mesma separação de
 * responsabilidade dos outros geradores (`sistemaSolo.ts`/`cargasEletricas.ts`).
 */
export function gerarPontosEletricos(comodos: ComodoDetectado[]): { geometria: NovaGeometria[]; resumo: ResumoLancamentoEletrico } {
  const geometria: NovaGeometria[] = [];
  const porComodo: ResumoComodoLancamento[] = [];
  let totalTomadas = 0;
  let totalPontosLuz = 0;
  let totalInterruptores = 0;
  const observacoesGerais = new Set<string>();

  for (const comodo of comodos) {
    const quantidade = quantidadeTomadasNBR(comodo.tipo, comodo.perimetroM);
    const blocoTomada = blocoTomadaPorTipo(comodo.tipo);

    // Ponto de luz: sempre seguro de lançar (centroide já garantido dentro
    // do cômodo mesmo sem contorno confiável -- ver `roomDetection.ts`).
    geometria.push(criarBloco("ponto_luz_teto", comodo.centroide.x, comodo.centroide.y, CAMADA_ILUMINACAO));
    totalPontosLuz++;

    let pontosAutomaticos = false;
    let observacao: string | undefined;

    if (comodo.contornoConfiavel && comodo.contorno) {
      const pontosTomadas = distribuirPontosNoContorno(comodo.contorno, quantidade, INSET_PONTO_MM, comodo.centroide);
      for (const p of pontosTomadas) {
        geometria.push(criarBloco(blocoTomada, p.x, p.y, CAMADA_TOMADAS));
        totalTomadas++;
      }
      const pontoParedeMaisPerto = pontoDoContornoMaisProximo(comodo.contorno, comodo.centroide);
      const posInterruptor = deslocarParaDentro(pontoParedeMaisPerto, comodo.centroide, INSET_PONTO_MM);
      geometria.push(criarBloco("interruptor_simples", posInterruptor.x, posInterruptor.y, CAMADA_ILUMINACAO));
      totalInterruptores++;
      pontosAutomaticos = true;
    } else {
      observacao = `Contorno não pôde ser traçado com segurança -- adicione manualmente ${quantidade} tomada(s) (${blocoTomada}) e 1 interruptor.`;
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
    });
  }

  observacoesGerais.add(
    "O bloco de tomada dedicada de chuveiro/aquecedor (circuito exclusivo) nunca é lançado automaticamente -- posicione manualmente onde houver chuveiro elétrico de verdade."
  );
  observacoesGerais.add(
    "Quantidades são o MÍNIMO normativo (NBR 5410, 9.5.2) -- acrescente tomadas extras por conveniência conforme o layout de móveis do projeto, se desejar."
  );

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
      totalPontosLuz,
      totalInterruptores,
      porComodo,
      observacoesGerais: Array.from(observacoesGerais),
    },
  };
}

function criarBloco(nome: string, x: number, y: number, camada: string): NovaGeometria {
  return {
    tipo: "bloco",
    camada,
    nome,
    x,
    y,
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
  const ESCALA_ICONE = 0.22; // reduz o bloco (desenhado em mm "de planta") pra um ícone de legenda compacto.
  const ALTURA_LINHA = 14;
  const FONTE_TITULO = 5;
  const FONTE_ITEM = 3.4;

  geometria.push({
    tipo: "texto",
    camada: CAMADA_LEGENDA_ELETRICA,
    x: origemX,
    y: origemY,
    conteudo: "LEGENDA -- SIMBOLOGIA ELÉTRICA (NBR 5410)",
    fontSize: FONTE_TITULO,
  });

  let linha = 1;
  for (const nomeBloco of nomesBlocosUsados) {
    const def = getBlockDef(nomeBloco);
    if (!def) continue; // bloco desconhecido -- não deveria acontecer, mas nunca quebra a legenda por isso.
    const y = origemY + linha * ALTURA_LINHA;
    geometria.push({
      tipo: "bloco",
      camada: CAMADA_LEGENDA_ELETRICA,
      nome: nomeBloco,
      x: origemX + 10,
      y: y + ALTURA_LINHA / 2 - 4,
      escalaX: ESCALA_ICONE,
      escalaY: ESCALA_ICONE,
    });
    geometria.push({
      tipo: "texto",
      camada: CAMADA_LEGENDA_ELETRICA,
      x: origemX + 24,
      y,
      conteudo: `${def.label} -- ${def.descricao}`,
      fontSize: FONTE_ITEM,
    });
    linha++;
  }

  return geometria;
}
