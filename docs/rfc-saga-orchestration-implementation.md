# RFC: Implementação da Saga Orquestrada no bunzina-os

- **Status:** Proposto
- **Data:** 2026-10-18
- **Escopo:** `bunzina-os`
- **Referências:** contrato de eventos da Fase 4, ADR 0013 e ADR 0015

## 1. Objetivo

Implementar no `bunzina-os` o orquestrador da Saga da ordem de serviço, mantendo o
fluxo distribuído observável, idempotente e compensável.

O `bunzina-os` será responsável por:

- Persistir a ordem de serviço e o estado da saga.
- Publicar comandos no RabbitMQ.
- Consumir eventos do Billing e do Workshop.
- Decidir o próximo passo do fluxo.
- Detectar falhas e timeouts.
- Executar compensações na ordem inversa das etapas concluídas.
- Expor a API da ordem de serviço, health checks, métricas e Swagger.

Billing e Workshop continuam donos de seus próprios dados e comportamentos. O OS não
acessa os bancos desses serviços.

## 2. Decisão arquitetural

A estratégia é **Saga orquestrada**.

O `bunzina-os` é o único serviço que publica comandos. Billing e Workshop executam os
comandos recebidos e publicam eventos com o resultado. O próximo passo não é decidido
por uma reação autônoma do serviço participante: ele é decidido pelo orquestrador a
partir do estado persistido da saga.

```text
Cliente
  |
  v
bunzina-os -- comandos --> RabbitMQ -- comandos --> Billing/Workshop
     ^                         |
     +------ eventos ----------+
```

O `serviceOrderId` é o `correlationId` de todo o fluxo. Não haverá um segundo id de
saga.

## 3. Regras do contrato adotadas

O RFC implementa o contrato existente sem alterar seus nomes de mensagens:

### Caminho feliz

```text
OrderCreated
  -> cmd.workshop.start-diagnostic
  -> evt.workshop.diagnostic-completed
  -> cmd.billing.issue-quote
  -> evt.billing.quote-issued
  -> evt.billing.quote-approved
  -> cmd.billing.charge
  -> evt.billing.payment-confirmed
  -> cmd.workshop.start-execution
  -> evt.workshop.execution-completed
```

### Falhas e compensações

```text
Diagnostic failed/timeout
  -> cmd.workshop.abort, quando a fila já tiver sido reservada

Payment failed/timeout
  -> cmd.billing.cancel-quote

Execution failed/timeout após pagamento
  -> cmd.workshop.abort
  -> cmd.billing.refund
```

As compensações aguardam o evento correspondente antes de avançar para a próxima
compensação. Se uma compensação falhar após as tentativas configuradas, a mensagem vai
para a DLQ e a saga fica em estado de falha operacional para intervenção humana.

A recusa do orçamento (`evt.billing.quote-rejected`) é um desfecho de negócio. Ela
retorna a OS para `RECEIVED` e não inicia compensação técnica.

## 4. Modelo de estados

### 4.1 Status da ordem de serviço

O domínio deve adicionar `AWAITING_PAYMENT` entre aprovação e execução:

```text
RECEIVED
  -> IN_DIAGNOSTIC
  -> AWAITING_APPROVAL
  -> AWAITING_PAYMENT
  -> IN_EXECUTION
  -> COMPLETED
  -> DELIVERED
```

A recusa do orçamento usa a transição existente de retorno:

```text
AWAITING_APPROVAL -> RECEIVED
```

Falhas que não puderem ser recuperadas levam a OS para `CANCELED`.

### 4.2 Status da saga

```text
RUNNING
  -> COMPLETED
  -> COMPENSATING
  -> FAILED
```

`COMPLETED` significa que a ordem chegou ao fim do fluxo técnico. `FAILED` significa
que ocorreu uma falha e a compensação terminou ou ficou bloqueada. O termo
`COMPENSATED` não será usado como status persistido, pois não faz parte do contrato
base definido em `events-saga-contracts.md`.

### 4.3 Etapas registradas

A saga deve guardar as etapas concluídas, não apenas a etapa atual:

```text
DIAGNOSTIC
QUOTE
PAYMENT
EXECUTION
```

O conjunto de etapas concluídas determina quais compensações são necessárias.

## 5. Persistência

