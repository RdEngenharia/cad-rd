/**
 * roomDetection.ts
 * -----------------------------------------------------------------------
 * Iteração 35 -- detecção automática de CÔMODOS a partir de geometria de
 * paredes já desenhada (linhas/polilinhas/retângulos/polígonos) + textos
 * de nome de ambiente, para alimentar o gerador automático de tomadas/
 * interruptores/iluminação (`lib/lancamentoEletrico.ts`).
 *
 * Pedido original do usuário (verbatim): "a regra é selecionar primeiro a
 * casa ai o botao de lançar circuitos fica ativado [...] a regra é que
 * todos os comodos tenham nome pois existem normas para comodos
 * diferentes na norma, tambem existem comodos que nao tem divisoria o
 * sistema precisa entender isso e pedir que o usuario desenhe uma linha
 * para fechar todos os comodos [...] muito cuidado para nao passar
 * informacoes erradas".
 *
 * ESTRATÉGIA -- raster/flood-fill (não geometria computacional exata):
 * paredes reais desenhadas à mão (o usuário confirmou: "paredes com duas
 * linhas representando os 14cm do tijolo, usamos as vezes comando offset")
 * quase sempre têm pequenas imperfeições -- gaps de meio milímetro num
 * canto, um endpoint que não encosta exatamente no outro. Tentar montar um
 * grafo planar EXATO a partir dessas linhas quebra fácil com qualquer gap.
 * Em vez disso: transforma a seleção num grid (células de `res` mm),
 * "pinta" de bloqueado uma faixa em volta de cada segmento de parede (um
 * buffer pequeno, só o suficiente pra tolerar gaps de poucos milímetros/
 * poucos cm num canto -- NÃO precisa ser maior que a distância de 14cm
 * entre as 2 linhas de uma parede dupla, porque cada linha sozinha já
 * bloqueia o flood-fill independentemente da outra) e faz flood-fill
 * (BFS) nas células livres. Cada componente conectado é um "candidato a
 * cômodo".
 *
 * REGRA DE SEGURANÇA (pedido explícito do usuário -- nunca adivinhar):
 *   - Um componente que TOCA a borda do grid (que tem uma margem generosa
 *     em volta de toda a seleção) "vazou" pro exterior -- parede externa
 *     com um vão, ou não há parede nenhuma ali. Marcado como "aberta".
 *   - Um componente com 2+ textos de nome de ambiente dentro dele é o caso
 *     "existem comodos que nao tem divisoria" do pedido original: dois
 *     ambientes nomeados caindo na MESMA área conectada (falta uma parede/
 *     divisória entre eles). Marcado como "mesclada" -- o sistema NUNCA
 *     tenta adivinhar onde cortar; só pede pro usuário desenhar uma linha
 *     temporária de fechamento (que ele apaga depois, como pedido) e rodar
 *     de novo.
 *   - Um componente FECHADO (não toca a borda) sem NENHUM texto dentro é
 *     "sem nome" -- por ex. um cômodo real que o projetista esqueceu de
 *     rotular. Também nunca processado sem nome.
 *   - Só um componente fechado com EXATAMENTE 1 texto de nome vira um
 *     "cômodo" de verdade, processável.
 * -----------------------------------------------------------------------
 */

import type {
  Geometria,
  LinhaGeometria,
  PoligonoGeometria,
  PolilinhaGeometria,
  RetanguloGeometria,
  TextoGeometria,
} from "./types";
import { distanciaAoSegmento } from "./geom";
import type { TipoAmbiente } from "./cargasEletricas";

interface Ponto {
  x: number;
  y: number;
}

/** Resolução padrão do grid (mm/célula) -- fino o bastante pra não corroer a área útil do cômodo, grosso o bastante pra rodar rápido numa casa inteira e tolerar pequenos gaps de desenho. */
export const RESOLUCAO_GRID_MM_PADRAO = 20;

/** Buffer (mm) em volta de cada linha de parede -- tolera gaps de canto de poucos cm sem precisar (nem dever) juntar as 2 linhas de uma parede dupla de 14cm. */
const BUFFER_PAREDE_MM = 35;

/** Margem (mm) em volta da bounding box da seleção -- generosa o bastante pra qualquer vazamento de verdade pro exterior sempre alcançar a borda do grid (nunca ficar "preso" antes por falta de espaço). */
const MARGEM_GRID_MM = 1000;

/** Segmento de parede (2 pontos), já extraído de qualquer tipo de geometria fechada/aberta. */
type Segmento = [Ponto, Ponto];

