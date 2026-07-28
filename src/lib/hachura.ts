/**
 * hachura.ts
 * -----------------------------------------------------------------------
 * Motor de padrões de hachura (fill patterns) para retângulos e
 * polígonos fechados -- versão simplificada do comando HATCH do
 * AutoCAD. Para cada combinação (tipo, cor, escala), desenhamos o
 * motivo num pequeno <canvas> "ladrilho" (tile) offscreen usando as
 * APIs nativas do Canvas 2D -- o mesmo papel que `ctx.createPattern()`
 * + `ctx.fillStyle` + `ctx.fill()` cumpririam num <canvas> puro. Esse
 * ladrilho é então usado como `fillPatternImage` do Konva.Shape que
 * desenha a forma (ver GeometryLayer.tsx): o Konva internamente chama
 * `ctx.createPattern(imagem, "repeat")` e aplica como `fillStyle` antes
 * de `ctx.fill()` -- é a mesma engine de padrões do Canvas, só
 * acessada pela API de shapes do Konva em vez de um `sceneFunc` manual,
 * o que é mais robusto/performático com centenas de elementos na tela
 * (o Konva já cacheia o preenchimento internamente).
 *
 * Os ladrilhos gerados são cacheados por chave (tipo|cor|escala):
 * elementos que compartilham a mesma hachura (comum -- muitos lotes/
 * áreas hachuradas igual num croqui) reaproveitam o mesmo canvas em vez
 * de regenerar um a cada re-render.
 * -----------------------------------------------------------------------
 */
import type { HachuraConfig, HachuraTipo } from "./types";

/** Tamanho do ladrilho (px) em escala 1 -- equivale a ~10mm de mundo no desenho. */
const TAMANHO_BASE = 10;

const cache = new Map<string, HTMLCanvasElement | null>();

