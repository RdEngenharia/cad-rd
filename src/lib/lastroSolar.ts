/**
 * lastroSolar.ts
 * -----------------------------------------------------------------------
 * Iteração 28: usuário anexou o datasheet técnico (PDF, 7 páginas,
 * "DATASHEET ESTRUTURA DE LASTRO FORTLEV SOLAR", revisão 02) do "Lastro"
 * -- a base plástica lastreada (preenchida com areia/brita/concreto) que
 * fixa uma estrutura fotovoltaica de fixação ao solo SEM fundação -- com
 * o pedido "atue como um especialista senior e crie o bloco desse lastro
 * solar, seja fiel as medidas e armazene as informacoes".
 *
 * Este arquivo é o "armazenar as informações" do pedido -- todo dado
 * numérico do datasheet que NÃO cabe dentro de um `BlockDef` (que só
 * descreve a geometria do SÍMBOLO, ver `lib/blocks.ts#lastro_solar` para
 * o bloco em si). Cada constante abaixo cita a página do PDF de onde veio
 * o número, pra rastreabilidade caso o datasheet seja atualizado.
 *
 * Contexto do próximo passo (ainda NÃO implementado aqui, de propósito):
 * o usuário vai anexar em seguida o datasheet de um painel fotovoltaico,
 * pra um botão futuro de "dimensionar sistema fotovoltaico no solo" (dado
 * o tamanho do painel + o tamanho do terreno, desenhar em 2D quantos
 * painéis cabem, respeitando o afastamento entre fileiras pra não gerar
 * sombra entre elas). Este arquivo guarda os dados do LASTRO em si
 * (peso/base/espaçamento estrutural por vento) -- ele NÃO tenta calcular
 * ainda quantas fileiras cabem no terreno nem o afastamento
 * anti-sombreamento entre fileiras (isso depende da geometria do PAINEL
 * e do ângulo solar, que ainda não foram informados). Decisão deliberada
 * de escopo: é melhor guardar os dados brutos, fiéis ao datasheet, agora
 * -- e desenhar o algoritmo de leiaute/sombreamento só quando o resto dos
 * requisitos (painel + terreno) estiver definido -- do que arriscar
 * construir uma fórmula prematura que precise ser refeita depois.
 * -----------------------------------------------------------------------
 */

/**
 * Dimensões e peso físicos do lastro em si (página 1, "Overall
 * dimensions") -- são os mesmos para as duas famílias de módulo
 * suportadas (550/670); só a posição do console de fixação do trilho
 * (ver `LASTRO_COMPATIBILIDADE_MODULO` abaixo) muda entre elas.
 */
export interface LastroSolarEspecificacaoFisica {
  fabricante: string;
  modelo: string;
  /** Revisão do datasheet (campo "REVISÃO" do carimbo de cada folha). */
  revisaoDatasheet: string;
  /** Peso do lastro vazio (sem preenchimento), em kg -- pág. 1. */
  pesoVazioKg: number;
  /** Altura total do lastro (extremidade mais alta), em mm -- pág. 1. */
  alturaMm: number;
  /** Largura do lastro (dimensão AO LONGO da fileira de módulos), em mm -- pág. 1. */
  larguraMm: number;
  /** Profundidade do lastro (dimensão FRENTE-FUNDO, sentido da inclinação), em mm -- pág. 1. */
  profundidadeMm: number;
  /** Peso mínimo recomendado de material de preenchimento (areia/brita/concreto), em kg -- pág. 1/2/3. */
  pesoMinimoPreenchimentoKg: number;
  /** Limite mínimo recomendado de ALTURA de preenchimento dentro do lastro, em mm -- pág. 2/3. */
  alturaMinimaRecomendadaPreenchimentoMm: number;
  /** Área da base de apoio traseira (o "pé" da extremidade alta/fundo) no solo, em m² -- pág. 7. */
  areaBaseTraseiraM2: number;
  /** Área da base de apoio frontal (o "pé" da extremidade baixa/frente) no solo, em m² -- pág. 7. */
  areaBaseFrontalM2: number;
  /** Área total de contato com o solo (traseira + frontal), em m² -- pág. 7. */
  areaBaseTotalM2: number;
  /** Espessura das nervuras/paredes do lastro, em mm -- pág. 5/6 (detalhes "A"/"C", escala 1:5). */
  espessuraNervuraMm: number;
}

