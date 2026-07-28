/**
 * painelFotovoltaico.ts
 * -----------------------------------------------------------------------
 * Iteração 29: usuário anexou o datasheet técnico (PDF, 2 páginas,
 * "DATASHEET IMO00171 JKM630M66HL4MBDV", código de catálogo
 * "JKM625-650N-66HL4M-BDV-Z2-EN") do módulo fotovoltaico bifacial N-type
 * "Tiger Neo 66HL4M-BDV" da Jinko Solar, com o pedido "envio o datasheet
 * do painel para voce ter referencia" -- este arquivo é o armazenamento
 * fiel desses dados, no mesmo espírito/formato de `lib/lastroSolar.ts`
 * (Iteração 28).
 *
 * O datasheet cobre uma FAIXA de 6 variantes de potência (625 a 650Wp,
 * todas com a MESMA dimensão física/mecânica -- só mudam os elétricos).
 * `PAINEL_JINKO_66HL4M_BDV` guarda o que é comum a todas (mecânico); cada
 * entrada de `PAINEL_VARIANTES_POTENCIA` guarda o elétrico específico de
 * uma potência (tanto STC quanto BNPI -- "Bifacial Nameplate Irradiance",
 * a condição de teste bifacial padrão da indústria: frente 1000W/m² +
 * verso 135W/m²).
 *
 * NOTA IMPORTANTE (transparência, ver resposta final ao usuário): as
 * dimensões físicas deste painel (2382 × 1134mm) NÃO batem com exatidão
 * com nenhuma das duas famílias de compatibilidade já cadastradas em
 * `lib/lastroSolar.ts#LASTRO_COMPATIBILIDADE_MODULO` -- a LARGURA
 * (1134mm) é quase idêntica à família "550" (1135mm), mas o COMPRIMENTO
 * (2382mm) é quase idêntico à família "670" (2384mm), não à "550"
 * (2280mm). Ou seja, este painel específico é "híbrido": não existe uma
 * família 100% correta no datasheet do lastro para ele. Como o ângulo de
 * inclinação (ver `lib/lastroSolar.ts#calcularTiltGrausLastro`) depende do
 * VÃO ENTRE OS CONSOLES do lastro -- que é fixo por família, e dimensionado
 * para o COMPRIMENTO de referência da família, não para o painel exato
 * que for instalado por cima -- a escolha mais criteriosa é casar pelo
 * COMPRIMENTO (que é a medida que define o vão/inclinação), não pela
 * largura: por isso o gerador de sistema no solo (`lib/sistemaSolo.ts`)
 * usa a família "670" como padrão sugerido, mas deixa a família
 * SELECIONÁVEL no modal (o usuário pode escolher "550" se preferir, por
 * exemplo por já ter esse lastro em estoque).
 * -----------------------------------------------------------------------
 */

/**
 * Especificação mecânica -- igual para as 6 variantes de potência (pág. 2,
 * "Mechanical Characteristics" + "Engineering Drawings").
 */
export interface PainelFotovoltaicoEspecificacaoFisica {
  fabricante: string;
  /** Nome comercial da linha (carimbo da pág. 1: "Tiger Neo"). */
  linha: string;
  modelo: string;
  /** Código de catálogo completo do datasheet (rodapé de ambas as páginas). */
  codigoDatasheet: string;
  tipoCelula: string;
  numeroCelulas: number;
  /** Comprimento (lado maior), em mm -- pág. 2, "Dimensions" (2382×1134×30mm). */
  comprimentoMm: number;
  /** Largura (lado menor), em mm. */
  larguraMm: number;
  espessuraMm: number;
  pesoKg: number;
  /** Tensão máxima de sistema (CC), em V -- pág. 2, "Application Conditions". */
  tensaoMaximaSistemaVdc: number;
  /** Corrente máxima do fusível de proteção em série, em A. */
  correnteMaximaFusivelA: number;
  /** Faixa de temperatura de operação, em °C. */
  temperaturaOperacaoMinC: number;
  temperaturaOperacaoMaxC: number;
  /** Coeficiente de temperatura da potência máxima, %/°C (negativo = perde potência com calor). */
  coeficienteTemperaturaPmaxPctPorC: number;
  coeficienteTemperaturaVocPctPorC: number;
  coeficienteTemperaturaIscPctPorC: number;
  /** Coeficientes de bifacialidade (ganho do lado traseiro em relação à frente), em % -- pág. 2, "Bifaciality Coefficents". */
  bifacialidadeVocPct: number;
  bifacialidadeIscPct: number;
  bifacialidadePmaxPct: number;
  /**
   * Posições dos pontos de fixação/clamp ao longo do lado maior (2382mm),
   * medidas a partir de uma extremidade, em mm -- pág. 2, "Engineering
   * Drawings" (1400±1 / 790±1 / 400±1mm). Armazenado só por fidelidade ao
   * datasheet (não usado nos cálculos de leiaute do gerador de sistema no
   * solo, que trabalha com a dimensão externa do painel, não a posição
   * exata dos furos de fixação do trilho).
   */
  posicoesFixacaoMm: number[];
}

