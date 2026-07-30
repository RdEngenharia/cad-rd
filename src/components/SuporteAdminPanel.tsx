"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  enviarRespostaAdmin,
  marcarConversaLidaAdmin,
  observarTodasConversas,
  type ConversaSuporte,
} from "@/lib/suporte";
import { observarErrosRecentes, type ErroReportado } from "@/lib/errorLog";

function formatarHora(epochMs: number): string {
  if (!epochMs) return "";
  return new Date(epochMs).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface SuporteAdminPanelProps {
  onFechar: () => void;
}

/**
 * SuporteAdminPanel
 * -----------------------------------------------------------------------
 * Visão do ADMIN (Iteração 45, versão Beta -- pedido do usuário: "deve
 * ficar disponivel tipo uma comunidade, onde eu veja todas as informacoes
 * e somente eu consiga responder... eu verei as mensagens de todos em uma
 * mesma tela"). Coluna da esquerda: todas as conversas (mais recente
 * primeiro, com bolinha vermelha nas que têm mensagem nova não lida).
 * Coluna da direita: a conversa selecionada, com o histórico completo e um
 * campo pra responder. Só é renderizado para `EMAIL_ADMIN` (ver
 * `SuportePanel.tsx`, que decide qual painel montar).
 * -----------------------------------------------------------------------
 */
export function SuporteAdminPanel({ onFechar }: SuporteAdminPanelProps) {
  const [conversas, setConversas] = useState<ConversaSuporte[]>([]);
  const [uidSelecionado, setUidSelecionado] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const historicoRef = useRef<HTMLDivElement>(null);

  // Iteração 45 -- monitoramento de erros: 2ª aba dentro do mesmo painel
  // do admin (em vez de um modal separado), já que ambos são "coisas que
  // só o admin vê" -- reaproveita o mesmo cabeçalho/botão de fechar.
  const [aba, setAba] = useState<"conversas" | "erros">("conversas");
  const [erros, setErros] = useState<ErroReportado[]>([]);
  const [erroSelecionadoId, setErroSelecionadoId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = observarTodasConversas(setConversas);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = observarErrosRecentes(setErros);
    return unsubscribe;
  }, []);

  const conversaSelecionada = useMemo(
    () => conversas.find((c) => c.uid === uidSelecionado) ?? null,
    [conversas, uidSelecionado]
  );

  useEffect(() => {
    historicoRef.current?.scrollTo({ top: historicoRef.current.scrollHeight, behavior: "smooth" });
  }, [conversaSelecionada?.mensagens.length]);

  function selecionar(uid: string) {
    setUidSelecionado(uid);
    setErro(null);
    void marcarConversaLidaAdmin(uid);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!uidSelecionado || !resposta.trim()) return;
    setEnviando(true);
    setErro(null);
    const r = await enviarRespostaAdmin(uidSelecionado, resposta);
    setEnviando(false);
    if (r.ok) {
      setResposta("");
    } else {
      setErro(r.erro ?? "Não foi possível enviar.");
    }
  }

  const erroSelecionado = useMemo(() => erros.find((e) => e.id === erroSelecionadoId) ?? null, [erros, erroSelecionadoId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex h-[600px] w-[820px] flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">🛠 Painel de Suporte (admin)</h2>
            <p className="text-[11px] text-slate-400">
              {aba === "conversas"
                ? `${conversas.length} conversa(s) -- ${conversas.filter((c) => c.naoLidoAdmin).length} com mensagem nova.`
                : `${erros.length} erro(s) reportado(s) automaticamente pelo app.`}
            </p>
          </div>
          <button type="button" onClick={onFechar} className="text-slate-400 hover:text-slate-600" title="Fechar">
            ✕
          </button>
        </div>

        {/* Iteração 45 -- abas: "Conversas" (mensagens manuais de sugestão/
            erro) e "Erros" (capturados automaticamente pelo app, ver
            `lib/useCapturarErros.ts`). */}
        <div className="flex border-b border-slate-100">
          <button
            type="button"
            onClick={() => setAba("conversas")}
            className={`px-4 py-2 text-xs font-medium ${aba === "conversas" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            💬 Conversas
          </button>
          <button
            type="button"
            onClick={() => setAba("erros")}
            className={`px-4 py-2 text-xs font-medium ${aba === "erros" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            ⚠️ Erros {erros.length > 0 && `(${erros.length})`}
          </button>
        </div>

        {aba === "conversas" ? (
          <div className="flex flex-1 overflow-hidden">
            <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-100">
              {conversas.length === 0 ? (
                <p className="p-3 text-center text-[11px] text-slate-400">Nenhuma mensagem recebida ainda.</p>
              ) : (
                <ul>
                  {conversas.map((c) => {
                    const ultima = c.mensagens[c.mensagens.length - 1];
                    return (
                      <li key={c.uid}>
                        <button
                          type="button"
                          onClick={() => selecionar(c.uid)}
                          className={`flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 ${
                            uidSelecionado === c.uid ? "bg-blue-50" : ""
                          }`}
                        >
                          <span className="flex w-full items-center gap-1.5">
                            {c.naoLidoAdmin && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                            <span className="truncate text-xs font-medium text-slate-700" title={c.email}>
                              {c.email}
                            </span>
                          </span>
                          {ultima && <span className="w-full truncate text-[10px] text-slate-400">{ultima.texto}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-1 flex-col">
              {!conversaSelecionada ? (
                <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
                  Selecione uma conversa à esquerda.
                </div>
              ) : (
                <>
                  <div ref={historicoRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
                    {conversaSelecionada.mensagens.map((m) => (
                      <div key={m.id} className={`flex ${m.de === "admin" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] rounded-lg px-2.5 py-1.5 text-xs ${
                            m.de === "admin" ? "bg-blue-600 text-white" : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                          <p className={`mt-0.5 text-[9px] ${m.de === "admin" ? "text-blue-100" : "text-slate-400"}`}>
                            {formatarHora(m.criado_em)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {erro && <p className="px-3 pt-1.5 text-[11px] text-red-600">{erro}</p>}
                  <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-200 p-2.5">
                    <textarea
                      value={resposta}
                      onChange={(e) => setResposta(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder={`Responder para ${conversaSelecionada.email} -- Enter envia, Shift+Enter quebra linha`}
                      rows={2}
                      className="flex-1 resize-none rounded border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
                    />
                    <button
                      type="submit"
                      disabled={enviando || !resposta.trim()}
                      className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {enviando ? "..." : "Responder"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-100">
              {erros.length === 0 ? (
                <p className="p-3 text-center text-[11px] text-slate-400">
                  Nenhum erro reportado ainda -- ótimo sinal!
                </p>
              ) : (
                <ul>
                  {erros.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setErroSelecionadoId(e.id)}
                        className={`flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 ${
                          erroSelecionadoId === e.id ? "bg-blue-50" : ""
                        }`}
                      >
                        <span className="w-full truncate text-xs font-medium text-slate-700">{e.mensagem}</span>
                        <span className="text-[10px] text-slate-400">
                          {formatarHora(e.criado_em)} {e.usuarioEmail ? `-- ${e.usuarioEmail}` : "-- (deslogado)"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {!erroSelecionado ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  Selecione um erro à esquerda para ver os detalhes.
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <p>
                    <span className="font-semibold text-slate-700">Mensagem:</span> {erroSelecionado.mensagem}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Quando:</span> {formatarHora(erroSelecionado.criado_em)}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Página:</span> {erroSelecionado.url || "--"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Usuário:</span>{" "}
                    {erroSelecionado.usuarioEmail ?? "(deslogado no momento do erro)"}
                  </p>
                  {erroSelecionado.stack && (
                    <div>
                      <p className="font-semibold text-slate-700">Stack trace:</p>
                      <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-[10px] leading-snug text-slate-100">
                        {erroSelecionado.stack}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
