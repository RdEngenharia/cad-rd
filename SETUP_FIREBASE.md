# Configurando o Firebase de verdade (plano Spark -- gratuito)

Hoje o app funciona com um "mock local" (localStorage) sempre que as
variáveis `NEXT_PUBLIC_FIREBASE_*` não estão preenchidas -- é por isso
que aparece o aviso amarelo "Firebase não configurado — usando mock
local" no topo da tela. Seguindo os passos abaixo, o app passa a usar
Firestore (salvar/carregar projetos na nuvem) e Firebase Auth (login por
e-mail/senha) de verdade, sem precisar mudar nenhum código.

## 1. Criar o projeto Firebase

1. Acesse https://console.firebase.google.com e entre com sua conta Google.
2. Clique em **"Adicionar projeto"** (ou "Criar um projeto").
3. Dê um nome (ex.: `cad-unifilar`) e clique em **Continuar**.
4. Na etapa do Google Analytics, pode **desativar** (não é necessário para
   este app) e clicar em **Criar projeto**.
5. Aguarde a criação e clique em **Continuar**.

## 2. Ativar o Firestore Database

1. No menu lateral esquerdo, vá em **Build > Firestore Database**.
2. Clique em **"Criar banco de dados"**.
3. Escolha o modo **produção** ("Iniciar no modo de produção").
4. Escolha a localização (ex.: `southamerica-east1` -- São Paulo, mais
   perto do Brasil). Essa escolha é definitiva, não dá pra mudar depois.
5. Clique em **Ativar**.

## 3. Aplicar as regras de segurança

1. Ainda em **Firestore Database**, clique na aba **Regras** (Rules).
2. Apague o conteúdo padrão e cole o conteúdo do arquivo
   [`firestore.rules`](./firestore.rules) deste projeto.
3. Clique em **Publicar**.

(Alternativa via linha de comando, se preferir: instale o
`firebase-tools` (`npm i -g firebase-tools`), rode `firebase login`,
`firebase init firestore` -- apontando pro `firestore.rules` já
existente -- e depois `firebase deploy --only firestore:rules` sempre
que quiser atualizar as regras.)

## 4. Ativar o login por e-mail/senha

1. No menu lateral, vá em **Build > Authentication**.
2. Clique em **"Vamos começar"** (Get started).
3. Na aba **Sign-in method**, clique em **E-mail/senha**.
4. Ative a primeira opção (E-mail/senha) e clique em **Salvar**.

## 5. Registrar o app Web e pegar as chaves

1. No menu lateral, clique no ícone de engrenagem ⚙️ ao lado de "Visão
   geral do projeto" e escolha **Configurações do projeto**.
2. Role até **"Seus apps"** e clique no ícone **Web** (`</>`).
3. Dê um apelido (ex.: `cad-unifilar-web`) -- **não** marque "Configurar
   também o Firebase Hosting" (não é necessário).
4. Clique em **Registrar app**.
5. A tela vai mostrar um bloco `firebaseConfig` parecido com:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "cad-unifilar-xxxxx.firebaseapp.com",
     projectId: "cad-unifilar-xxxxx",
     storageBucket: "cad-unifilar-xxxxx.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef1234567890",
   };
   ```
6. Copie esses 6 valores.

## 6. Preencher o `.env.local`

1. Copie o arquivo [`.env.local.example`](./.env.local.example) para
   `.env.local` (mesma pasta, raiz do projeto).
2. Preencha cada variável com o valor correspondente do `firebaseConfig`:

   | Variável em `.env.local`              | Campo no `firebaseConfig` |
   |----------------------------------------|----------------------------|
   | `NEXT_PUBLIC_FIREBASE_API_KEY`         | `apiKey`                   |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`     | `authDomain`               |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`      | `projectId`                |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`  | `storageBucket`            |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId`    |
   | `NEXT_PUBLIC_FIREBASE_APP_ID`          | `appId`                    |

3. Salve o arquivo. **Nunca** suba `.env.local` pro Git (já fica de fora
   por padrão nos projetos Next.js).
4. Reinicie o servidor (`Ctrl+C` e `npm run dev` de novo, ou
   `npm run build && npm start` em produção) -- variáveis
   `NEXT_PUBLIC_*` só são lidas na inicialização.

## 7. Conferir que funcionou

- O aviso amarelo "Firebase não configurado — usando mock local" deve
  sumir do topo da tela.
- Crie uma conta (e-mail/senha) pelo botão "Entrar" do app -- se aparecer
  no **Authentication > Users** do Firebase Console, está funcionando.
- Clique em **"Salvar no Firestore"** -- se o documento aparecer em
  **Firestore Database > Dados > projetos**, está funcionando.

---

Qualquer chave errada ou passo faltando, o app AVISA -- os erros do
Firebase Auth (senha fraca, e-mail já cadastrado etc.) aparecem
traduzidos na tela, e erros de Firestore aparecem no retorno de
`salvarProjeto`/`carregarProjeto` (ver `lib/firebase.ts`).
