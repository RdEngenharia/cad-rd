/**
 * sistemaSolo.ts
 * -----------------------------------------------------------------------
 * Iteração 29 -- gerador do "dimensionar sistema fotovoltaico no solo"
 * pedido pelo usuário: dado o tamanho de um terreno retangular + qual
 * lado dele aponta pro norte + a orientação do módulo (retrato/paisagem),
 * calcula e desenha em 2D quantas fileiras/módulos cabem, respeitando o
 * afastamento anti-sombreamento entre fileiras. Função pura (mesmo
 * princípio arquitetural de `lib/diagramaFv.ts`): só calcula e devolve
 * geometria + um resumo, sem depender de Zustand/React/Konva. Quem
 * insere de fato no projeto é `store.ts#gerarSistemaSolo`.
 *
 * Iteração 29b -- REVISÃO a pedido do usuário, 2 correções importantes
 * sobre a 1ª entrega desta mesma feature:
 *
 *  a) MÓDULO GENÉRICO, NÃO MAIS TRAVADO NO PAINEL JINKO: "sobre os
 *     modulos nao conseguimos determinar um especifico, pois existem
 *     diversas marcas no mercado, o tamanho do modelo precisa ser
 *     editavel". A 1ª versão desta feature calculava tudo em cima das 6
 *     variantes fixas do datasheet Jinko (`painelFotovoltaico.ts`) -- isso
 *     foi substituído por 3 campos livres (`comprimentoModuloMm`/
 *     `larguraModuloMm`/`potenciaModuloWp`), que o modal ainda pré-
 *     preenche com os números do painel Jinko como sugestão/exemplo, mas
 *     100% editáveis pra qualquer marca/modelo. `painelFotovoltaico.ts`
 *     continua existindo como referência/fonte da sugestão, mas este
 *     arquivo não importa mais nada de lá.
 *
 *  b) BUG REAL CORRIGIDO -- ALTURA DA ESTRUTURA IGNORADA NO AFASTAMENTO:
 *     "sobre o afastamento voce considerol a altura da caixa fortlev? se
 *     por ventura usar uma estrutura diferente preciso do campo de
 *     digitar a altura da estrutura da parte mais alta pois isso
 *     enfluencia a sombra na fileira de tras". Resposta honesta: NÃO, a
 *     1ª versão não considerava -- a fórmula usada
 *     (`L·sin(β)/tan(α)`) calculava a sombra a partir do GANHO de altura
 *     do módulo (frente→fundo), como se a borda frontal/baixa estivesse
 *     encostada no chão (altura zero). Só que o lastro Fortlev already
 *     ELEVA a borda baixa do chão (~540-550mm, "distância mínima ao
 *     solo") -- a altura de verdade do ponto mais alto da estrutura
 *     (o que de fato projeta a sombra) é essa elevação de base MAIS o
 *     ganho da inclinação, não só o ganho sozinho. Isso subestimava o
 *     afastamento necessário (fileiras mais próximas do que deveriam,
 *     risco real de sombreamento). Corrigido: a fórmula agora usa
 *     diretamente `alturaMaximaEstruturaMm` (a altura do ponto mais alto
 *     da estrutura acima do solo -- exatamente o que o usuário pediu),
 *     em vez de tentar derivar essa altura só do ganho geométrico do
 *     módulo. Esse campo agora é uma ENTRADA do modal (sugerida a partir
 *     do lastro Fortlev selecionado, mas editável -- pra quando "uma
 *     estrutura diferente" for usada). Ver `calcularAfastamentoEntreFileirasMm`
 *     abaixo para a dedução geométrica completa em comentário.
 *
 * Iteração 29c -- pedido do usuário após simular o leiaute manualmente:
 * "no caso das caixas tambem preciso saber a distancia entre uma caixa e
 * outra, porque colocar os modulos é mais fácil, consegue a opcao de criar
 * dois diagramas ao mesmo tempo? um so com as caixas e cotas de
 * distanciamento e outro do lado com tudo?". Duas mudanças:
 *
 *  a) COTAS (CotaGeometria, `lib/types.ts`) agora são geradas
 *     automaticamente: (i) o afastamento ENTRE FILEIRAS (`pitchMm`),
 *     cotado uma única vez entre a 1ª e a 2ª fileira (é constante entre
 *     todas, então cotar todas seria poluição visual -- convenção de
 *     desenho técnico é anotar 1 ocorrência com "(TYP.)" quando o valor se
 *     repete); (ii) o espaçamento ENTRE LASTROS ao longo de uma fileira
 *     (`calcularPosicoesLastroNaFileira`), cotado (o vão LIVRE entre uma
 *     caixa e a próxima, não centro-a-centro) só na 1ª fileira, pelo mesmo
 *     motivo -- o padrão é sempre o mesmo em toda fileira (datasheet
 *     Fortlev, `lib/lastroSolar.ts`). Ambas marcadas explicitamente como
 *     "(TYP.)" no texto pra não sugerir que só a 1ª fileira/vão tem essa
 *     medida.
 *
 *  b) 2º DIAGRAMA opcional (`gerarDiagramaLastros`, default true): quando
 *     ativo, desenha uma 2ª cópia do terreno + lastros + cotas + seta norte
 *     (SEM módulos) deslocada ao lado do diagrama principal -- o usuário
 *     explicou que posicionar os MÓDULOS é fácil visualmente (encostam uns
 *     nos outros), mas as CAIXAS de lastro precisam de cotas explícitas
 *     pra implantação em campo, e um diagrama dedicado (sem a "poluição"
 *     visual dos módulos por cima) deixa essas cotas mais legíveis pra
 *     quem for medir/instalar no terreno.
 *
 * PREMISSAS/DECISÕES DE PRODUTO (a comunicar com transparência ao usuário
 * na resposta final, não são "mágica escondida"):
 *
 *  1) SOLSTÍCIO CRÍTICO: o pedido original do usuário citou "sousticio de
 *     verão" como base do cálculo de afastamento -- astronomicamente,
 *     essa é a base ERRADA (no solstício de verão o sol fica MAIS alto
 *     no céu ao meio-dia, gerando a sombra MAIS CURTA do ano; o pior caso
 *     de sombreamento -- sombra mais comprida -- acontece no solstício de
 *     INVERNO do hemisfério do local). Este módulo aplica sempre o
 *     inverno astronômico (ver `calcularAnguloSolarCritico`), que é a
 *     única base que garante ausência de sombra o ano INTEIRO (inclusive
 *     no próprio verão) -- exatamente o resultado que o pedido original
 *     queria ("nao gerar sombra"), só corrigindo qual data extrema usar.
 *
 *  2) ÂNGULO DE INCLINAÇÃO E ALTURA MÁXIMA DA ESTRUTURA: agora são
 *     ENTRADAS diretas e editáveis (`tiltGraus`/`alturaMaximaEstruturaMm`
 *     em `DadosSistemaSolo`) -- o modal sugere valores calculados a
 *     partir do lastro Fortlev selecionado (`lib/lastroSolar.ts`), mas o
 *     usuário pode sobrescrever os dois pra usar uma estrutura diferente
 *     (outro fabricante, rack fixo com outra altura, etc.). O BLOCO
 *     desenhado continua sendo sempre o símbolo `lastro_solar` (Fortlev,
 *     ver `blocks.ts`) -- se o usuário usar de fato outra estrutura, o
 *     símbolo no desenho não vai bater visualmente com o hardware real,
 *     só o CÁLCULO de afastamento/quantidade vai refletir os valores
 *     digitados. Ver premissa 6 abaixo.
 *
 *  3) LASTRO/ISOPLETA continuam Fortlev-específicos: o espaçamento
 *     estrutural ENTRE LASTROS ao longo de uma fileira (distinto do
 *     afastamento ENTRE FILEIRAS) ainda vem de `LASTRO_ESPACAMENTO_FILEIRA`
 *     (Fortlev) -- não foi generalizado nesta revisão porque o pedido do
 *     usuário foi especificamente sobre módulo genérico + altura da
 *     estrutura, não sobre trocar o fabricante do lastro em si.
 *
 *  4) LATITUDE: campo novo no modal, não pedido explicitamente pelo
 *     usuário, mas estruturalmente indispensável -- o afastamento
 *     anti-sombreamento depende da altura do sol no local, que depende
 *     da latitude. Sem esse dado não existe fórmula de afastamento
 *     nenhuma que funcione.
 *
 *  5) MARGEM DO TERRENO: recuo aplicado igualmente nas 4 bordas do
 *     retângulo do terreno antes de começar a preencher com
 *     fileiras/módulos -- simplificação (na vida real, recuos de divisa/
 *     servidão podem variar por lado e por norma municipal); o modal
 *     sugere um valor padrão, mas é sempre editável.
 *
 *  6) SEM SUBSTITUIR ENGENHARIA ESTRUTURAL: assim como o restante do app
 *     nunca sugere disjuntor/bitola por conta própria (ver
 *     `lib/diagramaFv.ts`), este leiaute é preliminar/informativo -- não
 *     substitui um projeto estrutural assinado por engenheiro responsável
 *     (fundação, ancoragem, carga de vento real do local).
 * -----------------------------------------------------------------------
 */
