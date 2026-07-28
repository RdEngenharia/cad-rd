"use client";

import { useCadStore } from "@/lib/store";
import type { Ferramenta, PosicaoToolbar } from "@/lib/types";

const FERRAMENTAS: { id: Ferramenta; label: string; atalho: string }[] = [
  { id: "selecionar", label: "Selecionar", atalho: "Esc" },
  { id: "linha", label: "Linha", atalho: "L" },
  { id: "circulo", label: "Círculo", atalho: "C" },
  { id: "retangulo", label: "Retângulo", atalho: "REC" },
  { id: "poligono", label: "Polígono", atalho: "POL" },
  { id: "polilinha", label: "Polilinha", atalho: "PL" },
  { id: "aparar", label: "Aparar", atalho: "TR" },
  { id: "deslocar", label: "Deslocar", atalho: "O" },
  { id: "concordancia", label: "Concordância", atalho: "F" },
  { id: "mover", label: "Mover", atalho: "M" },
  { id: "copiar", label: "Copiar", atalho: "CO" },
  { id: "hachurar", label: "Hachurar", atalho: "H" },
  { id: "texto", label: "Texto", atalho: "T" },
  { id: "cota", label: "Cota", atalho: "DIM" },
  { id: "concessionaria", label: "Padrão Entrada", atalho: "PE" },
  { id: "viewport", label: "Viewport", atalho: "MV" },
  { id: "zoomWindow", label: "Zoom Window", atalho: "Z/W" },
  { id: "apagar", label: "Apagar", atalho: "E/DEL" },
];

const DICAS: Partial<Record<Ferramenta, string>> = {
  mover: " (requer seleção prévia)",
  copiar: " (requer seleção prévia)",
  poligono: " (clique crava vértices; Enter fecha, Esc cancela)",
  polilinha: " (clique crava vértices; Enter conclui ABERTA, Esc cancela)",
  hachurar: " (clique numa forma fechada para aplicar/remover; ou selecione e rode o comando)",
  aparar: " (passe o mouse sobre um segmento e clique para removê-lo)",
  deslocar: " (digite a distância na linha de comando, clique na linha, clique no lado)",
  concordancia: " (clique em duas linhas; R muda o raio na linha de comando)",
  texto: " (clique para posicionar, digite o conteúdo na linha de comando)",
  cota: " (clique no ponto inicial, no ponto final, e depois posicione a linha de cota)",
  selecionar:
    " (arraste da esquerda p/ direita = Window; da direita p/ esquerda = Crossing; Alt+clique seleciona um XREF mesmo que esteja por baixo de outro desenho)",
  concessionaria: " (clique a posição do poste, depois a do medidor -- insere o conjunto de uma vez)",
  viewport: " (2 cliques definem o retângulo na folha; repete até Esc)",
  zoomWindow: " (2 cliques definem a janela de zoom; dentro de um viewport em Model Ativo, enquadra só ele)",
};

interface ToolRulerProps {
  orientacao: PosicaoToolbar;
}

/**
 * ToolRuler
 * -----------------------------------------------------------------------
 * "Régua de ferramentas" reposicionável: o mesmo cluster de botões de
 * atalho de ferramenta que antes vivia dentro da Toolbar, agora extraído
 * num componente próprio que pode ser renderizado no topo (barra
 * horizontal, layout padrão) ou nas laterais (coluna vertical) conforme
 * `toolbarPosicao` no store -- escolhido no painel de Configurações da
 * barra lateral (ver `SettingsPanel.tsx`).
 * -----------------------------------------------------------------------
 */
/**
 * Únicas ferramentas que fazem sentido com uma Prancha ativa -- ela é uma
 * janela de plotagem somente-leitura, sem desenho direto. "viewport"
 * (MV -- insere um novo Viewport nesta Prancha) foi liberado na Iteração
 * 12g ("preciso do botao viewport dentro da prancha").
 */
const FERRAMENTAS_PERMITIDAS_EM_PRANCHA: Ferramenta[] = ["selecionar", "zoomWindow", "viewport"];

export function ToolRuler({ orientacao }: ToolRulerProps) {
  const ferramenta = useCadStore((s) => s.ferramenta);
  const setFerramenta = useCadStore((s) => s.setFerramenta);
  const prenchaAtivaId = useCadStore((s) => s.prenchaAtivaId);

  const vertical = orientacao !== "TOP";

  return (
    <div
      className={`flex shrink-0 gap-1 border-slate-200 bg-white p-1 ${
        vertical
          ? "h-full w-[74px] flex-col overflow-y-auto border-r"
          : "w-full flex-row flex-wrap items-center border-b"
      }`}
    >
      {FERRAMENTAS.map((f) => {
        // Com uma Prancha ativa, só Selecionar/Zoom Window continuam
        // clicáveis -- as demais ficam visíveis mas desabilitadas (em vez
        // de sumir), pra não fazer a régua "pular" de layout ao trocar de
        // página -- ver `CanvasStage.tsx` pra a proteção funcional
        // correspondente.
        const desabilitada = !!prenchaAtivaId && !FERRAMENTAS_PERMITIDAS_EM_PRANCHA.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            disabled={desabilitada}
            onClick={() => setFerramenta(f.id)}
            title={
              desabilitada
                ? "Indisponível numa Prancha -- volte pro Desenho pra editar"
                : `Atalho na linha de comando: ${f.atalho}${DICAS[f.id] ?? ""}`
            }
            className={`rounded px-2 py-1 text-xs font-medium transition ${
              vertical ? "w-full text-center" : ""
            } ${
              desabilitada
                ? "cursor-not-allowed text-slate-300"
                : ferramenta === f.id
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
