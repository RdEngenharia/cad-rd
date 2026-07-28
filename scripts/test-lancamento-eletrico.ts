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

console.log("\n-----------------------------------------------------------------------");
if (falhas > 0) {
  console.log(`${falhas} verificação(ões) FALHARAM.`);
  process.exit(1);
} else {
  console.log("Todas as verificações passaram.");
}