export const PAINEL_JINKO_66HL4M_BDV: PainelFotovoltaicoEspecificacaoFisica = {
  fabricante: "Jinko Solar",
  linha: "Tiger Neo",
  modelo: "66HL4M-BDV",
  codigoDatasheet: "JKM625-650N-66HL4M-BDV-Z2-EN",
  tipoCelula: "N-type Mono-crystalline (TOPCon)",
  numeroCelulas: 132,
  comprimentoMm: 2382,
  larguraMm: 1134,
  espessuraMm: 30,
  pesoKg: 32.4,
  tensaoMaximaSistemaVdc: 1500,
  correnteMaximaFusivelA: 35,
  temperaturaOperacaoMinC: -40,
  temperaturaOperacaoMaxC: 70,
  coeficienteTemperaturaPmaxPctPorC: -0.29,
  coeficienteTemperaturaVocPctPorC: -0.25,
  coeficienteTemperaturaIscPctPorC: 0.045,
  bifacialidadeVocPct: 98,
  bifacialidadeIscPct: 80,
  bifacialidadePmaxPct: 80,
  posicoesFixacaoMm: [400, 790, 1400],
};

/**
 * Elétrico de cada uma das 6 variantes de potência (pág. 2,
 * "Specifications (STC)" + "Specifications (BNPI)"). STC = Standard Test
 * Conditions (irradiância 1000W/m², célula 25°C, AM1.5) -- só a face
 * frontal. BNPI = Bifacial Nameplate Irradiance (frente 1000W/m² + verso
 * 135W/m²) -- inclui o ganho bifacial, por isso os números são maiores.
 */
export interface PainelFotovoltaicoVariantePotencia {
  potenciaWp: number;
  vmpV: number;
  impA: number;
  vocV: number;
  iscA: number;
  eficienciaPct: number;
  bnpi: {
    potenciaWp: number;
    vmpV: number;
    impA: number;
    vocV: number;
    iscA: number;
  };
}

export const PAINEL_VARIANTES_POTENCIA: PainelFotovoltaicoVariantePotencia[] = [
  { potenciaWp: 625, vmpV: 40.88, impA: 15.29, vocV: 49.28, iscA: 16.14, eficienciaPct: 23.14, bnpi: { potenciaWp: 690, vmpV: 40.88, impA: 16.88, vocV: 49.26, iscA: 17.83 } },
  { potenciaWp: 630, vmpV: 41.02, impA: 15.36, vocV: 49.48, iscA: 16.20, eficienciaPct: 23.32, bnpi: { potenciaWp: 696, vmpV: 41.04, impA: 16.95, vocV: 49.46, iscA: 17.90 } },
  { potenciaWp: 635, vmpV: 41.16, impA: 15.43, vocV: 49.68, iscA: 16.26, eficienciaPct: 23.51, bnpi: { potenciaWp: 701, vmpV: 41.17, impA: 17.03, vocV: 49.66, iscA: 17.96 } },
  { potenciaWp: 640, vmpV: 41.30, impA: 15.50, vocV: 49.88, iscA: 16.32, eficienciaPct: 23.69, bnpi: { potenciaWp: 707, vmpV: 41.33, impA: 17.10, vocV: 49.86, iscA: 18.03 } },
  { potenciaWp: 645, vmpV: 41.44, impA: 15.57, vocV: 50.08, iscA: 16.38, eficienciaPct: 23.88, bnpi: { potenciaWp: 712, vmpV: 41.46, impA: 17.17, vocV: 50.06, iscA: 18.09 } },
  { potenciaWp: 650, vmpV: 41.58, impA: 15.64, vocV: 50.28, iscA: 16.44, eficienciaPct: 24.06, bnpi: { potenciaWp: 717, vmpV: 41.59, impA: 17.24, vocV: 50.26, iscA: 18.15 } },
];

/** Busca uma variante de potência pelo valor nominal (Wp) em STC -- devolve `undefined` se não houver exata (as 6 variantes do datasheet são fixas, sem interpolação). */
export function buscarVariantePotencia(potenciaWp: number): PainelFotovoltaicoVariantePotencia | undefined {
  return PAINEL_VARIANTES_POTENCIA.find((v) => v.potenciaWp === potenciaWp);
}
