"use client";

import { useRef, useState } from "react";
import { useCadStore } from "@/lib/store";
import { saveXrefBlob, deleteXrefBlob } from "@/lib/xrefDb";
import { rasterizarPaginaPdf, inspecionarPdf, type ThumbnailPagina } from "@/lib/pdfImport";
import { PdfPageModal } from "./PdfPageModal";

function medirImagem(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = objectUrl;
  });
}

/**
 * XrefImportButton
 * -----------------------------------------------------------------------
 * Ponto de entrada da importação de XREF (imagem OU PDF). Nada é
 * enviado para um servidor: o arquivo vira um Blob local, exibido via
 * Object URL (`URL.createObjectURL`) e persistido no IndexedDB (para
 * sobreviver a um F5). Um PDF é primeiro rasterizado para um <canvas>
 * em `pdfImport.ts`, e a partir daí segue o mesmo caminho de uma imagem
 * comum. PDFs de MAIS DE 1 página pausam esse fluxo e abrem o
 * `PdfPageModal` -- um seletor visual (miniaturas) de qual página vira
 * o XREF; PDFs de 1 página continuam importando direto, sem esse passo
 * extra.
 *
 * Também lista os XREFs já importados, com X/Y/Escala editáveis --
 * exatamente os campos que vão para o Firestore (ver lib/firebase.ts) --
 * e o botão "Calibrar por referência" (Scale by Reference), que arma a
 * ferramenta de calibração para aquele XREF específico (ver
 * CanvasStage + GeometryLayer + CalibrationModal).
 * -----------------------------------------------------------------------
 */