import type { NovaGeometria, HachuraConfig } from "./types";
import { LASTRO_FORTLEV_SOLAR, LASTRO_ESPACAMENTO_FILEIRA, calcularPosicoesLastroNaFileira } from "./lastroSolar";

export const CAMADA_TERRENO = "TERRENO";
export const CAMADA_MODULOS_FV = "MODULOS_FV";
export const CAMADA_LASTROS = "LASTROS";
export const CAMADA_ANOTACOES_SOLO = "ANOTACOES_SOLO";
/** Iteração 29c: camada própria pras cotas de espaçamento (entre lastros e entre fileiras), separada de `CAMADA_ANOTACOES_SOLO` pra o usuário poder ligar/desligar a visibilidade das cotas independente da seta de norte/textos-resumo. */
export const CAMADA_COTAS_SOLO = "COTAS_SOLO";

/** Iteração 29h: valor de `GeometriaBase.origemGeradorId` marcado em toda geometria produzida por este gerador -- ver comentário no fim de `gerarLeiauteSistemaSolo` e em `store.ts#gerarSistemaSolo`. */
export const ORIGEM_GERADOR_SISTEMA_SOLO = "sistemaSolo";

/** Folga mecânica constante entre módulos adjacentes numa mesma fileira, em mm -- valor típico de instalação, não editável no modal (ver premissa 5, cabeçalho do arquivo, sobre o espírito de constantes fixas documentadas). */
const GAP_ENTRE_MODULOS_MM = 20;

/** Trava de segurança: acima disso, o leiaute provavelmente indica um terreno grande demais para esta ferramenta (ou parâmetros incoerentes gerando milhares de elementos) -- evita travar o navegador. */
const MAX_ELEMENTOS_LEIAUTE = 3000;

export type LadoNorte = "superior" | "inferior" | "esquerda" | "direita";
export type OrientacaoModulo = "retrato" | "paisagem";

export interface DadosSistemaSolo {
  /** Extensão do terreno no eixo X do desenho, em mm. */
  larguraTerrenoMm: number;
  /** Extensão do terreno no eixo Y do desenho, em mm. */
  profundidadeTerrenoMm: number;
  /** Recuo aplicado igualmente nas 4 bordas do terreno, em mm. */
  margemMm: number;
  /** Qual lado do RETÂNGULO do terreno está voltado para o norte geográfico. */
  ladoNorte: LadoNorte;
  orientacaoModulo: OrientacaoModulo;
  /** Graus decimais; negativo = hemisfério sul (convenção padrão). */
  latitudeGraus: number;
  /** Lado MAIOR do módulo (mm) -- qualquer marca/modelo, editável no modal. */
  comprimentoModuloMm: number;
  /** Lado MENOR do módulo (mm). */
  larguraModuloMm: number;
  /** Potência do módulo (Wp), só usada pro cálculo de potência total. */
  potenciaModuloWp: number;
  /** Rótulo livre opcional (marca/modelo), só usado no texto-resumo. */
  rotuloModulo?: string;
  /**
   * Ângulo de inclinação do módulo em graus (β da fórmula de afastamento
   * abaixo) -- entrada direta e editável (o modal sugere o valor derivado
   * do lastro Fortlev selecionado, mas o usuário pode digitar outro se
   * usar uma estrutura diferente).
   */
  tiltGraus: number;
  /**
   * Altura (mm) do ponto mais alto da estrutura acima do solo -- é essa
   * altura, não o ganho de inclinação do módulo sozinho, que determina o
   * comprimento da sombra projetada sobre a fileira de trás (ver dedução
   * completa em `calcularAfastamentoEntreFileirasMm`). O modal sugere a
   * "distância máxima ao solo" do lastro Fortlev selecionado, mas o campo
   * é livre pra qualquer estrutura.
   */
  alturaMaximaEstruturaMm: number;
  /** true = usa a linha "Isopleta 5" (vento mais crítico); false = a linha "Padrão". */
  isopletaExplicita: boolean;
  /**
   * Iteração 29c: quando true (padrão), gera um 2º diagrama deslocado ao
   * lado do principal contendo só terreno + lastros + cotas de
   * espaçamento + seta norte (SEM módulos) -- pedido do usuário pra
   * facilitar a implantação em campo das caixas de lastro (ver premissa no
   * cabeçalho do arquivo).
   */
  gerarDiagramaLastros: boolean;
}

