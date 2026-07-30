"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Toolbar } from "./Toolbar";
import { ToolRuler } from "./ToolRuler";
import { Sidebar } from "./Sidebar";
import { CommandLine } from "./CommandLine";
import { StatusBar } from "./StatusBar";
import { JsonPanel } from "./JsonPanel";
import { CalibrationModal } from "./CalibrationModal";
import { ProjectManagerModal } from "./ProjectManagerModal";
import { SuportePanel } from "./SuportePanel";
import { AjudaPanel } from "./AjudaPanel";
import { useHydrateXrefs } from "@/lib/useHydrateXrefs";
import { useCapturarErros } from "@/lib/useCapturarErros";
import { useCadStore } from "@/lib/store";

// O Konva toca `window`/`document` na importação, então o Stage só pode
// existir no cliente -- carregado sem SSR para não quebrar a renderização
// no servidor (Next.js App Router).
const CanvasStage = dynamic(() => import("./CanvasStage").then((m) => m.CanvasStage), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
      Carregando área de desenho...
    </div>
  ),
});

/**
 * Editor
 * -----------------------------------------------------------------------
 * Componente raiz do editor CAD: monta o layout (toolbar, sidebar,
 * canvas, status bar, linha de comando e os modais) e dispara a
 * reidratação dos XREFs a partir do IndexedDB local.
 *
 * Iteração 34 (pedido do usuário):
 *  - O painel JSON ("{ } JSON") não tem mais botão na Toolbar nem aparece
 *    por padrão -- é só uma ferramenta interna de depuração, ligada pelo
 *    atalho `Ctrl+J` (nunca visível de outra forma).
 *  - O modal "📁 Projetos" (`ProjectManagerModal`) agora abre sozinho
 *    assim que o app carrega, igual à tela inicial do AutoCAD/Word ("Novo
 *    desenho" / "Abrir desenho existente") -- o usuário fecha ele (✕) se
 *    quiser só ir direto pro desenho em branco atual.
 *  - A barra de comando por IA no rodapé (`AiCommandLine`) foi removida
 *    da tela (pedido explícito: "retire tambem o botao IA do rodapé, não
 *    vai existir").
 * -----------------------------------------------------------------------
 */
export function Editor() {
  const [jsonPanelAberto, setJsonPanelAberto] = useState(false);
  const garantirIdProjeto = useCadStore((s) => s.garantirIdProjeto);
  const toolbarPosicao = useCadStore((s) => s.toolbarPosicao);
  const abrirGerenciadorProjetos = useCadStore((s) => s.abrirGerenciadorProjetos);

  useHydrateXrefs();
  useCapturarErros();

  // Sorteia o id_projeto só depois de montado no navegador (ver
  // comentário em lib/store.ts) para não causar mismatch de hidratação.
  useEffect(() => {
    garantirIdProjeto();
  }, [garantirIdProjeto]);

  // Iteração 34: tela inicial "Novo/Abrir projeto" -- abre 1x ao montar,
  // igual à tela de boas-vindas do AutoCAD/Word. Roda separado do efeito
  // acima (que é sobre o id do projeto, não sobre UI) e só 1 vez (array
  // de dependências vazio) -- fechar o modal não deve reabri-lo sozinho.
  useEffect(() => {
    abrirGerenciadorProjetos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atalho Ctrl+J -- liga/desliga o painel JSON de depuração (nunca tem
  // botão visível, ver comentário da função acima).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setJsonPanelAberto((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-slate-100">
      <Toolbar />
      {toolbarPosicao === "TOP" && <ToolRuler orientacao="TOP" />}
      <div className="flex flex-1 overflow-hidden">
        {toolbarPosicao === "LEFT" && <ToolRuler orientacao="LEFT" />}
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <CanvasStage />
          </div>
          <StatusBar />
          <CommandLine />
        </div>
        {toolbarPosicao === "RIGHT" && <ToolRuler orientacao="RIGHT" />}
        {jsonPanelAberto && <JsonPanel />}
      </div>
      <CalibrationModal />
      <ProjectManagerModal />
      <SuportePanel />
      <AjudaPanel />
    </div>
  );
}
