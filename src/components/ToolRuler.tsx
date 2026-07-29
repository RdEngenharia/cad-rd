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
  // Iteração 41 -- rótulo trocado de "Aparar" pra "Trim" (pedido do
  // usuário: "altere o nome aparar para trim"), mesmo espírito da troca
  // Concordância -> Fillet da Iteração 38 logo abaixo: só o texto do
  // botão muda, o id interno (`id: "aparar"`) e os atalhos/sinônimos de
  // linha de comando (TR/TRIM/APARAR, ver `lib/commands.ts`) continuam
  // os mesmos.
  { id: "aparar", label: "Trim", atalho: "TR" },
  { id: "deslocar", label: "Deslocar", atalho: "O" },
  // Iteração 38 -- rótulo trocado de "Concordância" pra "Fillet" (pedido
  // do usuário: "altere o nome concordancia para fillit igual o
  // autocad"). O identificador interno (`id: "concordancia"`) NÃO mudou
  // -- é só o texto visível no botão; a linha de comando já aceita
  // digitar "FILLET" como sinônimo de "F" (ver `lib/commands.ts`), e as
  // mensagens ecoadas já usavam a palavra "FILLET" antes mesmo desta
  // troca.
  { id: "concordancia", label: "Fillet", atalho: "F" },
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

/**
 * Iteração 38 -- rótulo amigável de cada ferramenta, derivado do MESMO
 * `FERRAMENTAS` acima (fonte única) -- exportado pra `StatusBar.tsx` e
 * `CommandLine.tsx` mostrarem o NOME (ex.: "Fillet") em vez do
 * identificador interno cru (`ferramenta`, ex.: "concordancia") no
 * rodapé/barra de status. Sem isso, renomear só o botão deixava
 * "CONCORDANCIA" aparecendo ainda em 2 outros lugares da tela (a régua
 * de ferramentas foi corrigida, mas o resto não). `Partial` porque
 * "carimbar"/"calibrar" não têm botão próprio na régua (são armados
 * programaticamente) -- quem usa faz fallback pro id cru nesse caso.
 */
export const NOME_FERRAMENTA: Partial<Record<Ferramenta, string>> = FERRAMENTAS.reduce(
  (acc, f) => ({ ...acc, [f.id]: f.label }),
  {} as Partial<Record<Ferramenta, string>>
);

const DICAS: Partial<Record<Ferramenta, string>> = {
  mover: " (requer seleção prévia)",
  copiar: " (requer seleção prévia)",
  poligono: " (clique crava vértices; Enter fecha, Esc cancela)",
  polilinha: " (clique crava vértices; Enter conclui ABERTA, Esc cancela)",
  hachurar: " (clique numa forma fechada para aplicar/remover; ou selecione e rode o comando)",
  aparar:
    " (passe o mouse sobre um segmento e clique para removê-lo; numa linha reta sem cruzamento, 2 cliques abrem um vão -- ex.: porta numa parede)",
  deslocar: " (digite a distância na linha de comando, clique na linha, clique no lado)",
  // Iteração 38 -- dica reescrita pra deixar mais claro que o CANTO
  // ARREDONDADO já é uma opção (raio > 0, campo "Raio do canto (mm)" na
  // barra de propriedades, ou digitando R + um número na linha de
  // comando) -- raio 0 continua fechando o canto reto ("em bico"), como
  // sempre. Pedido do usuário: "quero ter a opcao de fechar um canto de
  // linhas arredondado tambem".
  concordancia:
    " (clique em duas linhas; raio 0 fecha o canto reto, raio > 0 arredonda -- ajuste em \"Raio do canto (mm)\" na barra lateral, ou digite R + um número na linha de comando)",
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
 * 12g ("preciso do botao viewport dentro da prancha"). Exportado
 * (Iteração 38) pra `CanvasStage.tsx` reaproveitar na mesma checagem
 * antes de a tecla Espaço repetir o último comando -- sem isso, Espaço
 * poderia reativar uma ferramenta indisponível numa Prancha por baixo
 * dos panos, mesmo com o botão correspondente desabilitado na tela.
 */
export const FERRAMENTAS_PERMITIDAS_EM_PRANCHA: Ferramenta[] = ["selecionar", "zoomWindow", "viewport"];

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
            onClick={(e) => {
              setFerramenta(f.id);
              // Iteração 40 (pedido do usuário: "a tecla espace deve
              // funcionar para puchar qualquer ultimo comando") -- sem
              // isto, o BOTÃO continua com o foco do teclado depois do
              // clique (comportamento padrão do navegador), e o atalho
              // de Espaço em `CanvasStage.tsx` deliberadamente NÃO reage
              // com um <button> focado (pra não disparar junto com o
              // navegador ativando nativamente o botão focado ao
              // apertar Espaço) -- na prática isso deixava Espaço "sem
              // efeito" bem na hora mais comum: logo depois de escolher
              // uma ferramenta pelo botão, sem ainda ter clicado no
              // canvas. Tirando o foco do botão aqui, o próximo Espaço
              // já cai no fluxo normal de "repetir o último comando".
              e.currentTarget.blur();
            }}
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