O banco do serviço será PostgreSQL próprio do `bunzina-os`.

### 5.1 Tabelas necessárias

```text
service_orders
service_order_items
saga_instances
processed_events
outbox_messages
```

`outbox_messages` é incluída para impedir que o serviço persista uma mudança de estado
e perca o comando se o processo cair antes da publicação no RabbitMQ.

### 5.2 `saga_instances`

Campos mínimos:

```sql
service_order_id uuid primary key
status text not null
current_step text not null
completed_steps jsonb not null default '[]'
step_deadline_at timestamptz
last_error text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

A implementação pode acrescentar `failure_reason`, `failure_detail` e dados de
compensação, desde que preserve o contrato e mantenha os valores de `reason` como enum.

### 5.3 Idempotência

Cada mensagem consumida será registrada em `processed_events` usando:

```text
(event_id, consumer)
```

O registro da mensagem deve ocorrer na mesma transação da alteração de negócio. Se a
chave já existir, o evento é redelivery: o serviço faz `ack` sem repetir o efeito.

## 6. Estrutura de implementação

A estrutura alvo é:

```text
src/
  application/
    saga/
      saga-orchestrator.ts
      saga-event-handler.ts
      saga-timeout-worker.ts
  domain/
    saga/
      entities/saga-instance.ts
      repositories/saga-instance-repository.ts
      types/saga-status.ts
      types/saga-step.ts
    service-order/
  infrastructure/
    messaging/
    repositories/
    outbox/
  adapters/
    input/
    output/
