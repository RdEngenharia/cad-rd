"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { entrar, cadastrar } from "@/lib/auth";
import { FIREBASE_CONFIGURADO } from "@/lib/firebase";
import { useCadStore } from "@/lib/store";

interface LoginModalProps {
  aberto: boolean;
  onFechar: () => void;
}

/**
 * LoginModal
 * -----------------------------------------------------------------------
 * Login/cadastro por e-mail+senha (Sprint 3 -- "Auth + Gestão de Projetos
 * na Nuvem"). Mesmo padrão visual de `CalibrationModal.tsx`. Alterna
 * entre os modos "Entrar" e "Criar conta" (mesmo formulário, ação
 * diferente); no modo mock (`!FIREBASE_CONFIGURADO`) mostra um aviso
 * explicando que a sessão é só local (não valida senha de verdade), sem
 * esconder o fluxo -- o usuário pode testar o Gerenciador de Projetos
 * imediatamente, sem precisar configurar credenciais reais primeiro.
 * -----------------------------------------------------------------------
 */
export function LoginModal({ aberto, onFechar }: LoginModalProps) {
  const setUsuario = useCadStore((s) => s.setUsuario);

  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const id = requestAnimationFrame(() => {
      setErro(null);
      setCarregando(false);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [aberto]);

  if (!aberto) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const acao = modo === "entrar" ? entrar : cadastrar;
    const r = await acao(email, senha);
    setCarregando(false);
    if (r.ok && r.usuario) {
      setUsuario(r.usuario);
      setEmail("");
      setSenha("");
      onFechar();
    } else {
      setErro(r.erro ?? "Não foi possível autenticar.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <form onSubmit={handleSubmit} className="w-80 rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-800">
          👤 {modo === "entrar" ? "Entrar" : "Criar conta"}
        </h2>

        {!FIREBASE_CONFIGURADO && (
          <p className="mt-1 rounded bg-amber-50 p-1.5 text-[10px] leading-snug text-amber-700">
            Sessão local: qualquer e-mail válido + senha (mín. 4 caracteres) entra, sempre no mesmo usuário
            para o mesmo e-mail. Seus projetos ficam salvos neste dispositivo.
          </p>
        )}

        <label className="mt-3 block text-xs font-medium text-slate-600">
          E-mail
          <input
            ref={inputRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
          />
        </label>
        <label className="mt-2 block text-xs font-medium text-slate-600">
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
          />
        </label>

        {erro && <p className="mt-1.5 text-xs text-red-600">{erro}</p>}

        <button
          type="button"
          onClick={() => {
            setModo(modo === "entrar" ? "cadastrar" : "entrar");
            setErro(null);
          }}
          className="mt-2 text-[11px] text-blue-600 hover:underline"
        >
          {modo === "entrar" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
        </button>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={carregando}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {carregando ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </div>
      </form>
    </div>
  );
}
