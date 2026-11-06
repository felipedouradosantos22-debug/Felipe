# Plano — Saídas de Almoxarifado

## Escopo aprovado

Aplicativo Android simples para registrar saídas de almoxarifado e alimentar um sistema online já existente. A operação deve ler QR Code, permitir conferir e preencher o equipamento, registrar quantidade e solicitante, coletar assinatura na tela, revisar os dados e finalizar enviando a movimentação ao sistema online para atualizar o estoque simultaneamente.

A integração externa será feita por um endpoint seguro no servidor do projeto. O APK chama apenas o endpoint do próprio app; URL externa, token e regras de autenticação ficam no ambiente do servidor. O contrato final será ajustado quando forem fornecidos endereço/API, método, autenticação, payload e resposta do sistema existente.

O acesso ao fluxo de saída usa o Manus OAuth já presente no starter. A sessão é armazenada com SecureStore no Android e a API valida a sessão antes de aceitar uma saída. O servidor registra a identidade autenticada do operador; quando `INVENTORY_OPERATOR_OPEN_IDS` estiver preenchido, somente os IDs listados e administradores poderão registrar operações.

## Direção visual

### Alternativas consideradas

- **Painel técnico de almoxarifado** — 0,07: interface operacional clara, com blocos densos e sinalização de status.
- **Cartão de tarefa em campo** — 0,04: fluxo linear, controles grandes e foco em uso com uma mão.
- **Minimalismo institucional** — 0,08: superfícies neutras, hierarquia silenciosa e formulário compacto.

**Escolha:** Cartão de tarefa em campo.

### Design Movement

Minimalismo operacional para dispositivos usados em movimento: uma sequência vertical de tarefa, com cabeçalho curto, cartões com borda suave e uma ação primária sempre próxima do fim do formulário.

### Core Principles

1. **Uma operação por vez:** a tela conduz da identificação à confirmação sem exigir navegação entre telas.
2. **Leitura rápida:** labels curtos, números fortes e estados de sincronização visíveis.
3. **Tolerância de campo:** QR Code e preenchimento manual coexistem; o operador pode revisar antes de enviar.
4. **Confiança no envio:** a finalização só mostra sucesso quando o servidor confirma a sincronização.

### Color Philosophy

Azul petróleo como cor proprietária de ação e confiança operacional; fundo azul-neutro muito claro para separar a tarefa do ambiente; verde somente para confirmação; âmbar para pendências e vermelho para erro. O contraste deve permitir leitura em almoxarifado sem aparência de sistema financeiro.

### Layout Paradigm

Fluxo vertical de cartões assimétricos, com o cartão de QR Code abrindo a tarefa, uma faixa de status atravessando a largura e um rodapé de ação que acompanha a leitura do formulário. Evitar grade centralizada e excesso de navegação.

### Signature Elements

- Marca quadrada com QR estilizado e seta de saída.
- Pílula de status “Pronto para sincronizar” com ponto colorido.
- Numeração lateral 01–04 para transformar o formulário em uma sequência operacional.

### Interaction Philosophy

Cada toque deve produzir uma consequência evidente: abrir câmera, preencher, selecionar, limpar ou avançar. Campos obrigatórios mostram o problema perto do campo; o envio desabilita durante a sincronização; o erro preserva os dados para correção ou nova tentativa.

### Animation

Usar apenas transições curtas de opacidade/escala em cartões e feedback de toque. A câmera abre como modal de tarefa; a assinatura não tem animação decorativa. Estados de carregamento usam indicador discreto, nunca bloqueio sem texto.

### Typography System

Sistema sans nativo, com título de 28–30 px, títulos de cartão de 16–18 px, labels de 11–12 px em caixa alta e valores de 15–16 px. Números de quantidade e código usam peso forte/monoespaçado quando fizer sentido.

### Brand Essence

“Registrar a saída certa, no momento certo, sem papel.” Personalidade: direto, confiável, operacional.

### Brand Voice

- Títulos: “Registrar saída”, “Confira antes de enviar”.
- CTAs: “Ler QR Code”, “Finalizar saída”.
- Feedback: “Dados prontos para sincronizar” e “Não foi possível atualizar o estoque”.

