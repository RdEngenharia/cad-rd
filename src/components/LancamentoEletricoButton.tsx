"use client";

import { useState } from "react";
import { useCadStore } from "@/lib/store";
import type { ResumoLancamentoEletrico } from "@/lib/lancamentoEletrico";
import type { ProblemaComodo } from "@/lib/roomDetection";

/**
 * LancamentoEletricoButton
 * -----------------------------------------------------------------------
 * Iteração 35 -- ponto de entrada do gerador automático de tomadas/
 * interruptores/iluminação (NBR 5410). Pedido do usuário: "a regra é
 * selecionar primeiro a casa ai o botao de lançar circuitos fica
 * ativado" -- por isso o botão fica DESABILITADO enquanto
 * `selecionadoIds` estiver vazio (nenhuma seleção feita ainda).
 *
 * Diferente de `CargasEletricasButton`/`SistemaSoloButton`/`DiagramaFvButton`
 * (que abrem um MODAL de formulário antes de gerar), este botão não tem
 * nenhum dado pra perguntar -- tudo que ele precisa (nomes/áreas dos
 * cômodos) já está na própria seleção do desenho. Por isso ele age direto
 * no clique e só abre um modal DEPOIS, só pra mostrar o resultado
 * (resumo de sucesso ou a lista de problemas a corrigir).
 * -----------------------------------------------------------------------
 */
export function LancamentoEletricoButton() {
  const selecionadoIds = useCadStore((s) => s.selecionadoIds);
  const gerarLancamentoEletrico = useCadStore((s) => s.gerarLancamentoEletrico);
  const [resultado, setResultado] = useState<{
    ok: boolean;
    resumo: ResumoLancamentoEletrico | null;
    problemas: ProblemaComodo[];
  } | null>(null);

  const habilitado = selecionadoIds.length > 0;

  function handleClick() {
    const res = gerarLancamentoEletrico(selecionadoIds);
    setResultado(res);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={!habilitado}
        title={
          habilitado
            ? "Detecta os cômodos da seleção (paredes + nomes) e lança tomadas/interruptores/iluminação conforme a NBR 5410"
            : "Selecione primeiro as paredes e os nomes dos cômodos da casa (clique ou caixa de seleção) para ativar"
        }
        className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-2 text-xs font-medium text-amber-700 hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
      >
        ⚡ Lançar tomadas/iluminação (NBR 5410)
      </button>
      {!habilitado && (
        <p className="mt-1 text-[10px] text-slate-400">Selecione a casa (paredes + nomes dos cômodos) para ativar.</p>
      )}
      {resultado && <LancamentoEletricoResultModal resultado={resultado} onFechar={() => setResultado(null)} />}
    </div>
  );
}

function LancamentoEletricoResultModal({
  resultado,
  onFechar,
}: {
  resultado: { ok: boolean; resumo: ResumoLancamentoEletrico | null; problemas: ProblemaComodo[] };
  onFechar: () => void;
}) {
  const { ok, resumo, problemas } = resultado;

  const ROTULO_PROBLEMA: Record<ProblemaComodo["tipo"], string> = {
    aberta: "Área aberta (parede com vão) -- desenhe uma linha temporária pra fechar e tente de novo (apague a linha depois)",
    mesclada: "2+ nomes na mesma área conectada -- falta uma parede/divisória entre eles (ou desenhe uma linha temporária)",
    sem_nome:
      "Área fechada sem nenhum nome de ambiente próximo -- adicione (ou aproxime) um texto com o nome do cômodo e tente de novo",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex max-h-[85vh] w-[34rem] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            {ok ? "⚡ Lançamento elétrico gerado" : "⚠ Não foi possível gerar"}
          </h2>
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-xs text-slate-700">
          {!ok && (
            <>
              <p className="mb-2 text-slate-600">
                {problemas.length > 0
                  ? "Corrija o(s) problema(s) abaixo na seleção e clique no botão de novo:"
                  : "Nenhum cômodo foi reconhecido na seleção -- confira se ela inclui as paredes (linhas) e os textos de nome de cada ambiente."}
              </p>
              <ul className="list-disc space-y-2 pl-4">
                {problemas.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{ROTULO_PROBLEMA[p.tipo]}</span>
                    {p.nomes.length > 0 && <> -- nome(s) envolvido(s): {p.nomes.join(", ")}</>}
                    <> -- localização aprox. no desenho: ({(p.centroideAprox.x / 1000).toFixed(2)}m, {(p.centroideAprox.y / 1000).toFixed(2)}m)</>
                  </li>
                ))}
              </ul>
              {problemas.some((p) => p.tipo === "sem_nome") && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Dica: o texto do nome do cômodo precisa estar a menos de 1m das paredes selecionadas (o sistema já
                  busca automaticamente textos próximos que não tenham sido clicados/selecionados, mesmo que estejam
                  fora da seleção). Use a localização acima pra achar a área no desenho.
                </p>
              )}
            </>
          )}

          {ok && resumo && (
            <>
              <p className="mb-2">
                {resumo.comodosProcessados} cômodo(s) processado(s): {resumo.totalTomadas} tomada(s),{" "}
                {resumo.totalPontosLuz} ponto(s) de luz, {resumo.totalInterruptores} interruptor(es)
                {resumo.totalTues > 0 && <>, {resumo.totalTues} TUE(s)</>}.
              </p>
              <table className="mb-3 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1 pr-2">Cômodo</th>
                    <th className="py-1 pr-2">Tipo</th>
                    <th className="py-1 pr-2">Área</th>
                    <th className="py-1 pr-2">Tomadas</th>
                    <th className="py-1 pr-2">TUE(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.porComodo.map((c, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{c.nome}</td>
                      <td className="py-1 pr-2">{c.tipoRotulo}</td>
                      <td className="py-1 pr-2">{c.areaM2.toFixed(1)}m²</td>
                      <td className="py-1 pr-2">
                        {c.quantidadeTomadas} {!c.pontosAutomaticos && "(manual)"}
                      </td>
                      <td className="py-1 pr-2">
                        {c.nomesTuesLancados.length > 0 ? c.nomesTuesLancados.join(", ") : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mb-1 font-medium text-slate-600">Observações importantes:</p>
              <ul className="list-disc space-y-1 pl-4 text-slate-500">
                {resumo.observacoesGerais.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
                {resumo.porComodo
                  .filter((c) => c.observacao)
                  .map((c, i) => (
                    <li key={`obs-${i}`}>
                      {c.nome}: {c.observacao}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onFechar}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
