/**
 * scripts/test-lancamento-eletrico.ts
 * -----------------------------------------------------------------------
 * Teste sintético do gerador de tomadas/interruptores/iluminação
 * (Iteração 35) -- valida as fórmulas de quantidade da NBR 5410 e o
 * fluxo completo detectarComodos -> gerarPontosEletricos ->
 * gerarLegendaEletrica sobre uma casa sintética com 3 cômodos.
 * -----------------------------------------------------------------------
 */
import { detectarComodos } from "../src/lib/roomDetection";
import { gerarPontosEletricos, gerarLegendaEletrica, quantidadeTomadasNBR, CAMADA_TOMADAS, CAMADA_ILUMINACAO } from "../src/lib/lancamentoEletrico";
import { getBlockDef } from "../src/lib/blocks";
import type { Geometria } from "../src/lib/types";

let falhas = 0;
function checar(descricao: string, condicao: boolean, detalhe?: string) {
  if (condicao) {
    console.log(`  OK  ${descricao}`);
  } else {
    falhas++;
    console.log(`  FALHOU  ${descricao}${detalhe ? " -- " + detalhe : ""}`);
  }
}

// -----------------------------------------------------------------------
// Teste 1: fórmulas de quantidade (NBR 5410, 9.5.2)
// -----------------------------------------------------------------------
console.log("Teste 1: fórmulas de quantidade de tomadas");
checar("sala, perímetro 14m -> ceil(14/5)=3", quantidadeTomadasNBR("sala", 14) === 3, `${quantidadeTomadasNBR("sala", 14)}`);
checar("sala, perímetro 4m -> mínimo 1", quantidadeTomadasNBR("sala", 4) === 1, `${quantidadeTomadasNBR("sala", 4)}`);
checar("cozinha, perímetro 10m -> ceil(10/3.5)=3", quantidadeTomadasNBR("cozinha", 10) === 3, `${quantidadeTomadasNBR("cozinha", 10)}`);
checar("banheiro, perímetro 20m -> fixo 1", quantidadeTomadasNBR("banheiro", 20) === 1, `${quantidadeTomadasNBR("banheiro", 20)}`);
checar("varanda, perímetro 20m -> fixo 1", quantidadeTomadasNBR("varanda", 20) === 1, `${quantidadeTomadasNBR("varanda", 20)}`);
checar("garagem, perímetro 20m -> fixo 1", quantidadeTomadasNBR("garagem", 20) === 1, `${quantidadeTomadasNBR("garagem", 20)}`);

// -----------------------------------------------------------------------
// Teste 2: fluxo completo numa casa sintética (3 cômodos: sala, cozinha, banheiro)
// -----------------------------------------------------------------------
console.log("Teste 2: fluxo completo (detecção -> pontos -> legenda)");
let uid = 0;
function novoId() {
  uid++;
  return `g${uid}`;
}
function linha(x1: number, y1: number, x2: number, y2: number): Geometria {
  return { id: novoId(), tipo: "linha", camada: "0", x1, y1, x2, y2 };
}
function texto(x: number, y: number, conteudo: string): Geometria {
  return { id: novoId(), tipo: "texto", camada: "0", x, y, conteudo, fontSize: 3 };
}

// Sala 5000x4000, Cozinha 3000x4000 (parede dupla 14cm entre elas),
// Banheiro 2000x2000 -- 3 blocos retangulares lado a lado.
const geo: Geometria[] = [
  // Sala: x 0-5000, y 0-4000
  linha(0, 0, 5000, 0),
  linha(5000, 0, 5000, 4000),
  linha(5000, 4000, 0, 4000),
  linha(0, 4000, 0, 0),
  texto(2500, 2000, "Sala"),

  // Cozinha: x 5140-8140, y 0-4000
  linha(5140, 0, 8140, 0),
  linha(8140, 0, 8140, 4000),
  linha(8140, 4000, 5140, 4000),
  linha(5140, 4000, 5140, 0),
  texto(6640, 2000, "Cozinha"),

  // Banheiro: x 8280-10280, y 0-2000
  linha(8280, 0, 10280, 0),
  linha(10280, 0, 10280, 2000),
  linha(10280, 2000, 8280, 2000),
  linha(8280, 2000, 8280, 0),
  texto(9280, 1000, "Banheiro"),
];

