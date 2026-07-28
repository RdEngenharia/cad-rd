/**
 * scripts/test-room-detection.ts
 * -----------------------------------------------------------------------
 * Teste sintético (fora do app, rodado com `npx tsx`) do módulo
 * `lib/roomDetection.ts` -- Iteração 35, "seja cuidadoso e teste tudo".
 * Cobre: retângulo simples, sala em L, parede com vão (aberta), 2 nomes
 * na mesma área (mesclada) e cômodo sem nome nenhum.
 * -----------------------------------------------------------------------
 */
import { detectarComodos, distribuirPontosNoContorno } from "../src/lib/roomDetection";
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

// -----------------------------------------------------------------------
// Teste 1: sala retangular simples 4000x3000mm, nome "Sala"
// -----------------------------------------------------------------------
{
  console.log("Teste 1: retângulo simples 4000x3000mm");
  const geo: Geometria[] = [
    linha(0, 0, 4000, 0),
    linha(4000, 0, 4000, 3000),
    linha(4000, 3000, 0, 3000),
    linha(0, 3000, 0, 0),
    texto(2000, 1500, "Sala"),
  ];
  const r = detectarComodos(geo);
  checar("1 cômodo detectado", r.comodos.length === 1, `achou ${r.comodos.length}`);
  checar("0 problemas", r.problemas.length === 0, JSON.stringify(r.problemas));
  if (r.comodos.length === 1) {
    const c = r.comodos[0];
    checar("nome = Sala", c.nome === "Sala");
    checar("tipo = sala", c.tipo === "sala", c.tipo);
    checar("área ~12m² (tolerância 10%)", Math.abs(c.areaM2 - 12) / 12 < 0.1, `área=${c.areaM2}`);
    checar("perímetro ~14m (tolerância 10%)", Math.abs(c.perimetroM - 14) / 14 < 0.1, `perímetro=${c.perimetroM}`);
    checar("contorno confiável", c.contornoConfiavel === true);
    checar("centroide plausível (~2000,1500)", Math.hypot(c.centroide.x - 2000, c.centroide.y - 1500) < 200);
  }
}

// -----------------------------------------------------------------------
// Teste 2: sala em L (retângulo 4000x4000 com um canto 2000x2000 cortado)
// -----------------------------------------------------------------------
{
  console.log("Teste 2: sala em L");
  const pontos: [number, number][] = [
    [0, 0],
    [4000, 0],
    [4000, 2000],
    [2000, 2000],
    [2000, 4000],
    [0, 4000],
  ];
  const geo: Geometria[] = [];
  for (let i = 0; i < pontos.length; i++) {
    const [x1, y1] = pontos[i];
    const [x2, y2] = pontos[(i + 1) % pontos.length];
    geo.push(linha(x1, y1, x2, y2));
  }
  // Centroide geométrico da área (calculado à parte) cai dentro do L --
  // usa um ponto qualquer claramente dentro de uma das pernas do L.
  geo.push(texto(3000, 1000, "Quarto 2"));
  const r = detectarComodos(geo);
  checar("1 cômodo detectado", r.comodos.length === 1, `achou ${r.comodos.length}, problemas=${JSON.stringify(r.problemas)}`);
  if (r.comodos.length === 1) {
    const c = r.comodos[0];
    // Área real do L: 4000x4000 - 2000x2000 = 16 - 4 = 12 m².
    checar("área ~12m² (tolerância 10%)", Math.abs(c.areaM2 - 12) / 12 < 0.1, `área=${c.areaM2}`);
    checar("tipo = quarto", c.tipo === "quarto", c.tipo);
    checar("contorno confiável", c.contornoConfiavel === true);
    if (c.contorno) {
      // Centroide precisa estar DENTRO do L de verdade (não no vazio do
      // canto cortado) -- valida ponto-a-ponto com ray casting simples.
      function dentro(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
        let d = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const pi = poly[i];
          const pj = poly[j];
          const inter = pi.y > p.y !== pj.y > p.y && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
          if (inter) d = !d;
        }
        return d;
      }
      checar("centroide dentro do polígono em L", dentro(c.centroide, c.contorno));
    }
  }
}

// -----------------------------------------------------------------------
// Teste 3: parede externa com vão (aberta) -- vaza pro exterior
// -----------------------------------------------------------------------
{
  console.log("Teste 3: cômodo aberto (vão na parede)");
  const geo: Geometria[] = [
    linha(0, 0, 4000, 0),
    linha(4000, 0, 4000, 1200), // para antes do canto -- vão de 1800mm
    linha(4000, 3000, 0, 3000),
    linha(0, 3000, 0, 0),
    texto(2000, 1500, "Cozinha"),
  ];
  const r = detectarComodos(geo);
  checar("0 cômodos válidos", r.comodos.length === 0, `achou ${r.comodos.length}`);
  checar("1+ problema tipo aberta", r.problemas.some((p) => p.tipo === "aberta"), JSON.stringify(r.problemas));
}

