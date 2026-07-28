"use client";

import { useState } from "react";
import { useCadStore } from "@/lib/store";

/**
 * LayersPanel
 * -----------------------------------------------------------------------
 * Painel de camadas (layers) na barra lateral: lista, cria e liga/
 * desliga a visibilidade de cada camada (ícone de lâmpada). Clicar no
 * nome de uma camada a torna a "camada ativa" -- todo elemento novo
 * (linha/círculo/bloco) herda essa camada automaticamente.
 * -----------------------------------------------------------------------
 */
export function LayersPanel() {
  const camadas = useCadStore((s) => s.projeto.camadas);
  const activeLayer = useCadStore((s) => s.activeLayer);
  const setActiveLayer = useCadStore((s) => s.setActiveLayer);
  const criarCamada = useCadStore((s) => s.criarCamada);
  const alternarVisibilidadeCamada = useCadStore((s) => s.alternarVisibilidadeCamada);
  const atualizarCamada = useCadStore((s) => s.atualizarCamada);
  const removerCamada = useCadStore((s) => s.removerCamada);

  const [novoNome, setNovoNome] = useState("");
  const [novaCor, setNovaCor] = useState("#22c55e");
  // Recolhido por padrão (pedido do usuário, Iteração 12f): deixa a
  // sidebar mais limpa visualmente, mesmo padrão dobrável já usado em
  // `BlockLibraryPanel.tsx`.
  const [aberto, setAberto] = useState(false);

  const lista = Object.values(camadas).sort((a, b) => a.nome.localeCompare(b.nome));

  function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    if (!novoNome.trim()) return;
    criarCamada(novoNome, novaCor);
    setNovoNome("");
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        <span>Camadas</span>
        <span className="text-slate-400">{aberto ? "▾" : "▸"}</span>
      </button>
      {aberto && (
        <>
      <ul className="space-y-1">
        {lista.map((camada) => {
          const ativa = camada.nome === activeLayer;
          return (
            <li
              key={camada.nome}
              className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] ${
                ativa ? "border-blue-400 bg-blue-50" : "border-transparent hover:bg-slate-50"
              }`}
            >
              <button
                type="button"
                onClick={() => alternarVisibilidadeCamada(camada.nome)}
                title={camada.visible ? "Ocultar camada" : "Mostrar camada"}
                className={`shrink-0 rounded p-0.5 ${camada.visible ? "text-amber-500" : "text-slate-300"}`}
              >
                {camada.visible ? "💡" : "🌑"}
              </button>

              <input
                type="color"
                value={camada.cor}
                onChange={(e) => atualizarCamada(camada.nome, { cor: e.target.value })}
                title="Cor da camada"
                className="h-4 w-4 shrink-0 cursor-pointer border-0 bg-transparent p-0"
              />

              <button
                type="button"
                onClick={() => setActiveLayer(camada.nome)}
                className={`flex-1 truncate text-left font-medium ${ativa ? "text-blue-700" : "text-slate-700"}`}
                title="Definir como camada ativa"
              >
                {camada.nome}
              </button>

              <input
                type="number"
                min={0.2}
                step={0.2}
                value={camada.espessuraDaLinha}
                onChange={(e) => atualizarCamada(camada.nome, { espessuraDaLinha: Number(e.target.value) })}
                title="Espessura da linha (px)"
                className="w-10 shrink-0 rounded border border-slate-200 px-0.5 py-0.5 text-[10px]"
              />

              <select
                value={camada.estiloLinha ?? "continua"}
                onChange={(e) =>
                  atualizarCamada(camada.nome, {
                    estiloLinha: e.target.value as "continua" | "tracejada",
                  })
                }
                title="Estilo da linha (contínua ou tracejada)"
                className="w-11 shrink-0 rounded border border-slate-200 px-0.5 py-0.5 text-[10px]"
              >
                <option value="continua">──</option>
                <option value="tracejada">╌╌</option>
              </select>

              {lista.length > 1 && (
                <button
                  type="button"
                  onClick={() => removerCamada(camada.nome)}
                  title="Remover camada"
                  className="shrink-0 px-0.5 text-slate-300 hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={handleCriar} className="mt-2 flex items-center gap-1">
        <input
          type="color"
          value={novaCor}
          onChange={(e) => setNovaCor(e.target.value)}
          className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
          title="Cor da nova camada"
        />
        <input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="NOVA_CAMADA"
          className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px] uppercase"
        />
        <button
          type="submit"
          className="shrink-0 rounded bg-slate-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
        >
          +
        </button>
      </form>
      <p className="mt-1 text-[10px] text-slate-400">
        Clique no nome para ativar. Novos elementos herdam a camada ativa.
      </p>
        </>
      )}
    </div>
  );
}
