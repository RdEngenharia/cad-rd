"use client";

import type { ThumbnailPagina } from "@/lib/pdfImport";

interface PdfPageModalProps {
  nomeArquivo: string;
  thumbnails: ThumbnailPagina[];
  carregando: boolean;
  onEscolher: (numero: number) => void;
  onCancelar: () => void;
}

/**
 * PdfPageModal
 * -----------------------------------------------------------------------
 * Seletor visual de página para importação de XREF a partir de um PDF
 * com MAIS DE UMA página (`XrefImportButton.tsx` só chama isto quando
 * `inspecionarPdf` reporta `numPaginas > 1`; para PDFs de 1 página, o
 * fluxo antigo -- importar direto -- continua igual). Mostra uma
 * miniatura de cada página (já rasterizada em baixa resolução por
 * `inspecionarPdf`); ao clicar numa delas, a página escolhida é
 * rasterizada de novo em alta resolução (ver `rasterizarPaginaPdf`) e
 * segue o mesmo caminho de importação de sempre.
 *
 * Segue o mesmo padrão visual de `CalibrationModal.tsx` (overlay +
 * cartão central), mas sem estado nenhum no Zustand -- é um fluxo local
 * e efêmero, então vive inteiramente como estado de componente em
 * `XrefImportButton.tsx`.
 * -----------------------------------------------------------------------
 */
export function PdfPageModal({ nomeArquivo, thumbnails, carregando, onEscolher, onCancelar }: PdfPageModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="max-h-[80vh] w-[28rem] overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-800">📄 Escolha a página</h2>
        <p className="mt-1 text-xs leading-snug text-slate-500">
          <b>{nomeArquivo}</b> tem {thumbnails.length} páginas -- qual delas vira o XREF de fundo?
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {thumbnails.map((t) => (
            <button
              key={t.numero}
              type="button"
              disabled={carregando}
              onClick={() => onEscolher(t.numero)}
              className="group rounded border border-slate-200 p-1 text-center hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
              title={`Importar a página ${t.numero}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL local gerado em memória (pdf.js), sem sentido passar pelo otimizador de imagem do Next. */}
              <img src={t.dataUrl} alt={`Página ${t.numero}`} className="w-full rounded border border-slate-100" />
              <span className="mt-1 block text-[11px] font-medium text-slate-600 group-hover:text-blue-700">
                Página {t.numero}
              </span>
            </button>
          ))}
        </div>

        {carregando && <p className="mt-2 text-xs text-blue-600">Importando a página escolhida...</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancelar}
            disabled={carregando}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