export const LASTRO_FORTLEV_SOLAR: LastroSolarEspecificacaoFisica = {
  fabricante: "Fortlev Solar",
  modelo: "Lastro",
  revisaoDatasheet: "02",
  pesoVazioKg: 18,
  alturaMm: 1025,
  larguraMm: 600,
  profundidadeMm: 1480,
  pesoMinimoPreenchimentoKg: 300,
  alturaMinimaRecomendadaPreenchimentoMm: 520,
  areaBaseTraseiraM2: 0.13665,
  areaBaseFrontalM2: 0.16715,
  areaBaseTotalM2: 0.3038,
  espessuraNervuraMm: 20,
};

/**
 * Compatibilidade do lastro com cada família de módulo (páginas 2, 3 e 4
 * do datasheet) -- o lastro físico é o mesmo (`LASTRO_FORTLEV_SOLAR`),
 * mas o console de fixação do trilho desliza pra uma posição diferente
 * conforme a largura do módulo, mudando ligeiramente a distância ao solo
 * e o balanço (cantilever) do trilho além do lastro.
 *
 * "Modelo" novo/antigo (pág. 4) é uma revisão do PRÓPRIO lastro (não do
 * módulo) -- o datasheet chama de "Antigo" uma versão anterior do
 * produto, que não é compatível com a família "670" (linhas marcadas
 * "Não aplicável" -- representadas aqui como `null`).
 */
export interface LastroCompatibilidadeModulo {
  /** Identificador da família de módulo suportada, conforme o datasheet chama cada uma. */
  familiaModulo: "550" | "670";
  /** Dimensões do módulo de referência usadas pelo datasheet pra nomear a família (largura x comprimento, mm). */
  dimensaoModuloReferenciaMm: string;
  /**
   * Comprimento de referência da família (lado maior, mm), extraído em
   * número de `dimensaoModuloReferenciaMm` (Iteração 29, pra uso
   * programático em `calcularTiltGrausLastro`). Deliberadamente é o
   * COMPRIMENTO DE REFERÊNCIA DA FAMÍLIA, não o comprimento do módulo
   * real que for instalado -- o ângulo de inclinação é uma propriedade do
   * VÃO FIXO entre os consoles do lastro (dimensionado pra essa família),
   * não do módulo exato por cima, que pode divergir alguns cm do valor de
   * referência sem mudar a inclinação física do trilho.
   */
  comprimentoReferenciaMm: number;
  revisaoLastro: "novo" | "antigo";
  /** Distância mínima da extremidade BAIXA/frente do módulo até o solo, em mm (null = não aplicável). */
  distanciaMinimaSoloMm: number | null;
  /** Distância máxima da extremidade ALTA/fundo do módulo até o solo, em mm (null = não aplicável). */
  distanciaMaximaSoloMm: number | null;
  /** Balanço (cantilever do trilho além do ponto de apoio alto do lastro), em mm (null = não aplicável). */
  balancoMm: number | null;
}

