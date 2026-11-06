# TODO — Saídas de Almoxarifado

## Implementar o fluxo operacional de saída

- O aplicativo deve ser Android simples, em uma tela de operação por vez.
- Deve conduzir o operador por identificação, conferência, dados do solicitante, assinatura e revisão.
- Deve manter os dados preenchidos quando ocorrer erro de sincronização.

## Ler QR Code e preencher o equipamento

- O aplicativo deve ler QR Code pela câmera para identificar o item ou equipamento da saída.
- Deve existir alternativa de preenchimento manual quando a leitura não estiver disponível.
- Deve permitir selecionar e preencher o equipamento e conferir os dados antes do envio.

## Registrar quantidade e solicitante

- Deve registrar a quantidade retirada com validação de campos obrigatórios.
- Deve coletar os dados de identificação do solicitante, incluindo nome e setor/matrícula.

## Coletar assinatura na tela

- Deve capturar a assinatura do solicitante diretamente na tela do dispositivo Android.
- Deve permitir limpar e refazer a assinatura antes da confirmação.

## Revisar e finalizar a saída

- Deve apresentar revisão dos dados completos da saída antes da finalização.
- O botão de finalização deve impedir envio enquanto existirem campos obrigatórios vazios.
- Deve bloquear duplo envio enquanto a sincronização estiver em andamento.

## Sincronizar com o sistema online e atualizar estoque

- Ao finalizar uma saída, o aplicativo deve enviar os dados simultaneamente para atualizar o estoque no sistema online existente.
- O envio deve ocorrer por um endpoint seguro do servidor, sem expor token da integração no APK.
- Deve exibir confirmação clara de sincronização bem-sucedida quando o sistema externo confirmar a operação.
- Deve exibir mensagem clara de erro quando o envio não for concluído e preservar o formulário para nova tentativa.
- Permanece pendente configurar URL/API, autenticação, formato de dados e resposta do sistema online existente.

## Autenticar operadores e auditar a saída

- [concluído] O aplicativo deve exigir login antes de permitir acesso à tela de registro de saída.
- [concluído] O login usa a autenticação OAuth existente no projeto, com armazenamento seguro da sessão no Android.
- [concluído] A API deve rejeitar saídas sem sessão autenticada com resposta HTTP 401.
- [concluído] A API deve rejeitar usuários fora da lista `INVENTORY_OPERATOR_OPEN_IDS` com resposta HTTP 403; administradores permanecem autorizados.
- [concluído] A identidade do operador deve ser obtida no servidor e anexada à saída, sem aceitar o nome do operador enviado pelo celular como fonte de verdade.
- [concluído] O cabeçalho deve mostrar o operador autenticado e disponibilizar logout.

## Preparar APK e identidade nativa

- Deve preservar os identificadores Expo/Android do projeto.
- Deve incluir ícone quadrado próprio e permissão de câmera.
- Deve ficar pronto para build Android pelo fluxo de build do projeto; nenhum APK é considerado entregue antes de um build real confirmado.

## Conectar conta individual ao Projeto Brasil para teste — somente consulta

- [ ] [Implementado; teste manual no app pendente] O usuário comum pode conectar a própria conta do site no aplicativo, preservando o login OAuth do app e sem solicitar acesso administrativo.
- [x] O aplicativo deve identificar explicitamente o endereço do Projeto Brasil, proteger o campo de senha e não persistir a senha em dispositivo, banco, arquivos ou logs.
- [x] A sessão externa deve ser isolada por operador autenticado, permanecer somente na memória do servidor e expirar; reconexão é necessária após reinício ou expiração.
- [ ] [Implementado; login real no app pendente] O teste deve consultar a sessão e o catálogo reais e mostrar nome/perfil, contagens de materiais, lotes e equipamentos e horário da consulta, sem exibir cookies, CSRF ou respostas de login.
- [x] CAPTCHA, bloqueio, sessão expirada, acesso negado e indisponibilidade devem gerar mensagem clara, sem tentativas automáticas repetidas nem contorno de autorização.
- [x] Todas as rotas de conexão devem exigir sessão válida do app e autorização de operador. Desconectar deve descartar a sessão do operador sem afetar colegas.

## Garantir modo de teste sem movimentação de estoque

- [x] A tela e a revisão devem informar que o teste é somente consulta e que não registram saídas nem atualizam estoque.
- [x] QR Code e assinatura devem continuar disponíveis para preenchimento local, sem transmitir assinatura ao site durante o teste.
- [x] O endpoint de saída deve recusar movimentações no modo de teste; não criar solicitações, documentos, aprovações nem comprovantes no sistema de produção.
- [x] Explicar que o perfil warehouse do usuário segue o fluxo de autorização do site. A integração produtiva continua pendente e não deve ser apresentada como concluída.

### Evidências da etapa de teste

As consultas autorizadas no navegador ao perfil e catálogo reais responderam HTTP 200 sem alterações de estoque. O cliente/rotas de consulta têm 19 testes Vitest focados aprovados, incluindo isolamento, expiração, desconexão durante operações em andamento, timeout do corpo, bloqueios, revogação de acesso e HTTP 401/403/409. TypeScript, lint, build do servidor e exportação Expo Web passaram. O login feito pelo próprio app com credenciais reais permanece pendente de execução pelo usuário; câmera e assinatura no Android também exigem teste em dispositivo. Nenhum APK foi compilado nesta etapa.
