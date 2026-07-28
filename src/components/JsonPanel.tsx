"use client";

import { useCadStore } from "@/lib/store";

/**
 * JsonPanel
 * -----------------------------------------------------------------------
 * Painel lateral direito, colapsável, que espelha em tempo real o JSON
 * exato que é (ou seria) persistido -- útil para depurar. O `objectUrl`
 * de cada XREF é omitido aqui de propósito: ele é um detalhe de runtime
 * do navegador, nunca é persistido.
 *
 * Iteração 34 (pedido do usuário): painel de uso interno/depuração --
 * nunca aparece por padrão nem tem botão visível na Toolbar; só abre via
 * atalho de teclado (`Ctrl+J`, ver `Editor.tsx`). O texto também não
 * menciona mais onde o projeto é armazenado.
 * -----------------------------------------------------------------------
 */
export function JsonPanel() {
  const projeto = useCadStore((s) => s.projeto);

  const paraExibir = {
    ...projeto,
    // objectUrl é só um detalhe de runtime do navegador; nunca é persistido.
    xrefs: projeto.xrefs.map((x) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { objectUrl, ...resto } = x;
      return resto;
    }),
  };

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-200 bg-slate-950">
      <div className="border-b border-slate-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Projeto (JSON)
        </h2>
        <p className="text-[10px] text-slate-500">
          {projeto.geometria.length} elemento(s) · {projeto.xrefs.length} xref(s)
        </p>
      </div>
      <pre className="flex-1 overflow-auto p-3 text-[11px] leading-snug text-emerald-300">
        {JSON.stringify(paraExibir, null, 2)}
      </pre>
    </aside>
  );
}