const deteccao = detectarComodos(geo);
checar("3 cômodos detectados", deteccao.comodos.length === 3, `achou ${deteccao.comodos.length}, problemas=${JSON.stringify(deteccao.problemas)}`);
checar("0 problemas", deteccao.problemas.length === 0, JSON.stringify(deteccao.problemas));

const { geometria, resumo } = gerarPontosEletricos(deteccao.comodos);

checar("3 cômodos processados", resumo.comodosProcessados === 3);
checar("3 pontos de luz (1 por cômodo)", resumo.totalPontosLuz === 3, `${resumo.totalPontosLuz}`);
checar("3 interruptores (1 por cômodo)", resumo.totalInterruptores === 3, `${resumo.totalInterruptores}`);

const sala = resumo.porComodo.find((c) => c.nome === "Sala");
const cozinha = resumo.porComodo.find((c) => c.nome === "Cozinha");
const banheiro = resumo.porComodo.find((c) => c.nome === "Banheiro");
checar("Sala encontrada no resumo", !!sala);
checar("Cozinha encontrada no resumo", !!cozinha);
checar("Banheiro encontrado no resumo", !!banheiro);

if (sala) {
  checar("Sala: perímetro ~18m -> 4 tomadas (ceil(18/5))", sala.quantidadeTomadas === 4, `perim=${sala.perimetroM}, qtd=${sala.quantidadeTomadas}`);
  checar("Sala: bloco tomada_baixa", sala.blocoTomada === "tomada_baixa");
}
if (cozinha) {
  checar("Cozinha: perímetro ~14m -> 4 tomadas (ceil(14/3.5))", cozinha.quantidadeTomadas === 4, `perim=${cozinha.perimetroM}, qtd=${cozinha.quantidadeTomadas}`);
  checar("Cozinha: bloco tomada_media", cozinha.blocoTomada === "tomada_media");
}
if (banheiro) {
  checar("Banheiro: mínimo fixo 1 tomada", banheiro.quantidadeTomadas === 1, `qtd=${banheiro.quantidadeTomadas}`);
  checar("Banheiro: bloco tomada_alta", banheiro.blocoTomada === "tomada_alta");
}

const totalTomadasEsperado = (sala?.quantidadeTomadas ?? 0) + (cozinha?.quantidadeTomadas ?? 0) + (banheiro?.quantidadeTomadas ?? 0);
checar("total de tomadas bate com a soma por cômodo", resumo.totalTomadas === totalTomadasEsperado, `${resumo.totalTomadas} vs ${totalTomadasEsperado}`);

const blocosGeometria = geometria.filter((g) => g.tipo === "bloco");
checar("geometria contém só blocos com origemGeradorId marcado", blocosGeometria.every((g) => g.origemGeradorId === "lancamentoEletrico"));
checar(
  "nenhuma tomada_chuveiro foi lançada automaticamente",
  !blocosGeometria.some((g) => g.tipo === "bloco" && g.nome === "tomada_chuveiro")
);
checar(
  "todos os blocos de tomada estão na camada correta",
  blocosGeometria.filter((g) => g.tipo === "bloco" && g.nome.startsWith("tomada_")).every((g) => g.camada === CAMADA_TOMADAS)
);
checar(
  "todos os pontos de luz/interruptor estão na camada correta",
  blocosGeometria
    .filter((g) => g.tipo === "bloco" && (g.nome === "ponto_luz_teto" || g.nome === "interruptor_simples"))
    .every((g) => g.camada === CAMADA_ILUMINACAO)
);

// -----------------------------------------------------------------------
// Teste 3: legenda -- só os blocos de fato usados aparecem
// -----------------------------------------------------------------------
console.log("Teste 3: legenda automática");
const nomesUsados = Array.from(new Set(blocosGeometria.filter((g) => g.tipo === "bloco").map((g) => (g as { nome: string }).nome)));
const legenda = gerarLegendaEletrica(nomesUsados, 0, 0);
const titulo = legenda.find((g) => g.tipo === "texto" && g.conteudo.includes("LEGENDA"));
checar("legenda tem título", !!titulo);
const blocosNaLegenda = legenda.filter((g) => g.tipo === "bloco").map((g) => (g as { nome: string }).nome);
checar("legenda tem 1 ícone por bloco usado (sem duplicar)", blocosNaLegenda.length === nomesUsados.length, `${blocosNaLegenda.length} vs ${nomesUsados.length}`);
checar("legenda não inclui tomada_chuveiro (nunca usada)", !blocosNaLegenda.includes("tomada_chuveiro"));