export interface ResumoSistemaSolo {
  numeroFileiras: number;
  modulosPorFileira: number;
  totalModulos: number;
  potenciaTotalKwp: number;
  afastamentoEntreFileirasMm: number;
  anguloInclinacaoGraus: number;
  alturaMaximaEstruturaMm: number;
  anguloSolarCriticoGraus: number;
  declinacaoCriticaGraus: number;
  isopletaUsada: string;
  orientacaoModulo: OrientacaoModulo;
  larguraEfetivaModuloMm: number;
  comprimentoEfetivoModuloMm: number;
  /** Iteração 29c: se o 2º diagrama (só lastros + cotas) foi de fato gerado. */
  diagramaLastrosGerado: boolean;
}

export interface ResultadoSistemaSolo {
  geometria: NovaGeometria[];
  resumo: ResumoSistemaSolo;
}

/**
 * Altura solar de meio-dia (graus) no dia mais crítico do ano p/ aquela
 * latitude, e a declinação usada pra chegar nela -- ver premissa 1 no
 * cabeçalho do arquivo (sempre o INVERNO astronômico do hemisfério do
 * local, nunca o verão).
 */
function calcularAnguloSolarCritico(latitudeGraus: number): { anguloSolarGraus: number; declinacaoCriticaGraus: number } {
  const declinacaoCriticaGraus = latitudeGraus >= 0 ? -23.45 : 23.45;
  const anguloSolarGraus = 90 - Math.abs(latitudeGraus - declinacaoCriticaGraus);
  return { anguloSolarGraus, declinacaoCriticaGraus };
}

/**
 * Afastamento (pitch) entre a borda frontal/baixa de uma fileira e a da
 * próxima, ao longo do eixo norte-sul, em mm.
 *
 * DEDUÇÃO (corrigida na Iteração 29b -- ver cabeçalho do arquivo): no
 * corte transversal da fileira, a borda frontal/baixa fica na origem
 * (x=0) e a borda traseira/alta fica em `x = L·cos(β)`, na altura
 * `alturaMaximaEstruturaMm` acima do solo (`L` = comprimento do módulo no
 * sentido do caimento, `β` = inclinação). Um ponto a uma altura `H` acima
 * do solo projeta sombra até `H/tan(α)` HORIZONTALMENTE ALÉM da sua
 * própria posição (`α` = altura solar crítica) -- e como a borda
 * traseira/alta é ao mesmo tempo o ponto mais alto E o mais ao sul da
 * fileira, é ela que sempre projeta a sombra mais comprida (nenhum outro
 * ponto da fileira projeta mais longe). Logo, a ponta da sombra cai a
 * `L·cos(β) + alturaMaximaEstruturaMm/tan(α)` da borda frontal -- essa
 * distância é o afastamento mínimo pra fileira de trás não ficar
 * sombreada. Note que a altura da borda FRONTAL (onde a estrutura toca
 * o solo, ex.: a "distância mínima ao solo" do lastro) NÃO aparece na
 * fórmula -- só a altura do ponto mais alto importa pra esse cálculo,
 * exatamente como o usuário observou ao perguntar sobre a altura da
 * caixa Fortlev.
 */
export function calcularAfastamentoEntreFileirasMm(
  latitudeGraus: number,
  comprimentoModuloMm: number,
  tiltGraus: number,
  alturaMaximaEstruturaMm: number
): { pitchMm: number; anguloSolarGraus: number; declinacaoCriticaGraus: number } {
  const { anguloSolarGraus, declinacaoCriticaGraus } = calcularAnguloSolarCritico(latitudeGraus);
  if (anguloSolarGraus <= 0) {
    throw new Error(
      `Latitude ${latitudeGraus}° é extrema demais para esta fórmula simplificada (altura solar crítica calculada: ${anguloSolarGraus.toFixed(
        1
      )}°) -- este gerador não cobre sites em latitudes polares.`
    );
  }
  const tiltRad = (tiltGraus * Math.PI) / 180;
  const solarRad = (anguloSolarGraus * Math.PI) / 180;
  const pitchMm = comprimentoModuloMm * Math.cos(tiltRad) + alturaMaximaEstruturaMm / Math.tan(solarRad);
  return { pitchMm, anguloSolarGraus, declinacaoCriticaGraus };
}

/**
 * Mapeamento do "espaço local de fileira" (u = ao longo da fileira, a
 * partir de uma borda; v = a partir da borda NORTE, crescendo em direção
 * ao sul) pras coordenadas reais (x,y) do desenho, conforme qual lado do
 * terreno foi apontado como norte -- e o ângulo de rotação que cada bloco/
 * módulo precisa pra sua face "de frente para o sol" (ver convenção de
 * orientação documentada em `blocks.ts#lastro_solar`) apontar fisicamente
 * pro norte escolhido. Só 4 casos discretos (0°/90°/180°/270°), nunca
 * rotação livre -- por isso um retângulo em espaço (u,v) sempre vira um
 * retângulo eixo-alinhado em (x,y), sem precisar de geometria rotacionada
 * de verdade.
 */
interface EixosTerreno {
  rotacaoGraus: number;
  paraMundo: (u: number, v: number) => { x: number; y: number };
  direcaoNorte: { x: number; y: number };
}