```

A nomenclatura pode acompanhar a estrutura já migrada do monólito quando isso evitar
movimentação desnecessária.

## 7. Plano de implementação por PR

O plano foi consolidado em sete PRs. Cada PR mantém lint, formatação e testes
passando, mas entrega uma capacidade maior e revisável. Nenhum PR deve misturar
infraestrutura de outro repositório com regra de domínio do OS.

### PR 1 — Migrar e ajustar o domínio da OS

- Migrar entidades, value objects, tipos, repositories/interfaces e testes de domínio
  de `service-order`.
- Adicionar `AWAITING_PAYMENT` entre aprovação e execução.
- Atualizar a máquina de estados e os testes de transição.
- Ajustar aliases e imports para o novo repositório.

Os casos de uso, adapters, presenters e rotas dependentes de banco ficam para o PR 2,
porque dependem da persistência própria e dos ports de Cadastros.

**Aceite:** o domínio migrado passa nos testes, tem cobertura mínima de 80% e a
aprovação não pula diretamente para `IN_EXECUTION`.

### PR 2 — Persistência própria e integração com Cadastros

- Criar migrations de `service_orders` e itens.
- Criar `saga_instances`, `processed_events` e `outbox_messages`.
- Migrar repositories, schemas e mappers.
- Implementar snapshots de cliente e veículo.
- Implementar cliente REST do `bunzina` com timeout e retry limitado.
- Ajustar `/ready` para validar o PostgreSQL próprio.

**Aceite:** uma OS pode ser criada e recuperada no banco do OS sem acessar o banco do
`bunzina`.

### PR 3 — Modelo da saga e mensageria

- Criar `SagaInstance`, `SagaStatus`, `SagaStep` e seus repositories.
- Reutilizar o messaging do template.
- Validar envelopes com Zod.
- Criar factories para os comandos do OS.
- Publicar com routing key baseada no `eventType`.
- Propagar `traceparent`, `correlationId` e `causationId`.

**Aceite:** o estado da saga é persistido por `serviceOrderId` e os comandos têm
payload e routing key compatíveis com o contrato.

### PR 4 — Caminho feliz da saga

Implementar e testar os handlers:

```text
diagnostic-completed -> issue-quote
quote-issued         -> AWAITING_APPROVAL
quote-approved       -> charge
payment-confirmed    -> start-execution
execution-completed  -> COMPLETED
```

**Aceite:** testes unitários comprovam o próximo comando e a atualização de estado
para cada evento.

### PR 5 — Idempotência, compensação e timeout

- Implementar `IdempotencyGuard` para PostgreSQL.
- Registrar `(eventId, consumer)` na mesma transação da regra de negócio.
- Implementar `payment-failed -> cancel-quote`.
- Implementar `execution-failed -> workshop.abort -> billing.refund`.
- Persistir `COMPENSATING` antes da primeira compensação.
- Compensar na ordem inversa das etapas concluídas.
- Criar worker para `step_deadline_at` e tratar timeout como `TIMEOUT`.
- Testar redelivery, falha de compensação e timeout.

**Aceite:** o cenário de execução falha após pagamento, realiza estorno e termina com
OS `CANCELED`; repetir qualquer evento não duplica efeitos.

### PR 6 — Integração real com RabbitMQ e outbox

- Inicializar exchange, fila do OS, DLQ e bindings.
- Registrar handlers por `eventType`.
- Usar `ack` manual após a transação de negócio.
- Fazer `nack` sem requeue para mensagens inválidas ou não tratáveis.
- Publicar a outbox com retry e publisher confirms.
- Validar o fluxo no `docker-compose`, incluindo restart entre commit e publicação.

**Aceite:** eventos reais são processados com idempotência, DLQ e sem perda de
comandos após commit no PostgreSQL.

### PR 7 — BDD, observabilidade e documentação

- Criar BDD do caminho feliz.
- Criar BDD da falha após pagamento com estorno.
- Cobrir redelivery e timeout.
- Adicionar logs com `serviceOrderId`, `eventId` e `causationId`.
- Adicionar métricas de estado, duração, falhas, compensações e DLQ.
- Validar trace HTTP -> RabbitMQ -> serviço consumidor.
- Atualizar README, Swagger, diagrama e link deste RFC.

Preferencialmente, os testes BDD rodam contra o `docker-compose`. Enquanto Billing e
Workshop não estiverem prontos, podem usar stubs que respeitem o mesmo contrato.

## 8. Critérios de aceite do conjunto

A implementação será considerada pronta quando:

1. O caminho feliz atravessar OS, Workshop e Billing.
2. O cenário de falha após pagamento confirmado solicitar abort, refund e terminar com
   OS `CANCELED`.
3. Todo evento for validado e idempotente.
4. Timeouts dispararem compensação.
5. Nenhum serviço acessar o banco de outro.
6. A publicação não perder comandos após commit da transação.
7. O trace usar o mesmo `serviceOrderId` como correlação.
8. Testes, lint, cobertura mínima de 80% e Sonar passarem.

## 9. Análise de consistência e pontos de atenção

### 9.1 Pontos coerentes

- O OS como orquestrador está alinhado ao ADR 0013 e ao contrato.
- RabbitMQ topic atende aos nomes `cmd.*` e `evt.*`.
- PostgreSQL no OS é adequado para ordem, saga, idempotência e outbox.
- O Workshop como participante assíncrono preserva seu banco MongoDB próprio.
- A compensação de execução após pagamento é o melhor cenário para demonstrar a saga.
- A separação entre ações humanas via REST e comunicação entre serviços via mensageria
  mantém o BDD determinístico.

### 9.2 Correções incorporadas ao plano

- O contrato define `RUNNING`, `COMPENSATING`, `COMPLETED` e `FAILED`; o RFC não usa
  `COMPENSATED` como status persistido.
- `quote-rejected` volta a OS para `RECEIVED` e não é tratado como falha técnica.
- `evt.os.order-created` é evento de notificação/observabilidade, não gatilho consumido
  por Billing ou Workshop.
- O timeout usa o mesmo caminho de compensação da falha explícita.
- A compensação de execução ocorre antes do estorno quando a execução foi iniciada.

### 9.3 Decisões ainda necessárias antes da implementação final

- Definir os valores exatos de timeout por etapa.
- Definir quantidade e backoff de retries da outbox e das compensações.
- Confirmar se o `outbox_messages` será aplicado já no primeiro fluxo ou em PR separado.
- Confirmar a exposição pública do webhook do Mercado Pago no repositório Billing.
- Definir o mecanismo do job de timeout: worker no processo ou tarefa agendada externa.

Essas decisões não bloqueiam a migração do domínio, o modelo da saga ou os testes
unitários do orquestrador.

## 10. Comandos de validação por PR

Executar no `bunzina-os`:

```bash
bun test
bun run test:ci
bun run lint
bun run fmt:check
```

PRs que alterarem migrations ou integração devem também executar o `docker-compose` e
validar `/health`, `/ready` e `/swagger`.