// Iteração 36 (pedido do usuário): "o icone da legenda deve ficar do
// mesmo tamanho do bloco real na planta" (sem escalaX/escalaY reduzindo)
// e "a legenda precisa ter o retangulo contornando".
const blocosComEscala = legenda.filter((g) => g.tipo === "bloco" && ((g as { escalaX?: number }).escalaX !== undefined || (g as { escalaY?: number }).escalaY !== undefined));
checar("ícones da legenda SEM escalaX/escalaY (tamanho real, 1:1)", blocosComEscala.length === 0, JSON.stringify(blocosComEscala));
const retangulosNaLegenda = legenda.filter((g) => g.tipo === "retangulo");
checar("legenda tem exatamente 1 retângulo contornando", retangulosNaLegenda.length === 1, `${retangulosNaLegenda.length}`);
if (retangulosNaLegenda.length === 1) {
  const ret = retangulosNaLegenda[0] as { largura: number; altura: number };
  checar("retângulo da legenda tem largura/altura positivas", ret.largura > 0 && ret.altura > 0, JSON.stringify(ret));
  // O retângulo precisa ser desenhado ATRÁS do resto (primeiro no array),
  // senão (sem hachura ele é só contorno, então nem tapa nada, mas a
  // convenção de "fundo" ainda deve valer pra o dia que ganhar preenchimento).
  checar("retângulo é o 1º item da legenda (desenha atrás do título/ícones/texto)", legenda[0]?.tipo === "retangulo");
}

// -----------------------------------------------------------------------
// Teste 4 (Iteração 35b/36 -- bugfix "simbologias invisíveis"/"faceando a
// parede" + confirmação do usuário de que o fator final é 8x o tamanho
// ORIGINAL de cada bloco -- 20-24mm/14mm, herdados do diagrama unifilar):
// confere que cada bloco tem EXATAMENTE 8x seu tamanho original (não um
// valor arbitrário) e que toda tomada/interruptor lançado automaticamente
// ganhou uma `rotacao` (número válido em [0,360)) -- só `ponto_luz_teto`
// fica sem rotação (símbolo simétrico, lançado no centroide, sem parede
// de referência).
// -----------------------------------------------------------------------
console.log("Teste 4: tamanho = 8x o original + rotação faceando a parede");
const TAMANHO_ORIGINAL: Record<string, { largura: number; altura: number }> = {
  tomada_baixa: { largura: 20, altura: 24 },
  tomada_media: { largura: 20, altura: 24 },
  tomada_alta: { largura: 20, altura: 24 },
  tomada_chuveiro: { largura: 22, altura: 26 },
  interruptor_simples: { largura: 14, altura: 14 },
  ponto_luz_teto: { largura: 20, altura: 20 },
};
for (const nome of Object.keys(TAMANHO_ORIGINAL)) {
  const def = getBlockDef(nome);
  checar(`${nome}: definido na biblioteca`, !!def);
  if (def) {
    const original = TAMANHO_ORIGINAL[nome];
    checar(`${nome}: largura = 8x original (${original.largura}mm -> ${original.largura * 8}mm)`, def.largura === original.largura * 8, `${def.largura}`);
    checar(`${nome}: altura = 8x original (${original.altura}mm -> ${original.altura * 8}mm)`, def.altura === original.altura * 8, `${def.altura}`);
  }
}

// Iteração 36: baixa/média/alta não devem mais ter texto dentro do
// símbolo (usuário: "nao precisa de texto nos simbolos, somente na
// legenda") -- a diferenciação agora é só pelo preenchimento (vazado/
// meio/sólido).
for (const nome of ["tomada_baixa", "tomada_media", "tomada_alta"]) {
  const def = getBlockDef(nome);
  checar(`${nome}: sem <text> dentro do símbolo`, !!def && !def.svgInner.includes("<text"), def?.svgInner);
}
checar("tomada_baixa: contorno vazado (só 1 polygon, fill=white)", (getBlockDef("tomada_baixa")?.svgInner.match(/<polygon/g) ?? []).length === 1);
checar("tomada_media: meio preenchido (2 polygons -- contorno + metade sólida)", (getBlockDef("tomada_media")?.svgInner.match(/<polygon/g) ?? []).length === 2);
checar(
  "tomada_alta: totalmente sólida (fill igual ao stroke, não branco)",
  (getBlockDef("tomada_alta")?.svgInner.match(/fill="white"/g) ?? []).length === 0
);

