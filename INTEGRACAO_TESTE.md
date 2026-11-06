# CREC Almoxarifado — conexão de teste

Esta versão foi preparada para usar sua conta comum do Projeto Brasil em **somente consulta**. Não exige conta de administrador e não altera permissões. O sistema externo é https://www.brazilhrproject.icu.

## Como testar no aplicativo

Abra a Prévia do projeto ou a versão mobile de teste disponibilizada pelo painel. Entre primeiro no CREC Almoxarifado com o login já existente do aplicativo. No painel **Conexão de teste**, escolha **Conectar e testar** e informe o usuário e a senha que você normalmente usa no Projeto Brasil. A senha deve ser digitada somente nesse formulário; nunca enviada pelo chat.

O teste faz login e consulta sua sessão e o catálogo do site. Se essas consultas forem bem-sucedidas, o painel apresenta o nome da conta, seu perfil, as contagens de materiais, lotes e equipamentos e o horário da consulta. **Testar novamente** repete somente as consultas. **Desconectar** descarta a conexão dessa conta no aplicativo.

A consulta não representa uma integração de saídas já finalizada. Não é enviado nenhum documento, pedido de autorização, comprovante ou assinatura, e não há baixa de estoque. O endpoint de saída desta versão também recusa envios, mesmo se alguém tentar acioná-lo fora da tela.

## QR Code e assinatura

Você pode preencher o formulário local, usar o QR Code no dispositivo compatível e desenhar a assinatura para testar a experiência. A lista de demonstração não é o catálogo real do site. A revisão não permite confirmar uma saída online nesta versão. A câmera nativa precisa ser verificada em um Android/Expo Go ou APK real; a prévia web não comprova seu funcionamento no celular.

## Sua conta e suas permissões

Na consulta realizada em 05/11/2026, a conta do usuário tinha perfil `warehouse`, e a tela Nova saída informava que o envio vai para autorização sem movimentação de estoque nessa etapa. O aplicativo não tenta contornar essa regra. Para uma versão produtiva, será necessário adaptar material, lote e equipamento de destino separadamente e respeitar a autorização antes de confirmar a baixa.

A assinatura no site é vinculada a um documento por upload de imagem/PDF e registro de comprovação. Essa vinculação produtiva ainda não está implementada; os traços da assinatura do app não são apresentados como comprovante já registrado no site.

## Proteção da conta e limites

A senha não é persistida no aplicativo, em arquivos ou no banco do projeto. A sessão externa de teste é individual por operador do aplicativo e fica temporariamente na memória do servidor, com duração máxima de 30 minutos. Um reinício, expiração ou invalidação exige reconectar. Desconectar no app não encerra a sua sessão independente no navegador do site.

Se o sistema exigir CAPTCHA, bloquear tentativas, negar acesso ou pedir troca de senha, o teste informa a condição e não tenta contornar a proteção. Não repita tentativas com senha incorreta. A conexão feita no navegador desta conversa é independente da conexão do app: cookies não são copiados entre as duas.

## O que foi confirmado e o que ainda falta

Foi confirmada uma consulta autenticada bem-sucedida aos endpoints de sessão e catálogo do sistema externo usando o acesso autorizado no navegador. O painel do aplicativo precisa ser conectado por você com sua conta para verificar o login feito pelo próprio servidor do app; não foi usada sua senha para automatizar esse login.

Esta entrega é uma versão-fonte/Prévia de teste, não um APK já compilado. O APK Android deve ser gerado pelo painel do projeto, e só deve ser considerado disponível após a compilação real. A integração produtiva de saídas, atualização de estoque e envio da assinatura permanece pendente.

O cliente de consulta e suas rotas passaram por 19 testes automatizados focados, sem credenciais reais nem escritas no sistema externo. Foram verificados isolamento por operador, expiração, desconexão durante operações em andamento, limite de tempo, bloqueios de login, revogação de permissão e recusa de saída no modo de teste. TypeScript, lint, compilação do servidor e exportação da prévia Expo Web também passaram. Esses resultados não substituem o teste manual do login no app e da câmera/assinatura em um Android real.