function calcularEixosTerreno(
  ladoNorte: LadoNorte,
  larguraTerrenoMm: number,
  profundidadeTerrenoMm: number,
  margemMm: number
): EixosTerreno {
  const xMin = margemMm;
  const xMax = larguraTerrenoMm - margemMm;
  const yMin = margemMm;
  const yMax = profundidadeTerrenoMm - margemMm;

  switch (ladoNorte) {
    case "inferior":
      return { rotacaoGraus: 0, paraMundo: (u, v) => ({ x: xMin + u, y: yMax - v }), direcaoNorte: { x: 0, y: 1 } };
    case "superior":
      return { rotacaoGraus: 180, paraMundo: (u, v) => ({ x: xMin + u, y: yMin + v }), direcaoNorte: { x: 0, y: -1 } };
    case "direita":
      return { rotacaoGraus: 270, paraMundo: (u, v) => ({ x: xMax - v, y: yMin + u }), direcaoNorte: { x: 1, y: 0 } };
    case "esquerda":
      return { rotacaoGraus: 90, paraMundo: (u, v) => ({ x: xMin + v, y: yMin + u }), direcaoNorte: { x: -1, y: 0 } };
  }
}

/**
 * Translada uma geometria já pronta por (dx,dy) -- usado (Iteração 29c)
 * pra duplicar o conjunto "terreno + lastros + cotas + seta norte" (ver
 * `elementosLastroCota` em `gerarLeiauteSistemaSolo`) deslocado ao lado do
 * diagrama principal, sem precisar reimplementar o algoritmo de leiaute
 * uma 2ª vez. Cobre todos os tipos que este gerador de fato produz
 * (retângulo/bloco/texto/linha/cota/polígono); os demais tipos de
 * `TipoGeometria` (polilinha, arco, círculo, viewport) nunca são gerados
 * por este arquivo, então caem no `default` (devolvidos sem alteração) só
 * por exaustividade do `switch`, não por uso real esperado aqui.
 */