export function XrefImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** PDF multipáginas aguardando a escolha do usuário no `PdfPageModal` (null = nenhum seletor aberto). */
  const [pdfPendente, setPdfPendente] = useState<{ file: File; thumbnails: ThumbnailPagina[] } | null>(null);

  const xrefs = useCadStore((s) => s.projeto.xrefs);
  const addXref = useCadStore((s) => s.addXref);
  const updateXref = useCadStore((s) => s.updateXref);
  const removeXref = useCadStore((s) => s.removeXref);
  const iniciarCalibracao = useCadStore((s) => s.iniciarCalibracao);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const calibXrefId = useCadStore((s) => s.calibXrefId);

  /** Rasteriza (se PDF) ou lê direto (se imagem) e cria o XREF -- ponto final comum de todo fluxo de importação. */
  async function importarArquivo(file: File, ehPdf: boolean, pagina: number) {
    setErro(null);
    setCarregando(true);
    try {
      let blob: Blob;
      let largura_px: number;
      let altura_px: number;

      if (ehPdf) {
        const { canvas, largura, altura } = await rasterizarPaginaPdf(file, pagina);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao rasterizar o PDF."))), "image/png")
        );
        largura_px = largura;
        altura_px = altura;
      } else {
        blob = file;
        const objectUrlTemp = URL.createObjectURL(blob);
        const dims = await medirImagem(objectUrlTemp);
        largura_px = dims.width;
        altura_px = dims.height;
        URL.revokeObjectURL(objectUrlTemp);
      }

      const objectUrl = URL.createObjectURL(blob);
      // Escala inicial: encaixa a maior dimensão em ~150mm no desenho.
      const escalaInicial = Math.min(1, 150 / Math.max(largura_px, altura_px, 1));

      const id = addXref({
        nome_arquivo: ehPdf && pagina > 1 ? `${file.name} (pág. ${pagina})` : file.name,
        tipo: ehPdf ? "pdf" : "imagem",
        x: 0,
        y: 0,
        escala: Number(escalaInicial.toFixed(4)),
        largura_px,
        altura_px,
        objectUrl,
      });

      await saveXrefBlob(id, blob);
      setPdfPendente(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ehPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (ehPdf) {
      // PDFs de mais de 1 página pausam aqui: mostra o seletor visual de
      // página (miniaturas) em vez de importar direto a 1ª página.
      setErro(null);
      setCarregando(true);
      try {
        const info = await inspecionarPdf(file);
        setCarregando(false);
        if (info.numPaginas > 1 && info.thumbnails) {
          setPdfPendente({ file, thumbnails: info.thumbnails });
          if (inputRef.current) inputRef.current.value = "";
          return;
        }
      } catch (err) {
        setCarregando(false);
        setErro(err instanceof Error ? err.message : String(err));
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }

    await importarArquivo(file, ehPdf, 1);
  }

  function handleRemover(id: string, objectUrl?: string) {
    removeXref(id);
    void deleteXrefBlob(id);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        className="hidden"
        onChange={handleFiles}
      />
      <button
        type="button"
        disabled={carregando}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-xs font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
      >
        {carregando ? "Importando..." : "+ Importar imagem / PDF"}
      </button>
      {erro && <p className="mt-1 text-[11px] text-red-600">{erro}</p>}
      <p className="mt-1 text-[10px] leading-snug text-slate-400">
        Fica só no seu navegador. O projeto salvo na nuvem guarda apenas nome, X/Y e escala.
      </p>

      {xrefs.length > 0 && (
        <ul className="mt-2 space-y-2">
          {xrefs.map((x) => {
            const calibrandoEste = ferramenta === "calibrar" && calibXrefId === x.id;
            return (
            <li
              key={x.id}
              className={`rounded-md border p-2 text-[11px] ${calibrandoEste ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate font-medium text-slate-700" title={x.nome_arquivo}>
                    {x.nome_arquivo}
                  </span>
                  {x.calibrado && (
                    <span title="Escala calibrada por referência" className="shrink-0 text-amber-500">
                      📐
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => updateXref(x.id, { visivel: x.visivel === false })}
                  className={`shrink-0 rounded px-1 text-[10px] ${
                    x.visivel === false ? "bg-slate-200 text-slate-500" : "bg-blue-100 text-blue-700"
                  }`}
                  title={x.visivel === false ? "Fundo desligado -- clique para mostrar a imagem/PDF de novo" : "Fundo ligado -- clique para esconder a imagem/PDF (sem apagar)"}
                >
                  {x.visivel === false ? "🚫" : "🖼"}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemover(x.id, x.objectUrl)}
                  className="shrink-0 text-red-500 hover:text-red-700"
                  title="Remover XREF"
                >
                  ✕
                </button>
              </div>

              <button
                type="button"
                onClick={() => iniciarCalibracao(x.id)}
                disabled={calibrandoEste}
                title="Ajustar a escala da imagem clicando em dois pontos de referência conhecidos (ex.: a barra de escala do Google Maps)"
                className={`mb-1 w-full rounded border px-1.5 py-1 text-[10px] font-medium ${
                  calibrandoEste
                    ? "cursor-default border-amber-300 bg-amber-100 text-amber-700"
                    : "border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                }`}
              >
                📐 {calibrandoEste ? "Calibrando..." : "Calibrar por referência"}
              </button>
              {calibrandoEste && (
                <p className="mb-1 rounded bg-amber-100 p-1.5 text-[10px] leading-snug text-amber-800">
                  Clique em dois pontos conhecidos da imagem (ex.: as duas pontas da barra de escala do
                  mapa). Esc cancela.
                </p>
              )}

              <div className="grid grid-cols-3 gap-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-400">X</span>
                  <input
                    type="number"
                    value={x.x}
                    onChange={(e) => updateXref(x.id, { x: Number(e.target.value) })}
                    className="w-full rounded border border-slate-200 px-1 py-0.5"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-400">Y</span>
                  <input
                    type="number"
                    value={x.y}
                    onChange={(e) => updateXref(x.id, { y: Number(e.target.value) })}
                    className="w-full rounded border border-slate-200 px-1 py-0.5"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-slate-400">Escala</span>
                  <input
                    type="number"
                    step="any"
                    value={x.escala}
                    onChange={(e) => updateXref(x.id, { escala: Number(e.target.value), calibrado: false })}
                    className="w-full rounded border border-slate-200 px-1 py-0.5"
                  />
                </label>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {pdfPendente && (
        <PdfPageModal
          nomeArquivo={pdfPendente.file.name}
          thumbnails={pdfPendente.thumbnails}
          carregando={carregando}
          onEscolher={(numero) => importarArquivo(pdfPendente.file, true, numero)}
          onCancelar={() => setPdfPendente(null)}
        />
      )}
    </div>
  );
}
