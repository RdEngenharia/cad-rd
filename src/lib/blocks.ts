/**
 * blocks.ts
 * -----------------------------------------------------------------------
 * Biblioteca de blocos/símbolos elétricos "carimbáveis" no canvas.
 * Cada bloco é descrito como um SVG (viewBox 0 0 100 100) para poder ser:
 *   1) Renderizado nativamente na barra lateral (elemento <svg> comum).
 *   2) Convertido em data-URI e carregado como Konva.Image no canvas.
 *
 * Adicionar um novo símbolo é só empurrar um novo item nesta lista --
 * nenhum outro arquivo precisa mudar.
 * -----------------------------------------------------------------------
 */

import type { BlocoGeometria } from "./types";

/** MIME type customizado usado no drag&drop de blocos da `BlockLibraryPanel` para o `CanvasStage`. */
export const BLOCO_DRAG_MIME = "application/x-cad-bloco";

export interface BlockDef {
  /** Chave estável salva em `geometria[].nome` (ex.: "disjuntor"). */
  id: string;
  /** Rótulo exibido na barra lateral. */
  label: string;
  /** Descrição curta (norma/uso). */
  descricao: string;
  /** Marcação SVG (viewBox fixo 0 0 100 100), sem a tag <svg> externa. */
  svgInner: string;
  /** Dimensão do símbolo em unidades de desenho (mm) quando carimbado. */
  largura: number;
  altura: number;
  /**
   * `true` para blocos que existem só como peça interna de uma ferramenta
   * composta (ex.: poste/medidor do "Padrão de Entrada/Concessionária") --
   * continuam pesquisáveis via `getBlockDef` (renderização, seleção,
   * export PDF), mas ficam de fora da grade "Blocos elétricos" da
   * `BlockLibraryPanel`, que é pensada pra inserção avulsa pelo usuário.
   */
  interno?: boolean;
  /**
   * Pontos de conexão (terminais elétricos) do símbolo, em coordenadas
   * do viewBox (0-100) -- Iteração 12f, pedido do usuário ("as linhas
   * dos blocos precisam ter a mesma espessura das linhas" veio junto com
   * o pedido implícito de conseguir ENCOSTAR uma linha na ponta de um
   * bloco com o SNAP magnético, igual encosta na ponta de outra linha).
   * Cada ponto vira um candidato de OSNAP "endpoint" em
   * `osnap.ts#segmentosDaGeometria` (via `pontosConexaoMundo`, que
   * aplica a mesma transformação de posição/rotação/escala usada pelo
   * desenho do bloco -- ver `pdfExport.ts#desenharBloco`).
   *
   * Deliberadamente ausente (undefined) nos símbolos sem terminal
   * "óbvio" de fiação (tomada, módulo fotovoltaico, malha de
   * aterramento) -- esses não geram candidato nenhum, sem quebrar nada
   * (mesmo tratamento de "sem OSNAP" que qualquer outro tipo não listado
   * em `segmentosDaGeometria`).
   */
  pontosConexao?: { x: number; y: number }[];
}

const STROKE = "#0f172a";

