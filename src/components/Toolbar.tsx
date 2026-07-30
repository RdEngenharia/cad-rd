"use client";

import { useCadStore } from "@/lib/store";
import { exportarPagina, exportarTodasPranchas, exportarPaginaA4, exportarTodasPranchasA4 } from "@/lib/pdfExport";
import { exportarPranchaDxf } from "@/lib/dxfExport";
import { AuthPanel } from "./AuthPanel";
import { useState } from "react";
import { useAutoSalvar } from "@/lib/useAutoSalvar";

/**
 * Toolbar
 * -----------------------------------------------------------------------
 * Barra superior: nome do app/projeto, seletor de prancha (formato ABNT
 * ativo) com exportação para PDF vetorial, e o widget de conta (`AuthPanel`).
 *
 * Iteração 34 (pedido do usuário): os botões antigos "Novo" / "Salvar no
 * Firestore" / "Carregar" (por ID manual) e o painel de depuração
 * "{ } JSON" saíram daqui -- Novo/Salvar/Abrir agora vivem só no modal
 * "📁 Projetos" (`ProjectManagerModal`, que também abre sozinho ao
 * carregar o app, ver `Editor.tsx`), e o painel JSON ficou reservado para
 * uso interno (atalho `Ctrl+J`), nunca visível por padrão. O usuário
 * também pediu para nenhuma tela mencionar como/onde o projeto é
 * armazenado (nome de provedores de nuvem etc.) -- por isso as mensagens
 * de status aqui usam só termos genéricos ("nuvem"/"neste dispositivo").
 * -----------------------------------------------------------------------
 */
