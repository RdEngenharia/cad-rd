"use client";

import { useState } from "react";
import { useCadStore } from "@/lib/store";
import { FORMATOS_FOLHA, type FormatoFolha } from "@/lib/types";
import { deMm, paraMm, ROTULO_UNIDADE, type UnidadeDesenho } from "@/lib/unidades";

const UNIDADES: UnidadeDesenho[] = ["mm", "cm", "m"];

const FORMATOS: FormatoFolha[] = Object.keys(FORMATOS_FOLHA) as FormatoFolha[];

/**
 * PaginaTabs
 * -----------------------------------------------------------------------
 * Abas de página (Iteração 12e): "Desenho" (Model Space, sem moldura) +
 * uma aba por Prancha/Layout criada, com um seletor de formato + botão
 * "+" pra criar uma nova. Fica no canto direito do rodapé (pedido
 * explícito do usuário). Duplo clique numa aba de Prancha renomeia
 * (`window.prompt` -- simples e direto, sem precisar de um modal
 * dedicado só pra isso); o "✕" só aparece na aba ATIVA, pra economizar
 * espaço horizontal quando há várias pranchas.
 * -----------------------------------------------------------------------
 */
function PaginaTabs() {
  const pranchas = useCadStore((s) => s.projeto.pranchas);
  const prenchaAtivaId = useCadStore((s) => s.prenchaAtivaId);
  const selecionarPrancha = useCadStore((s) => s.selecionarPrancha);
  const criarPrancha = useCadStore((s) => s.criarPrancha);
  const removerPrancha = useCadStore((s) => s.removerPrancha);
  const renomearPrancha = useCadStore((s) => s.renomearPrancha);
  const redefinirOrientacaoPrancha = useCadStore((s) => s.redefinirOrientacaoPrancha);
  const viewportPranchaSelecionadoId = useCadStore((s) => s.viewportPranchaSelecionadoId);
  const autoAjustarViewportPrancha = useCadStore((s) => s.autoAjustarViewportPrancha);
  const activeSheet = useCadStore((s) => s.activeSheet);
  const [formatoNovaPrancha, setFormatoNovaPrancha] = useState<FormatoFolha>(activeSheet);
  // Iteração 13: mantém o formato sugerido pro botão "+ Prancha" em sincronia
  // com `activeSheet` -- sem isso, o botão sempre nascia em "A4" (valor
  // inicial fixo do `useState` acima), mesmo quando `activeSheet` tinha sido
  // trocado pra "A1" automaticamente (ex.: `gerarDiagramaFotovoltaico` troca
  // pra A1 quando o diagrama gerado não cabe em A4). Isso causava uma Prancha
  // A4 sendo criada por baixo de um diagrama com coordenadas pensadas pra
  // uma folha A1 -- diagrama e coluna direita (Legenda/carimbo) colidindo
  // visualmente na exportação do PDF (bug encontrado via inspeção visual do
  // PDF rasterizado). Ajustado durante a renderização (padrão recomendado
  // pelo React pra "resetar" um state quando outro muda, em vez de um
  // `useEffect` com `setState` síncrono) -- só resincroniza quando
  // `activeSheet` muda de verdade, então não briga com uma escolha manual
  // do usuário no dropdown enquanto `activeSheet` ficar parado.
  const [activeSheetAnterior, setActiveSheetAnterior] = useState(activeSheet);
  if (activeSheet !== activeSheetAnterior) {
    setActiveSheetAnterior(activeSheet);
    setFormatoNovaPrancha(activeSheet);
  }

  const pranchaAtiva = pranchas.find((pr) => pr.id === prenchaAtivaId);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => selecionarPrancha(null)}
        title="Desenho (Model Space) -- onde você desenha, sem limite de folha"
        className={`rounded px-2 py-0.5 font-semibold ${
          prenchaAtivaId === null ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500 hover:bg-slate-300"
        }`}
      >
        Desenho
      </button>
      {pranchas.map((pr) => {
        const ativa = pr.id === prenchaAtivaId;
        return (
          <span key={pr.id} className="flex items-center">
            <button
              type="button"
              onClick={() => selecionarPrancha(pr.id)}
              onDoubleClick={() => {
                const novoNome = window.prompt("Renomear prancha:", pr.nome);
                if (novoNome && novoNome.trim()) renomearPrancha(pr.id, novoNome.trim());
              }}
              title={`${pr.nome} (${pr.formato}${pr.orientacao === "retrato" ? ", retrato" : ""}) -- duplo clique renomeia`}
              className={`rounded px-2 py-0.5 font-semibold ${
                ativa ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500 hover:bg-slate-300"
              }`}
            >
              {pr.nome} <span className="font-normal opacity-70">({pr.formato})</span>
            </button>
            {ativa && (
              <button
                type="button"
                onClick={() => removerPrancha(pr.id)}
                title="Remover esta prancha (não afeta o Desenho)"
                className="ml-0.5 px-1 text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            )}
          </span>
        );
      })}
      {pranchaAtiva && (
        <button
          type="button"
          onClick={() =>
            redefinirOrientacaoPrancha(pranchaAtiva.id, pranchaAtiva.orientacao === "retrato" ? "paisagem" : "retrato")
          }
          title="Alterna a orientação da folha desta prancha (paisagem/retrato)"
          className="rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-300"
        >
          ⟳ {pranchaAtiva.orientacao === "retrato" ? "Retrato" : "Paisagem"}
        </button>
      )}
      {pranchaAtiva && viewportPranchaSelecionadoId && (
        <button
          type="button"
          onClick={() => autoAjustarViewportPrancha(pranchaAtiva.id, viewportPranchaSelecionadoId)}
          title="Reenquadra a câmera deste viewport pra mostrar todo o Desenho atual"
          className="rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-300"
        >
          ⤢ Auto-ajuste
        </button>
      )}
      <select
        value={formatoNovaPrancha}
        onChange={(e) => setFormatoNovaPrancha(e.target.value as FormatoFolha)}
        title="Formato da próxima prancha"
        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600"
      >
        {FORMATOS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => criarPrancha(formatoNovaPrancha)}
        title="Nova prancha, enquadrando o Desenho atual"
        className="rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-300"
      >
        + Prancha
      </button>
    </div>
  );
}

