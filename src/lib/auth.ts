/**
 * auth.ts
 * -----------------------------------------------------------------------
 * Autenticação do editor (Sprint 3: Nuvem, Gestão de Projetos e
 * Propriedades Avançadas). Uma única API assíncrona (`entrar`/
 * `cadastrar`/`sair`/`observarUsuario`) com duas implementações por trás,
 * no mesmo espírito de `lib/firebase.ts`:
 *
 *   - Firebase Auth (e-mail/senha) de verdade, quando `FIREBASE_CONFIGURADO`
 *     (mesmas variáveis NEXT_PUBLIC_FIREBASE_* já usadas pelo Firestore).
 *   - Um "Mock Service" local (localStorage) enquanto não houver
 *     credenciais reais -- não valida senha de fato (não há um "banco de
 *     usuários" pra consultar), só simula a sessão o suficiente para o
 *     Gerenciador de Projetos funcionar de ponta a ponta desde já, sem
 *     precisar configurar nada. O uid é derivado DETERMINISTICAMENTE do
 *     e-mail (mesmo e-mail -> sempre o mesmo uid), então "entrar" de novo
 *     com o mesmo e-mail recupera os mesmos projetos salvos antes.
 *
 * Como no resto do app: liga automaticamente pro Firebase de verdade
 * assim que `NEXT_PUBLIC_FIREBASE_*` forem preenchidos -- nenhuma outra
 * mudança de código é necessária.
 * -----------------------------------------------------------------------
 */

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as signOutFirebase,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import { FIREBASE_CONFIGURADO, obterApp } from "./firebase";

export interface Usuario {
  uid: string;
  email: string;
}

const MOCK_SESSION_KEY = "cad-unifilar:mock-auth-user";

let auth: Auth | undefined;
function getAuthInstance(): Auth {
  if (!auth) auth = getAuth(obterApp());
  return auth;
}

/** uid determinístico a partir do e-mail (mesmo e-mail -> sempre o mesmo uid) -- só usado no modo mock. */
function uidDeterministicoMock(email: string): string {
  const normalizado = email.trim().toLowerCase();
  const base64 =
    typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(normalizado))) : normalizado;
  return "mock-" + base64.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
}

function validarCredenciais(email: string, senha: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Digite um e-mail válido.";
  if (senha.length < 4) return "A senha precisa ter pelo menos 4 caracteres.";
  return null;
}

function mensagemErroFirebaseAuth(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? "";
  const mapa: Record<string, string> = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado -- tente entrar em vez de criar conta.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "Senha muito fraca (mínimo 6 caracteres).",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas -- aguarde um pouco antes de tentar de novo.",
    "auth/network-request-failed": "Falha de conexão -- verifique sua internet e tente de novo.",
  };
  if (mapa[codigo]) return mapa[codigo];
  // Iteração 34 (pedido do usuário): nenhuma tela pode mostrar de que
  // jeito o app foi construído/armazenado -- mensagens de erro não
  // mapeadas do SDK trazem o nome do provedor embutido (ex.: "Firebase:
  // Error (auth/...)"), então caem num texto genérico aqui em vez de
  // repassar a mensagem crua. O erro original ainda vai pro console do
  // navegador (`console.error`), só não aparece na tela.
  console.error("Erro de autenticação:", e);
  return "Não foi possível autenticar. Tente novamente.";
}

export async function cadastrar(
  email: string,
  senha: string
): Promise<{ ok: boolean; usuario?: Usuario; erro?: string }> {
  const erroValidacao = validarCredenciais(email, senha);
  if (erroValidacao) return { ok: false, erro: erroValidacao };

  if (!FIREBASE_CONFIGURADO) {
    const usuario: Usuario = { uid: uidDeterministicoMock(email), email: email.trim().toLowerCase() };
    window.localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(usuario));
    return { ok: true, usuario };
  }
  try {
    const cred = await createUserWithEmailAndPassword(getAuthInstance(), email.trim(), senha);
    return { ok: true, usuario: { uid: cred.user.uid, email: cred.user.email ?? email } };
  } catch (e) {
    return { ok: false, erro: mensagemErroFirebaseAuth(e) };
  }
}

export async function entrar(
  email: string,
  senha: string
): Promise<{ ok: boolean; usuario?: Usuario; erro?: string }> {
  const erroValidacao = validarCredenciais(email, senha);
  if (erroValidacao) return { ok: false, erro: erroValidacao };

  if (!FIREBASE_CONFIGURADO) {
    const usuario: Usuario = { uid: uidDeterministicoMock(email), email: email.trim().toLowerCase() };
    window.localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(usuario));
    return { ok: true, usuario };
  }
  try {
    const cred = await signInWithEmailAndPassword(getAuthInstance(), email.trim(), senha);
    return { ok: true, usuario: { uid: cred.user.uid, email: cred.user.email ?? email } };
  } catch (e) {
    return { ok: false, erro: mensagemErroFirebaseAuth(e) };
  }
}

export async function sair(): Promise<void> {
  if (!FIREBASE_CONFIGURADO) {
    window.localStorage.removeItem(MOCK_SESSION_KEY);
    return;
  }
  await signOutFirebase(getAuthInstance());
}

/**
 * Observa o usuário logado. No modo mock, chama `callback` UMA VEZ com o
 * que estiver salvo em localStorage (não há listener de verdade -- a
 * sessão só muda via `entrar`/`cadastrar`/`sair`, chamados direto pela
 * UI, que já atualiza o store na hora de qualquer forma). No modo
 * Firebase, usa `onAuthStateChanged` de verdade (dispara de novo em
 * qualquer mudança de sessão, inclusive vinda de outra aba). Devolve a
 * função de "unsubscribe" (chame no cleanup de um `useEffect`).
 */
export function observarUsuario(callback: (u: Usuario | null) => void): () => void {
  if (!FIREBASE_CONFIGURADO) {
    try {
      const raw = window.localStorage.getItem(MOCK_SESSION_KEY);
      callback(raw ? (JSON.parse(raw) as Usuario) : null);
    } catch {
      callback(null);
    }
    return () => {};
  }
  return onAuthStateChanged(getAuthInstance(), (user) => {
    callback(user ? { uid: user.uid, email: user.email ?? "" } : null);
  });
}
