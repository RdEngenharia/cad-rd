/**
 * firebase.ts
 * -----------------------------------------------------------------------
 * Camada de persistência do editor.
 *
 * Como usar com suas credenciais reais (plano Spark - gratuito):
 *   1) Crie um projeto em https://console.firebase.google.com
 *   2) Ative o Firestore (modo produção, região à sua escolha).
 *   3) Copie `.env.local.example` para `.env.local` e preencha as chaves
 *      NEXT_PUBLIC_FIREBASE_* com os dados do seu app web.
 *   4) Pronto -- `salvarProjeto`/`carregarProjeto` passam a gravar no
 *      Firestore de verdade automaticamente (nenhuma outra mudança de
 *      código é necessária).
 *
 * Enquanto as credenciais não existirem, o app funciona normalmente:
 * as funções abaixo detectam a ausência de config e caem para um mock
 * local (localStorage), então os botões "Salvar"/"Carregar" continuam
 * testáveis desde já.
 * -----------------------------------------------------------------------
 */

import { initializeApp, type FirebaseApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import type { Projeto, ProjetoResumo } from "./types";

// -----------------------------------------------------------------------
// Configuração (preencha via variáveis de ambiente NEXT_PUBLIC_FIREBASE_*)
// -----------------------------------------------------------------------
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** true assim que `NEXT_PUBLIC_FIREBASE_PROJECT_ID` estiver definido. */
export const FIREBASE_CONFIGURADO = Boolean(firebaseConfig.projectId);

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

/**
 * Instância única do FirebaseApp -- exportada para que `lib/auth.ts`
 * (Firebase Auth, Sprint 3) reaproveite o mesmo app em vez de chamar
 * `initializeApp` de novo (o SDK lança se o mesmo app "nomeado" for
 * inicializado duas vezes). Só é chamada de fato quando
 * `FIREBASE_CONFIGURADO` é true -- ver guarda em cada chamador.
 */
export function obterApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

function getDb(): Firestore {
  if (!FIREBASE_CONFIGURADO) {
    // Nunca deveria aparecer pro usuário final (todo chamador já checa
    // `FIREBASE_CONFIGURADO` antes) -- mensagem técnica só para quem está
    // configurando o ambiente, não para a UI.
    throw new Error("Armazenamento na nuvem não configurado (variáveis de ambiente ausentes).");
  }
  if (!db) {
    db = getFirestore(obterApp());
  }
  return db;
}

/**
 * Iteração 34 (pedido do usuário): nenhuma tela pode indicar como/onde o
 * projeto é armazenado. Erros crus do SDK de nuvem (ex.: "FirebaseError:
 * Missing or insufficient permissions") entregam esse tipo de informação
 * de graça, então em vez de repassar `String(e)` direto pra UI, este
 * helper loga o erro completo no console (pra eu conseguir depurar) e
 * devolve só uma mensagem genérica pro usuário.
 */
function mensagemErroGenerica(e: unknown, contexto: string): string {
  console.error(`Erro ao ${contexto}:`, e);
  return `Não foi possível ${contexto}. Tente novamente.`;
}

const COLECAO_PROJETOS = "projetos";
const LOCAL_STORAGE_PREFIX = "cad-unifilar:mock-projeto:";

/**
 * Salva o projeto (metadados de XRef + geometria) no Firestore.
 * Documento: /projetos/{id_projeto}
 *
 * OBS: nenhum binário (imagem/PDF) é enviado aqui -- `projeto.xrefs`
 * carrega apenas nome/posição/escala, nunca o `objectUrl` em runtime.
 */
/**
 * @param ownerUid Uid do usuário logado (mock ou Firebase Auth de
 * verdade -- ver `lib/auth.ts`), quando houver. Gravado no documento como
 * `owner_uid`, usado por `listarProjetosDoUsuario` para filtrar o
 * Gerenciador de Projetos (Sprint 3). Salvar sem usuário logado continua
 * funcionando exatamente como antes (fluxo por id manual na Toolbar) --
 * só não aparece na lista "Meus Projetos".
 */
export async function salvarProjeto(projeto: Projeto, ownerUid?: string | null): Promise<{
  ok: boolean;
  modo: "firestore" | "mock-local";
  erro?: string;
}> {
  // Nunca persistir o objectUrl (é um Blob URL válido só nesta sessão).
  const payload: Projeto = {
    ...projeto,
    xrefs: projeto.xrefs.map((x) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { objectUrl, ...resto } = x;
      return resto;
    }),
    ...(ownerUid ? { owner_uid: ownerUid } : {}),
  };

  if (!FIREBASE_CONFIGURADO) {
    try {
      window.localStorage.setItem(
        LOCAL_STORAGE_PREFIX + projeto.id_projeto,
        JSON.stringify({ ...payload, atualizado_em: Date.now() })
      );
      return { ok: true, modo: "mock-local" };
    } catch (e) {
      return { ok: false, modo: "mock-local", erro: mensagemErroGenerica(e, "salvar o projeto") };
    }
  }

  try {
    const ref = doc(getDb(), COLECAO_PROJETOS, projeto.id_projeto);
    await setDoc(ref, { ...payload, atualizado_em: serverTimestamp() });
    return { ok: true, modo: "firestore" };
  } catch (e) {
    return { ok: false, modo: "firestore", erro: mensagemErroGenerica(e, "salvar o projeto") };
  }
}

