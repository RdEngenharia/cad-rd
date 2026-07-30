/**
 * suporte.ts
 * -----------------------------------------------------------------------
 * "Sugestões/Suporte" da versão Beta (Iteração 45 -- pedido do usuário:
 * "essa versao beta precisa de um botao de enviar sugestoes para
 * melhorias da ferramenta e possiveis erros, essa informacao deve vir com
 * o e-mail do usuario e deve ficar disponivel tipo uma comunidade, onde eu
 * veja todas as informacoes e somente eu consiga responder, os usuarios
 * só terao acesso a um tipo de chat e verá a minha resposta e a mensagem
 * que ele mandou, eu verei as mensagens de todos em uma mesma tela").
 *
 * Modelo de dados: 1 documento por usuário (`suporte/{uid}`), cada um uma
 * "conversa" com uma lista de mensagens (`de: "usuario" | "admin"`) --
 * mesmo espírito de um chat de suporte 1-a-1. O usuário comum só enxerga
 * (e só pode ESCREVER) a própria conversa; o admin (identificado só pelo
 * e-mail, `EMAIL_ADMIN`) enxerga e responde TODAS -- ver
 * `SuporteAdminPanel.tsx` vs `SuporteChatUsuario.tsx`.
 *
 * Como no resto do app (`lib/firebase.ts`/`lib/auth.ts`): usa Firestore de
 * verdade quando `FIREBASE_CONFIGURADO`, com um fallback local
 * (localStorage) enquanto não houver credenciais reais -- nesse modo mock
 * NÃO existe listener de verdade (só 1 leitura na hora de abrir, mesmo
 * limite já documentado em `auth.ts#observarUsuario`), e a visão "todas as
 * conversas" do admin só enxerga o que está gravado NESTE navegador (mock
 * é por dispositivo, não sincroniza entre usuários de verdade -- pra isso
 * de fato funcionar como "comunidade", precisa do Firebase configurado).
 *
 * Segurança: a regra que só o admin pode enviar mensagem com `de: "admin"`
 * é reforçada tanto aqui (funções separadas -- só `SuporteAdminPanel.tsx`
 * chama `enviarRespostaAdmin`) quanto no `firestore.rules` (a fonte de
 * verdade real, já que qualquer checagem só no cliente pode ser
 * contornada por alguém mexendo no console do navegador).
 * -----------------------------------------------------------------------
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { FIREBASE_CONFIGURADO, getDb } from "./firebase";

/** E-mail do único administrador da versão Beta -- comparação sempre em minúsculas. */
export const EMAIL_ADMIN = "rodrigues.solar@hotmail.com";

export function ehAdmin(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === EMAIL_ADMIN;
}

export interface MensagemSuporte {
  id: string;
  de: "usuario" | "admin";
  texto: string;
  /** Epoch ms gravado no CLIENTE -- `serverTimestamp()` não é suportado dentro de elementos de array no Firestore, só em campos de nível superior (ver `atualizado_em`). */
  criado_em: number;
}

export interface ConversaSuporte {
  uid: string;
  email: string;
  mensagens: MensagemSuporte[];
  /** epoch ms (convertido de `Timestamp` no modo Firestore; já é número cru no modo mock). */
  atualizado_em: number;
  /** true quando há resposta do admin ainda não vista pelo usuário. */
  naoLidoUsuario: boolean;
  /** true quando há mensagem do usuário ainda não vista pelo admin. */
  naoLidoAdmin: boolean;
}

const COLECAO_SUPORTE = "suporte";
const LOCAL_STORAGE_PREFIX = "cad-unifilar:mock-suporte:";

function chaveLocal(uid: string): string {
  return LOCAL_STORAGE_PREFIX + uid;
}

function lerConversaLocal(uid: string): ConversaSuporte | null {
  try {
    const raw = window.localStorage.getItem(chaveLocal(uid));
    return raw ? (JSON.parse(raw) as ConversaSuporte) : null;
  } catch {
    return null;
  }
}