// -----------------------------------------------------------------------
// Teste 4: 2 nomes na mesma área conectada (falta divisória) -- mesclada
// -----------------------------------------------------------------------
{
  console.log("Teste 4: 2 ambientes mesclados (sem divisória)");
  const geo: Geometria[] = [
    linha(0, 0, 8000, 0),
    linha(8000, 0, 8000, 3000),
    linha(8000, 3000, 0, 3000),
    linha(0, 3000, 0, 0),
    // SEM parede divisória no meio (x=4000) -- área única.
    texto(2000, 1500, "Sala"),
    texto(6000, 1500, "Cozinha"),
  ];
  const r = detectarComodos(geo);
  checar("0 cômodos válidos", r.comodos.length === 0, `achou ${r.comodos.length}`);
  const mesclada = r.problemas.find((p) => p.tipo === "mesclada");
  checar("1 problema tipo mesclada", !!mesclada, JSON.stringify(r.problemas));
  if (mesclada) {
    checar("nomes inclui Sala e Cozinha", mesclada.nomes.includes("Sala") && mesclada.nomes.includes("Cozinha"), JSON.stringify(mesclada.nomes));
  }
}

// -----------------------------------------------------------------------
// Teste 5: cômodo fechado sem nome nenhum
// -----------------------------------------------------------------------
{
  console.log("Teste 5: cômodo fechado sem nome");
  const geo: Geometria[] = [
    linha(0, 0, 3000, 0),
    linha(3000, 0, 3000, 3000),
    linha(3000, 3000, 0, 3000),
    linha(0, 3000, 0, 0),
    // Sem nenhum texto.
  ];
  const r = detectarComodos(geo);
  checar("0 cômodos válidos", r.comodos.length === 0, `achou ${r.comodos.length}`);
  checar("1 problema tipo sem_nome", r.problemas.some((p) => p.tipo === "sem_nome"), JSON.stringify(r.problemas));
}

// -----------------------------------------------------------------------
// Teste 6: 2 cômodos independentes (parede dupla 14cm, como o usuário
// desenha de verdade) com pequeno gap de 3mm num canto -- tolerância do
// buffer de rasterização.
// -----------------------------------------------------------------------
{
  console.log("Teste 6: parede dupla (14cm) com gap de 3mm num canto, 2 salas separadas");
  const geo: Geometria[] = [
    // Sala A (0,0)-(3000,3000), Sala B (3140,0)-(6140,3000) -- parede
    // dupla entre elas em x=3000 (face A) e x=3140 (face B, 14cm depois).
    linha(0, 0, 3000, 0),
    linha(3000, 0, 3000, 2997), // gap de 3mm antes do canto inferior
    linha(3000, 3000, 0, 3000),
    linha(0, 3000, 0, 0),

    linha(3140, 0, 6140, 0),
    linha(6140, 0, 6140, 3000),
    linha(6140, 3000, 3140, 3000),
    linha(3140, 3000, 3140, 0),

    texto(1500, 1500, "Quarto 1"),
    texto(4640, 1500, "Quarto 2"),
  ];
  const r = detectarComodos(geo);
  checar("2 cômodos detectados", r.comodos.length === 2, `achou ${r.comodos.length}, problemas=${JSON.stringify(r.problemas)}`);
  checar("0 problemas", r.problemas.length === 0, JSON.stringify(r.problemas));
}

// -----------------------------------------------------------------------
// Teste 7: distribuirPontosNoContorno -- pontos igualmente espaçados,
// deslocados pra DENTRO do retângulo, e todos dentro da faixa esperada.
// -----------------------------------------------------------------------
{
  console.log("Teste 7: distribuirPontosNoContorno no retângulo do Teste 1");
  const geo: Geometria[] = [
    linha(0, 0, 4000, 0),
    linha(4000, 0, 4000, 3000),
    linha(4000, 3000, 0, 3000),
    linha(0, 3000, 0, 0),
    texto(2000, 1500, "Sala"),
  ];
  const r = detectarComodos(geo);
  const c = r.comodos[0];
  checar("pré-condição: contorno disponível", !!c?.contorno);
  if (c?.contorno) {
    const pontos = distribuirPontosNoContorno(c.contorno, 4, 60, c.centroide);
    checar("4 pontos devolvidos", pontos.length === 4, `${pontos.length}`);
    checar("todos os pontos dentro da bbox (com folga de inset)", pontos.every((p) => p.x > 0 && p.x < 4000 && p.y > 0 && p.y < 3000), JSON.stringify(pontos));
    // Nenhum ponto deve coincidir com outro (bem espalhados).
    const distâncias: number[] = [];
    for (let i = 0; i < pontos.length; i++) {
      for (let j = i + 1; j < pontos.length; j++) {
        distâncias.push(Math.hypot(pontos[i].x - pontos[j].x, pontos[i].y - pontos[j].y));
      }
    }
    checar("pontos bem distintos entre si (>500mm)", distâncias.every((d) => d > 500), JSON.stringify(distâncias));
  }
}

console.log("\n-----------------------------------------------------------------------");
if (falhas > 0) {
  console.log(`${falhas} verificação(ões) FALHARAM.`);
  process.exit(1);
} else {
  console.log("Todas as verificações passaram.");
}