/** PRNG determinístico simples (LCG) -- o padrão "pontilhado" fica estável entre re-renders. */
function criarGeradorPseudoAleatorio(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Gera (ou reaproveita do cache) um canvas com o motivo de hachura,
 * pronto para servir de `fillPatternImage` de uma forma Konva.
 * Retorna `null` para "SOLID" -- nesse caso a forma deve usar um `fill`
 * de cor sólida direto, sem precisar de um padrão de imagem.
 */
export function obterPadraoHachura(tipo: HachuraTipo, cor: string, escala: number): HTMLCanvasElement | null {
  if (tipo === "SOLID") return null;
  if (typeof document === "undefined") return null; // guarda contra SSR (não deveria rodar lá, mas por segurança)

  const escalaSegura = Math.max(0.1, escala || 1);
  const chave = `${tipo}|${cor}|${escalaSegura}`;
  if (cache.has(chave)) return cache.get(chave)!;

  const tamanho = Math.max(4, Math.round(TAMANHO_BASE * escalaSegura));
  const canvas = document.createElement("canvas");
  canvas.width = tamanho;
  canvas.height = tamanho;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cache.set(chave, null);
    return null;
  }

  ctx.clearRect(0, 0, tamanho, tamanho);
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;

  if (tipo === "ANSI31_DIAGONAL") {
    // Linhas diagonais a 45°, estilo ANSI31 do AutoCAD. Desenha o traço
    // central + as duas metades nas bordas opostas, para o ladrilho
    // emendar perfeitamente ao repetir (fillPatternRepeat = "repeat").
    ctx.lineWidth = Math.max(1, tamanho / 12);
    ctx.beginPath();
    ctx.moveTo(0, tamanho);
    ctx.lineTo(tamanho, 0);
    ctx.moveTo(-tamanho / 2, tamanho / 2);
    ctx.lineTo(tamanho / 2, -tamanho / 2);
    ctx.moveTo(tamanho / 2, tamanho * 1.5);
    ctx.lineTo(tamanho * 1.5, tamanho / 2);
    ctx.stroke();
  } else if (tipo === "PONTILHADO") {
    // Pontos pseudo-aleatórios com seed fixa -- o padrão fica estável
    // (não "pisca" trocando de posição a cada re-render).
    const rand = criarGeradorPseudoAleatorio(42);
    const nPontos = Math.max(4, Math.round(tamanho / 2.2));
    const raio = Math.max(0.5, tamanho / 22);
    for (let i = 0; i < nPontos; i++) {
      ctx.beginPath();
      ctx.arc(rand() * tamanho, rand() * tamanho, raio, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tipo === "CRUZADO") {
    // Hachura cruzada (NET/CROSS-HATCH): as mesmas diagonais do
    // ANSI31_DIAGONAL, repetidas nas duas direções (45° e -45°) --
    // forma uma grade de losangos.
    ctx.lineWidth = Math.max(1, tamanho / 14);
    ctx.beginPath();
    ctx.moveTo(0, tamanho);
    ctx.lineTo(tamanho, 0);
    ctx.moveTo(-tamanho / 2, tamanho / 2);
    ctx.lineTo(tamanho / 2, -tamanho / 2);
    ctx.moveTo(tamanho / 2, tamanho * 1.5);
    ctx.lineTo(tamanho * 1.5, tamanho / 2);
    // 2ª família, perpendicular à primeira (-45° / 135°).
    ctx.moveTo(0, 0);
    ctx.lineTo(tamanho, tamanho);
    ctx.moveTo(-tamanho / 2, tamanho / 2);
    ctx.lineTo(tamanho / 2, tamanho * 1.5);
    ctx.moveTo(tamanho / 2, -tamanho / 2);
    ctx.lineTo(tamanho * 1.5, tamanho / 2);
    ctx.stroke();
  } else if (tipo === "CONCRETO") {
    // Hachura de concreto/alvenaria (BRICK): grade retangular simples --
    // aproximação do padrão AR-CONC/BRICK do AutoCAD (blocos separados
    // por juntas horizontais/verticais).
    ctx.lineWidth = Math.max(1, tamanho / 16);
    ctx.strokeRect(0.5, 0.5, tamanho - 1, tamanho - 1);
    ctx.beginPath();
    ctx.moveTo(tamanho / 2, 0);
    ctx.lineTo(tamanho / 2, tamanho);
    ctx.stroke();
  } else if (tipo === "TERRA") {
    // Hachura de terra/solo (EARTH): linhas horizontais de base com
    // pequenos traços diagonais por baixo -- convenção usual de corte de
    // terreno em desenhos de engenharia civil/elétrica (valas, aterros).
    ctx.lineWidth = Math.max(1, tamanho / 18);
    ctx.beginPath();
    ctx.moveTo(0, tamanho * 0.3);
    ctx.lineTo(tamanho, tamanho * 0.3);
    ctx.moveTo(0, tamanho * 0.8);
    ctx.lineTo(tamanho, tamanho * 0.8);
    for (let x = 0; x <= tamanho; x += tamanho / 3) {
      ctx.moveTo(x, tamanho * 0.3);
      ctx.lineTo(x - tamanho * 0.15, tamanho * 0.5);
      ctx.moveTo(x, tamanho * 0.8);
      ctx.lineTo(x - tamanho * 0.15, tamanho);
    }
    ctx.stroke();
  } else if (tipo === "BLOCO") {
    // Hachura de "parede de bloco" (alvenaria/bloco estrutural em corte,
    // padrão "running bond"): fiadas horizontais + juntas verticais que
    // se alternam a cada fiada (meio bloco de defasagem) -- é esse
    // desalinhamento entre fiadas que dá a aparência de parede de blocos
    // de verdade, diferente da grade reta e alinhada do CONCRETO.
    ctx.lineWidth = Math.max(1, tamanho / 16);
    ctx.beginPath();
    // Fiada horizontal no meio do ladrilho (as de cima/baixo já "fecham"
    // sozinhas nas bordas do tile, graças ao fillPatternRepeat="repeat").
    ctx.moveTo(0, tamanho / 2);
    ctx.lineTo(tamanho, tamanho / 2);
    // Junta vertical da fiada de CIMA -- centralizada no tile.
    ctx.moveTo(tamanho / 2, 0);
    ctx.lineTo(tamanho / 2, tamanho / 2);
    // Junta vertical da fiada de BAIXO -- na borda do tile (deslocada
    // meio bloco em relação à de cima), criando o desalinhamento.
    ctx.moveTo(0, tamanho / 2);
    ctx.lineTo(0, tamanho);
    ctx.moveTo(tamanho, tamanho / 2);
    ctx.lineTo(tamanho, tamanho);
    ctx.stroke();
  }

  cache.set(chave, canvas);
  return canvas;
}

/**
 * Resolve as props Konva de preenchimento (fill) de uma forma fechada a
 * partir da sua config de hachura -- "SOLID" usa uma cor sólida direto;
 * os demais tipos usam o ladrilho gerado acima como `fillPatternImage`
 * (o Konva aplica isso via `ctx.createPattern()` internamente). Extraído
 * de `GeometryLayer.tsx` (Sprint 5) para ser reaproveitado também pelo
 * conteúdo somente-leitura desenhado dentro de um Viewport
 * (`ViewportShape.tsx`), sem duplicar a lógica.
 */
export function estiloHachuraKonva(hachura?: HachuraConfig) {
  if (!hachura) return {};
  if (hachura.tipo === "SOLID") {
    return { fill: hachura.cor, opacity: 0.5 };
  }
  const padrao = obterPadraoHachura(hachura.tipo, hachura.cor, hachura.escala);
  if (!padrao) return {};
  // O Konva aceita qualquer CanvasImageSource (inclui HTMLCanvasElement)
  // em runtime para `fillPatternImage`, mas a tipagem do react-konva só
  // declara HTMLImageElement -- cast seguro, é exatamente o padrão
  // usado nos exemplos oficiais de "cached pattern" do Konva.
  return { fillPatternImage: padrao as unknown as HTMLImageElement, fillPatternRepeat: "repeat" as const };
}

/** Opções exibidas no seletor de padrões da barra lateral. */
export const HACHURA_OPCOES: { valor: HachuraTipo; label: string }[] = [
  { valor: "SOLID", label: "Sólido" },
  { valor: "ANSI31_DIAGONAL", label: "ANSI31 (diagonal)" },
  { valor: "PONTILHADO", label: "Pontilhado" },
  { valor: "CRUZADO", label: "Cruzado" },
  { valor: "CONCRETO", label: "Concreto" },
  { valor: "TERRA", label: "Terra" },
  { valor: "BLOCO", label: "Bloco (parede)" },
];