/** Extrai todos os segmentos de linha "formadores de parede" da geometria selecionada. Círculos/arcos/blocos/textos/cotas/viewports não bloqueiam (limitação documentada: paredes curvas não são suportadas nesta versão). */
export function extrairSegmentosDeParede(geometria: Geometria[]): Segmento[] {
  const segmentos: Segmento[] = [];
  for (const g of geometria) {
    switch (g.tipo) {
      case "linha": {
        const l = g as LinhaGeometria;
        segmentos.push([{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]);
        break;
      }
      case "retangulo": {
        const r = g as RetanguloGeometria;
        const p1 = { x: r.x, y: r.y };
        const p2 = { x: r.x + r.largura, y: r.y };
        const p3 = { x: r.x + r.largura, y: r.y + r.altura };
        const p4 = { x: r.x, y: r.y + r.altura };
        segmentos.push([p1, p2], [p2, p3], [p3, p4], [p4, p1]);
        break;
      }
      case "poligono": {
        const p = g as PoligonoGeometria;
        for (let i = 0; i < p.pontos.length; i++) {
          const a = p.pontos[i];
          const b = p.pontos[(i + 1) % p.pontos.length];
          segmentos.push([a, b]);
        }
        break;
      }
      case "polilinha": {
        const p = g as PolilinhaGeometria;
        for (let i = 1; i < p.pontos.length; i++) {
          segmentos.push([p.pontos[i - 1], p.pontos[i]]);
        }
        break;
      }
      // circulo/arco/bloco/texto/cota/viewport: não formam parede -- ver comentário do cabeçalho.
      default:
        break;
    }
  }
  return segmentos;
}

interface Grade {
  minX: number;
  minY: number;
  res: number;
  cols: number;
  rows: number;
}

function celulaDoMundo(grade: Grade, p: Ponto): { col: number; row: number } {
  return {
    col: Math.floor((p.x - grade.minX) / grade.res),
    row: Math.floor((p.y - grade.minY) / grade.res),
  };
}

function centroDaCelula(grade: Grade, col: number, row: number): Ponto {
  return { x: grade.minX + (col + 0.5) * grade.res, y: grade.minY + (row + 0.5) * grade.res };
}

/** Vértice de grid (canto de célula) em coordenadas de mundo -- usado pelo traçado de contorno (ver `tracarContorno`). */
function verticeDoGrid(grade: Grade, col: number, row: number): Ponto {
  return { x: grade.minX + col * grade.res, y: grade.minY + row * grade.res };
}

/** Marca de bloqueado (parede) as células dentro de `BUFFER_PAREDE_MM` de qualquer segmento. */
function rasterizarParedes(grade: Grade, bloqueado: Uint8Array, segmentos: Segmento[]) {
  const raio = BUFFER_PAREDE_MM;
  for (const [a, b] of segmentos) {
    const minX = Math.min(a.x, b.x) - raio;
    const maxX = Math.max(a.x, b.x) + raio;
    const minY = Math.min(a.y, b.y) - raio;
    const maxY = Math.max(a.y, b.y) + raio;
    const c0 = Math.max(0, Math.floor((minX - grade.minX) / grade.res));
    const c1 = Math.min(grade.cols - 1, Math.ceil((maxX - grade.minX) / grade.res));
    const r0 = Math.max(0, Math.floor((minY - grade.minY) / grade.res));
    const r1 = Math.min(grade.rows - 1, Math.ceil((maxY - grade.minY) / grade.res));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const idx = row * grade.cols + col;
        if (bloqueado[idx]) continue;
        const centro = centroDaCelula(grade, col, row);
        if (distanciaAoSegmento(centro, a, b).dist <= raio) bloqueado[idx] = 1;
      }
    }
  }
}

interface ComponenteBruto {
  id: number;
  celulas: { col: number; row: number }[];
  tocaBorda: boolean;
  somaX: number;
  somaY: number;
}

/** Flood-fill (BFS, 4-conectado) das células livres -- devolve o rótulo de componente por célula (`-1` = bloqueada) e os componentes encontrados. */
function floodFill(grade: Grade, bloqueado: Uint8Array): { comp: Int32Array; componentes: ComponenteBruto[] } {
  const { cols, rows } = grade;
  const comp = new Int32Array(cols * rows).fill(-1);
  const componentes: ComponenteBruto[] = [];
  const fila: number[] = [];

  for (let rowIni = 0; rowIni < rows; rowIni++) {
    for (let colIni = 0; colIni < cols; colIni++) {
      const idxIni = rowIni * cols + colIni;
      if (bloqueado[idxIni] || comp[idxIni] !== -1) continue;

      const id = componentes.length;
      const celulas: { col: number; row: number }[] = [];
      let tocaBorda = false;
      let somaX = 0;
      let somaY = 0;

      comp[idxIni] = id;
      fila.push(idxIni);
      while (fila.length > 0) {
        const idx = fila.pop()!;
        const row = Math.floor(idx / cols);
        const col = idx - row * cols;
        celulas.push({ col, row });
        const centro = centroDaCelula(grade, col, row);
        somaX += centro.x;
        somaY += centro.y;
        if (col === 0 || col === cols - 1 || row === 0 || row === rows - 1) tocaBorda = true;

        const vizinhos = [
          [col - 1, row],
          [col + 1, row],
          [col, row - 1],
          [col, row + 1],
        ];
        for (const [vc, vr] of vizinhos) {
          if (vc < 0 || vc >= cols || vr < 0 || vr >= rows) continue;
          const vidx = vr * cols + vc;
          if (bloqueado[vidx] || comp[vidx] !== -1) continue;
          comp[vidx] = id;
          fila.push(vidx);
        }
      }
      componentes.push({ id, celulas, tocaBorda, somaX, somaY });
    }
  }
  return { comp, componentes };
}

