# Saga de ordem de serviço

O `bunzina-os` é o orquestrador. `serviceOrderId` permanece como identificador da
ordem e `correlationId` em todos os envelopes.

## Caminho feliz

```mermaid
sequenceDiagram
    participant Client as Cliente
    participant OS as bunzina-os
    participant MQ as RabbitMQ
    participant Workshop
    participant Billing

    Client->>OS: POST /service-orders
    OS->>MQ: cmd.workshop.start-diagnostic
    MQ->>Workshop: start-diagnostic
    Workshop-->>MQ: evt.workshop.diagnostic-completed
    MQ->>OS: evento
    OS->>MQ: cmd.billing.issue-quote
    MQ->>Billing: issue-quote
    Billing-->>MQ: evt.billing.quote-issued
    Billing-->>MQ: evt.billing.quote-approved
    MQ->>OS: eventos
    OS->>MQ: cmd.billing.charge
    MQ->>Billing: charge
    Billing-->>MQ: evt.billing.payment-confirmed
    MQ->>OS: evento
    OS->>MQ: cmd.workshop.start-execution
    MQ->>Workshop: start-execution
    Workshop-->>MQ: evt.workshop.execution-completed
    MQ->>OS: evento
    OS->>OS: Marca a ordem COMPLETED
```

## Compensação após falha de execução

```mermaid
sequenceDiagram
    participant OS as bunzina-os
    participant MQ as RabbitMQ
    participant Workshop
    participant Billing

    Workshop-->>MQ: evt.workshop.execution-failed
    MQ->>OS: evento
    OS->>MQ: cmd.workshop.abort
    MQ->>Workshop: abort
    Workshop-->>MQ: evt.workshop.execution-aborted
    MQ->>OS: evento
    OS->>MQ: cmd.billing.refund
    MQ->>Billing: refund
    Billing-->>MQ: evt.billing.payment-refunded
    MQ->>OS: evento
    OS->>OS: Marca a ordem CANCELED
```

Rejeitar um orçamento é um desfecho de negócio. `evt.billing.quote-rejected` retorna a
ordem para `RECEIVED` sem disparar uma compensação.

Os testes em `src/application/saga/saga-orchestrator.bdd.test.ts` percorrem esses
eventos com repositórios em memória. Eles validam o comportamento do `bunzina-os` sem
depender de Billing ou Workshop em execução.
