"use client";

import { useEffect, useState } from "react";
import { useCadStore } from "@/lib/store";
import { observarUsuario, sair } from "@/lib/auth";
import { LoginModal } from "./LoginModal";

/**
 * AuthPanel
 * -----------------------------------------------------------------------
 * Widget compacto de conta (Sprint 3), montado na Toolbar: observa o
 * usuário logado (`lib/auth.ts#observarUsuario`, mock local ou Firebase
 * Auth de verdade) e alterna entre dois estados --
 *   - Deslogado: botão "Entrar" (abre `LoginModal`).
 *   - Logado: e-mail + botão "Sair" + botão "📁 Meus Projetos".
 *
 * Iteração 34: o botão "📁 Meus Projetos" agora só abre o
 * `ProjectManagerModal` (renderizado 1x em `Editor.tsx`, controlado pelo
 * store -- `gerenciadorProjetosAberto`/`abrirGerenciadorProjetos`) em vez
 * de montar sua própria instância -- o mesmo modal também abre sozinho ao
 * carregar o app, então precisa ser uma instância única compartilhada.
 * -----------------------------------------------------------------------
 */
export function AuthPanel() {
  const usuario = useCadStore((s) => s.usuario);
  const setUsuario = useCadStore((s) => s.setUsuario);
  const abrirGerenciadorProjetos = useCadStore((s) => s.abrirGerenciadorProjetos);
  const [loginAberto, setLoginAberto] = useState(false);

  useEffect(() => {
    const unsubscribe = observarUsuario(setUsuario);
    return unsubscribe;
  }, [setUsuario]);

  async function handleSair() {
    await sair();
    setUsuario(null);
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {usuario ? (
          <>
            <span className="max-w-[120px] truncate text-[11px] text-slate-500" title={usuario.email}>
              👤 {usuario.email}
            </span>
            <button
              type="button"
              onClick={abrirGerenciadorProjetos}
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              📁 Meus Projetos
            </button>
            <button
              type="button"
              onClick={handleSair}
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Sair
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setLoginAberto(true)}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            👤 Entrar
          </button>
        )}
      </div>

      <LoginModal aberto={loginAberto} onFechar={() => setLoginAberto(false)} />
    </>
  );
}