function gravarConversaLocal(conversa: ConversaSuporte): void {
  try {
    window.localStorage.setItem(chaveLocal(conversa.uid), JSON.stringify(conversa));
  } catch {
    // Falha silenciosa (quota/indisponível) -- mesmo espírito de salvarTemaCanvas.
  }
}

// Iteração 45 -- limite simples contra spam (melhoria sugerida e aceita
// pelo usuário: "quero avisos fáceis e limpos, foque na experiência do
// usuário"). Como o link do Beta vai circular em grupos abertos, alguém
// (de propósito ou sem querer, ex.: segurando Enter) poderia mandar
// dezenas de mensagens seguidas e lotar o painel do admin. O limite é só
// do lado do CLIENTE -- é o suficiente pra evitar o caso comum (alguém
// mandando mensagem repetida sem querer), mas não é uma barreira de
// segurança de verdade: alguém decidido a abusar do sistema mexendo no
// console do navegador ainda consegue burlar isso (uma proteção real
// exigiria Cloud Functions contando no servidor, fora do escopo agora --
// mesmo tipo de limite já documentado noutros pontos do app, ex.:
// `firestore.rules`). O aviso mostrado é curto e educado, sem jargão.
const LIMITE_MENSAGENS_POR_HORA = 5;
const UMA_HORA_MS = 60 * 60 * 1000;

function excedeuLimiteDeEnvio(mensagens: MensagemSuporte[]): boolean {
  const agora = Date.now();
  const recentes = mensagens.filter((m) => m.de === "usuario" && agora - m.criado_em < UMA_HORA_MS);
  return recentes.length >= LIMITE_MENSAGENS_POR_HORA;
}

/** Envia uma mensagem do USUÁRIO (cria a conversa se for a 1ª vez). */
export async function enviarMensagemUsuario(uid: string, email: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: "Mensagem vazia." };
  const nova: MensagemSuporte = { id: uuidv4(), de: "usuario", texto: limpo, criado_em: Date.now() };

  if (!FIREBASE_CONFIGURADO) {
    const atual = lerConversaLocal(uid);
    if (atual && excedeuLimiteDeEnvio(atual.mensagens)) {
      return { ok: false, erro: "Você atingiu o limite de mensagens por hora. Tente novamente mais tarde." };
    }
    const conversa: ConversaSuporte = atual
      ? { ...atual, mensagens: [...atual.mensagens, nova], atualizado_em: Date.now(), naoLidoAdmin: true }
      : { uid, email, mensagens: [nova], atualizado_em: Date.now(), naoLidoUsuario: false, naoLidoAdmin: true };
    gravarConversaLocal(conversa);
    return { ok: true };
  }

  try {
    const ref = doc(getDb(), COLECAO_SUPORTE, uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existente = snap.data() as ConversaSuporte;
      if (excedeuLimiteDeEnvio(existente.mensagens ?? [])) {
        return { ok: false, erro: "Você atingiu o limite de mensagens por hora. Tente novamente mais tarde." };
      }
      await updateDoc(ref, { mensagens: arrayUnion(nova), atualizado_em: serverTimestamp(), naoLidoAdmin: true, email });
    } else {
      await setDoc(ref, {
        uid,
        email,
        mensagens: [nova],
        atualizado_em: serverTimestamp(),
        naoLidoUsuario: false,
        naoLidoAdmin: true,
      });
    }
    return { ok: true };
  } catch (e) {
    console.error("Erro ao enviar mensagem de suporte:", e);
    return { ok: false, erro: "Não foi possível enviar sua mensagem. Tente novamente." };
  }
}

/** Envia uma resposta do ADMIN a uma conversa já existente. Só chamado por `SuporteAdminPanel.tsx`. */
export async function enviarRespostaAdmin(uid: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: "Mensagem vazia." };
  const nova: MensagemSuporte = { id: uuidv4(), de: "admin", texto: limpo, criado_em: Date.now() };

  if (!FIREBASE_CONFIGURADO) {
    const atual = lerConversaLocal(uid);
    if (!atual) return { ok: false, erro: "Conversa não encontrada." };
    gravarConversaLocal({ ...atual, mensagens: [...atual.mensagens, nova], atualizado_em: Date.now(), naoLidoUsuario: true, naoLidoAdmin: false });
    return { ok: true };
  }

  try {
    const ref = doc(getDb(), COLECAO_SUPORTE, uid);
    await updateDoc(ref, { mensagens: arrayUnion(nova), atualizado_em: serverTimestamp(), naoLidoUsuario: true, naoLidoAdmin: false });
    return { ok: true };
  } catch (e) {
    console.error("Erro ao enviar resposta de suporte:", e);
    return { ok: false, erro: "Não foi possível enviar a resposta. Tente novamente." };
  }
}

