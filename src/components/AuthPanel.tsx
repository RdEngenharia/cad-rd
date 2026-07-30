"use client";

import { useEffect, useState } from "react";
import { useCadStore } from "@/lib/store";
import { observarUsuario, sair } from "@/lib/auth";
import { ehAdmin, observarConversaUsuario, observarTodasConversas } from "@/lib/suporte";
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
  const abrirSuporte = useCadStore((s) => s.abrirSuporte);
  const abrirAjuda = useCadStore((s) => s.abrirAjuda);
  const cancelarDesenho = useCadStore((s) => s.cancelarDesenho);
  const [loginAberto, setLoginAberto] = useState(false);
  const [suporteNaoLido, setSuporteNaoLido] = useState(0);

  useEffect(() => {
    const unsubscribe = observarUsuario(setUsuario);
    return unsubscribe;
  }, [setUsuario]);

  // Iteração 45 -- pedido do usuário: "ative notificação dentro do cad
  // para que quando eu responder ele seja notificado no chat, preciso
  // receber aviso de mensagens tambem" -- bolinha de notificação no botão
  // "💬 Sugestões", alimentada por um listener em tempo real (Firestore
  // `onSnapshot`, ver `lib/suporte.ts`) sempre ativo enquanto logado, não
  // só quando o painel está aberto. Usuário comum: 1 (tem resposta nova do
  // admin) ou 0. Admin (`EMAIL_ADMIN`): total de conversas com mensagem
  // nova de algum usuário.
  useEffect(() => {
    // Sem usuário: nada pra observar -- o botão nem aparece nesse caso (ver
    // JSX abaixo), então não há necessidade de zerar `suporteNaoLido`
    // sincronamente aqui (a próxima vez que `usuario` existir, o listener
    // abaixo já chama de volta com o valor certo).
    if (!usuario) return;
    if (ehAdmin(usuario.email)) {
      return observarTodasConversas((conversas) => {
        setSuporteNaoLido(conversas.filter((c) => c.naoLidoAdmin).length);
      });
    }
    return observarConversaUsuario(usuario.uid, (conversa) => {
      setSuporteNaoLido(conversa?.naoLidoUsuario ? 1 : 0);
    });
  }, [usuario]);

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
        <button
          type="button"
          onClick={abrirAjuda}
          title="Manual passo a passo: comandos, botões e geradores automáticos"
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          ❓ Ajuda
        </button>
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
              onClick={abrirSuporte}
              title="Envie erros encontrados ou sugestões de melhoria -- versão Beta"
              className="relative rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              💬 Sugestões
              {suporteNaoLido > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-semibold text-white">
                  {suporteNaoLido}
                </span>
              )}
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
