"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { entrar, cadastrar, redefinirSenha } from "@/lib/auth";
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

  const [modo, setModo] = useState<"entrar" | "cadastrar" | "recuperar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  // Mensagem de sucesso da recuperação de senha (modo "recuperar") -- não
  // reaproveita `erro` porque não é um erro, é uma confirmação.
  const [mensagemRecuperar, setMensagemRecuperar] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const id = requestAnimationFrame(() => {
      setErro(null);
      setCarregando(false);
      setMensagemRecuperar(null);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [aberto]);

  if (!aberto) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    // Modo "Esqueci minha senha" (Iteração 45 -- sugestão de melhoria
    // aceita pelo usuário: "com login virando obrigatório pra tudo, um
    // projetista/eletricista que esquecer a senha fica travado"). Não
    // chama `setUsuario`/`onFechar` -- só manda o e-mail e mostra a
    // confirmação, o usuário continua na tela pra depois voltar a "Entrar".
    if (modo === "recuperar") {
      const r = await redefinirSenha(email);
      setCarregando(false);
      if (r.ok) {
        setMensagemRecuperar(
          r.mock
            ? "Sessão local: não existe senha de verdade pra redefinir -- é só entrar de novo com o mesmo e-mail e qualquer senha (mín. 4 caracteres)."
            : "Se este e-mail tiver uma conta, enviamos um link de redefinição de senha para ele. Confira sua caixa de entrada (e o spam)."
        );
      } else {
        setErro(r.erro ?? "Não foi possível enviar o e-mail de redefinição.");
      }
      return;
    }

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

  const titulo =
    modo === "entrar" ? "Entrar" : modo === "cadastrar" ? "Criar conta" : "Recuperar senha";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <form onSubmit={handleSubmit} className="w-80 rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-800">👤 {titulo}</h2>

        {!FIREBASE_CONFIGURADO && modo !== "recuperar" && (
          <p className="mt-1 rounded bg-amber-50 p-1.5 text-[10px] leading-snug text-amber-700">
            Sessão local: qualquer e-mail válido + senha (mín. 4 caracteres) entra, sempre no mesmo usuário
            para o mesmo e-mail. Seus projetos ficam salvos neste dispositivo.
          </p>
        )}

        {modo === "recuperar" && !mensagemRecuperar && (
          <p className="mt-1 rounded bg-blue-50 p-1.5 text-[10px] leading-snug text-blue-700">
            Digite o e-mail da sua conta -- vamos mandar um link para redefinir a senha.
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
        {modo !== "recuperar" && (
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
        )}

        {erro && <p className="mt-1.5 text-xs text-red-600">{erro}</p>}
        {mensagemRecuperar && <p className="mt-1.5 text-xs text-green-700">{mensagemRecuperar}</p>}

        {modo === "entrar" && (
          <button
            type="button"
            onClick={() => {
              setModo("recuperar");
              setErro(null);
              setMensagemRecuperar(null);
            }}
            className="mt-2 block text-[11px] text-blue-600 hover:underline"
          >
            Esqueceu a senha?
          </button>
        )}

        {modo === "recuperar" ? (
          <button
            type="button"
            onClick={() => {
              setModo("entrar");
              setErro(null);
              setMensagemRecuperar(null);
            }}
            className="mt-2 block text-[11px] text-blue-600 hover:underline"
          >
            Voltar para login
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setModo(modo === "entrar" ? "cadastrar" : "entrar");
              setErro(null);
              setMensagemRecuperar(null);
            }}
            className="mt-2 block text-[11px] text-blue-600 hover:underline"
          >
            {modo === "cadastrar" ? "Já tem conta? Entrar" : "Não tem conta? Criar conta"}
          </button>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          {!(modo === "recuperar" && mensagemRecuperar) && (
            <button
              type="submit"
              disabled={carregando}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {carregando
                ? "Aguarde..."
                : modo === "entrar"
                  ? "Entrar"
                  : modo === "cadastrar"
                    ? "Criar conta"
                    : "Enviar link de redefinição"}
            </button>
          )}
        </div>

        {/* Iteração 45 -- duas melhorias sugeridas e aceitas pelo usuário:
            (a) aviso claro de que a cobrança de R$49,90/mês começa só
            depois do período Beta (evita qualquer surpresa pra quem se
            cadastrar agora, de graça); (b) link para a Política de
            Privacidade, já que a conta agora é obrigatória pra usar
            qualquer parte do editor. */}
        <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] leading-snug text-slate-400">
          <p>🧪 Versão Beta -- gratuita durante o período de testes. Depois, uso mensal de R$49,90.</p>
          <p className="mt-0.5 flex gap-2">
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Política de Privacidade
            </a>
            <span>·</span>
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Termos de Uso
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
