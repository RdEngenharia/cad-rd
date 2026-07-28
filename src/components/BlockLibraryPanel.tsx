"use client";

import { useState } from "react";
import { useCadStore } from "@/lib/store";
import { BLOCK_LIBRARY, BLOCO_DRAG_MIME, buildFullSvg } from "@/lib/blocks";

/**
 * BlockLibraryPanel
 * -----------------------------------------------------------------------
 * "Biblioteca de Blocos" (leva não-numerada, pedida junto do Sprint 3):
 * painel dobrável na barra lateral com a simbologia elétrica/fotovoltaica
 * padrão ABNT (Disjuntor CA, DPS, Seccionadora CC, Fusível, Inversor,
 * Stringbox, Transformador, Malha de Aterramento -- mais a Tomada
 * herdada da Iteração 1). Dois jeitos de inserir, ambos mantendo o
 * OSNAP/snap de grid ativos:
 *   1) Clique no bloco arma o carimbo (comportamento pré-existente desde
 *      a Iteração 1: `armarCarimbo` + clique no canvas).
 *   2) Arraste (Drag & Drop) o bloco direto para o ponto do canvas onde
 *      deve ser inserido -- ver `handleDrop` em `CanvasStage.tsx`.
 * Blocos marcados `interno: true` (poste/medidor do Padrão de Entrada)
 * ficam de fora desta grade -- só existem como peça de
 * `inserirPadraoConcessionaria` no store.
 * -----------------------------------------------------------------------
 */
export function BlockLibraryPanel() {
  const [aberto, setAberto] = useState(true);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const blocoParaCarimbar = useCadStore((s) => s.blocoParaCarimbar);
  const armarCarimbo = useCadStore((s) => s.armarCarimbo);
  const setFerramenta = useCadStore((s) => s.setFerramenta);

  const blocosVisiveis = BLOCK_LIBRARY.filter((b) => !b.interno);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        <span>Biblioteca de Blocos</span>
        <span className="text-slate-400">{aberto ? "▾" : "▸"}</span>
      </button>

      {aberto && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {blocosVisiveis.map((bloco) => {
              const ativo = ferramenta === "carimbar" && blocoParaCarimbar === bloco.id;
              return (
                <button
                  key={bloco.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(BLOCO_DRAG_MIME, bloco.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title={`${bloco.descricao} — clique para armar o carimbo, ou arraste para o canvas`}
                  onClick={() => armarCarimbo(bloco.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition ${
                    ativo
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400"
                      : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50"
                  }`}
                >
                  <span
                    className="h-10 w-10"
                    // SVG estático, gerado localmente a partir de lib/blocks.ts (não vem de input do usuário).
                    dangerouslySetInnerHTML={{ __html: buildFullSvg(bloco) }}
                  />
                  <span className="text-[11px] font-medium text-slate-700">{bloco.label}</span>
                </button>
              );
            })}
          </div>
          {ferramenta === "carimbar" && blocoParaCarimbar && (
            <p className="mt-2 rounded bg-blue-50 p-2 text-[11px] text-blue-700">
              Carimbo armado. Clique no canvas para inserir o bloco (ou arraste outro direto). Esc para cancelar.
            </p>
          )}

          <button
            type="button"
            onClick={() => setFerramenta("concessionaria")}
            title="Padrão de Entrada/Concessionária (PE): poste + ramal + medidor + textos, em 2 cliques"
            className={`mt-3 w-full rounded-lg border p-2 text-center text-[11px] font-medium transition ${
              ferramenta === "concessionaria"
                ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-400"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
            }`}
          >
            ⚡ Padrão de Entrada / Concessionária
          </button>
          {ferramenta === "concessionaria" && (
            <p className="mt-2 rounded bg-blue-50 p-2 text-[11px] text-blue-700">
              Clique a posição do poste, depois a posição do medidor -- o
              conjunto (poste + ramal + medidor + textos) é inserido de
              uma vez. Esc cancela. Os textos &quot;RAMAL AÉREO&quot; e
              &quot;AFASTAMENTO&quot; nascem com valor padrão -- edite-os
              depois pela barra de propriedades (selecione o texto).
            </p>
          )}
        </>
      )}
    </div>
  );
}
