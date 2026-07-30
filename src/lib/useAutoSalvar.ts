"use client";

import { useEffect, useRef, useState } from "react";
import { useCadStore } from "./store";
import { salvarProjeto } from "./firebase";

const INTERVALO_AUTOSAVE_MS = 2 * 60 * 1000; // 2 minutos

/**
 * useAutoSalvar
 * -----------------------------------------------------------------------
 * Iteração 45 -- melhoria sugerida e aceita pelo usuário: "com login
 * virando obrigatório pra tudo, faz sentido salvar automaticamente de
 * tempos em tempos (pra não perder trabalho se o navegador fechar/cair) e
 * avisar se tentar sair da página com alterações não salvas".
 *
 * Duas responsabilidades, ambas comparando o `projeto` atual contra
 * `ultimoSnapshotSalvo` (ver `store.ts`) pra saber se há algo "sujo":
 *
 *   1) A cada `INTERVALO_AUTOSAVE_MS`, se houver usuário logado E o
 *      projeto estiver sujo, salva na nuvem/mock local (mesma função
 *      `salvarProjeto` do salvamento manual) e atualiza o snapshot.
 *      Sem usuário logado não salva nada -- não há onde salvar (mesmo
 *      comportamento do botão manual "💾 Salvar projeto atual", que
 *      também exige login desde que ele virou obrigatório).
 *   2) Registra um listener de `beforeunload`: se sujo, mostra o aviso
 *      nativo do navegador ("Alterações não salvas -- sair mesmo assim?").
 *      Os navegadores modernos não exibem mais a MENSAGEM customizada
 *      (`e.returnValue = '...'), só o texto genérico deles -- mas o
 *      `preventDefault()`/`returnValue` ainda são o jeito padrão de ativar
 *      esse aviso.
 *
 * Lê o estado via `useCadStore.getState()` direto dentro do `setInterval`
 * (em vez de um seletor reativo) de propósito -- comparar
 * `JSON.stringify(projeto)` a cada render seria caro; aqui só roda a cada
 * 2 minutos e sob demanda no evento de saída.
 *
 * Devolve `ultimoAutoSalvamento` (epoch ms do último autosave bem-sucedido,
 * ou `null` se ainda não rodou nesta sessão) -- usado pelo indicador visual
 * na Toolbar ("💾 Salvo automaticamente às HH:MM").
 * -----------------------------------------------------------------------
 */
export function useAutoSalvar(): number | null {
  const [ultimoAutoSalvamento, setUltimoAutoSalvamento] = useState<number | null>(null);
  // Evita duas rodadas de autosave sobrepostas caso `salvarProjeto` demore
  // mais que o próprio intervalo (rede lenta) -- não é o cenário comum,
  // mas evita corrida de duas gravações concorrentes do mesmo projeto.
  const salvandoRef = useRef(false);

  useEffect(() => {
    function estaSujo(): boolean {
      const { projeto, ultimoSnapshotSalvo } = useCadStore.getState();
      return JSON.stringify(projeto) !== ultimoSnapshotSalvo;
    }

    const intervalId = setInterval(async () => {
      if (salvandoRef.current) return;
      const { usuario, projeto, marcarProjetoComoSalvo } = useCadStore.getState();
      if (!usuario) return; // sem conta, sem onde salvar -- mesma regra do botão manual
      if (!estaSujo()) return;

      salvandoRef.current = true;
      try {
        const r = await salvarProjeto(projeto, usuario.uid);
        if (r.ok) {
          marcarProjetoComoSalvo();
          setUltimoAutoSalvamento(epochAgora());
        }
        // Falha silenciosa (sem `erro` na tela) -- é um autosave em
        // segundo plano, não uma ação que o usuário pediu agora; o
        // próximo ciclo tenta de novo, e o botão manual continua
        // disponível a qualquer momento como alternativa confiável.
      } finally {
        salvandoRef.current = false;
      }
    }, INTERVALO_AUTOSAVE_MS);

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!estaSujo()) return;
      e.preventDefault();
      // Alguns navegadores mais antigos ainda usam o valor de retorno pra
      // decidir se mostram o aviso -- mantido por compatibilidade, mesmo
      // que os navegadores atuais ignorem o texto customizado.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return ultimoAutoSalvamento;
}

// `Date.now()` isolado numa função só pra deixar claro, no call site acima,
// que é o horário real do autosave (não tem relação com o padrão de scripts
// de Workflow do resto do projeto, que não se aplica aqui -- isto é código
// de app de verdade, rodando no navegador do usuário).
function epochAgora(): number {
  return Date.now();
}