const tomadasEInterruptores = blocosGeometria.filter(
  (g) => g.tipo === "bloco" && (g.nome.startsWith("tomada_") || g.nome === "interruptor_simples")
);
checar("há tomadas/interruptores para conferir rotação", tomadasEInterruptores.length > 0, `${tomadasEInterruptores.length}`);
checar(
  "toda tomada/interruptor automático tem rotacao numérica válida (0-360)",
  tomadasEInterruptores.every((g) => typeof (g as { rotacao?: number }).rotacao === "number" && (g as { rotacao: number }).rotacao >= 0 && (g as { rotacao: number }).rotacao < 360),
  JSON.stringify(tomadasEInterruptores.map((g) => (g as { nome: string; rotacao?: number }).rotacao))
);

const pontosLuz = blocosGeometria.filter((g) => g.tipo === "bloco" && g.nome === "ponto_luz_teto");
checar("há pontos de luz para conferir", pontosLuz.length > 0, `${pontosLuz.length}`);
checar(
  "ponto_luz_teto não recebe rotacao (símbolo simétrico, sem parede de referência)",
  pontosLuz.every((g) => (g as { rotacao?: number }).rotacao === undefined)
);

// -----------------------------------------------------------------------
// Teste 5 (Iteração 35b -- achado ao testar visualmente o bugfix): num
// cômodo QUADRADO (simétrico), o ponto médio da parede mais próxima do
// centroide -- usado pra aproximar o interruptor -- pode coincidir com um
// dos pontos igualmente espaçados das tomadas na mesma parede. Reproduz
// exatamente o caso que apareceu no teste E2E (cozinha 3000x3000mm, 4
// tomadas -- 1 por parede) e confere que o interruptor NÃO fica sobreposto
// a nenhuma tomada (distância mínima = soma dos "raios" dos 2 símbolos).
// -----------------------------------------------------------------------
console.log("Teste 5: interruptor não sobrepõe tomada em cômodo simétrico (quadrado)");
const geoQuadrado: Geometria[] = [
  linha(0, 0, 3000, 0),
  linha(3000, 0, 3000, 3000),
  linha(3000, 3000, 0, 3000),
  linha(0, 3000, 0, 0),
  texto(1500, 1500, "Cozinha"),
];
const deteccaoQuadrado = detectarComodos(geoQuadrado);
checar("cômodo quadrado detectado", deteccaoQuadrado.comodos.length === 1, JSON.stringify(deteccaoQuadrado.problemas));
if (deteccaoQuadrado.comodos.length === 1) {
  const { geometria: geoGerada, resumo: resumoQuadrado } = gerarPontosEletricos(deteccaoQuadrado.comodos);
  checar("4 tomadas (ceil(12/3.5))", resumoQuadrado.totalTomadas === 4, `${resumoQuadrado.totalTomadas}`);
  const blocosQuadrado = geoGerada.filter((g) => g.tipo === "bloco") as { nome: string; x: number; y: number }[];
  const tomadasQuadrado = blocosQuadrado.filter((g) => g.nome.startsWith("tomada_"));
  const interruptorQuadrado = blocosQuadrado.find((g) => g.nome === "interruptor_simples");
  checar("interruptor encontrado", !!interruptorQuadrado);
  if (interruptorQuadrado) {
    const defTomada = getBlockDef("tomada_media");
    const defInterruptor = getBlockDef("interruptor_simples");
    const raioTomada = Math.max(defTomada?.altura ?? 0, defTomada?.largura ?? 0) / 2;
    const raioInterruptor = Math.max(defInterruptor?.altura ?? 0, defInterruptor?.largura ?? 0) / 2;
    const distanciaMinima = raioTomada + raioInterruptor + 40;
    const distancias = tomadasQuadrado.map((t) => Math.hypot(t.x - interruptorQuadrado.x, t.y - interruptorQuadrado.y));
    checar(
      "interruptor fica a uma distância segura de TODAS as tomadas (sem sobreposição visual)",
      distancias.every((d) => d >= distanciaMinima),
      JSON.stringify({ distancias, distanciaMinima })
    );
  }
}

console.log("\n-----------------------------------------------------------------------");
if (falhas > 0) {
  console.log(`${falhas} verificação(ões) FALHARAM.`);
  process.exit(1);
} else {
  console.log("Todas as verificações passaram.");
}