/**
 * Traçado de contorno: constrói o(s) polígono(s) de borda de um conjunto
 * de células (todas do MESMO componente) a partir do grafo de arestas de
 * fronteira (aresta = lado de uma célula do conjunto que encosta numa
 * célula FORA do conjunto -- bloqueada ou de outro componente -- ou na
 * borda do grid). Cada aresta de fronteira liga 2 vértices de grid; como o
 * conjunto é 4-conectado, todo vértice de fronteira tem exatamente 2
 * arestas em casos não-degenerados, formando um ou mais laços fechados
 * (laço externo + eventuais "buracos" internos, ex.: uma coluna estrutural
 * -- não modelados como buraco nesta versão, ver limitação no relatório
 * final). Devolve o MAIOR laço por área absoluta (o contorno externo).
 *
 * Se o grafo de arestas não fechar num laço único dentro de um número
 * razoável de passos (situação degenerada rara -- ex.: 2 células do
 * mesmo componente se tocando só pela quina, um "pinch point"), devolve
 * `null` em vez de arriscar um polígono errado -- quem chama cai num
 * modo mais simples (sem posicionamento automático dos pontos ao longo do
 * perímetro, só área/perímetro/centro por contagem de células).
 */
function areaAbsPontos(pontos: Ponto[]): number {
  let s = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Traça TODOS os laços fechados do contorno de fronteira do componente
 * (não só o maior) -- extraído de `tracarContorno` (que só queria o
 * laço externo) porque a CONTAGEM de laços virou um sinal importante:
 * ver `ehResiduoDeParedeDupla` logo abaixo. Devolve `null` no mesmo caso
 * degenerado de sempre (grafo de arestas não fechou com segurança).
 */
function tracarTodosOsLacos(grade: Grade, comp: Int32Array, idAlvo: number, cellSet: Set<number>): Ponto[][] | null {
  const { cols } = grade;
  // chave de vértice = row*(cols+1)+col
  const vcols = cols + 1;
  const vkey = (col: number, row: number) => row * vcols + col;

  const proximaAresta = new Map<number, [number, number]>(); // fromVertexKey -> [toCol,toRow] (assume 1 aresta por vértice de saída no caso comum)
  const arestas: [number, number, number, number][] = []; // [c1,r1,c2,r2]

  function pertence(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= cols || row >= grade.rows) return false;
    return comp[row * cols + col] === idAlvo;
  }

  for (const idx of cellSet) {
    const row = Math.floor(idx / cols);
    const col = idx - row * cols;
    // Convenção (mundo Y cresce pra baixo, ver cabeçalho de dxfExport.ts pra
    // a mesma convenção de eixos do resto do app): percorrendo cada aresta
    // de fronteira no sentido horário com a célula preenchida à DIREITA de
    // quem anda, o laço resultante fecha com winding consistente.
    if (!pertence(col, row - 1)) arestas.push([col, row, col + 1, row]); // topo: esquerda -> direita
    if (!pertence(col + 1, row)) arestas.push([col + 1, row, col + 1, row + 1]); // direita: cima -> baixo
    if (!pertence(col, row + 1)) arestas.push([col + 1, row + 1, col, row + 1]); // baixo: direita -> esquerda
    if (!pertence(col - 1, row)) arestas.push([col, row + 1, col, row]); // esquerda: baixo -> cima
  }

  if (arestas.length === 0) return null;
  for (const [c1, r1, c2, r2] of arestas) {
    proximaAresta.set(vkey(c1, r1), [c2, r2]);
  }

  const visitadas = new Set<number>();
  const laços: Ponto[][] = [];
  for (const [c1, r1] of arestas) {
    const chaveInicial = vkey(c1, r1);
    if (visitadas.has(chaveInicial)) continue;

    const laço: Ponto[] = [];
    let atualCol = c1;
    let atualRow = r1;
    let passos = 0;
    const limite = arestas.length + 2;
    while (passos < limite) {
      const chave = vkey(atualCol, atualRow);
      if (visitadas.has(chave)) {
        // Fechou o laço (voltou a um vértice já visitado nesta volta).
        break;
      }
      visitadas.add(chave);
      laço.push(verticeDoGrid(grade, atualCol, atualRow));
      const prox = proximaAresta.get(chave);
      if (!prox) {
        // Grafo quebrado -- não deveria acontecer num conjunto 4-conectado
        // simples, mas não arrisca: aborta o traçado inteiro (ver comentário
        // da função).
        return null;
      }
      [atualCol, atualRow] = prox;
      passos++;
    }
    if (passos >= limite) return null; // não fechou -- caso degenerado, não arrisca.
    if (laço.length >= 3) laços.push(laço);
  }

  if (laços.length === 0) return null;
  laços.sort((a, b) => areaAbsPontos(b) - areaAbsPontos(a));
  return laços;
}

