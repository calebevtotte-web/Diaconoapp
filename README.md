# Escala Diaconia

Sistema de gestão de escalas para ministérios e diaconia com sorteio inteligente e integração com WhatsApp.

## 🚀 Funcionalidades

- **Gestão de Membros:** Perfil completo com estatísticas de participação mensal.
- **Sorteio Inteligente:** Algoritmo que prioriza membros disponíveis e balanceia as escalas.
- **Trocas Rápidas:** Sistema de substituição de membros com histórico de trocas.
- **Relatórios WhatsApp:** Geração de texto formatado para envio direto aos grupos.
- **Estatísticas:** Visão clara de quem está servindo mais ou menos.
- **PWA (Progressive Web App):** Instale o aplicativo diretamente pelo navegador no seu celular.

## 🛠️ Como rodar o projeto

Este projeto foi construído com **React + Vite + Tailwind CSS**.

### Instalação

```bash
npm install
```

### Execução em Desenvolvimento

```bash
npm run dev
```

### Build para Produção

```bash
npm run build
```

## 📦 Arquivo Único (Portátil)

O projeto agora está configurado para gerar um **único arquivo HTML** que contém todo o CSS e JavaScript necessários. 

1. Execute `npm run build`.
2. O arquivo gerado em `dist/index.html` é tudo o que você precisa.
3. Você pode enviar este arquivo por e-mail ou WhatsApp, e ele abrirá perfeitamente em qualquer navegador, mesmo sem internet (offline), mantendo todo o layout e funcionalidades.

## 📱 Como Gerar o APK (Android)

Este projeto já está configurado com **Capacitor**. Para gerar o seu arquivo APK, siga estes passos no seu computador pessoal:

1. **Pré-requisitos:**
   - Instale o [Android Studio](https://developer.android.com/studio).
   - Baixe o código do projeto para sua máquina.

2. **Prepare o projeto:**
   ```bash
   npm install
   npm run mobile:sync
   ```

3. **Abra no Android Studio:**
   ```bash
   npm run mobile:open
   ```

4. **Gere o APK:**
   - No Android Studio, vá em **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
   - O Android Studio irá compilar e te dará um link para a pasta onde o arquivo `.apk` foi gerado.

## 📝 Notas sobre a Exportação

Se você exportou este código para o GitHub através do Google AI Studio e não consegue abrir o link gerado:
1. Verifique se o repositório é **Público** ou **Privado**. Link privados exigem login.
2. Certifique-se de que o GitHub terminou de processar a criação do repositório.
3. Este repositório contém o **código fonte**. Para visualizar o app rodando (GitHub Pages), você precisará configurar o build no Actions ou fazer o deploy em um serviço como Vercel ou Netlify.