### Wordmark & Logo

Ícone quadrado com três módulos de QR no canto e uma seta apontando para fora de uma caixa; o wordmark textual aparece somente no cabeçalho para preservar espaço no Android.

### Signature Brand Color

Azul petróleo `#0C5666`, usado em ações primárias e no marcador de etapa.

## Implementação

- `app/(tabs)/index.tsx`: tela única do fluxo de saída, com leitura QR, seleção/preenchimento, solicitante, assinatura, revisão e finalização.
- `components/signature-pad.tsx`: captura de traços da assinatura via gesto e SVG, serializada como pontos para o servidor.
- `lib/inventory-api.ts`: contrato tipado do envio pelo endpoint interno `/api/inventory/stock-out`.
- `server/_core/index.ts`: rota segura de proxy; valida dados, encaminha ao sistema externo quando `INVENTORY_API_URL` estiver configurado e retorna sucesso/erro explícitos.
- `app.config.ts` e `assets/images/*`: permissão de câmera e identidade nativa do app.
- `TODO.md`: critérios de entrega e pendências de integração.

## Dependências e limites

O starter Expo já possui React Native Web, NativeWind, SVG e servidor Express. A leitura de QR Code usa `expo-camera`; a assinatura usa SVG/gestos sem depender de serviço externo. O contrato real do sistema de estoque não foi informado, então o proxy não inventará campos adicionais: ele envia um payload estável e documentado, mas permanece em estado de configuração pendente até receber o contrato externo.

## Integração externa pendente

Para ativar a sincronização real, ainda será necessário informar: URL base e endpoint de saída; método HTTP; tipo de autenticação e credencial; campos obrigatórios e nomes exatos; formato da resposta; e se o sistema espera assinatura como imagem, base64 ou arquivo. Essas informações devem ser configuradas como segredos/variáveis do servidor, não no código do APK.

## Etapa atual — conexão de teste com Projeto Brasil

O usuário esclareceu em 05/11/2026 que não é administrador e autorizou usar sua própria conta para teste. O site confirmado é https://www.brazilhrproject.icu. A sessão consultada identifica perfil warehouse; Nova saída informa que envia para autorização sem movimentação nessa etapa. A consulta autenticada de /api/session/ e /api/bootstrap/?section=catalog respondeu HTTP 200. Nenhuma escrita de estoque foi autorizada ou realizada.

Adicionar ao app um painel de **Conexão de teste — somente consulta**. Cada operador autenticado pelo OAuth existente conecta sua própria conta do Projeto Brasil em formulário protegido no aplicativo, não pelo chat. O servidor faz GET /login/ para obter o CSRF e POST /api/login/ usando os campos observados no script público. Não copiar a sessão do navegador. Não guardar a senha em banco, arquivos, logs, armazenamento do celular ou variáveis de ambiente; a sessão externa fica somente na memória do servidor, vinculada ao openId autenticado, com expiração curta. Reiniciar o servidor exige reconexão.

As únicas operações externas desse módulo são login e GET de sessão/catalogo. O painel mostra nome, perfil, contagens de materiais/lotes/equipamentos, horário da consulta e a regra de autorização. CAPTCHA, bloqueio, sessão expirada, falta de acesso e indisponibilidade devem ser informados sem repetir login automaticamente nem contornar proteções. Não informar sucesso de conexão sem resposta real.

O modo atual bloqueia no servidor e na revisão do formulário qualquer registro de saída, autorização, comprovante ou baixa de estoque. QR e assinatura continuam disponíveis como preenchimento local. A integração produtiva e a conversão/vinculação da assinatura seguem pendentes; conexão de consulta não equivale à integração produtiva.

Estrutura adicional: `shared/site-connection.ts` define o contrato seguro do painel; `server/inventory/site-connection.ts` implementa o cliente externo restrito e as sessões individuais; `server/inventory/site-connection-routes.ts` protege as rotas internas; `lib/site-connection-api.ts` e `components/site-connection-panel.tsx` implementam o teste no app. Preservar stack, identidade e layout existentes.