function tracarContorno(grade: Grade, comp: Int32Array, idAlvo: number, cellSet: Set<number>): Ponto[] | null {
  const laços = tracarTodosOsLacos(grade, comp, idAlvo, cellSet);
  if (!laços) return null;
  // Maior laço por área absoluta (shoelace) = contorno externo.
  return simplificarColineares(laços[0]);
}

/**
 * Área mínima (m²) que um SEGUNDO laço precisa ter pra contar como
 * "furo" de verdade, e não só ruído da rasterização (uns poucos pixels
 * de escada entre 2 componentes que quase se tocam). Bem menor que o
 * corte de 1m² usado pra reportar "sem_nome" -- mesmo um furo pequeno já
 * prova que a forma é um ANEL (parede dupla), não uma sala.
 */
const AREA_MINIMA_LACO_INTERNO_M2 = 0.05;

/**
 * Detecta o padrão "resíduo de parede dupla": o vão ENTRE as duas linhas
 * de uma parede desenhada em par (face externa + face interna, ex.: 14/15cm
 * de tijolo -- ver comentário no cabeçalho do arquivo, "usamos as vezes
 * comando offset") forma, ele mesmo, um componente FECHADO do flood-fill
 * -- uma faixa/moldura que corre em volta do cômodo real, sem nenhum
 * texto dentro (o nome do cômodo fica na linha interna, não na faixa).
 * Se essa faixa for comprida o bastante (perímetro do cômodo x espessura
 * da parede), sua área facilmente passa de 1m² e o sistema reportava um
 * falso "sem_nome" -- bug real reportado pelo usuário (planta com sala/
 * quarto/banheiro todos nomeados e fechados, mesmo assim erro de cômodo
 * sem nome).
 *
 * Sinal usado: topologicamente, essa faixa é um ANEL (multiplamente
 * conexo) -- tem um laço de fronteira EXTERNO e outro INTERNO (o "furo"
 * = a área do cômodo lá dentro, cercada pela linha interna da parede).
 * Uma sala de verdade, por mais irregular que seja (formato em L, U etc.),
 * é sempre SIMPLESMENTE conexa -- só tem 1 laço de fronteira. Por isso,
 * em vez de um limiar de "quão fina"/"quão oca" (arriscado -- corredores
 * estreitos de verdade também são finos), usa a contagem de laços: 2 ou
 * mais laços de área substancial (`AREA_MINIMA_LACO_INTERNO_M2`) é uma
 * prova geométrica direta de anel, não uma heurística de tamanho.
 */
function ehResiduoDeParedeDupla(grade: Grade, comp: Int32Array, idAlvo: number, cellSet: Set<number>): boolean {
  const laços = tracarTodosOsLacos(grade, comp, idAlvo, cellSet);
  if (!laços || laços.length < 2) return false;
  // laços[0] é sempre o maior (laço externo) -- basta o segundo maior já
  // ser substancial pra confirmar que há um furo de verdade.
  const areaSegundoLacoM2 = areaAbsPontos(laços[1]) / 1_000_000;
  return areaSegundoLacoM2 >= AREA_MINIMA_LACO_INTERNO_M2;
}

/** Remove vértices colineares consecutivos (mesma direção) -- reduz a "escada" do traçado raster a um polígono mais limpo, sem mudar a forma. */
function simplificarColineares(pontos: Ponto[]): Ponto[] {
  if (pontos.length < 3) return pontos;
  const resultado: Ponto[] = [];
  const n = pontos.length;
  for (let i = 0; i < n; i++) {
    const prev = pontos[(i - 1 + n) % n];
    const atual = pontos[i];
    const prox = pontos[(i + 1) % n];
    const d1x = atual.x - prev.x;
    const d1y = atual.y - prev.y;
    const d2x = prox.x - atual.x;
    const d2y = prox.y - atual.y;
    // Colinear se o produto cruzado for ~0 (mesma direção, sem virar).
    const cruz = d1x * d2y - d1y * d2x;
    if (Math.abs(cruz) > 1e-6) resultado.push(atual);
  }
  return resultado.length >= 3 ? resultado : pontos;
}