/** Carrega um projeto pelo id, do Firestore ou do mock local. */
export async function carregarProjeto(
  idProjeto: string
): Promise<{ ok: boolean; projeto?: Projeto; modo: "firestore" | "mock-local"; erro?: string }> {
  if (!FIREBASE_CONFIGURADO) {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + idProjeto);
      if (!raw) return { ok: false, modo: "mock-local", erro: "Projeto não encontrado." };
      return { ok: true, projeto: JSON.parse(raw) as Projeto, modo: "mock-local" };
    } catch (e) {
      return { ok: false, modo: "mock-local", erro: mensagemErroGenerica(e, "carregar o projeto") };
    }
  }

  try {
    const ref = doc(getDb(), COLECAO_PROJETOS, idProjeto);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { ok: false, modo: "firestore", erro: "Projeto não encontrado." };
    }
    return { ok: true, projeto: snap.data() as Projeto, modo: "firestore" };
  } catch (e) {
    return { ok: false, modo: "firestore", erro: mensagemErroGenerica(e, "carregar o projeto") };
  }
}

/** Lista os ids de todos os projetos salvos (Firestore) -- útil para um futuro seletor. */
export async function listarProjetos(): Promise<string[]> {
  if (!FIREBASE_CONFIGURADO) {
    return Object.keys(window.localStorage)
      .filter((k) => k.startsWith(LOCAL_STORAGE_PREFIX))
      .map((k) => k.replace(LOCAL_STORAGE_PREFIX, ""));
  }
  const snap = await getDocs(collection(getDb(), COLECAO_PROJETOS));
  return snap.docs.map((d) => d.id);
}

/**
 * Lista os projetos (resumo: id/nome/atualizado_em) de um usuário
 * específico -- o que alimenta o "Gerenciador de Projetos" (Sprint 3).
 * Filtra por `owner_uid` (gravado por `salvarProjeto`); ordena por mais
 * recente primeiro. A ordenação é feita no cliente (não via `orderBy` do
 * Firestore) de propósito -- um `where` + `orderBy` em campos diferentes
 * pode exigir a criação manual de um índice composto no Console, o que
 * quebraria a experiência de "funciona imediatamente" na primeira vez
 * que o usuário configura credenciais reais.
 */
export async function listarProjetosDoUsuario(ownerUid: string): Promise<ProjetoResumo[]> {
  if (!FIREBASE_CONFIGURADO) {
    const resumos: ProjetoResumo[] = [];
    for (const chave of Object.keys(window.localStorage)) {
      if (!chave.startsWith(LOCAL_STORAGE_PREFIX)) continue;
      try {
        const raw = window.localStorage.getItem(chave);
        if (!raw) continue;
        const p = JSON.parse(raw) as Projeto & { atualizado_em?: number };
        if (p.owner_uid !== ownerUid) continue;
        resumos.push({ id_projeto: p.id_projeto, nome: p.nome, atualizado_em: p.atualizado_em ?? 0 });
      } catch {
        // Entrada corrompida no localStorage -- ignora silenciosamente.
      }
    }
    return resumos.sort((a, b) => b.atualizado_em - a.atualizado_em);
  }

  const q = query(collection(getDb(), COLECAO_PROJETOS), where("owner_uid", "==", ownerUid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data() as Projeto & { atualizado_em?: { toMillis?: () => number } };
      const atualizado_em =
        data.atualizado_em && typeof data.atualizado_em.toMillis === "function"
          ? data.atualizado_em.toMillis()
          : 0;
      return { id_projeto: d.id, nome: data.nome, atualizado_em };
    })
    .sort((a, b) => b.atualizado_em - a.atualizado_em);
}

/** Renomeia um projeto salvo (Gerenciador de Projetos, Sprint 3) sem precisar recarregar a geometria inteira. */
export async function renomearProjeto(
  idProjeto: string,
  novoNome: string
): Promise<{ ok: boolean; erro?: string }> {
  if (!FIREBASE_CONFIGURADO) {
    try {
      const chave = LOCAL_STORAGE_PREFIX + idProjeto;
      const raw = window.localStorage.getItem(chave);
      if (!raw) return { ok: false, erro: "Projeto não encontrado." };
      const p = JSON.parse(raw) as Projeto & { atualizado_em?: number };
      p.nome = novoNome;
      p.atualizado_em = Date.now();
      window.localStorage.setItem(chave, JSON.stringify(p));
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: mensagemErroGenerica(e, "renomear o projeto") };
    }
  }
  try {
    await updateDoc(doc(getDb(), COLECAO_PROJETOS, idProjeto), { nome: novoNome, atualizado_em: serverTimestamp() });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErroGenerica(e, "renomear o projeto") };
  }
}

/** Exclui um projeto salvo (Gerenciador de Projetos, Sprint 3). Não afeta os XREFs locais (IndexedDB) de outros projetos. */
export async function excluirProjetoSalvo(idProjeto: string): Promise<{ ok: boolean; erro?: string }> {
  if (!FIREBASE_CONFIGURADO) {
    window.localStorage.removeItem(LOCAL_STORAGE_PREFIX + idProjeto);
    return { ok: true };
  }
  try {
    await deleteDoc(doc(getDb(), COLECAO_PROJETOS, idProjeto));
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErroGenerica(e, "excluir o projeto") };
  }
}
