# Handoff — Fase 4 / bunzina-os

Este arquivo existe para permitir que outra IA ou outra pessoa continue o trabalho sem
precisar reconstruir o contexto da Fase 4.

## Estado atual

- **Repositório:** `bunzina-os`
- **Branch atual:** `feat/os-saga-model-messaging`
- **Base atual:** `main` depois do merge do PR 2
- **HEAD atual:** `f8ab39c feat(os): implement service order persistence and catalog integration`
- **Working tree:** limpa no momento da criação deste arquivo
- **Próximo trabalho:** PR 3 — modelo da Saga e mensageria

A branch do PR 3 já foi criada, mas ainda não há implementação do modelo da saga nela.

## Objetivo da Fase 4

Transformar o monólito em uma arquitetura com quatro serviços de aplicação:

```text
bunzina          -> cadastros, autenticação e notificações; PostgreSQL próprio
bunzina-os       -> ordem de serviço e orquestrador da Saga; PostgreSQL próprio
bunzina-billing  -> orçamento e pagamento; PostgreSQL próprio
bunzina-workshop -> diagnóstico, fila e reparos; MongoDB próprio
```

A Saga escolhida é **orquestrada**. O `bunzina-os` decide o próximo passo, publica
comandos e consome eventos de Billing e Workshop.

O `serviceOrderId` é o `correlationId` de todo o fluxo. Não existe um segundo id de saga.

## Contrato de eventos

O contrato oficial está no repositório principal:

- `../bunzina/docs/contracts/events-saga-contracts.md`
- `../bunzina/docs/contracts/events-overview.md`
- ADR da saga: `../bunzina/docs/arch/adrs/0013-orchestrated-saga.md`
- ADR dos microsserviços: `../bunzina/docs/arch/adrs/0012-microservices-split.md`
- ADR do RabbitMQ: `../bunzina/docs/arch/adrs/0015-rabbitmq-broker.md`

### Caminho feliz

```text
OS criada
  -> cmd.workshop.start-diagnostic
  -> evt.workshop.diagnostic-completed
  -> cmd.billing.issue-quote
  -> evt.billing.quote-issued
  -> evt.billing.quote-approved
  -> cmd.billing.charge
  -> evt.billing.payment-confirmed
  -> cmd.workshop.start-execution
  -> evt.workshop.execution-completed
  -> OS COMPLETED
```

### Falha principal da demonstração

```text
evt.workshop.execution-failed
  -> saga COMPENSATING
  -> cmd.workshop.abort
  -> evt.workshop.execution-aborted
  -> cmd.billing.refund
  -> evt.billing.payment-refunded
  -> OS CANCELED
  -> saga FAILED
```

`quote-rejected` é desfecho de negócio, não erro técnico. Nesse caso a OS volta para
`RECEIVED` e não há compensação.

### Envelope obrigatório

Toda mensagem usa:

```json
{
  "eventId": "uuid v7",
  "eventType": "cmd.* ou evt.*",
  "eventVersion": 1,
  "occurredAt": "ISO 8601 UTC",
  "correlationId": "serviceOrderId",
  "causationId": "eventId anterior",
  "producer": "nome-do-servico",
  "traceparent": "W3C trace context",
  "data": {}
}
```

Comandos são publicados somente pelo OS. Serviços participantes publicam eventos.

## O que já foi feito

### PR 1 — Domínio da ordem de serviço

Foi implementado e incorporado à `main`:

- Entidade `ServiceOrder`.
- Entidades `ServiceItem` e `AutoPartItem`.
- Value objects `Price` e `Quote`.
- Interface `ServiceOrderRepository`.
- Status `AWAITING_PAYMENT`.
- Transição:

```text
AWAITING_APPROVAL -> AWAITING_PAYMENT -> IN_EXECUTION
```

- Testes do domínio e da máquina de estados.
- Comparações dos testes feitas com o corpo completo dos objetos.

Arquivos principais:

```text
src/domain/core/
src/domain/service-order/
```

### PR 2 — Persistência e integração com Cadastros

Foi implementado e incorporado à `main`:

- Repository PostgreSQL da OS.
- DTOs e mappers de persistência.
- Snapshots de cliente e veículo.
- Gateway REST `HttpCatalogService`.
- Timeout do gateway.
- API key opcional para chamadas ao `bunzina`.
- Casos de uso de criação, busca por ID e listagem.
- Presenter da OS.
- Rotas:
  - `POST /service-orders`
  - `GET /service-orders/:id`
  - `GET /service-orders`
- Migration da outbox.
- Testes de criação, gateway, snapshots e mappers.
- Porta HTTP configurável por `PORT`.
- Correção de tipagem do mock do publisher.
- Cobertura adicional para os caminhos de erro do catálogo.

Arquivos principais:

