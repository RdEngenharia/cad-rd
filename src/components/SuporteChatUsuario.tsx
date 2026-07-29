"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Usuario } from "@/lib/auth";
import {
  enviarMensagemUsuario,
  marcarConversaLidaUsuario,
  observarConversaUsuario,
  type ConversaSuporte,
} from "@/lib/suporte";

function formatarHora(epochMs: number): string {
  if (!epochMs) return "";
  return new Date(epochMs).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface SuporteChatUsuarioProps {
  usuario: Usuario;
  onFechar: () => void;
}

/**
 * SuporteChatUsuario
 * -----------------------------------------------------------------------
 * Chat de "Sugestões/Suporte" do lado do usuário comum (Iteração 45,
 * versão Beta): mostra só a PRÓPRIA conversa com o admin (mensagens
 * enviadas + respostas recebidas), com um campo pra mandar mensagem nova.
 * Diferente do painel do admin (`SuporteAdminPanel.tsx`), que enxerga
 * TODAS as conversas -- aqui só existe "um tipo de chat", como pedido.
 * -----------------------------------------------------------------------
 */
export function SuporteChatUsuario({ usuario, onFechar }: SuporteChatUsuarioProps) {
  const [conversa, setConversa] = useState<ConversaSuporte | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const historicoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = observarConversaUsuario(usuario.uid, setConversa);
    void marcarConversaLidaUsuario(usuario.uid);
    return unsubscribe;
  }, [usuario.uid]);

  useEffect(() => {
    historicoRef.current?.scrollTo({ top: historicoRef.current.scrollHeight, behavior: "smooth" });
  }, [conversa?.mensagens.length]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const bruto = texto;
    if (!bruto.trim()) return;
    setEnviando(true);
    setErro(null);
    const r = await enviarMensagemUsuario(usuario.uid, usuario.email, bruto);
    setEnviando(false);
    if (r.ok) {
      setTexto("");
    } else {
      setErro(r.erro ?? "Não foi possível enviar.");
    }
  }

  const mensagens = conversa?.mensagens ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex h-[520px] w-[420px] flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">💬 Sugestões / Suporte</h2>
            <p className="text-[11px] text-slate-400">Versão Beta -- fale direto com quem está desenvolvendo o Cad RD.</p>
          </div>
          <button type="button" onClick={onFechar} className="text-slate-400 hover:text-slate-600" title="Fechar">
            ✕
          </button>
        </div>

        <div ref={historicoRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
          {mensagens.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">
              Mande um erro que encontrou ou uma sugestão de melhoria -- sua mensagem vai direto pro desenvolvedor,
              junto com seu e-mail ({usuario.email}).
            </p>
          ) : (
            mensagens.map((m) => (
              <div key={m.id} className={`flex ${m.de === "usuario" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${
                    m.de === "usuario" ? "bg-blue-600 text-white" : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
                  }`}
                >
                  {!(m.de === "usuario") && <p className="mb-0.5 text-[10px] font-semibold text-slate-400">Desenvolvedor</p>}
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  <p className={`mt-0.5 text-[9px] ${m.de === "usuario" ? "text-blue-100" : "text-slate-400"}`}>
                    {formatarHora(m.criado_em)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {erro && <p className="px-3 pt-1.5 text-[11px] text-red-600">{erro}</p>}

        <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-200 p-2.5">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Digite um erro ou sugestão -- Enter envia, Shift+Enter quebra linha"
            rows={2}
            className="flex-1 resize-none rounded border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "..." : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