/**
 * StatusBar
 * -----------------------------------------------------------------------
 * Faixa fina entre o canvas e a linha de comando: coordenadas do
 * cursor (já com snap aplicado), zoom atual, tamanho do grid, um
 * botão para ligar/desligar o snap magnético, e as abas de página
 * (Desenho + Pranchas, Iteração 12e) no canto direito.
 * -----------------------------------------------------------------------
 */
export function StatusBar() {
  const ponteiro = useCadStore((s) => s.ponteiroMundo);
  const viewport = useCadStore((s) => s.viewport);
  const prenchaAtivaId = useCadStore((s) => s.prenchaAtivaId);
  const pranchaViewports = useCadStore((s) => s.pranchaViewports);
  // Iteração 12t: zoom exibido tem que refletir o mesmo `viewportAtual` que
  // o CanvasStage está de fato usando pra renderizar -- senão, dentro de
  // uma Prancha, este número mostraria o zoom do DESENHO (campo `viewport`
  // "cru"), diferente do que está na tela (`pranchaViewports[id]`), desde
  // que os dois passaram a ser independentes (ver `CanvasStage.tsx`).
  const zoomAtual = prenchaAtivaId ? pranchaViewports[prenchaAtivaId]?.scale ?? 1 : viewport.scale;
  const snapAtivo = useCadStore((s) => s.snapAtivo);
  const toggleSnap = useCadStore((s) => s.toggleSnap);
  const gridSize = useCadStore((s) => s.gridSize);
  const setGridSize = useCadStore((s) => s.setGridSize);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const osnapAlvo = useCadStore((s) => s.osnapAlvo);
  const osnapTipo = useCadStore((s) => s.osnapTipo);
  const selecionadoIds = useCadStore((s) => s.selecionadoIds);
  const unidadeDesenho = useCadStore((s) => s.unidadeDesenho);
  const setUnidadeDesenho = useCadStore((s) => s.setUnidadeDesenho);
  const orthoAtivo = useCadStore((s) => s.orthoAtivo);
  const toggleOrtho = useCadStore((s) => s.toggleOrtho);

  // Iteração 12s: casas decimais e "step" do campo de grid ajustados pra
  // unidade escolhida -- mm inteiro, cm com 1 casa, m com 2 casas (mesmo
  // critério de `formatarComUnidade`), pra não obrigar digitar "0.01" só
  // pra representar um grid de 10mm quando a unidade é "m".
  const casasGrid = unidadeDesenho === "mm" ? 0 : unidadeDesenho === "cm" ? 1 : 2;
  const stepGrid = unidadeDesenho === "mm" ? 1 : unidadeDesenho === "cm" ? 0.1 : 0.01;

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-3 font-mono text-[11px] text-slate-500">
      <div className="flex items-center gap-4">
        <span>
          X: {ponteiro ? deMm(ponteiro.x, unidadeDesenho).toFixed(unidadeDesenho === "mm" ? 1 : unidadeDesenho === "cm" ? 2 : 3) : "--"} {ROTULO_UNIDADE[unidadeDesenho]}
        </span>
        <span>
          Y: {ponteiro ? deMm(ponteiro.y, unidadeDesenho).toFixed(unidadeDesenho === "mm" ? 1 : unidadeDesenho === "cm" ? 2 : 3) : "--"} {ROTULO_UNIDADE[unidadeDesenho]}
        </span>
        <span>Zoom: {(zoomAtual * 100).toFixed(0)}%</span>
        {osnapAlvo && (
          <span className="font-semibold text-emerald-600">
            OSNAP:{" "}
            {osnapTipo === "midpoint"
              ? "Midpoint"
              : osnapTipo === "center"
              ? "Center"
              : osnapTipo === "intersection"
              ? "Intersection"
              : "Endpoint"}
          </span>
        )}
        {selecionadoIds.length > 0 && (
          <span className="text-blue-600">{selecionadoIds.length} selecionado(s)</span>
        )}
        <span className="text-slate-400">Roda = zoom · Botão do meio/direito = pan</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="uppercase text-slate-400">
          Ferramenta: <b className="text-slate-600">{ferramenta}</b>
        </span>
        <label className="flex items-center gap-1">
          <span>Grid</span>
          <input
            type="number"
            value={deMm(gridSize, unidadeDesenho).toFixed(casasGrid)}
            min={stepGrid}
            step={stepGrid}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setGridSize(paraMm(v, unidadeDesenho));
            }}
            className="w-14 rounded border border-slate-200 px-1 py-0.5 text-slate-700"
            title="Tamanho do grid/snap -- guardado em mm por baixo dos panos, só exibido/digitado na unidade escolhida"
          />
          <span>{ROTULO_UNIDADE[unidadeDesenho]}</span>
        </label>
        {/* Iteração 12s: unidade de exibição/digitação (mm/cm/m) -- pedido
            do usuário ("preciso ter a opcao de escolher a escalas dos
            desenhos se é em metros, cm ou mm"). Não migra/re-escala
            geometria nenhuma, só troca como os números são mostrados e
            qual unidade um valor digitado SEM sufixo assume por padrão
            (ver `lib/unidades.ts` e `CommandLine.tsx`). */}
        <label className="flex items-center gap-1">
          <span>Unidade</span>
          <select
            value={unidadeDesenho}
            onChange={(e) => setUnidadeDesenho(e.target.value as UnidadeDesenho)}
            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-700"
            title="Unidade de exibição e de digitação padrão (números sem sufixo mm/cm/m assumem esta unidade) -- a geometria continua guardada em mm"
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={toggleSnap}
          className={`rounded px-2 py-0.5 font-semibold ${
            snapAtivo ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"
          }`}
        >
          SNAP {snapAtivo ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          onClick={toggleOrtho}
          title="ORTHO (igual ao F8 do AutoCAD): trava o próximo ponto de Linha/Polígono/Polilinha na horizontal/vertical em relação ao ponto anterior, sem deixar o grid torcer a direção"
          className={`rounded px-2 py-0.5 font-semibold ${
            orthoAtivo ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"
          }`}
        >
          ORTHO {orthoAtivo ? "ON" : "OFF"}
        </button>
        <PaginaTabs />
      </div>
    </div>
  );
}
