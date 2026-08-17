# 0012 - Convite não emite sessão de conta existente sem a senha dela

Status: aceito

## Contexto

O convite de equipe foi desenhado para o caso comum: a pessoa não tem conta,
recebe o link, define a senha e entra. O código também tratava o caso de o
e-mail já pertencer a alguém, para que um veterinário que atende em duas
clínicas não precisasse de duas contas. Nesse caminho, ele reaproveitava o
usuário existente e emitia sessão para ele.

Combinado com o fato de a rota de convite devolver o link com o token em texto
na própria resposta HTTP, isso formava uma falha de identidade: um
administrador podia convidar o e-mail de um veterinário que já tinha conta,
abrir o link ele mesmo e passar a agir sob a identidade daquela pessoa dentro
da sua própria clínica. Como o convite ainda cria o registro profissional com
o CRMV informado, vinculado àquele usuário, o resultado é assinar nota clínica
e receita em nome de outro profissional.

O prontuário do CHIRON é imutável depois de assinado justamente para que a
autoria valha alguma coisa. Uma porta que permite assinar em nome de terceiro
esvazia essa garantia inteira.

## Decisão

Aceitar convite para e-mail que já tem conta com senha definida exige a senha
daquela conta, conferida pelo mesmo caminho do login, com bloqueio por
tentativas e registro em auditoria, antes de qualquer sessão ser emitida.

A senha é exigida nos três casos (conta nova, conta sem senha e conta
existente), para que a ausência dela não revele qual é o caso, e a mensagem de
recusa é a mesma, para não virar oráculo de cadastro.

O link com o token só volta na resposta da API em desenvolvimento e em teste.
Em produção ele existe para ser entregue ao destinatário por e-mail, e para
mais ninguém.

## Consequências

Aceitas:

- Ninguém entra em uma organização sem provar que é dono da conta, e a autoria
  do registro clínico volta a significar o que promete.
- Quem convida não vê mais o token, então perder o acesso ao e-mail do
  convidado não vira acesso à conta dele.

Custos:

- Em produção o convite depende do e-mail funcionar. É por isso que o envio
  transacional entrou junto, com recusa explícita no boot quando falta
  configuração, em vez de falhar em silêncio.
- Quem atende em duas clínicas precisa lembrar a própria senha ao aceitar o
  segundo convite. Se esqueceu, o caminho é redefinir a senha e aceitar depois.

## Alternativas consideradas

**Exigir que a pessoa esteja autenticada para aceitar.** Mais limpo em teoria,
mas empurra o problema para a interface (aceitar em outra sessão, trocar de
conta) e ainda deixaria o token exposto na resposta. A senha no próprio aceite
resolve com um passo só.

**Manter a emissão de sessão e apenas parar de devolver o token.** Descartada:
reduz a exposição, não fecha a falha. Qualquer vazamento de token voltaria a
permitir agir como a outra pessoa, e o token trafega por e-mail.