```text
src/application/ports/catalog-service.ts
src/application/use-cases/service-order/create.ts
src/application/use-cases/service-order/find-by-id.ts
src/application/use-cases/service-order/list.ts
src/infrastructure/services/catalog/http-catalog-service.ts
src/infrastructure/repositories/service-order/
src/api/service-order-routes.ts
src/adapters/output/service-order-presenter.ts
```

### Migrations existentes

O banco do `bunzina-os` já possui:

```text
001_create_schema_and_enums.sql
002_create_service_orders.sql
003_create_service_order_items.sql
004_create_saga_instances.sql
005_create_processed_events.sql
006_create_outbox_messages.sql
```

A migration 006 criou:

```text
outbox_messages
  id
  aggregate_type
  aggregate_id
  event_type
  payload
  headers
  published_at
  attempts
  last_error
  created_at
```

A tabela existe, mas ainda não há worker da outbox. Isso é intencional: o worker fica no
PR 6, junto da integração real com RabbitMQ.

### Validação já realizada

No ambiente local, a suíte chegou a:

```text
66 testes passando
0 falhas
cobertura acima de 99%
typecheck passando
lint passando
```

O CI usa Bun `1.4.4`; por isso a cobertura foi ajustada para cobrir explicitamente os
caminhos de erro do `HttpCatalogService`. Não remover esses testes sem substituir a
cobertura.

## Configuração local

O `.env` local do `bunzina-os` contém configuração de desenvolvimento:

```env
PORT=0
DATABASE_URL=postgres://bun:bun@localhost:5432/bunzina-os
```

`PORT=0` faz o sistema escolher uma porta livre. A API informa a porta efetiva no log.
Não commitar `.env`.

### Subir PostgreSQL

```bash
docker compose up -d db
bun run migration
```

### Iniciar API

```bash
bun run start
```

### Testar API

Use a porta exibida no log:

```bash
curl http://localhost:<PORTA>/health
curl http://localhost:<PORTA>/ready
curl http://localhost:<PORTA>/service-orders
```

O `POST /service-orders` também depende do serviço `bunzina` estar acessível pelo
`CATALOG_SERVICE_URL`. O fallback atual é `http://localhost:3001`.

Swagger:

```text
http://localhost:<PORTA>/swagger
```

### Validações do repositório

```bash
bun test --config=./bunfig.ci.toml
bunx tsc --noEmit
bun run lint
bunx oxfmt --check
```

Se o formatter global acusar arquivos antigos do scaffold, verificar primeiro se o
arquivo apontado pertence ao PR atual. O CI deve ser reproduzido com o mesmo comando
configurado no workflow.

## Próximo PR — PR 3

### Nome sugerido

```text
feat/os-saga-model-messaging
```

A branch já existe. O objetivo é criar o modelo da saga e preparar a publicação de
comandos, sem implementar ainda o fluxo completo nem o worker da outbox.

### Implementar

1. Criar tipos de domínio:

```text
src/domain/saga/types/saga-status.ts
src/domain/saga/types/saga-step.ts
```

Status:

```text
RUNNING
COMPENSATING
COMPLETED
FAILED
```

Etapas:

```text
DIAGNOSTIC
QUOTE
PAYMENT
EXECUTION
```

2. Criar entidade:

```text
src/domain/saga/entities/saga-instance.ts
```

A entidade deve conter, no mínimo:

```text
serviceOrderId
status
currentStep
completedSteps
stepDeadlineAt
lastError
createdAt
updatedAt
```

3. Criar port do repository:

```text
src/domain/saga/repositories/saga-instance-repository.ts
```

Operações mínimas:

```text
findByServiceOrderId
create
update
```

4. Criar implementation PostgreSQL:

```text
src/infrastructure/repositories/saga/saga-instance-repository.ts
```

Usar a tabela já existente em `migrations/004_create_saga_instances.sql`.

5. Reutilizar o messaging do template:

```text
src/infrastructure/messaging/envelope.ts
src/infrastructure/messaging/publisher.ts
src/infrastructure/messaging/consumer.ts
src/infrastructure/messaging/connection.ts
```

Não duplicar a infraestrutura se ela já estiver na branch.

6. Criar factories de comandos do OS:

```text
cmd.workshop.start-diagnostic
cmd.billing.issue-quote
cmd.billing.charge
cmd.workshop.start-execution
```

Cada factory deve gerar envelope válido com:

```text
eventId
eventType
eventVersion
occurredAt
correlationId
causationId
producer
traceparent
data
```

7. Criar testes unitários de:

- Criação da saga com `RUNNING`.
- Atualização de etapa.
- Registro de etapa concluída sem perder etapas anteriores.
- Transições válidas de status.
- Persistência via repository mockado.
- Payload e routing key de cada comando.
- Propagação de `correlationId` e `causationId`.

### Não fazer no PR 3

Não implementar ainda:

- Consumer real do fluxo da saga.
- Caminho feliz completo.
- Compensações.
- Timeouts.
- Worker da outbox.
- Integração real de Billing e Workshop.
- Remoção da OS do monólito.

Esses itens ficam para os PRs 4, 5 e 6.

### Critério de aceite do PR 3

Deve ser possível:

```text
criar SagaInstance
  -> persistir no PostgreSQL
  -> recuperar por serviceOrderId
  -> atualizar currentStep/completedSteps
  -> criar comando válido
  -> publicar usando eventType como routing key
```

## Próximos PRs depois do PR 3

### PR 4 — Caminho feliz — implementado localmente

Implementado no `bunzina-os`:

- `SagaOrchestrator` para iniciar e avançar a Saga.
- Início automático do diagnóstico após a criação da OS.
- Handler de `evt.workshop.diagnostic-completed`.
- Handler de `evt.billing.quote-issued`.
- Handler de `evt.billing.quote-approved`.
- Handler de `evt.billing.payment-confirmed`.
- Handler de `evt.workshop.execution-completed`.
- Atualização de status da OS durante o fluxo.
- Atualização dos itens diagnosticados e do orçamento final.
- Persistência de `quoteId`, `paymentId` e `paymentAmountCents` na saga.
- Migration `007_add_saga_payment_references.sql`.
- Mapa de handlers em `saga-event-handlers.ts`.
- Teste do caminho feliz completo.

Validação local do PR4:

```text
76 testes passando
0 falhas
typecheck passando
lint passando
migrations passando
```

O consumer real do RabbitMQ ainda não foi ligado. Os handlers estão prontos para serem
entregues ao consumer no PR6, quando a idempotência e a outbox estiverem completas.

### PR 5 — Idempotência, compensações e timeout

Handlers e decisões:

```text
evt.workshop.diagnostic-completed -> cmd.billing.issue-quote
evt.billing.quote-issued         -> AWAITING_APPROVAL
evt.billing.quote-approved       -> cmd.billing.charge
evt.billing.payment-confirmed    -> cmd.workshop.start-execution
evt.workshop.execution-completed -> COMPLETED
```

### PR 5 — Idempotência, compensações e timeout

- Implementar `processed_events` dentro da transação de negócio.
- Ignorar redelivery.
- Implementar `payment-failed -> cancel-quote`.
- Implementar `execution-failed -> abort -> refund`.
- Implementar `step_deadline_at` e worker de timeout.

### PR 6 — RabbitMQ real e Outbox

- Declarar exchange, fila e DLQ.
- Consumer real.
- Ack/nack.
- Worker que lê `outbox_messages`.
- Retry e publisher confirms.
- Teste de restart entre commit no PostgreSQL e publicação.

### PR 7 — BDD, observabilidade e documentação

- BDD do caminho feliz.
- BDD da falha com estorno.
- Teste de redelivery e timeout.
- Logs com `serviceOrderId`, `eventId`, `causationId`.
- Métricas da saga.
- Trace HTTP -> RabbitMQ -> consumidores.
- README, Swagger e diagramas.

## Regras para não gerar conflito

- Não acessar o banco de outro serviço.
- Não alterar os contratos de eventos sem atualizar o repositório `bunzina` e avisar
  Billing/Workshop.
- Apenas o OS publica comandos.
- Billing e Workshop publicam eventos.
- Usar `serviceOrderId` como `correlationId`.
- Dinheiro em centavos nos eventos, com `currency` explícita.
- `reason` deve ser enum, nunca texto livre.
- Registrar mensagens processadas por `(eventId, consumer)`.
- Não remover as rotas de OS do monólito antes da nova API estar validada.
- Não incluir `.env`, credenciais ou tokens em commits.

## Arquivos de referência importantes

No `bunzina-os`:

```text
docs/rfc-saga-orchestration-implementation.md
migrations/004_create_saga_instances.sql
migrations/005_create_processed_events.sql
migrations/006_create_outbox_messages.sql
src/infrastructure/messaging/
src/domain/service-order/
src/api/service-order-routes.ts
```

No repositório principal:

```text
../bunzina/docs/tasks-phase-4.md
../bunzina/docs/contracts/events-saga-contracts.md
../bunzina/docs/contracts/events-overview.md
../bunzina/docs/arch/adrs/0012-microservices-split.md
../bunzina/docs/arch/adrs/0013-orchestrated-saga.md
../bunzina/docs/arch/adrs/0014-mongodb-workshop.md
../bunzina/docs/arch/adrs/0015-rabbitmq-broker.md
```

## Instrução para a próxima IA

Comece lendo este arquivo e depois:

1. Confirme `git status --short --branch`.
2. Leia a infraestrutura atual em `src/infrastructure/messaging`.
3. Leia `migrations/004_create_saga_instances.sql`.
4. Implemente somente o PR 3 descrito acima.
5. Rode testes, typecheck, lint e formatter.
6. Não recomece o PR 1 ou PR 2.