function perimetroPoligono(pontos: Ponto[]): number {
  let p = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

function areaPoligono(pontos: Ponto[]): number {
  let s = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Teste ponto-em-polígono (ray casting) -- usado só pra validar se o centroide calculado cai de fato dentro do próprio cômodo (ver comentário em `detectarComodos`). */
function pontoDentroDoPoligono(p: Ponto, poligono: Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const pi = poligono[i];
    const pj = poligono[j];
    const intersecta = pi.y > p.y !== pj.y > p.y && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

// ---------------------------------------------------------------------
// Classificação do nome do ambiente (palavra-chave -> TipoAmbiente)
// ---------------------------------------------------------------------

/**
 * Reconhece o TIPO de ambiente (vocabulário de `cargasEletricas.ts`, ver
 * `TipoAmbiente`) a partir do texto livre digitado pelo projetista na
 * planta -- comparação por palavra-chave, sem acento, case-insensitive.
 * QUALQUER texto (mesmo que não bata com nenhuma palavra-chave) ainda
 * conta como "o cômodo tem nome" -- só não é possível classificar o TIPO
 * com segurança, então cai em "outro" (regra normativa mais genérica/
 * conservadora: tomadas por perímetro sem tratamento especial de área
 * molhada). Nunca adivinha "banheiro"/"cozinha"/etc a partir de um nome
 * ambíguo -- só quando a palavra-chave aparece de fato no texto.
 */
export function inferirTipoAmbientePorNome(textoOriginal: string): TipoAmbiente {
  const t = textoOriginal
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  const grupos: [TipoAmbiente, string[]][] = [
    ["banheiro", ["banheiro", "lavabo", " wc", "wc ", "toalete", "sanitario"]],
    ["cozinha", ["cozinha", "copa"]],
    ["area_servico", ["area de servico", "lavanderia", "servico"]],
    ["varanda", ["varanda", "sacada", "terraco", "deck"]],
    ["garagem", ["garagem", "vaga"]],
    ["corredor", ["corredor", "hall", "circulacao"]],
    ["escritorio", ["escritorio", "home office", "estudio"]],
    ["quarto", ["quarto", "dormitorio", "suite", "closet"]],
    ["sala", ["sala", "estar", "jantar", "living"]],
  ];
  for (const [tipo, chaves] of grupos) {
    if (chaves.some((c) => t.includes(c))) return tipo;
  }
  return "outro";
}

// ---------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------

export interface ComodoDetectado {
  /** Texto exato digitado pelo projetista (ex.: "Quarto 1", "Suíte Master"). */
  nome: string;
  tipo: TipoAmbiente;
  areaM2: number;
  perimetroM: number;
  centroide: Ponto;
  /** Contorno (mundo, mm) do cômodo -- só presente quando o traçado fechou com segurança (ver `contornoConfiavel`). */
  contorno: Ponto[] | null;
  /** `false` quando o traçado do contorno não fechou com segurança -- ver `tracarContorno`. Área/perímetro/centro continuam válidos (calculados por contagem de células), só o posicionamento automático dos pontos ao longo do perímetro fica indisponível. */
  contornoConfiavel: boolean;
  /** Id do elemento `texto` que deu nome a este cômodo (rastreabilidade). */
  textoId: string;
}

export type TipoProblemaComodo = "aberta" | "mesclada" | "sem_nome";

export interface ProblemaComodo {
  tipo: TipoProblemaComodo;
  /** Nomes de texto envolvidos (vazio para "sem_nome"). */
  nomes: string[];
  centroideAprox: Ponto;
  areaM2Aprox: number;
}

export interface ResultadoDeteccaoComodos {
  comodos: ComodoDetectado[];
  problemas: ProblemaComodo[];
  resolucaoMm: number;
}

/**
 * Detecta os cômodos da seleção (geometria de paredes + textos de nome).
 * `textos` deve ser a lista de elementos `texto` presentes na MESMA
 * seleção (o botão que chama isso passa `projeto.geometria` filtrada por
 * `selecionadoIds`, ver `lib/lancamentoEletrico.ts`/store).
 */
export function detectarComodos(
  geometriaSelecionada: Geometria[],
  resolucaoMm: number = RESOLUCAO_GRID_MM_PADRAO
): ResultadoDeteccaoComodos {
  const segmentos = extrairSegmentosDeParede(geometriaSelecionada);
  const textos = geometriaSelecionada.filter((g): g is TextoGeometria => g.tipo === "texto");

  if (segmentos.length === 0) {
    return { comodos: [], problemas: [], resolucaoMm };
  }

  // Bounding box de TUDO (paredes + textos), com margem generosa -- ver
  // `MARGEM_GRID_MM` no cabeçalho.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [a, b] of segmentos) {
    minX = Math.min(minX, a.x, b.x);
    minY = Math.min(minY, a.y, b.y);
    maxX = Math.max(maxX, a.x, b.x);
    maxY = Math.max(maxY, a.y, b.y);
  }
  for (const t of textos) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
  }
  minX -= MARGEM_GRID_MM;
  minY -= MARGEM_GRID_MM;
  maxX += MARGEM_GRID_MM;
  maxY += MARGEM_GRID_MM;

  const grade: Grade = {
    minX,
    minY,
    res: resolucaoMm,
    cols: Math.max(1, Math.ceil((maxX - minX) / resolucaoMm)),
    rows: Math.max(1, Math.ceil((maxY - minY) / resolucaoMm)),
  };

  const bloqueado = new Uint8Array(grade.cols * grade.rows);
  rasterizarParedes(grade, bloqueado, segmentos);
  const { comp, componentes } = floodFill(grade, bloqueado);

  // Casa cada texto com o componente que contém sua célula -- se a célula
  // exata cair bloqueada (texto encostado numa parede), procura em anéis
  // crescentes ao redor (até 5 células) antes de desistir.
  const textosPorComponente = new Map<number, TextoGeometria[]>();
  const textosSemComponente: TextoGeometria[] = [];
  for (const t of textos) {
    const { col, row } = celulaDoMundo(grade, { x: t.x, y: t.y });
    let idComp = -1;
    for (let raio = 0; raio <= 5 && idComp === -1; raio++) {
      for (let dr = -raio; dr <= raio && idComp === -1; dr++) {
        for (let dc = -raio; dc <= raio && idComp === -1; dc++) {
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= grade.cols || r >= grade.rows) continue;
          const idx = r * grade.cols + c;
          if (comp[idx] !== -1) idComp = comp[idx];
        }
      }
    }
    if (idComp === -1) {
      textosSemComponente.push(t);
      continue;
    }
    const lista = textosPorComponente.get(idComp) ?? [];
    lista.push(t);
    textosPorComponente.set(idComp, lista);
  }

  const comodos: ComodoDetectado[] = [];
  const problemas: ProblemaComodo[] = [];

  for (const componente of componentes) {
    const areaM2Celulas = (componente.celulas.length * grade.res * grade.res) / 1_000_000;
    const centroCelulas: Ponto = {
      x: componente.somaX / componente.celulas.length,
      y: componente.somaY / componente.celulas.length,
    };
    const textosDoComponente = textosPorComponente.get(componente.id) ?? [];

    if (componente.tocaBorda) {
      // Só reporta como problema real se houver algum NOME dentro dessa
      // área vazada -- sem isso, o componente que toca a borda é quase
      // sempre só o EXTERIOR da própria seleção (o resto do mundo em volta
      // da casa, que naturalmente encosta na margem do grid) e não deveria
      // virar um aviso pro usuário resolver.
      if (textosDoComponente.length > 0) {
        problemas.push({
          tipo: "aberta",
          nomes: textosDoComponente.map((t) => t.conteudo),
          centroideAprox: centroCelulas,
          areaM2Aprox: areaM2Celulas,
        });
      }
      continue;
    }
    if (textosDoComponente.length === 0) {
      // Ignora componentes minúsculos (frestas/ruído de rasterização entre
      // paredes bem próximas) -- só reporta "sem nome" para áreas com
      // tamanho plausível de cômodo (>= 1m²), pra não gerar dezenas de
      // falsos avisos em casas com paredes bem detalhadas.
      if (areaM2Celulas >= 1) {
        // Antes de reportar, descarta o caso "resíduo de parede dupla"
        // (ver `ehResiduoDeParedeDupla`) -- o vão entre a face externa e
        // a face interna de uma parede desenhada em par forma, ele
        // mesmo, um componente fechado sem nome, mas geometricamente é
        // um ANEL (furo = a sala real lá dentro), nunca uma sala de
        // verdade. Bug real reportado pelo usuário: planta com todos os
        // cômodos nomeados e fechados (parede dupla, 14/15cm de tijolo)
        // continuava dando erro de "cômodo sem nome".
        const cellSet = new Set(componente.celulas.map((c) => c.row * grade.cols + c.col));
        if (!ehResiduoDeParedeDupla(grade, comp, componente.id, cellSet)) {
          problemas.push({ tipo: "sem_nome", nomes: [], centroideAprox: centroCelulas, areaM2Aprox: areaM2Celulas });
        }
      }
      continue;
    }
    if (textosDoComponente.length >= 2) {
      problemas.push({
        tipo: "mesclada",
        nomes: textosDoComponente.map((t) => t.conteudo),
        centroideAprox: centroCelulas,
        areaM2Aprox: areaM2Celulas,
      });
      continue;
    }

    // Exatamente 1 texto, componente fechado -- cômodo válido.
    const texto = textosDoComponente[0];
    const cellSet = new Set(componente.celulas.map((c) => c.row * grade.cols + c.col));
    const contorno = tracarContorno(grade, comp, componente.id, cellSet);

    let centroide = centroCelulas;
    let areaM2 = areaM2Celulas;
    let perimetroM = 0;
    let contornoConfiavel = false;

    if (contorno && contorno.length >= 3) {
      const areaContorno = areaPoligono(contorno) / 1_000_000;
      // Só confia no contorno traçado se a área bater (tolerância 15%) com
      // a contagem de células -- discrepância grande indicaria um laço
      // degenerado que passou pelas checagens de `tracarContorno` por
      // acidente. Nesse caso cai pro modo "sem contorno confiável".
      if (areaContorno > 0 && Math.abs(areaContorno - areaM2Celulas) / areaM2Celulas < 0.15) {
        const centroideContorno = { x: 0, y: 0 };
        contorno.forEach((p) => {
          centroideContorno.x += p.x;
          centroideContorno.y += p.y;
        });
        centroideContorno.x /= contorno.length;
        centroideContorno.y /= contorno.length;
        // Valida que o centroide (média dos vértices do contorno, mais
        // estável que o centroide de área pra formas em L/U bem
        // acentuadas) realmente cai DENTRO do polígono -- senão usa o
        // centro por contagem de células (sempre garantido dentro, ver
        // cabeçalho da função).
        centroide = pontoDentroDoPoligono(centroideContorno, contorno) ? centroideContorno : centroCelulas;
        areaM2 = areaContorno;
        perimetroM = perimetroPoligono(contorno) / 1000;
        contornoConfiavel = true;
      }
    }
    if (!contornoConfiavel) {
      // Fallback sem contorno: perímetro estimado por contagem de células
      // de fronteira (conta lados de célula expostos) -- menos preciso,
      // mas nunca falso/negativo (só afeta o cálculo de quantidade de
      // tomadas, não o posicionamento, que fica indisponível ver acima).
      let ladosExpostos = 0;
      for (const { col, row } of componente.celulas) {
        const vizinhos = [
          [col - 1, row],
          [col + 1, row],
          [col, row - 1],
          [col, row + 1],
        ];
        for (const [vc, vr] of vizinhos) {
          if (vc < 0 || vr < 0 || vc >= grade.cols || vr >= grade.rows || comp[vr * grade.cols + vc] !== componente.id) {
            ladosExpostos++;
          }
        }
      }
      perimetroM = (ladosExpostos * grade.res) / 1000;
    }

    comodos.push({
      nome: texto.conteudo,
      tipo: inferirTipoAmbientePorNome(texto.conteudo),
      areaM2,
      perimetroM,
      centroide,
      contorno: contornoConfiavel ? contorno : null,
      contornoConfiavel,
      textoId: texto.id,
    });
  }

  // Textos que não caíram em NENHUM componente (ex.: fora de qualquer área
  // fechada, ou dentro de uma região 100% bloqueada) -- reporta como aviso
  // informativo em vez de descartar silenciosamente.
  for (const t of textosSemComponente) {
    problemas.push({ tipo: "sem_nome", nomes: [t.conteudo], centroideAprox: { x: t.x, y: t.y }, areaM2Aprox: 0 });
  }

  return { comodos, problemas, resolucaoMm };
}

