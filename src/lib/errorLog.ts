/**
 * errorLog.ts
 * -----------------------------------------------------------------------
 * Monitoramento de erros (Iteração 45 -- melhoria sugerida e aceita pelo
 * usuário: "durante o Beta, seria bom saber quando algo quebra pros
 * usuários, sem precisar que cada um mande mensagem manualmente"). Em vez
 * de criar conta num serviço externo tipo Sentry (que exigiria configurar
 * mais uma credencial nova, fora do que já está pronto), reaproveita a
 * MESMA infraestrutura já configurada (Firestore, ou o fallback mock
 * local) -- mesmo espírito de `lib/suporte.ts`.
 *
 * Um erro reportado aqui é DIFERENTE de uma mensagem de "💬 Sugestões":
 * aquele é escrito manualmente pelo usuário; este é capturado
 * AUTOMATICAMENTE pelo app (`window.onerror`/`unhandledrejection`, ver o
 * listener montado em `Editor.tsx`) sempre que algo quebra de verdade --
 * o usuário nem precisa perceber ou reportar nada.
 *
 * Modelo de dados: coleção `erros_reportados`, 1 documento por ocorrência
 * (bem diferente de `suporte/{uid}`, que é 1 documento por USUÁRIO com uma
 * lista de mensagens -- aqui não faz sentido agrupar por usuário, e o
 * volume esperado é maior). Só o admin lê (ver `firestore.rules`); calquer
 * usuário autenticado pode CRIAR (reportar um erro que aconteceu com ele),
 * ninguém pode editar/apagar.
 * -----------------------------------------------------------------------
 */

import { addDoc, collection, onSnapshot, orderBy, query, limit, type Unsubscribe } from "firebase/firestore";
import { FIREBASE_CONFIGURADO, getDb } from "./firebase";

export interface ErroReportado {
  /** id do documento no Firestore, ou um uuid local no modo mock. */
  id: string;
  mensagem: string;
  /** Stack trace (quando disponível) -- só os primeiros ~2000 caracteres são guardados, ver `reportarErro`. */
  stack?: string;
  /** Caminho da página onde o erro aconteceu (ex.: "/", "/privacidade"). */
  url: string;
  /** E-mail da conta logada no momento do erro, ou `null` se deslogado. */
  usuarioEmail: string | null;
  /** epoch ms (convertido de `Timestamp` no modo Firestore; já é número cru no modo mock). */
  criado_em: number;
}

const COLECAO_ERROS = "erros_reportados";
const LOCAL_STORAGE_KEY = "cad-unifilar:mock-erros";
const MAX_ERROS_MOCK = 200; // evita o localStorage crescer sem limite numa sessão de testes longa

function lerErrosLocal(): ErroReportado[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ErroReportado[]) : [];
  } catch {
    return [];
  }
}

function gravarErrosLocal(lista: ErroReportado[]): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lista.slice(-MAX_ERROS_MOCK)));
  } catch {
    // Falha silenciosa (quota/indisponível) -- monitoramento de erro nunca
    // pode ele mesmo quebrar o app.
  }
}

/**
 * Reporta um erro capturado automaticamente. NUNCA lança -- é chamado de
 * dentro de um handler global de erro (`window.onerror`/
 * `unhandledrejection`); se esta função falhasse também, o app tentaria
 * reportar o próprio erro de report, criando ruído (ou, na pior hipótese,
 * um loop). Por isso todo o corpo roda dentro de um `try/catch` mudo.
 */
export async function reportarErro(entrada: {
  mensagem: string;
  stack?: string;
  usuarioEmail?: string | null;
}): Promise<void> {
  try {
    const erro: ErroReportado = {
      id: crypto.randomUUID(),
      mensagem: entrada.mensagem.slice(0, 500),
      stack: entrada.stack?.slice(0, 2000),
      url: typeof window !== "undefined" ? window.location.pathname : "",
      usuarioEmail: entrada.usuarioEmail ?? null,
      criado_em: Date.now(),
    };

    if (!FIREBASE_CONFIGURADO) {
      gravarErrosLocal([...lerErrosLocal(), erro]);
      return;
    }

    // `addDoc` (id automático) em vez de `setDoc` com uid -- aqui não há
    // "1 documento por usuário" nenhum, cada ocorrência é seu próprio
    // documento (ver comentário de topo do arquivo).
    await addDoc(collection(getDb(), COLECAO_ERROS), {
      mensagem: erro.mensagem,
      stack: erro.stack ?? null,
      url: erro.url,
      usuarioEmail: erro.usuarioEmail,
      criado_em: erro.criado_em,
    });
  } catch (e) {
    // Falha silenciosa de propósito -- ver doc da função acima.
    console.error("Falha ao reportar erro (não crítico):", e);
  }
}

/** Observa os erros mais recentes (visão do admin) -- só usado por `ErrosAdminPanel.tsx`. */
export function observarErrosRecentes(callback: (erros: ErroReportado[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURADO) {
    // Mesmo limite do resto do app em modo mock: só enxerga o que está
    // gravado NESTE navegador, não é uma visão de verdade de "todos os
    // usuários" (isso exige o Firebase configurado).
    callback([...lerErrosLocal()].sort((a, b) => b.criado_em - a.criado_em));
    return () => {};
  }

  const q = query(collection(getDb(), COLECAO_ERROS), orderBy("criado_em", "desc"), limit(100));
  return onSnapshot(q, (snap) => {
    const erros = snap.docs.map((d) => {
      const data = d.data() as Omit<ErroReportado, "id">;
      return { id: d.id, ...data } as ErroReportado;
    });
    callback(erros);
  });
}