export const BLOCK_LIBRARY: BlockDef[] = [
  {
    // Iteração 16: redesenhado de retângulo+diagonal pra um símbolo de
    // "mola"/coil entre dois terminais com bolinha -- pedido do usuário
    // depois de comparar com o PDF de referência dele, que usa esse
    // símbolo (não o de retângulo+diagonal) pro disjuntor inline no corpo
    // do diagrama. Mesmas dimensões/`pontosConexao` de antes (largura=20,
    // altura=30, terminais em {50,0}/{50,100}) -- só o miolo mudou, então
    // nenhum lugar que já posiciona este bloco (ex.: o cursor vertical de
    // `diagramaFv.ts`) precisa mudar.
    id: "disjuntor",
    label: "Disjuntor (Monopolar)",
    descricao: "Disjuntor termomagnético monopolar -- 1 traço cruzando a mola indica 1 polo (símbolo unifilar)",
    largura: 20,
    altura: 30,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="22" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="22" r="3.5" fill="${STROKE}"/>
      <path d="M 50 22 Q 37.5 45 50 68" fill="none" stroke="${STROKE}" stroke-width="4"/>
      <line x1="26" y1="45" x2="37.5" y2="45" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="68" r="3.5" fill="${STROKE}"/>
      <line x1="50" y1="68" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    // Iteração 19: pedido do usuário ("os blocos de disjuntores precisam
    // ter diferença entre monopolar, bipolar e tripolar") -- analisando os
    // PDFs de referência (diagramas monofásico e trifásico dele), o
    // símbolo usado no corpo do diagrama unifilar NÃO muda de forma (é
    // sempre a mesma "mola" entre dois terminais) -- o que muda é só a
    // QUANTIDADE de tracinhos horizontais cruzando a mola: 1 traço =
    // monopolar, 2 = bipolar, 3 = tripolar (convenção padrão de diagrama
    // unifilar pra indicar nº de polos comutados por um symbol só, sem
    // precisar desenhar 2/3 linhas paralelas completas). Mesma mola do
    // "disjuntor" acima, só adicionando o 2º traço.
    id: "disjuntor_bipolar",
    label: "Disjuntor (Bipolar)",
    descricao: "Disjuntor termomagnético bipolar -- 2 traços cruzando a mola indicam 2 polos (símbolo unifilar)",
    largura: 20,
    altura: 30,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="22" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="22" r="3.5" fill="${STROKE}"/>
      <path d="M 50 22 Q 37.5 45 50 68" fill="none" stroke="${STROKE}" stroke-width="4"/>
      <line x1="26" y1="41" x2="37.5" y2="41" stroke="${STROKE}" stroke-width="4"/>
      <line x1="26" y1="49" x2="37.5" y2="49" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="68" r="3.5" fill="${STROKE}"/>
      <line x1="50" y1="68" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    // Iteração 19: mesma mola, 3 traços = tripolar (ver comentário do bipolar acima).
    id: "disjuntor_tripolar",
    label: "Disjuntor (Tripolar)",
    descricao: "Disjuntor termomagnético tripolar -- 3 traços cruzando a mola indicam 3 polos (símbolo unifilar)",
    largura: 20,
    altura: 30,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="22" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="22" r="3.5" fill="${STROKE}"/>
      <path d="M 50 22 Q 37.5 45 50 68" fill="none" stroke="${STROKE}" stroke-width="4"/>
      <line x1="26" y1="37" x2="37.5" y2="37" stroke="${STROKE}" stroke-width="4"/>
      <line x1="26" y1="45" x2="37.5" y2="45" stroke="${STROKE}" stroke-width="4"/>
      <line x1="26" y1="53" x2="37.5" y2="53" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="68" r="3.5" fill="${STROKE}"/>
      <line x1="50" y1="68" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    id: "transformador",
    label: "Transformador",
    descricao: "Transformador de dois enrolamentos (símbolo de duas bobinas)",
    largura: 30,
    altura: 44,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="22" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="38" r="20" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="62" r="20" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <line x1="50" y1="78" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    id: "tomada",
    label: "Tomada",
    descricao: "Ponto de tomada de força (símbolo de planta baixa)",
    largura: 20,
    altura: 20,
    svgInner: `
      <circle cx="50" cy="50" r="34" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <line x1="50" y1="16" x2="50" y2="40" stroke="${STROKE}" stroke-width="4"/>
      <line x1="22" y1="65" x2="78" y2="65" stroke="${STROKE}" stroke-width="4"/>
    `,
  },

  // Iteração 35: família de blocos do gerador automático de tomadas/
  // interruptores/iluminação (`lib/roomDetection.ts` + `lib/lancamentoEletrico.ts`),
  // pedida pelo usuário com preferência explícita por "simbologia triângulo"
  // para as tomadas -- cada altura de instalação (baixa/média/alta) e o
  // ponto dedicado de chuveiro/aquecedor viram um bloco PRÓPRIO (em vez de
  // um único bloco "tomada" com um campo de altura à parte) porque o resto
  // da biblioteca já funciona assim (ex.: disjuntor mono/bi/tripolar são 3
  // blocos, não 1 bloco parametrizado) -- mantém `pdfExport.ts`/`dxfExport.ts`
  // simples (1 `case` por variante, sem precisar ler um campo extra da
  // geometria). Os números (30/130/200) e a sigla "CH" dentro do triângulo
  // são só um rótulo visual de conferência rápida na tela/impressão -- a
  // altura real de instalação (cm do piso) é informação de PROJETO/norma,
  // não uma coordenada Z (o desenho é 2D, vista de planta baixa).
  {
    id: "tomada_baixa",
    label: "Tomada Baixa (30cm)",
    descricao: "Ponto de tomada de força, instalação baixa (~30cm do piso) -- altura usual em ambientes secos (NBR 5410)",
    largura: 20,
    altura: 24,
    svgInner: `
      <polygon points="50,8 14,82 86,82" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <text x="50" y="74" font-size="20" text-anchor="middle" fill="${STROKE}" font-family="sans-serif">30</text>
    `,
  },
  {
    id: "tomada_media",
    label: "Tomada Média (130cm)",
    descricao: "Ponto de tomada de força, instalação média (~130cm do piso) -- uso típico sobre bancada (cozinha/área de serviço)",
    largura: 20,
    altura: 24,
    svgInner: `
      <polygon points="50,8 14,82 86,82" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <text x="50" y="74" font-size="18" text-anchor="middle" fill="${STROKE}" font-family="sans-serif">130</text>
    `,
  },
  {
    id: "tomada_alta",
    label: "Tomada Alta (200cm)",
    descricao: "Ponto de tomada de força, instalação alta (~200cm do piso) -- ex.: climatizador/equipamento sobre armário",
    largura: 20,
    altura: 24,
    svgInner: `
      <polygon points="50,8 14,82 86,82" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <text x="50" y="74" font-size="18" text-anchor="middle" fill="${STROKE}" font-family="sans-serif">200</text>
    `,
  },
  {
    // Iteração 35: NUNCA lançado automaticamente (ver `lancamentoEletrico.ts`)
    // -- fica na biblioteca só para o projetista posicionar manualmente onde
    // sabe que existe de fato um chuveiro/aquecedor (o nome do ambiente
    // "banheiro" sozinho não garante presença nem posição do box).
    id: "tomada_chuveiro",
    label: "Tomada Chuveiro/Aquecedor",
    descricao: "Ponto de força dedicado (circuito exclusivo) para chuveiro/aquecedor de água -- posicionamento sempre manual",
    largura: 22,
    altura: 26,
    svgInner: `
      <polygon points="50,8 12,84 88,84" fill="white" stroke="${STROKE}" stroke-width="4.5"/>
      <text x="50" y="76" font-size="16" text-anchor="middle" fill="${STROKE}" font-family="sans-serif">CH</text>
    `,
  },
  {
    id: "interruptor_simples",
    label: "Interruptor Simples",
    descricao: "Interruptor de 1 seção (liga/desliga 1 circuito de iluminação) -- símbolo de planta baixa",
    largura: 14,
    altura: 14,
    svgInner: `
      <circle cx="50" cy="50" r="30" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <text x="50" y="60" font-size="30" text-anchor="middle" fill="${STROKE}" font-family="sans-serif">S</text>
    `,
  },
  {
    id: "ponto_luz_teto",
    label: "Ponto de Luz (Teto)",
    descricao: "Ponto de iluminação no teto (símbolo de planta baixa)",
    largura: 20,
    altura: 20,
    svgInner: `
      <circle cx="50" cy="50" r="36" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <line x1="26" y1="26" x2="74" y2="74" stroke="${STROKE}" stroke-width="4"/>
      <line x1="74" y1="26" x2="26" y2="74" stroke="${STROKE}" stroke-width="4"/>
    `,
  },

  // Simbologia fotovoltaica/elétrica padrão ABNT (leva não-numerada,
  // pedida junto do Sprint 3): biblioteca lateral drag&drop.
  {
    id: "dps",
    label: "DPS",
    descricao: "Dispositivo de Proteção contra Surtos, com condutor de aterramento",
    largura: 20,
    altura: 36,
    // Só o terminal de CIMA -- o de baixo termina num símbolo de
    // aterramento (não é um ponto de conexão de fiação "solto").
    pontosConexao: [{ x: 50, y: 0 }],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="25" stroke="${STROKE}" stroke-width="4"/>
      <rect x="30" y="25" width="40" height="45" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <line x1="38" y1="32" x2="62" y2="63" stroke="${STROKE}" stroke-width="4"/>
      <polygon points="62,63 51,59 59,49" fill="${STROKE}"/>
      <line x1="50" y1="70" x2="50" y2="82" stroke="${STROKE}" stroke-width="4"/>
      <line x1="35" y1="82" x2="65" y2="82" stroke="${STROKE}" stroke-width="4"/>
      <line x1="40" y1="89" x2="60" y2="89" stroke="${STROKE}" stroke-width="3"/>
      <line x1="44" y1="96" x2="56" y2="96" stroke="${STROKE}" stroke-width="2"/>
    `,
  },
  {
    id: "seccionadora_cc",
    label: "Seccionadora CC",
    descricao: "Chave seccionadora de corrente contínua (símbolo de lâmina aberta)",
    largura: 20,
    altura: 32,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="34" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="34" r="4.5" fill="${STROKE}"/>
      <line x1="50" y1="34" x2="74" y2="68" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="74" cy="68" r="4.5" fill="${STROKE}"/>
      <line x1="50" y1="66" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    id: "fusivel",
    label: "Fusível",
    descricao: "Elo fusível (símbolo unifilar de retângulo cortado pela linha)",
    largura: 16,
    altura: 34,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="30" stroke="${STROKE}" stroke-width="4"/>
      <rect x="35" y="30" width="30" height="40" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <line x1="35" y1="50" x2="65" y2="50" stroke="${STROKE}" stroke-width="4"/>
      <line x1="50" y1="70" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    id: "inversor",
    label: "Inversor",
    descricao: "Inversor fotovoltaico (entrada CC / saída CA senoidal)",
    largura: 34,
    altura: 26,
    // Iteração 15: o gerador de diagrama FV (`diagramaFv.ts`) usa este
    // bloco num fluxo VERTICAL (CC entra por cima, CA sai por baixo) --
    // os pontos {0,50}/{100,50} (fluxo horizontal) continuam aqui porque
    // o bloco também é útil "solto" na biblioteca lateral, mas agora
    // ganhou também {50,0}/{50,100} + os traços verticais correspondentes
    // no SVG (antes só existiam os stubs horizontais, então uma linha
    // vertical parava ~5mm acima do retângulo visível, sem tocar nele).
    pontosConexao: [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <rect x="15" y="20" width="70" height="60" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <path d="M 25 50 Q 37 30 50 50 T 75 50" fill="none" stroke="${STROKE}" stroke-width="4"/>
      <line x1="0" y1="50" x2="15" y2="50" stroke="${STROKE}" stroke-width="4"/>
      <line x1="85" y1="50" x2="100" y2="50" stroke="${STROKE}" stroke-width="4"/>
      <line x1="50" y1="0" x2="50" y2="20" stroke="${STROKE}" stroke-width="4"/>
      <line x1="50" y1="80" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    // Iteração 17: variante SÓ-VERTICAL do inversor, usada exclusivamente
    // pelo gerador de diagrama FV (`diagramaFv.ts`) -- o bloco "inversor"
    // acima sempre desenha os 4 estirões (2 horizontais + 2 verticais)
    // porque também é usado solto na biblioteca lateral, onde os
    // conectores horizontais fazem sentido. Só que no diagrama gerado
    // (fluxo 100% vertical) esses 2 estirões horizontais não conectam a
    // NADA -- ficam literalmente "linhas soltas"/inacabadas apontando pro
    // vazio dos dois lados do bloco, relatado pelo usuário ao revisar o
    // PDF de perto. Em vez de remover os estirões horizontais do bloco
    // "inversor" genérico (o que quebraria a conexão de quem usa o bloco
    // avulso conectando uma linha horizontal a ele), esta variante
    // duplica o mesmo desenho SEM os 2 `<line>` horizontais nem os
    // `pontosConexao` correspondentes -- usada só na chamada
    // `colocarBloco("inversor_vertical")` do gerador.
    id: "inversor_vertical",
    label: "Inversor (vertical)",
    descricao: "Inversor fotovoltaico -- variante interna sem os terminais horizontais (uso exclusivo do gerador de diagrama FV)",
    interno: true,
    largura: 34,
    altura: 26,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <rect x="15" y="20" width="70" height="60" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <path d="M 25 50 Q 37 30 50 50 T 75 50" fill="none" stroke="${STROKE}" stroke-width="4"/>
      <line x1="50" y1="0" x2="50" y2="20" stroke="${STROKE}" stroke-width="4"/>
      <line x1="50" y1="80" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    id: "stringbox",
    label: "Stringbox",
    descricao: "Caixa de combinação de strings fotovoltaicas (String Box CC)",
    largura: 30,
    altura: 30,
    // Simplificação: o SVG tem 3 entradas de string em cima (x=35/50/65),
    // mas só a central entra como candidato de OSNAP -- as laterais
    // ficariam ambíguas sem um jeito de escolher "qual string" no
    // OSNAP genérico (fora do escopo desta Sprint).
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <rect x="20" y="25" width="60" height="55" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <line x1="35" y1="0" x2="35" y2="25" stroke="${STROKE}" stroke-width="3"/>
      <line x1="50" y1="0" x2="50" y2="25" stroke="${STROKE}" stroke-width="3"/>
      <line x1="65" y1="0" x2="65" y2="25" stroke="${STROKE}" stroke-width="3"/>
      <line x1="50" y1="80" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    id: "malha_aterramento",
    label: "Malha de Aterramento",
    descricao: "Malha de aterramento (símbolo de grade de condutores enterrados)",
    largura: 34,
    altura: 34,
    svgInner: `
      <line x1="15" y1="30" x2="85" y2="30" stroke="${STROKE}" stroke-width="3"/>
      <line x1="15" y1="50" x2="85" y2="50" stroke="${STROKE}" stroke-width="3"/>
      <line x1="15" y1="70" x2="85" y2="70" stroke="${STROKE}" stroke-width="3"/>
      <line x1="30" y1="15" x2="30" y2="85" stroke="${STROKE}" stroke-width="3"/>
      <line x1="50" y1="15" x2="50" y2="85" stroke="${STROKE}" stroke-width="3"/>
      <line x1="70" y1="15" x2="70" y2="85" stroke="${STROKE}" stroke-width="3"/>
    `,
  },

  // Símbolos do gerador de diagrama fotovoltaico (Iteração 12b, botão +
  // modal desde a Iteração 13 -- ver lib/diagramaFv.ts) -- também úteis
  // soltos, por isso não são `interno: true` (aparecem na grade normal também).
  {
    id: "medidor_kwh",
    label: "Medidor KWH",
    descricao: "Medidor de energia (padrão de medição da concessionária)",
    largura: 24,
    altura: 30,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="14" stroke="${STROKE}" stroke-width="4"/>
      <rect x="14" y="14" width="72" height="60" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <text x="50" y="50" font-size="22" text-anchor="middle" fill="${STROKE}" font-family="sans-serif">KWH</text>
      <line x1="50" y1="74" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    id: "modulo_fotovoltaico",
    label: "Módulo Fotovoltaico",
    descricao: "Módulo/painel solar fotovoltaico (símbolo unifilar de triângulo)",
    largura: 26,
    altura: 20,
    // Iteração 15: o ápice do triângulo foi movido pra y=0 (encostando na
    // borda do viewBox -- antes ficava em y=15, criando um gap visível
    // entre a linha de entrada e o símbolo) e ganhou um pequeno traço de
    // saída na base (y=90->100) pra servir de terminal de baixo, onde
    // agora se encosta o novo bloco `terra` (símbolo de aterramento do
    // string, ausente antes do gerador de diagrama FV).
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <polygon points="8,90 92,90 50,0" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <line x1="26" y1="90" x2="55" y2="23" stroke="${STROKE}" stroke-width="2.5"/>
      <line x1="44" y1="90" x2="62" y2="53" stroke="${STROKE}" stroke-width="2.5"/>
      <line x1="50" y1="90" x2="50" y2="100" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    // Iteração 15: DPS em derivação LATERAL (ramal em "T" saindo de um
    // barramento vertical), pedido pelo usuário ao comparar com o modelo
    // de referência -- lá o DPS nunca fica "flutuando" solto do
    // barramento: ele sai por uma perna horizontal curta que termina num
    // ponto de conexão (nó) marcado com um `círculo` preenchido (ver
    // `ponto()` em `diagramaFv.ts`). Orientação horizontal: terminal
    // único em {x:100,y:50} é onde essa perna encosta no barramento.
    id: "dps_lateral",
    label: "DPS (ramal lateral)",
    descricao: "Dispositivo de Proteção contra Surtos em derivação lateral, com aterramento",
    largura: 34,
    altura: 14,
    pontosConexao: [{ x: 100, y: 50 }],
    svgInner: `
      <line x1="8" y1="50" x2="8" y2="20" stroke="${STROKE}" stroke-width="3"/>
      <line x1="2" y1="20" x2="14" y2="20" stroke="${STROKE}" stroke-width="3"/>
      <line x1="4" y1="12" x2="12" y2="12" stroke="${STROKE}" stroke-width="2.5"/>
      <line x1="6" y1="5" x2="10" y2="5" stroke="${STROKE}" stroke-width="2"/>
      <line x1="8" y1="50" x2="30" y2="50" stroke="${STROKE}" stroke-width="4"/>
      <rect x="30" y="32" width="34" height="36" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <line x1="37" y1="60" x2="57" y2="40" stroke="${STROKE}" stroke-width="3.5"/>
      <polygon points="57,40 47,42 54,50" fill="${STROKE}"/>
      <line x1="64" y1="50" x2="100" y2="50" stroke="${STROKE}" stroke-width="4"/>
    `,
  },
  {
    // Iteração 15: símbolo de aterramento pontual (haste de terra), usado
    // após cada módulo fotovoltaico no gerador -- no modelo de
    // referência, todo string de módulos termina num pequeno símbolo de
    // terra (traço + hachura decrescente), que o gerador não desenhava.
    id: "terra",
    label: "Terra",
    descricao: "Símbolo de aterramento pontual (haste de terra)",
    largura: 14,
    altura: 18,
    pontosConexao: [{ x: 50, y: 0 }],
    svgInner: `
      <line x1="50" y1="0" x2="50" y2="40" stroke="${STROKE}" stroke-width="4"/>
      <line x1="20" y1="40" x2="80" y2="40" stroke="${STROKE}" stroke-width="4"/>
      <line x1="30" y1="60" x2="70" y2="60" stroke="${STROKE}" stroke-width="3"/>
      <line x1="40" y1="80" x2="60" y2="80" stroke="${STROKE}" stroke-width="2"/>
    `,
  },
  {
    // Iteração 18: desenho representativo da caixa do "Padrão de
    // Entrada" (medição de energia) -- pedido do usuário com base no PDF
    // de referência dele, que mostra uma caixa de medição real (foto)
    // com o medidor, disjuntor e os fios de entrada/saída visíveis. Até
    // aqui, sem uma foto real anexada pelo usuário no modal do gerador,
    // essa área do diagrama saía como um quadro tracejado VAZIO só com o
    // texto "(anexe a foto real...)" -- este bloco dá um desenho
    // esquemático substituto, no MESMO estilo de linha monocromático dos
    // outros símbolos da biblioteca (não uma reprodução fotográfica),
    // usado como bloco de fallback em `diagramaFv.ts` quando não há foto.
    id: "padrao_entrada_detalhe",
    label: "Padrão de Entrada (detalhe)",
    descricao: "Desenho representativo da caixa de medição (padrão de entrada) -- medidor, disjuntor e fiação",
    largura: 60,
    altura: 78,
    svgInner: `
      <line x1="35" y1="0" x2="35" y2="10" stroke="${STROKE}" stroke-width="3"/>
      <line x1="65" y1="0" x2="65" y2="10" stroke="${STROKE}" stroke-width="3"/>
      <rect x="10" y="10" width="80" height="60" fill="white" stroke="${STROKE}" stroke-width="3"/>
      <rect x="20" y="16" width="60" height="24" fill="white" stroke="${STROKE}" stroke-width="2.5"/>
      <text x="50" y="33" font-size="13" text-anchor="middle" fill="${STROKE}" font-family="sans-serif">kWh</text>
      <rect x="37" y="48" width="26" height="15" fill="white" stroke="${STROKE}" stroke-width="2.5"/>
      <line x1="42" y1="61" x2="57" y2="50" stroke="${STROKE}" stroke-width="2"/>
      <line x1="30" y1="70" x2="30" y2="88" stroke="${STROKE}" stroke-width="3"/>
      <line x1="50" y1="70" x2="50" y2="88" stroke="${STROKE}" stroke-width="3"/>
      <line x1="70" y1="70" x2="70" y2="92" stroke="${STROKE}" stroke-width="3"/>
      <line x1="58" y1="92" x2="82" y2="92" stroke="${STROKE}" stroke-width="3"/>
      <line x1="62" y1="97" x2="78" y2="97" stroke="${STROKE}" stroke-width="2"/>
    `,
  },

  // Peças internas da ferramenta "Padrão de Entrada/Concessionária" (não
  // aparecem na grade da biblioteca -- ver `interno: true` acima).
  {
    id: "poste_concessionaria",
    label: "Poste",
    descricao: "Poste de distribuição da concessionária (uso interno do Padrão de Entrada)",
    largura: 14,
    altura: 44,
    interno: true,
    svgInner: `
      <line x1="50" y1="4" x2="50" y2="92" stroke="${STROKE}" stroke-width="5"/>
      <line x1="24" y1="14" x2="76" y2="14" stroke="${STROKE}" stroke-width="4"/>
      <line x1="30" y1="92" x2="70" y2="92" stroke="${STROKE}" stroke-width="5"/>
    `,
  },
  {
    id: "medidor_concessionaria",
    label: "Medidor",
    descricao: "Caixa de medição de energia (uso interno do Padrão de Entrada)",
    largura: 24,
    altura: 24,
    interno: true,
    svgInner: `
      <rect x="12" y="12" width="76" height="76" fill="white" stroke="${STROKE}" stroke-width="4"/>
      <circle cx="50" cy="50" r="24" fill="white" stroke="${STROKE}" stroke-width="3"/>
      <line x1="50" y1="50" x2="50" y2="30" stroke="${STROKE}" stroke-width="3"/>
      <line x1="50" y1="50" x2="65" y2="60" stroke="${STROKE}" stroke-width="3"/>
    `,
  },

  // Iteração 28: usuário anexou o datasheet técnico (PDF, 7 páginas) do
  // "Lastro" da Fortlev Solar -- a base plástica lastreada (preenchida com
  // areia/brita/concreto) usada para fixar uma estrutura fotovoltaica no
  // solo SEM fundação, com um pedido explícito de fidelidade às medidas.
  // Ao contrário de todo o resto da biblioteca (símbolos ESQUEMÁTICOS de
  // diagrama unifilar, sem relação com o tamanho físico real do
  // equipamento), este bloco é a PRIMEIRA peça da biblioteca pensada pra
  // ser desenhada EM ESCALA REAL (vista em PLANTA/topo) -- vai ser usada
  // pelo futuro gerador de "sistema fotovoltaico no solo" (pedido do
  // usuário, ainda pendente do datasheet do painel) pra desenhar o
  // arranjo de módulos sobre o terreno mostrando exatamente quantos
  // lastros cabem por fileira. Por isso `largura`/`altura` aqui são as
  // dimensões REAIS em mm da página 1 do datasheet ("Overall dimensions"
  // -- Largura 600mm / Profundidade 1480mm), não um tamanho de ícone
  // arbitrário -- ver `lib/lastroSolar.ts` para o restante dos dados do
  // datasheet (peso, área de base, tabelas de compatibilidade por família
  // de módulo e de espaçamento entre lastros por zona de vento/isopleta)
  // que não cabem num `BlockDef` (só geometria de símbolo).
  //
  // Convenção de orientação adotada (documentada aqui pra o gerador
  // futuro replicar): y=0 (topo do viewBox) = extremidade ALTA/FUNDO do
  // lastro (a "distância máxima para o solo" do datasheet, ex. 1150mm --
  // marcada com um círculo, representando o suporte/console traseiro);
  // y=100 (base do viewBox) = extremidade BAIXA/FRENTE (a "distância
  // mínima para o solo", ex. 550mm -- marcada com um triângulo
  // preenchido, representando visualmente o lado voltado pro sol/mais
  // próximo do chão). O hachurado diagonal no meio é só uma indicação
  // visual de "base lastreada" (preenchimento de areia/brita/concreto),
  // não uma hachura de verdade (`HachuraConfig`) -- um bloco é um SVG
  // estático, sem estado de preenchimento próprio.
  {
    id: "lastro_solar",
    label: "Lastro Solar (Fortlev)",
    descricao:
      "Base lastreada p/ fixação de estrutura fotovoltaica no solo sem fundação -- vista em planta, 600×1480mm (ver lib/lastroSolar.ts p/ peso, base e espaçamento entre unidades)",
    largura: 600,
    altura: 1480,
    pontosConexao: [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    svgInner: `
      <rect x="4" y="2" width="92" height="96" fill="white" stroke="${STROKE}" stroke-width="2.5"/>
      <line x1="8" y1="34" x2="34" y2="8" stroke="${STROKE}" stroke-width="1.5"/>
      <line x1="8" y1="58" x2="58" y2="8" stroke="${STROKE}" stroke-width="1.5"/>
      <line x1="8" y1="82" x2="82" y2="8" stroke="${STROKE}" stroke-width="1.5"/>
      <line x1="18" y1="92" x2="92" y2="18" stroke="${STROKE}" stroke-width="1.5"/>
      <line x1="42" y1="92" x2="92" y2="42" stroke="${STROKE}" stroke-width="1.5"/>
      <line x1="66" y1="92" x2="92" y2="66" stroke="${STROKE}" stroke-width="1.5"/>
      <circle cx="50" cy="8" r="4" fill="white" stroke="${STROKE}" stroke-width="2"/>
      <polygon points="50,98 42,88 58,88" fill="${STROKE}"/>
    `,
  },
];

/** Devolve a definição de bloco a partir da chave salva na geometria. */
export function getBlockDef(id: string): BlockDef | undefined {
  return BLOCK_LIBRARY.find((b) => b.id === id);
}

/**
 * Converte os `pontosConexao` (coordenadas do viewBox 0-100) de um
 * bloco carimbado para coordenadas de MUNDO, aplicando a mesma
 * transformação de posição + rotação + escala usada tanto pelo desenho
 * do bloco no canvas (`BlocoShape.tsx`) quanto no PDF
 * (`pdfExport.ts#desenharBloco`'s `pt()`) -- ver o comentário lá para o
 * raciocínio da matriz de rotação (sentido horário, mesma convenção do
 * `rotation` do Konva).
 *
 * Usado por `osnap.ts` (Iteração 12f) para que uma linha consiga
 * "encostar" magneticamente no terminal de um bloco (ex.: ponta de cima
 * de um disjuntor), igual já acontecia com a ponta de outra linha --
 * antes disso, blocos não contribuíam NENHUM candidato de OSNAP.
 * Devolve `[]` para blocos sem `pontosConexao` definido (sem quebrar
 * nada, só sem candidato).
 */
export function pontosConexaoMundo(geo: BlocoGeometria): { x: number; y: number }[] {
  const def = getBlockDef(geo.nome);
  if (!def || !def.pontosConexao || def.pontosConexao.length === 0) return [];

  const larguraMundo = def.largura * (geo.escalaX ?? geo.escala ?? 1);
  const alturaMundo = def.altura * (geo.escalaY ?? geo.escala ?? 1);
  const fx = larguraMundo / 100;
  const fy = alturaMundo / 100;

  const anguloRad = ((geo.rotacao ?? 0) * Math.PI) / 180;
  const cosA = Math.cos(anguloRad);
  const sinA = Math.sin(anguloRad);

  return def.pontosConexao.map((p) => {
    const lx = (p.x - 50) * fx;
    const ly = (p.y - 50) * fy;
    return {
      x: geo.x + lx * cosA - ly * sinA,
      y: geo.y + lx * sinA + ly * cosA,
    };
  });
}

/**
 * Reescala todos os `stroke-width="N"` do SVG de um bloco por `fator`,
 * preservando as proporções RELATIVAS entre traços de um mesmo símbolo
 * (ex.: o contorno principal em "4" vs. um detalhe mais fino em "3") --
 * usado para fazer a linha do bloco bater com a espessura da CAMADA em
 * que ele está (Iteração 12f), já que cada bloco é um SVG rasterizado
 * (viewBox fixo 0-100) com espessuras fixas "cravadas" na marcação, ao
 * contrário de linha/círculo/retângulo (que já respeitam
 * `camada.espessuraDaLinha` nativamente via Konva). `fator === 1` é a
 * identidade -- devolve `svgInner` sem tocar (evita trabalho à toa nos
 * ~15 pontos que chamam isso sem se importar com espessura, ex.: prévia
 * da `BlockLibraryPanel`).
 */
function reescalarEspessuras(svgInner: string, fator: number): string {
  if (fator === 1 || !Number.isFinite(fator) || fator <= 0) return svgInner;
  return svgInner.replace(/stroke-width="([\d.]+)"/g, (_match, n: string) => {
    const escalado = Math.max(0.3, parseFloat(n) * fator);
    return `stroke-width="${escalado.toFixed(2)}"`;
  });
}

/** Monta o SVG completo (com tag externa) pronto para virar data-URI. `fatorEspessura` ver `reescalarEspessuras`. */
export function buildFullSvg(block: BlockDef, fatorEspessura = 1): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${reescalarEspessuras(block.svgInner, fatorEspessura)}</svg>`;
}

/**
 * Converte o SVG do bloco em data-URI utilizável por <img>/Konva.Image.
 * `fatorEspessura` (Iteração 12f, opcional -- default 1 = como sempre foi)
 * reescala os `stroke-width` do SVG; ver `BlocoShape.tsx` para como o
 * fator é calculado a partir de `camada.espessuraDaLinha`.
 */
export function blockToDataUri(block: BlockDef, fatorEspessura = 1): string {
  const svg = buildFullSvg(block, fatorEspessura);
  // encodeURIComponent é mais seguro que btoa para SVG com acentos/UTF-8.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