export const LASTRO_COMPATIBILIDADE_MODULO: LastroCompatibilidadeModulo[] = [
  {
    familiaModulo: "550",
    dimensaoModuloReferenciaMm: "1135 × 2280 mm",
    comprimentoReferenciaMm: 2280,
    revisaoLastro: "novo",
    distanciaMinimaSoloMm: 550,
    distanciaMaximaSoloMm: 1150,
    balancoMm: 460,
  },
  {
    familiaModulo: "550",
    dimensaoModuloReferenciaMm: "1135 × 2280 mm",
    comprimentoReferenciaMm: 2280,
    revisaoLastro: "antigo",
    distanciaMinimaSoloMm: 420,
    distanciaMaximaSoloMm: 1040,
    balancoMm: 560,
  },
  {
    familiaModulo: "670",
    dimensaoModuloReferenciaMm: "1303 × 2384 mm",
    comprimentoReferenciaMm: 2384,
    revisaoLastro: "novo",
    distanciaMinimaSoloMm: 540,
    distanciaMaximaSoloMm: 1160,
    balancoMm: 515,
  },
  {
    familiaModulo: "670",
    dimensaoModuloReferenciaMm: "1303 × 2384 mm",
    comprimentoReferenciaMm: 2384,
    revisaoLastro: "antigo",
    distanciaMinimaSoloMm: null,
    distanciaMaximaSoloMm: null,
    balancoMm: null,
  },
];

/**
 * Ângulo de inclinação (tilt) FIXO que o lastro impõe ao módulo, derivado
 * geometricamente da própria diferença de altura mínima/máxima ao solo
 * que o datasheet já informa (Iteração 29 -- ver cabeçalho do arquivo:
 * este cálculo tinha sido deliberadamente adiado na Iteração 28 até haver
 * um módulo real de referência). O lastro/trilho não tem ajuste de
 * ângulo -- a inclinação nasce como consequência de o console traseiro
 * ser mais alto que o dianteiro, ao longo do vão fixo `comprimentoReferenciaMm`
 * da família: `sin(tilt) = elevação / vão`. NÃO é uma entrada do usuário
 * no modal (`SistemaSoloModal.tsx`) -- é sempre calculado a partir dos
 * dados do lastro já armazenados aqui.
 */
export function calcularTiltGrausLastro(compat: LastroCompatibilidadeModulo): number {
  if (compat.distanciaMinimaSoloMm == null || compat.distanciaMaximaSoloMm == null) {
    throw new Error(
      `Combinação família "${compat.familiaModulo}" + revisão "${compat.revisaoLastro}" não tem distâncias ao solo aplicáveis ("Não aplicável" no datasheet) -- selecione outra revisão.`
    );
  }
  const elevacaoMm = compat.distanciaMaximaSoloMm - compat.distanciaMinimaSoloMm;
  return (Math.asin(elevacaoMm / compat.comprimentoReferenciaMm) * 180) / Math.PI;
}

/**
 * Posições (mm, medidas a partir de UMA das duas bordas da fileira -- o
 * algoritmo é simétrico, então tanto faz qual) dos LASTROS ao longo de
 * uma fileira de comprimento arbitrário, seguindo o padrão descrito pelo
 * datasheet (`padrao`, ver `LastroEspacamentoFileira` acima): 1º lastro a
 * `distanciaBordaAoPrimeiroMm` de cada borda, 2º a mais
 * `distanciaDoPrimeiroAoSegundoMm` (se houver espaço), e o vão central
 * restante preenchido com espaçamento uniforme <= `distanciaRepetidaEntreDemaisMm`.
 *
 * Deliberadamente adiado na Iteração 28 até existir um contexto de
 * terreno/painel real que justificasse o algoritmo (ver cabeçalho do
 * arquivo) -- implementado agora na Iteração 29, usado por
 * `lib/sistemaSolo.ts` pra posicionar os blocos `lastro_solar` dentro de
 * cada fileira do leiaute gerado.
 */
