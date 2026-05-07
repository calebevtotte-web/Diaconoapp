# 📱 Guia de Geração de APK - Escala Diaconia

Este documento descreve o processo exato para transformar este projeto em um aplicativo Android (.apk) instalável.

## 1. Pré-Requisitos no seu Computador
Antes de começar, você precisa ter instalado na sua máquina pessoal:
1. **Node.js**: [baixar aqui](https://nodejs.org/)
2. **Android Studio**: [baixar aqui](https://developer.android.com/studio)
3. **Java SDK 17**: Necessário para as versões mais recentes do Android Gradle Plugin.

---

## 2. Preparação do Ambiente
Após baixar o código do projeto (via ZIP ou git clone), abra o terminal na pasta do projeto e execute:

```bash
# Instala as dependências do projeto
npm install

# Instala as dependências do Android (Caso ainda não estejam)
npm install @capacitor/android
```

---

## 3. Construção e Sincronismo
Agora vamos preparar os arquivos web para serem lidos pelo Android Studio:

```bash
# 1. Gera a pasta 'dist' com o código otimizado
npm run build

# 2. Sincroniza o código com a pasta nativa do Android
npx cap sync android
```

---

## 4. Gerando o arquivo APK no Android Studio

1. Abra o **Android Studio**.
2. Vá em **File > Open** e selecione a pasta chamada `android` que está dentro da raiz deste projeto.
3. Aguarde o Android Studio baixar as bibliotecas do Gradle (isso pode demorar uns minutos na primeira vez).
4. No menu superior, clique em:
   **Build > Build Bundle(s) / APK(s) > Build APK(s)**
5. Quando o processo terminar, um balão de notificação aparecerá no canto inferior direito. Clique em **"locate"** para abrir a pasta onde o arquivo `app-debug.apk` foi salvo.

---

## 5. Dicas Importantes (Boas Práticas)

- **Teste Físico:** Transfira o arquivo `.apk` para o seu celular via USB, Google Drive ou WhatsApp e instale-o para testar a performance.
- **Permissões:** Se o seu app precisar de internet, o Capacitor já configura isso por padrão no `AndroidManifest.xml`.
- **Ícones:** Para trocar o ícone do app, você deve usar a ferramenta **Image Asset** dentro do Android Studio (clique com botão direito na pasta `res` > New > Image Asset).

---

## 📝 Nota sobre o Arquivo Único
Embora tenhamos configurado o `vite-plugin-singlefile` para gerar um HTML único portátil, o Android Studio lerá os arquivos da pasta `dist`. Se você preferir apenas enviar o app para alguém sem que ela instale nada, envie o arquivo `dist/index.html` que ele abrirá direto no navegador do celular mantendo o layout de app.
