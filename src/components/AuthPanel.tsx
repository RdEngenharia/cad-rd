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
  const cancelarDesenho = useCadStore((s) => s.cancelarDesenho);
  const [loginAberto, setLoginAberto] = useState(false);

  useEffect(() => {
    const unsubscribe = observarUsuario(setUsuario);
    return unsubscribe;
  }, [setUsuario]);

  async function handleSair() {
    await sair();
    setUsuario(null);
    // Iteração 45 -- pedido do usuário: descobriu que, mesmo com login
    // obrigatório para abrir/criar/editar/salvar via `ProjectManagerModal`,
    // clicar em "Sair" no meio de uma sessão não travava o Desenho -- dava
    // pra continuar desenhando livremente sem conta, o que contradiz o
    // próprio aviso do app ("é preciso entrar... pra editar").
    //
    // Duas partes, não só uma: reabrir o modal sozinho não bastava. Um
    // comando de vários cliques em andamento (ex.: 1º ponto da LINHA já
    // cravado, campo "Comprimento" com foco -- ver `CommandLine.tsx`)
    // continuava vivo por trás do modal: o `<input>` de comprimento
    // reganha foco automaticamente sempre que esse estado está ativo, e
    // digitar um número + Enter nele cria a linha de qualquer jeito,
    // porque esse fluxo não passa por clique nenhum no `<canvas>` (que o
    // overlay do modal, esse sim, bloqueia). `cancelarDesenho()` zera
    // qualquer rascunho pendente (ponto/polígono/polilinha/cota/etc.) e
    // volta a ferramenta pra "selecionar" -- sem rascunho, aquele campo
    // deixa de existir, então não há mais onde as teclas caírem.
    cancelarDesenho();
    // Tira o foco de qualquer campo que ainda esteja focado (ex.: a
    // própria linha de comando) -- defesa extra pra garantir que as
    // primeiras teclas digitadas depois do logout não caiam silenciosamente
    // num campo que só visualmente ficou escondido atrás do overlay.
    (document.activeElement as HTMLElement | null)?.blur?.();
    abrirGerenciadorProjetos();
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