export function Toolbar() {
  const projeto = useCadStore((s) => s.projeto);
  const setNomeProjeto = useCadStore((s) => s.setNomeProjeto);
  const selecionadoIds = useCadStore((s) => s.selecionadoIds);
  const pranchas = useCadStore((s) => s.projeto.pranchas);
  const prenchaAtivaId = useCadStore((s) => s.prenchaAtivaId);
  const pranchaAtiva = pranchas.find((pr) => pr.id === prenchaAtivaId);
  const desfazer = useCadStore((s) => s.desfazer);
  const refazer = useCadStore((s) => s.refazer);
  const podeDesfazer = useCadStore((s) => s.past.length > 0);
  const podeRefazer = useCadStore((s) => s.future.length > 0);
  const unidadeDesenho = useCadStore((s) => s.unidadeDesenho);

  const [status, setStatus] = useState<string | null>(null);
  // Iteração 45 -- melhoria aceita pelo usuário: autosave periódico +
  // aviso de alterações não salvas ao tentar fechar/recarregar a página
  // (ver `lib/useAutoSalvar.ts`). O hook cuida de tudo sozinho (intervalo +
  // listener de `beforeunload`); aqui só usamos o horário devolvido pra
  // mostrar um indicador discreto.
  const ultimoAutoSalvamento = useAutoSalvar();

  async function handleExportarPdf() {
    if (!pranchaAtiva) return;
    // exportarPagina é assíncrona (Iteração 12f -- precisa pré-carregar
    // as imagens de XREF antes de desenhar o PDF, ver pdfExport.ts).
    setStatus("Exportando PDF...");
    await exportarPagina(projeto, pranchaAtiva, unidadeDesenho);
    setStatus(`PDF da prancha "${pranchaAtiva.nome}" exportado ✓`);
  }

  async function handleExportarTodas() {
    if (pranchas.length === 0) return;
    setStatus("Exportando PDF...");
    await exportarTodasPranchas(projeto, unidadeDesenho);
    setStatus(`PDF com ${pranchas.length} prancha(s) exportado ✓`);
  }

  // "Ajustar para impressão em A4" (Iteração 14) -- opção SEPARADA das
  // duas acima (decisão do usuário via pergunta de esclarecimento): os
  // botões "Exportar PDF"/"Exportar todas (PDF)" continuam exportando no
  // tamanho NATIVO da prancha (útil para gráfica/plotter que aceita
  // A1/A2/A3); estes dois aqui geram uma cópia reduzida pra caber numa
  // folha A4 física, para imprimir numa impressora comum de casa/escritório.
  async function handleExportarA4() {
    if (!pranchaAtiva) return;
    setStatus("Ajustando para A4...");
    await exportarPaginaA4(projeto, pranchaAtiva, unidadeDesenho);
    setStatus(`PDF (A4) da prancha "${pranchaAtiva.nome}" exportado ✓`);
  }

  async function handleExportarTodasA4() {
    if (pranchas.length === 0) return;
    setStatus("Ajustando para A4...");
    await exportarTodasPranchasA4(projeto, unidadeDesenho);
    setStatus(`PDF (A4) com ${pranchas.length} prancha(s) exportado ✓`);
  }

  // Iteração 19: "inclua a opcao de baixar em DXF tambem, assim vamos
  // conseguir abrir nossos arquivos no autocad" -- ver `lib/dxfExport.ts`
  // pro escopo/simplificações (exporta o Model Space inteiro + carimbo da
  // Prancha ativa, sem XREFs/imagens do carimbo).
  async function handleExportarDxf() {
    if (!pranchaAtiva) return;
    setStatus("Exportando DXF...");
    await exportarPranchaDxf(projeto, pranchaAtiva);
    setStatus(`DXF do projeto (formato "${pranchaAtiva.formato}") exportado ✓`);
  }

  return (
    <div className="flex h-14 shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-1">
      <span className="text-sm font-semibold text-slate-800">⚡ Cad RD</span>

      <input
        value={projeto.nome}
        onChange={(e) => setNomeProjeto(e.target.value)}
        className="w-40 rounded border border-slate-200 px-2 py-1 text-sm text-slate-700"
        title="Nome do projeto"
      />

      {selecionadoIds.length > 0 && (
        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          {selecionadoIds.length} selecionado(s)
        </span>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={desfazer}
          disabled={!podeDesfazer}
          title="Desfazer (Ctrl+Z)"
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          ↶ Desfazer
        </button>
        <button
          type="button"
          onClick={refazer}
          disabled={!podeRefazer}
          title="Refazer (Ctrl+Y)"
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          ↷ Refazer
        </button>
      </div>

      <button
        type="button"
        onClick={handleExportarPdf}
        disabled={!pranchaAtiva}
        title={
          pranchaAtiva
            ? `Exporta um PDF vetorial da prancha "${pranchaAtiva.nome}" (${pranchaAtiva.formato})`
            : "Selecione uma Prancha (no rodapé) para exportar -- o Desenho em si não tem PDF, só as Pranchas"
        }
        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Exportar PDF
      </button>

      <button
        type="button"
        onClick={handleExportarDxf}
        disabled={!pranchaAtiva}
        title={
          pranchaAtiva
            ? "Exporta um arquivo .dxf (formato nativo do AutoCAD) com todo o desenho + carimbo -- abre em qualquer CAD"
            : "Selecione uma Prancha (no rodapé) para exportar -- o Desenho em si não tem DXF, só as Pranchas"
        }
        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Exportar DXF
      </button>

      {pranchas.length > 1 && (
        <button
          type="button"
          onClick={handleExportarTodas}
          title={`Exporta 1 PDF multi-página com as ${pranchas.length} pranchas do projeto, uma por página`}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Exportar todas (PDF)
        </button>
      )}

      <button
        type="button"
        onClick={handleExportarA4}
        disabled={!pranchaAtiva}
        title={
          pranchaAtiva
            ? `Reduz a prancha "${pranchaAtiva.nome}" (${pranchaAtiva.formato}) para caber numa folha A4, para imprimir numa impressora comum de casa/escritório`
            : "Selecione uma Prancha (no rodapé) para exportar"
        }
        className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-50"
      >
        Ajustar para impressão em A4
      </button>

      {pranchas.length > 1 && (
        <button
          type="button"
          onClick={handleExportarTodasA4}
          title="Exporta todas as pranchas, cada uma reduzida para caber numa folha A4, uma por página"
          className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
        >
          Ajustar todas p/ A4
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {ultimoAutoSalvamento && (
          <span
            className="text-[11px] text-slate-400"
            title="Salvamento automático periódico -- não substitui o botão 'Salvar projeto atual' se você quiser garantir agora"
          >
            💾 Salvo automaticamente às {new Date(ultimoAutoSalvamento).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        {status && <span className="max-w-[220px] truncate text-[11px] text-slate-500">{status}</span>}

        <AuthPanel />
      </div>
    </div>
  );
}
