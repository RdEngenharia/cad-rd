"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { Toolbar } from "./Toolbar";
import { ToolRuler } from "./ToolRuler";
import { Sidebar } from "./Sidebar";
import { CommandLine } from "./CommandLine";
import { StatusBar } from "./StatusBar";
import { CalibrationModal } from "./CalibrationModal";
import { ProjectManagerModal } from "./ProjectManagerModal";
import { SuportePanel } from "./SuportePanel";
import { AjudaPanel } from "./AjudaPanel";
import { BemVindoBanner } from "./BemVindoBanner";
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
 *  - O modal "📁 Projetos" (`ProjectManagerModal`) agora abre sozinho
 *    assim que o app carrega, igual à tela inicial do AutoCAD/Word ("Novo
 *    desenho" / "Abrir desenho existente") -- o usuário fecha ele (✕) se
 *    quiser só ir direto pro desenho em branco atual.
 *  - A barra de comando por IA no rodapé (`AiCommandLine`) foi removida
 *    da tela (pedido explícito: "retire tambem o botao IA do rodapé, não
 *    vai existir").
 *
 * Iteração 46 (pedido do usuário): o painel JSON de depuração interno
 * ("{ } JSON", ligado pelo atalho `Ctrl+J`, aparentemente acionado sem
 * querer) foi removido de vez -- "nao gostei desse json na tela pode
 * retirar". O atalho `Ctrl+J` não faz mais nada e o arquivo
 * `JsonPanel.tsx` foi apagado do projeto.
 * -----------------------------------------------------------------------
 */
export function Editor() {
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

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-slate-100">
      <Toolbar />
      <BemVindoBanner />
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
      </div>
      <CalibrationModal />
      <ProjectManagerModal />
      <SuportePanel />
      <AjudaPanel />
    </div>
  );
}