/** Observa a conversa de UM usuário (usada pelo próprio usuário, e pelo admin ao abrir uma conversa específica). */
export function observarConversaUsuario(uid: string, callback: (c: ConversaSuporte | null) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURADO) {
    callback(lerConversaLocal(uid));
    return () => {};
  }
  const ref = doc(getDb(), COLECAO_SUPORTE, uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data() as Omit<ConversaSuporte, "atualizado_em"> & { atualizado_em?: { toMillis?: () => number } };
    callback({
      ...data,
      atualizado_em: data.atualizado_em && typeof data.atualizado_em.toMillis === "function" ? data.atualizado_em.toMillis() : 0,
    } as ConversaSuporte);
  });
}

/** Observa TODAS as conversas (visão do admin -- `SuporteAdminPanel.tsx`), ordenadas pela mais recente primeiro. */
export function observarTodasConversas(callback: (conversas: ConversaSuporte[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURADO) {
    // Iteração 45: no modo mock só enxerga o que está salvo NESTE
    // navegador -- ver comentário de topo do arquivo. Não há listener de
    // verdade, só uma leitura na hora de abrir.
    const conversas: ConversaSuporte[] = [];
    for (const chave of Object.keys(window.localStorage)) {
      if (!chave.startsWith(LOCAL_STORAGE_PREFIX)) continue;
      try {
        const raw = window.localStorage.getItem(chave);
        if (!raw) continue;
        conversas.push(JSON.parse(raw) as ConversaSuporte);
      } catch {
        // Entrada corrompida -- ignora.
      }
    }
    callback(conversas.sort((a, b) => b.atualizado_em - a.atualizado_em));
    return () => {};
  }

  return onSnapshot(collection(getDb(), COLECAO_SUPORTE), (snap) => {
    const conversas = snap.docs.map((d) => {
      const data = d.data() as Omit<ConversaSuporte, "atualizado_em"> & { atualizado_em?: { toMillis?: () => number } };
      return {
        ...data,
        atualizado_em: data.atualizado_em && typeof data.atualizado_em.toMillis === "function" ? data.atualizado_em.toMillis() : 0,
      } as ConversaSuporte;
    });
    callback(conversas.sort((a, b) => b.atualizado_em - a.atualizado_em));
  });
}

/** Marca a conversa como lida PELO USUÁRIO (chamado ao abrir o chat). */
export async function marcarConversaLidaUsuario(uid: string): Promise<void> {
  if (!FIREBASE_CONFIGURADO) {
    const atual = lerConversaLocal(uid);
    if (atual && atual.naoLidoUsuario) gravarConversaLocal({ ...atual, naoLidoUsuario: false });
    return;
  }
  try {
    await updateDoc(doc(getDb(), COLECAO_SUPORTE, uid), { naoLidoUsuario: false });
  } catch {
    // Falha silenciosa -- só afeta a bolinha de notificação, não é crítico.
  }
}

/** Marca a conversa como lida PELO ADMIN (chamado ao abrir uma conversa específica no painel). */
export async function marcarConversaLidaAdmin(uid: string): Promise<void> {
  if (!FIREBASE_CONFIGURADO) {
    const atual = lerConversaLocal(uid);
    if (atual && atual.naoLidoAdmin) gravarConversaLocal({ ...atual, naoLidoAdmin: false });
    return;
  }
  try {
    await updateDoc(doc(getDb(), COLECAO_SUPORTE, uid), { naoLidoAdmin: false });
  } catch {
    // Falha silenciosa -- só afeta a bolinha de notificação, não é crítico.
  }
}