export function calcularPosicoesLastroNaFileira(
  comprimentoFileiraMm: number,
  padrao: LastroEspacamentoFileira
): number[] {
  const L = comprimentoFileiraMm;
  if (!(L > 0)) return [];

  const { distanciaBordaAoPrimeiroMm: d0, distanciaDoPrimeiroAoSegundoMm: d1, distanciaRepetidaEntreDemaisMm: d2 } = padrao;

  // Fileira curta demais até pro par de lastros de borda (1 de cada
  // ponta) caber sem se sobrepor -- 1 único lastro central sustenta.
  if (L <= 2 * d0) return [L / 2];

  const esquerda: number[] = [d0];
  // 2º lastro de cada ponta só entra se ainda sobrar espaço (vão central
  // não-negativo) depois de colocar o par nas duas pontas.
  if (L - 2 * (d0 + d1) >= 0) {
    esquerda.push(d0 + d1);
  }
  const direita = esquerda.map((p) => L - p);

  const posicoes = new Set<number>([...esquerda, ...direita]);

  const ultimoEsquerda = esquerda[esquerda.length - 1];
  const primeiroDireita = direita[direita.length - 1];
  const vaoCentral = primeiroDireita - ultimoEsquerda;
  if (vaoCentral > d2) {
    const numeroDeVaos = Math.ceil(vaoCentral / d2);
    const passo = vaoCentral / numeroDeVaos;
    for (let i = 1; i < numeroDeVaos; i++) posicoes.add(ultimoEsquerda + passo * i);
  }

  return Array.from(posicoes).sort((a, b) => a - b);
}

/**
 * Espaçamento estrutural ENTRE lastros AO LONGO de uma mesma fileira
 * (páginas 5 e 6) -- não confundir com espaçamento ENTRE FILEIRAS
 * (anti-sombreamento), que depende do painel/ângulo solar e ainda não
 * foi modelado (ver cabeçalho do arquivo). Este é o espaçamento
 * estrutural que o próprio fabricante recomenda pra distribuir o peso/
 * resistir ao vento ao longo do trilho -- mais apertado (mais lastros)
 * em zonas de vento mais crítico.
 *
 * O padrão descrito pelo datasheet é sempre simétrico a partir das DUAS
 * pontas da fileira: `distanciaBordaAoPrimeiroMm` da borda até o 1º
 * lastro, `distanciaDoPrimeiroAoSegundoMm` do 1º ao 2º, e
 * `distanciaRepetidaEntreDemaisMm` repetindo entre os lastros
 * subsequentes até chegar perto da ponta oposta (onde o mesmo padrão se
 * repete de trás pra frente) -- o datasheet mostra isso com "..." no
 * meio do desenho, sem informar uma fórmula fechada pra fileiras de
 * comprimento arbitrário. `zonaVento` só rotula os 2 casos que o
 * datasheet efetivamente mostra -- a pág. 5 NÃO nomeia a zona/isopleta
 * (a célula de descrição do carimbo daquela folha está em branco),
 * então ela é armazenada como "padrão" só por não ter outro rótulo; a
 * pág. 6 é explicitamente rotulada "Isopleta 5" no carimbo.
 */
export interface LastroEspacamentoFileira {
  zonaVento: string;
  /** true só para a linha explicitamente rotulada "Isopleta 5" no datasheet (pág. 6). */
  isopletaExplicita: boolean;
  distanciaBordaAoPrimeiroMm: number;
  distanciaDoPrimeiroAoSegundoMm: number;
  distanciaRepetidaEntreDemaisMm: number;
}

export const LASTRO_ESPACAMENTO_FILEIRA: LastroEspacamentoFileira[] = [
  {
    zonaVento: "Padrão (isopleta não rotulada no datasheet, pág. 5)",
    isopletaExplicita: false,
    distanciaBordaAoPrimeiroMm: 500,
    distanciaDoPrimeiroAoSegundoMm: 2080,
    distanciaRepetidaEntreDemaisMm: 2880,
  },
  {
    zonaVento: "Isopleta 5 (vento mais crítico, pág. 6)",
    isopletaExplicita: true,
    distanciaBordaAoPrimeiroMm: 500,
    distanciaDoPrimeiroAoSegundoMm: 890,
    distanciaRepetidaEntreDemaisMm: 1710,
  },
];
