"use client";

import { useEffect } from "react";
import { useCadStore } from "./store";
import { reportarErro } from "./errorLog";

/**
 * useCapturarErros
 * -----------------------------------------------------------------------
 * Iteração 45 -- melhoria de monitoramento de erros: captura AUTOMATICAMENTE
 * qualquer erro de JavaScript não tratado (`window.onerror`, via o evento
 * `error`) ou Promise rejeitada sem `.catch` (`unhandledrejection`) e manda
 * pro `lib/errorLog.ts#reportarErro`, junto com o e-mail da conta logada
 * (se houver) -- assim dá pra saber que algo quebrou pra um usuário real
 * sem depender dele mandar mensagem manual pelo "💬 Sugestões".
 *
 * Montado 1x em `Editor.tsx` (mesmo padrão de `useHydrateXrefs`/
 * `useAutoSalvar`). Lê o usuário via `useCadStore.getState()` direto (não
 * um seletor reativo) porque o listener só roda quando um erro de verdade
 * acontece -- não precisa re-registrar o listener a cada troca de sessão.
 * -----------------------------------------------------------------------
 */
export function useCapturarErros(): void {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      const usuario = useCadStore.getState().usuario;
      void reportarErro({
        mensagem: event.message || "Erro desconhecido (window.onerror)",
        stack: event.error?.stack,
        usuarioEmail: usuario?.email ?? null,
      });
    }

    function onRejeicaoNaoTratada(event: PromiseRejectionEvent) {
      const usuario = useCadStore.getState().usuario;
      const motivo: unknown = event.reason;
      const mensagem =
        typeof motivo === "string"
          ? motivo
          : motivo instanceof Error
            ? motivo.message
            : "Promise rejeitada sem mensagem (unhandledrejection)";
      const stack = motivo instanceof Error ? motivo.stack : undefined;
      void reportarErro({ mensagem, stack, usuarioEmail: usuario?.email ?? null });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejeicaoNaoTratada);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejeicaoNaoTratada);
    };
  }, []);
}