function transladarGeometria(g: NovaGeometria, dx: number, dy: number): NovaGeometria {
  switch (g.tipo) {
    case "retangulo":
    case "bloco":
    case "circulo":
    case "arco":
    case "texto":
      return { ...g, x: g.x + dx, y: g.y + dy };
    case "linha":
      return { ...g, x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy };
    case "cota":
      return {
        ...g,
        x1: g.x1 + dx,
        y1: g.y1 + dy,
        x2: g.x2 + dx,
        y2: g.y2 + dy,
        px: g.px + dx,
        py: g.py + dy,
      };
    case "poligono":
      return { ...g, pontos: g.pontos.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    default:
      return g;
  }
}

/**
 * Monta o leiaute completo: contorno do terreno, fileiras de módulos
 * (retângulos simples, camada `MODULOS_FV`) + lastros (bloco
 * `lastro_solar`, camada `LASTROS`) em cada fileira, seta indicando o
 * norte e um texto-resumo. Lança `Error` (com mensagem em pt-BR, pronta
 * pra mostrar ao usuário) se os parâmetros não permitirem NENHUMA fileira/
 * módulo.
 */
export function gerarLeiauteSistemaSolo(dados: DadosSistemaSolo): ResultadoSistemaSolo {
  const {
    larguraTerrenoMm,
    profundidadeTerrenoMm,
    margemMm,
    ladoNorte,
    orientacaoModulo,
    latitudeGraus,
    comprimentoModuloMm,
    larguraModuloMm,
    potenciaModuloWp,
    rotuloModulo,
    tiltGraus,
    alturaMaximaEstruturaMm,
    isopletaExplicita,
    gerarDiagramaLastros,
  } = dados;

  if (margemMm * 2 >= larguraTerrenoMm || margemMm * 2 >= profundidadeTerrenoMm) {
    throw new Error("A margem informada é grande demais para as dimensões do terreno -- não sobra área útil.");
  }
  if (!(comprimentoModuloMm > 0) || !(larguraModuloMm > 0)) {
    throw new Error("Informe as dimensões do módulo (comprimento e largura), maiores que zero.");
  }
  if (!(potenciaModuloWp > 0)) {
    throw new Error("Informe a potência do módulo (Wp), maior que zero.");
  }
  if (!(tiltGraus > 0 && tiltGraus < 90)) {
    throw new Error("Ângulo de inclinação inválido -- precisa estar entre 0° e 90°.");
  }
  if (!(alturaMaximaEstruturaMm > 0)) {
    throw new Error("Informe a altura do ponto mais alto da estrutura acima do solo, maior que zero.");
  }

  const comprimentoEfetivoMm = orientacaoModulo === "retrato" ? comprimentoModuloMm : larguraModuloMm;
  const larguraEfetivaMm = orientacaoModulo === "retrato" ? larguraModuloMm : comprimentoModuloMm;

  const espacamento =
    LASTRO_ESPACAMENTO_FILEIRA.find((e) => e.isopletaExplicita === isopletaExplicita) ?? LASTRO_ESPACAMENTO_FILEIRA[1];

  const { pitchMm, anguloSolarGraus, declinacaoCriticaGraus } = calcularAfastamentoEntreFileirasMm(
    latitudeGraus,
    comprimentoEfetivoMm,
    tiltGraus,
    alturaMaximaEstruturaMm
  );

  const eixos = calcularEixosTerreno(ladoNorte, larguraTerrenoMm, profundidadeTerrenoMm, margemMm);

  const ehEixoVertical = ladoNorte === "superior" || ladoNorte === "inferior";
  const compEixoNS = ehEixoVertical ? profundidadeTerrenoMm - 2 * margemMm : larguraTerrenoMm - 2 * margemMm;
  const compAoLongoFileira = ehEixoVertical ? larguraTerrenoMm - 2 * margemMm : profundidadeTerrenoMm - 2 * margemMm;

  const tiltRad = (tiltGraus * Math.PI) / 180;
  const footprintNSModuloMm = comprimentoEfetivoMm * Math.cos(tiltRad);

  const numeroFileiras = compEixoNS >= footprintNSModuloMm ? Math.floor((compEixoNS - footprintNSModuloMm) / pitchMm) + 1 : 0;
  const modulosPorFileira = Math.max(
    0,
    Math.floor((compAoLongoFileira + GAP_ENTRE_MODULOS_MM) / (larguraEfetivaMm + GAP_ENTRE_MODULOS_MM))
  );

  if (numeroFileiras <= 0) {
    throw new Error(
      `O terreno não tem profundidade suficiente no eixo norte-sul para nem 1 fileira: precisa de pelo menos ${(
        footprintNSModuloMm / 1000
      ).toFixed(2)}m de área útil nesse eixo, e sobrou só ${(compEixoNS / 1000).toFixed(2)}m.`
    );
  }
  if (modulosPorFileira <= 0) {
    throw new Error(
      `O terreno não tem largura suficiente ao longo da fileira para nem 1 módulo: precisa de pelo menos ${(
        larguraEfetivaMm / 1000
      ).toFixed(2)}m de área útil nesse eixo, e sobrou só ${(compAoLongoFileira / 1000).toFixed(2)}m.`
    );
  }

  const posicoesLastroPorFileira = calcularPosicoesLastroNaFileira(compAoLongoFileira, espacamento);
  const totalElementosEstimado = numeroFileiras * (modulosPorFileira + posicoesLastroPorFileira.length);
  if (totalElementosEstimado > MAX_ELEMENTOS_LEIAUTE) {
    throw new Error(
      `Esse terreno geraria ~${totalElementosEstimado} elementos (${numeroFileiras} fileiras × ${modulosPorFileira} módulos, + lastros) -- acima do limite de segurança (${MAX_ELEMENTOS_LEIAUTE}) para não travar o navegador. Reduza o terreno ou aumente a margem.`
    );
  }

  const geometria: NovaGeometria[] = [];
  // Iteração 29c: acumula só os elementos que também vão pro 2º diagrama
  // opcional (terreno + lastros + cotas + seta norte -- SEM módulos, ver
  // premissa "b" no cabeçalho do arquivo). Guarda as MESMAS referências
  // (nunca mutadas depois), então empurrar aqui é seguro/barato.
  const elementosLastroCota: NovaGeometria[] = [];
  const empurrarCompartilhado = (g: NovaGeometria) => {
    geometria.push(g);
    elementosLastroCota.push(g);
  };

  // Contorno do terreno + área útil (após a margem) -- ambos tracejados,
  // pra distinguir visualmente da própria geometria do arranjo FV.
  empurrarCompartilhado({
    tipo: "retangulo",
    camada: CAMADA_TERRENO,
    x: 0,
    y: 0,
    largura: larguraTerrenoMm,
    altura: profundidadeTerrenoMm,
    tracejado: true,
  });
  if (margemMm > 0) {
    empurrarCompartilhado({
      tipo: "retangulo",
      camada: CAMADA_TERRENO,
      x: margemMm,
      y: margemMm,
      largura: larguraTerrenoMm - 2 * margemMm,
      altura: profundidadeTerrenoMm - 2 * margemMm,
      tracejado: true,
    });
  }

  const hachuraModulo: HachuraConfig = { tipo: "ANSI31_DIAGONAL", escala: 0.6, cor: "#1d4ed8" };

  for (let i = 0; i < numeroFileiras; i++) {
    const vFrente = i * pitchMm;

    for (const u of posicoesLastroPorFileira) {
      const centro = eixos.paraMundo(u, vFrente + LASTRO_FORTLEV_SOLAR.profundidadeMm / 2);
      empurrarCompartilhado({
        tipo: "bloco",
        camada: CAMADA_LASTROS,
        nome: "lastro_solar",
        x: centro.x,
        y: centro.y,
        rotacao: eixos.rotacaoGraus,
      });
    }

    for (let j = 0; j < modulosPorFileira; j++) {
      const uInicio = j * (larguraEfetivaMm + GAP_ENTRE_MODULOS_MM);
      const p1 = eixos.paraMundo(uInicio, vFrente);
      const p2 = eixos.paraMundo(uInicio + larguraEfetivaMm, vFrente + footprintNSModuloMm);
      geometria.push({
        tipo: "retangulo",
        camada: CAMADA_MODULOS_FV,
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        largura: Math.abs(p2.x - p1.x),
        altura: Math.abs(p2.y - p1.y),
        hachura: hachuraModulo,
      });
    }
  }

  // Iteração 29c/29d: `fontSize` movido pra ANTES do bloco de cotas
  // (calculado aqui em vez de só lá na seta do norte, mais abaixo) porque
  // a anotação explicativa das cotas também precisa desse tamanho
  // PROPORCIONAL AO TERRENO.
  const fontSize = Math.max(200, Math.min(larguraTerrenoMm, profundidadeTerrenoMm) * 0.03);

  // Cotas de espaçamento (Iteração 29c) -----------------------------------
  // Pedido do usuário: "no caso das caixas tambem preciso saber a
  // distancia entre uma caixa e outra". Convenção de desenho técnico:
  // como o afastamento entre fileiras é CONSTANTE e o padrão de
  // espaçamento entre lastros se REPETE em toda fileira (mesmo datasheet
  // Fortlev pra todas), cota-se só 1 ocorrência de cada, com uma ÚNICA
  // anotação de texto (não repetida em cada cota) explicando o "(TYP.)" --
  // cotar/anotar TODAS as fileiras/vãos seria redundante e poluiria o
  // desenho.
  //
  // Iteração 29d -- BUG CORRIGIDO a pedido do usuário ("quando mudo para
  // A4 uma prancha A1, nao conseguimos ler as cotas, preciso que o texto
  // desse cad sejam visualizados em tamanho maior igual o diagrama
  // unifilar"): o renderizador de COTA (`pdfExport.ts`/`dxfExport.ts`) usa
  // um tamanho de fonte FIXO (9pt no PDF, 3mm no DXF) quando a cota não
  // traz seu próprio `fontSize` -- um valor calibrado pros diagramas
  // elétricos (poucos metros de extensão), não pra um terreno de dezenas
  // de metros. Como o Viewport precisa reduzir MUITO a escala pra caber
  // um terreno desse tamanho numa folha (`escalaGeom` bem menor que 1, ver
  // `desenharViewportPdf`), esse "9pt fixo" acaba renderizando praticamente
  // ilegível -- e piora ainda mais depois do ajuste A1→A4 (que reduz a
  // folha inteira mais uma vez). Corrigido dando a cada cota gerada aqui
  // seu PRÓPRIO `fontSize`. Escolhido proporcional ao tamanho FÍSICO do
  // lastro (`LASTRO_FORTLEV_SOLAR.larguraMm`, sempre ~600mm, INDEPENDENTE
  // do tamanho do terreno) -- não ao terreno inteiro (`fontSize` acima):
  // as cotas medem vãos na escala do LASTRO (centenas a poucos milhares de
  // mm), então um tamanho de fonte proporcional ao terreno inteiro (que
  // pode ter dezenas de metros) ficaria desproporcional/sobreposto nos
  // vãos mais curtos -- o mesmo problema de escala do bug original, só
  // que no sentido contrário (grande demais em vez de pequeno demais).
  //
  // Iteração 29e -- usuário revisou o PDF corrigido na 29d e pediu mais 2
  // ajustes de legibilidade: "ainda está pequeno, se voce duplicar o zoom
  // e deixar todo texto maiusculo vai melhorar". `fontSizeCota` DOBRADO
  // (120/0.3 -> 240/0.6) e todo texto deste gerador (cotas, títulos, nota,
  // resumo) passa por `.toUpperCase()` antes de virar geometria -- convenção
  // real de desenho técnico/ABNT (texto todo em caixa alta), não só
  // preferência estética.
  const fontSizeCota = Math.max(240, LASTRO_FORTLEV_SOLAR.larguraMm * 0.6);
  // Iteração 29e -- BUG CORRIGIDO (achado ao testar o próprio dobro de
  // fontSize pedido pelo usuário): os deslocamentos (v negativo) de cada
  // "faixa" de anotação acima da fileira 0 (linhas de cota, nota do vão de
  // módulo, nota "(TYP.)", título/legenda) eram baseados em `offsetCotaMm`
  // (derivado do TERRENO, não do texto) -- com o `fontSizeCota` dobrado,
  // o texto de uma faixa passou a ser mais ALTO que a distância até a
  // próxima faixa, sobrepondo tudo numa bagunça ilegível. Corrigido: o
  // passo entre faixas agora é derivado do próprio `fontSizeCota` (a maior
  // fonte dessa região), com folga generosa (1.6x) -- garante não-
  // sobreposição não importa o tamanho do terreno.
  const passoAnotacaoMm = fontSizeCota * 1.6;
  const vLinhasCota = -passoAnotacaoMm; // linha de cota do vão entre LASTROS e seu rótulo
  // Iteração 29e -- bug descoberto na verificação visual (não reportado
  // pelo usuário): a cota do vão entre MÓDULOS ficava na MESMA faixa
  // `vLinhasCota` da cota do vão entre lastros. Como o rótulo do PDF é
  // sempre alinhado à ESQUERDA e "cresce" pra DIREITA a partir do meio da
  // linha de cota (sem `align`/quebra), o rótulo largo da cota de lastro
  // (ex. "0.29 M") sprawlava por cima da cota de módulo -- que fica bem
  // perto em X (módulos ficam sobre a mesma fileira dos lastros) e é bem
  // mais estreita (vão de módulo = 20mm fixo vs. vão de lastro, na casa
  // de centenas de mm) -- na prática a cota de módulo ficava
  // completamente escondida atrás do texto da cota de lastro. Corrigido
  // dando à cota de módulo sua PRÓPRIA faixa vertical.
  const vLinhasCotaModulo = -passoAnotacaoMm * 2; // linha de cota do vão entre MÓDULOS e seu rótulo

  // Iteração 29g/29h -- pedido do usuário, depois de 3 rodadas tentando
  // corrigir a sobreposição do título/notas auto-gerados (29e: espaçamento
  // vertical; 29f: espaçamento horizontal entre os 2 diagramas; 29g: texto
  // vertical) -- ele então pediu pra REMOVER esse texto auto-gerado de
  // vez: "voce não está sendo capaz de resolver, é melhor tirar e deixar
  // que o usuario edite as legendas". Título/legenda e as 2 notas
  // explicativas ("(TYP.)" e "vão entre módulos") foram REMOVIDOS -- o
  // usuário adiciona seus próprios textos/legendas manualmente com a
  // ferramenta "Texto" já existente no app, com controle total sobre
  // conteúdo/posição/tamanho, em vez de depender de um posicionamento
  // automático que nunca se ajustava perfeitamente a todo tamanho/forma de
  // terreno. As cotas NUMÉRICAS (afastamento entre fileiras, vão entre
  // lastros, vão entre módulos -- "3.26 M"/"0.29 M"/"0.02 M") continuam
  // sendo geradas automaticamente -- não são "legenda", são medidas, e
  // nunca foram o motivo da reclamação.
  const uLadoCotaPitch = -fontSizeCota * 6;

  // (a) Afastamento entre fileiras: cota entre a borda frontal da 1ª e da
  // 2ª fileira (só existe se houver >= 2 fileiras).
  //
  // Iteração 29e -- bug descoberto na verificação visual (não reportado
  // pelo usuário): o `p3` usado pra calcular o deslocamento da linha de
  // cota (via `linhaDeCota`) tinha o mesmo `u=0` do segmento medido
  // (que também varia só em V) -- ou seja, `p3` ficava COLINEAR com o
  // segmento, o que faz `linhaDeCota` calcular deslocamento perpendicular
  // ZERO (a projeção de `p3-p1` num vetor perpendicular ao segmento é
  // nula quando `p3-p1` não tem nenhuma componente nessa direção). Na
  // prática a "linha de cota" saía desenhada em cima do próprio terreno
  // (u=0), cortando a 1ª coluna de lastros, com o rótulo bem no canto --
  // exatamente onde a cota de vão (que varia em U, na faixa `vLinhasCota`)
  // também põe o rótulo dela, causando a sobreposição visual no canto.
  // Corrigido: como esta cota varia em V (não em U), o deslocamento
  // perpendicular precisa ser em U -- movida pra uma faixa própria à
  // ESQUERDA do terreno (u negativo), fora da área de lastros/módulos e
  // fora da faixa horizontal usada pelos títulos/notas/cotas de vão.
  //
  // O deslocamento precisa ser bem maior que `passoAnotacaoMm` (usado
  // nas faixas verticais acima da fileira 0): o rótulo do PDF é sempre
  // desenhado alinhado à ESQUERDA a partir do ponto calculado (sem
  // suporte a `align`/rotação nessa exportação), então ele "cresce" pra
  // DIREITA -- ou seja, de volta em direção ao terreno. Um deslocamento
  // pequeno desloca só a linha, mas o texto ainda sobra por cima da 1ª
  // coluna de lastros. `uLadoCotaPitch` (definido acima, junto das colunas
  // verticais de anotação da Iteração 29g) dá folga suficiente pro texto
  // inteiro (poucos caracteres, ex. "3.26 M") caber antes de u=0.
  if (numeroFileiras >= 2) {
    const p1 = eixos.paraMundo(0, 0);
    const p2 = eixos.paraMundo(0, pitchMm);
    const p3 = eixos.paraMundo(uLadoCotaPitch, 0);
    empurrarCompartilhado({
      tipo: "cota",
      camada: CAMADA_COTAS_SOLO,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      px: p3.x,
      py: p3.y,
      texto: `${(pitchMm / 1000).toFixed(2)} M`,
      distanciaMm: pitchMm,
      fontSize: fontSizeCota,
    });
  }

  // (b) Espaçamento entre lastros ao longo da fileira: cota o VÃO LIVRE
  // (borda a borda, não centro-a-centro) entre lastros adjacentes.
  //
  // Iteração 29e -- bug descoberto na verificação visual (não reportado
  // pelo usuário): antes, TODO par adjacente de lastros da 1ª fileira
  // recebia sua própria cota -- como o espaçamento é uniforme (mesmo
  // padrão em todos os vãos), isso repetia o MESMO valor várias vezes
  // lado a lado. Com `fontSizeCota` dobrado (pedido do usuário), a
  // largura renderizada de cada rótulo (ex.: "1081.3 M") passou a ser
  // maior que o próprio passo entre lastros, fazendo os rótulos vizinhos
  // se sobreporem horizontalmente numa bagunça ilegível. Corrigido pelo
  // mesmo princípio "(TYP.)" já usado no afastamento entre fileiras: cota
  // só o 1º vão válido como representante (`break` após o primeiro),
  // já que a nota abaixo já avisa que o padrão se repete nos demais vãos.
  if (posicoesLastroPorFileira.length >= 2) {
    const vCentroFileira0 = LASTRO_FORTLEV_SOLAR.profundidadeMm / 2;
    for (let k = 0; k < posicoesLastroPorFileira.length - 1; k++) {
      const uInicioVao = posicoesLastroPorFileira[k] + LASTRO_FORTLEV_SOLAR.larguraMm / 2;
      const uFimVao = posicoesLastroPorFileira[k + 1] - LASTRO_FORTLEV_SOLAR.larguraMm / 2;
      const vaoLivreMm = uFimVao - uInicioVao;
      if (vaoLivreMm <= 0) continue; // lastros encostados/sobrepostos -- nada a cotar.
      const p1 = eixos.paraMundo(uInicioVao, vCentroFileira0);
      const p2 = eixos.paraMundo(uFimVao, vCentroFileira0);
      // Linha de cota deslocada pra ANTES da fileira (v negativo, ainda
      // dentro da margem/área livre em frente à 1ª fileira) -- evita
      // cruzar visualmente o corpo do bloco `lastro_solar` (que ocupa
      // v de 0 a `profundidadeMm`).
      const p3 = eixos.paraMundo(uInicioVao, vLinhasCota);
      empurrarCompartilhado({
        tipo: "cota",
        camada: CAMADA_COTAS_SOLO,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        px: p3.x,
        py: p3.y,
        texto: `${(vaoLivreMm / 1000).toFixed(2)} M`,
        distanciaMm: vaoLivreMm,
        fontSize: fontSizeCota,
      });
      break; // só 1 vão representativo -- ver comentário acima.
    }
  }

  // (c) Iteração 29e -- pedido do usuário: "adicione uma cota entre a
  // ponta de uma caixa a ponta da outra caixa, faca o mesmo com os
  // modulos". Mesma lógica de (b), mas pro vão FIXO entre 2 módulos
  // adjacentes na 1ª fileira (`GAP_ENTRE_MODULOS_MM`, sempre 20mm) -- só
  // no diagrama PRINCIPAL (`geometria`, não `empurrarCompartilhado`), já
  // que o 2º diagrama (só-lastros) não desenha módulo nenhum.
  if (modulosPorFileira >= 2) {
    const vCentroModulo0 = footprintNSModuloMm / 2;
    const uFimModulo0 = larguraEfetivaMm;
    const uInicioModulo1 = larguraEfetivaMm + GAP_ENTRE_MODULOS_MM;
    const p1 = eixos.paraMundo(uFimModulo0, vCentroModulo0);
    const p2 = eixos.paraMundo(uInicioModulo1, vCentroModulo0);
    // Faixa PRÓPRIA (`vLinhasCotaModulo`), distinta da cota de lastro
    // (`vLinhasCota`) -- ver comentário na declaração de `vLinhasCotaModulo`
    // acima: apesar de estarem em `u` diferentes, o rótulo largo e
    // alinhado-à-esquerda da cota de lastro sprawlava por cima da cota
    // (bem mais estreita) do vão entre módulos quando as duas dividiam a
    // mesma faixa.
    const p3 = eixos.paraMundo(uFimModulo0, vLinhasCotaModulo);
    geometria.push({
      tipo: "cota",
      camada: CAMADA_COTAS_SOLO,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      px: p3.x,
      py: p3.y,
      texto: `${(GAP_ENTRE_MODULOS_MM / 1000).toFixed(2)} M`,
      distanciaMm: GAP_ENTRE_MODULOS_MM,
      fontSize: fontSizeCota,
    });
    // Iteração 29h: nota explicativa do vão entre módulos REMOVIDA a
    // pedido do usuário (ver comentário na declaração de `uLadoCotaPitch`
    // mais acima) -- só a cota numérica acima permanece.
  }

  // Iteração 29h: nota única explicando o "(TYP.)" REMOVIDA a pedido do
  // usuário (ver comentário na declaração de `uLadoCotaPitch` mais acima).

  // Seta indicando o norte, fora da área do terreno (à direita) ---------
  // (`fontSize` já calculado mais acima, reaproveitado aqui pela nota das cotas)
  const comprimentoSetaMm = fontSize * 2.5;
  const anchoraX = larguraTerrenoMm + comprimentoSetaMm * 1.5;
  const anchoraY = profundidadeTerrenoMm / 2;
  const pontaX = anchoraX + eixos.direcaoNorte.x * comprimentoSetaMm;
  const pontaY = anchoraY + eixos.direcaoNorte.y * comprimentoSetaMm;
  const perpX = -eixos.direcaoNorte.y;
  const perpY = eixos.direcaoNorte.x;
  const larguraPontaMm = comprimentoSetaMm * 0.25;

  empurrarCompartilhado({
    tipo: "linha",
    camada: CAMADA_ANOTACOES_SOLO,
    x1: anchoraX,
    y1: anchoraY,
    x2: pontaX,
    y2: pontaY,
  });
  empurrarCompartilhado({
    tipo: "poligono",
    camada: CAMADA_ANOTACOES_SOLO,
    pontos: [
      { x: pontaX, y: pontaY },
      {
        x: pontaX - eixos.direcaoNorte.x * larguraPontaMm + perpX * larguraPontaMm * 0.5,
        y: pontaY - eixos.direcaoNorte.y * larguraPontaMm + perpY * larguraPontaMm * 0.5,
      },
      {
        x: pontaX - eixos.direcaoNorte.x * larguraPontaMm - perpX * larguraPontaMm * 0.5,
        y: pontaY - eixos.direcaoNorte.y * larguraPontaMm - perpY * larguraPontaMm * 0.5,
      },
    ],
    hachura: { tipo: "SOLID", escala: 1, cor: "#0f172a" },
  });
  empurrarCompartilhado({
    tipo: "texto",
    camada: CAMADA_ANOTACOES_SOLO,
    x: pontaX + eixos.direcaoNorte.x * fontSize * 0.8 - fontSize * 0.3,
    y: pontaY + eixos.direcaoNorte.y * fontSize * 0.8,
    conteudo: "N",
    fontSize,
  });

  // Iteração 29h: legenda/título do topo REMOVIDA a pedido do usuário (ver
  // comentário na declaração de `uLadoCotaPitch` mais acima) -- 3
  // tentativas (29e/29f/29g) de resolver a sobreposição desse texto
  // auto-gerado não convenceram o usuário, que preferiu adicionar suas
  // próprias legendas manualmente (ferramenta "Texto" já existente) em vez
  // de continuar depender de um posicionamento automático.

  // Resumo textual, abaixo do terreno ------------------------------------
  // Iteração 29e: reposicionado bem mais rente à borda do terreno (era
  // `fontSize * 2` de folga, virou `fontSize * 0.6` -- folga mínima só
  // pra não cruzar visualmente o contorno tracejado do terreno, já que o
  // texto agora também ficou maior) -- pedido do usuário ("deixe esse
  // texto grande rente a lateral do lado maior do terreno, assim agente
  // ganha espaço"). Mantido embaixo (e não do lado) porque, pra terrenos
  // mais largos que profundos (o caso mais comum de sistema no solo), a
  // borda INFERIOR já É o lado maior do terreno -- só a folga excessiva
  // que sobrava ali foi cortada.
  const totalModulos = numeroFileiras * modulosPorFileira;
  const potenciaTotalKwp = (totalModulos * potenciaModuloWp) / 1000;
  const rotuloModuloFinal = rotuloModulo?.trim() || `${comprimentoModuloMm}×${larguraModuloMm}mm`;

  const resumoTexto = (
    `SISTEMA FOTOVOLTAICO NO SOLO (preliminar -- não substitui projeto estrutural assinado)\n` +
    `Módulo: ${rotuloModuloFinal}, ${potenciaModuloWp}Wp (${orientacaoModulo})\n` +
    `Estrutura: inclinação ${tiltGraus.toFixed(1)}°, altura máxima ${(alturaMaximaEstruturaMm / 1000).toFixed(
      2
    )}m acima do solo (usada no afastamento entre fileiras)\n` +
    `Fileiras: ${numeroFileiras} × ${modulosPorFileira} módulos/fileira = ${totalModulos} módulos (${potenciaTotalKwp.toFixed(
      2
    )} kWp)\n` +
    `Afastamento entre fileiras: ${(pitchMm / 1000).toFixed(2)}m (ângulo solar crítico: ${anguloSolarGraus.toFixed(
      1
    )}°, base: solstício de ${declinacaoCriticaGraus > 0 ? "junho" : "dezembro"}, latitude ${latitudeGraus}°)\n` +
    `Zona de vento (espaçamento estrutural do lastro): ${espacamento.zonaVento}`
  ).toUpperCase();

  geometria.push({
    tipo: "texto",
    camada: CAMADA_ANOTACOES_SOLO,
    x: 0,
    y: profundidadeTerrenoMm + fontSize * 0.6,
    conteudo: resumoTexto,
    fontSize: fontSize * 0.6,
  });

  // 2º diagrama opcional -- só lastros + cotas, ao lado do principal ------
  // (Iteração 29c, ver premissa "b" no cabeçalho do arquivo).
  if (gerarDiagramaLastros) {
    const separacaoDiagramasMm = Math.max(5000, larguraTerrenoMm * 0.15);
    // Iteração 29h -- com título/notas REMOVIDOS (ver comentário na
    // declaração de `uLadoCotaPitch` mais acima), o afastamento entre os 2
    // diagramas só precisa garantir que a lane esquerda da cota de
    // afastamento entre fileiras do 2º diagrama (que fica à ESQUERDA do
    // seu próprio terreno, igual a do principal, ver `uLadoCotaPitch`) não
    // invada a seta de norte do diagrama principal.
    const offsetXDiagramaLastros = Math.max(
      larguraTerrenoMm + separacaoDiagramasMm,
      anchoraX - uLadoCotaPitch + separacaoDiagramasMm
    );

    for (const el of elementosLastroCota) {
      geometria.push(transladarGeometria(el, offsetXDiagramaLastros, 0));
    }

    // Iteração 29h: título do 2º diagrama REMOVIDO a pedido do usuário
    // (ver comentário na declaração de `uLadoCotaPitch` mais acima).
  }

  const resumo: ResumoSistemaSolo = {
    numeroFileiras,
    modulosPorFileira,
    totalModulos,
    potenciaTotalKwp,
    afastamentoEntreFileirasMm: pitchMm,
    anguloInclinacaoGraus: tiltGraus,
    alturaMaximaEstruturaMm,
    anguloSolarCriticoGraus: anguloSolarGraus,
    declinacaoCriticaGraus,
    isopletaUsada: espacamento.zonaVento,
    orientacaoModulo,
    larguraEfetivaModuloMm: larguraEfetivaMm,
    comprimentoEfetivoModuloMm: comprimentoEfetivoMm,
    diagramaLastrosGerado: gerarDiagramaLastros,
  };

  // Iteração 29h -- marca TODA a geometria gerada com sua proveniência
  // (ver `GeometriaBase.origemGeradorId` em `types.ts`), num único lugar
  // (em vez de em cada `push`/`empurrarCompartilhado` espalhado pelo
  // arquivo) -- usado por `store.ts#gerarSistemaSolo` pra substituir
  // (não acumular) uma geração anterior deste mesmo gerador.
  const geometriaMarcada = geometria.map((g) => ({ ...g, origemGeradorId: ORIGEM_GERADOR_SISTEMA_SOLO }));

  return { geometria: geometriaMarcada, resumo };
}