/**
 * Iteração 42 -- mesma detecção acima, mas com o fallback de "textos
 * próximos não selecionados" que `store.ts#gerarLancamentoEletrico` já
 * fazia (inline, duplicado). Extraído aqui pra ser reaproveitado também
 * pelo pré-preenchimento do modal de Dimensionamento de Cargas (pedido do
 * usuário: "interligue... o botao de lançamento de dimensionamento de
 * cargas ao selecionar a planta baixa com os circuitos lançados") -- os
 * DOIS fluxos (lançar tomadas/iluminação E pré-preencher o formulário de
 * cargas a partir da MESMA seleção) precisam enxergar exatamente os mesmos
 * cômodos, com a mesma tolerância de busca de texto perto da parede.
 *
 * `geometriaSelecionada` é a seleção atual (paredes + nomes já
 * selecionados); `geometriaCompleta` é o projeto inteiro, usado só pra
 * buscar textos de nome que estejam perto das paredes selecionadas mas
 * não tenham sido clicados/incluídos na seleção.
 */
export function detectarComodosComFallbackDeTexto(
  geometriaSelecionada: Geometria[],
  geometriaCompleta: Geometria[]
): ResultadoDeteccaoComodos {
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
      const textosProximosNaoSelecionados = geometriaCompleta.filter(
        (g): g is TextoGeometria =>
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

  return deteccao;
}

/**
 * Ângulo de rotação (graus, sentido HORÁRIO, mesma convenção usada em todo
 * o projeto para `BlocoGeometria.rotacao` -- ver `blocks.ts#pontosConexaoMundo`,
 * `pdfExport.ts#desenharBloco`, `dxfExport.ts#desenharBlocoDxf` e
 * `BlocoShape.tsx`, todos aplicando a MESMA transformação:
 * `worldX = lx*cosA - ly*senA`, `worldY = lx*senA + ly*cosA`, onde `lx,ly`
 * são coordenadas locais do bloco (viewBox 0-100, já centradas em 0,0)).
 *
 * Bug relatado pelo usuário: "quero as simbologias faceando com a parede
 * da planta baixa" -- os blocos de tomada/interruptor são desenhados na
 * biblioteca (`blocks.ts`) com a face/ápice que deve encarar o cômodo
 * apontando para o local `(0,-1)` (ex.: o ápice do triângulo da tomada, em
 * `(50,8)` relativo ao centro do viewBox `(50,50)`). Esta função devolve o
 * ângulo que gira essa direção local `(0,-1)` até coincidir com a normal
 * `(nx,ny)` (unitária, apontando da parede PRA DENTRO do cômodo -- já
 * calculada por quem chama), deixando o símbolo "de frente" pra dentro do
 * ambiente e, portanto, com a base encostada/faceando a parede mais
 * próxima.
 *
 * Dedução: substituindo `lx=0, ly=-1` na transformação acima, `worldX =
 * senA` e `worldY = -cosA` -- igualando a `(nx,ny)`: `senA = nx`, `cosA =
 * -ny` => `A = atan2(nx, -ny)`. Conferido à mão para o caso
 * `(nx,ny)=(0,1)` (parede em cima, cômodo embaixo): `A = atan2(0,-1) =
 * 180°`, que de fato reorienta o local `(0,-1)` para o mundo `(0,1)`
 * (ápice apontando pra baixo, pra dentro do cômodo) -- correto.
 */
export function anguloFaceandoParede(nx: number, ny: number): number {
  let graus = (Math.atan2(nx, -ny) * 180) / Math.PI;
  if (graus < 0) graus += 360;
  return graus;
}

/** Devolve pontos espaçados uniformemente ao longo do perímetro de `poligono`, deslocados `insetMm` para DENTRO (perpendicular ao trecho local, sempre no sentido do centro do polígono), cada um já com o `anguloGraus` (ver `anguloFaceandoParede`) que orienta o símbolo de frente pra dentro do cômodo/faceando a parede mais próxima. Usado por `lib/lancamentoEletrico.ts` para posicionar tomadas. */
export function distribuirPontosNoContorno(
  poligono: Ponto[],
  quantidade: number,
  insetMm: number,
  centro: Ponto
): { x: number; y: number; anguloGraus: number }[] {
  const n = poligono.length;
  if (n < 3 || quantidade <= 0) return [];

  const comprimentos: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = poligono[i];
    const b = poligono[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    comprimentos.push(d);
    total += d;
  }
  if (total <= 0) return [];

  const espacamento = total / quantidade;
  const pontos: { x: number; y: number; anguloGraus: number }[] = [];
  for (let k = 0; k < quantidade; k++) {
    let alvo = espacamento * (k + 0.5);
    let i = 0;
    while (i < n && alvo > comprimentos[i]) {
      alvo -= comprimentos[i];
      i++;
    }
    if (i >= n) i = n - 1;
    const a = poligono[i];
    const b = poligono[(i + 1) % n];
    const d = comprimentos[i] || 1;
    const t = Math.min(1, Math.max(0, alvo / d));
    const ponto = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };

    // Normal perpendicular ao trecho local, escolhendo o sentido que
    // aponta pro centro do polígono (sempre "pra dentro", qualquer que
    // seja a orientação/winding do laço traçado).
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const comprimentoTrecho = Math.hypot(dx, dy) || 1;
    const nx1 = -dy / comprimentoTrecho;
    const ny1 = dx / comprimentoTrecho;
    const paraCentroX = centro.x - ponto.x;
    const paraCentroY = centro.y - ponto.y;
    const mesmoSentido = nx1 * paraCentroX + ny1 * paraCentroY >= 0;
    const nx = mesmoSentido ? nx1 : -nx1;
    const ny = mesmoSentido ? ny1 : -ny1;

    pontos.push({ x: ponto.x + nx * insetMm, y: ponto.y + ny * insetMm, anguloGraus: anguloFaceandoParede(nx, ny) });
  }
  return pontos;
}
