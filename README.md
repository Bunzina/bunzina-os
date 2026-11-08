# bunzina-os

Microsserviço responsável por ordens de serviço e pela orquestração da Saga de
diagnóstico, orçamento, pagamento e execução. O serviço mantém seus dados no
PostgreSQL e publica comandos por uma outbox no RabbitMQ.

## Responsabilidades

- Criar, consultar e listar ordens de serviço.
- Persistir o estado da ordem, da Saga e dos eventos processados.
- Decidir o próximo comando a partir dos eventos de Billing e Workshop.
- Compensar falhas na ordem inversa: abortar a execução e, depois, estornar o pagamento.
- Detectar prazos vencidos e expor health checks, métricas e traces.

Billing é dono de orçamentos e pagamentos. Workshop é dono de diagnóstico e execução.
O `bunzina-os` integra esses serviços pelos contratos de eventos; ele não acessa os
bancos deles. O contrato compartilhado está em
[events-saga-contracts.md](https://github.com/Bunzina/bunzina/blob/main/docs/contracts/events-saga-contracts.md)
e a decisão arquitetural está no [RFC da Saga](docs/rfc-saga-orchestration-implementation.md).

## Fluxos

O `serviceOrderId` é o `correlationId` de toda a Saga.

Veja os diagramas de [caminho feliz e compensação](docs/saga-orchestration.md).

Se a execução falhar depois da confirmação do pagamento, o OS publica
`cmd.workshop.abort`; após `evt.workshop.execution-aborted`, publica
`cmd.billing.refund`. A ordem termina como `CANCELED` após o evento de estorno.
Uma rejeição do orçamento é um desfecho de negócio: a ordem volta para `RECEIVED` sem
compensação.

## Executar localmente

Requisitos: [Bun 1.4.4](https://bun.sh/) e Docker Compose.

```bash
bun install
bun test
bun run lint
bun run fmt:check
```

Para subir o PostgreSQL e o RabbitMQ locais, aplicar migrations e iniciar a API:

```bash
docker compose up --build -d db rabbitmq
docker compose run --rm app bun run migration
docker compose up --build app
```

O Compose publica a API em `http://localhost:3000`, o PostgreSQL em `localhost:5432`
e a interface de gerenciamento do RabbitMQ em `http://localhost:15672`.

## API e operação

- `GET /health`: verifica se o processo HTTP está respondendo.
- `GET /ready`: verifica a conexão com o PostgreSQL.
- `GET /metrics`: métricas no formato Prometheus.
- `GET /swagger`: documentação OpenAPI.
- `POST /service-orders`: cria a ordem e inicia o diagnóstico.
- `GET /service-orders/:id`: consulta uma ordem.
- `GET /service-orders`: lista ordens com paginação e filtros.

O intervalo de polling da outbox pode ser definido por `OUTBOX_POLL_INTERVAL_MS`. O
worker da Saga aceita `SAGA_TIMEOUT_POLL_INTERVAL_MS`. Ambos usam `1000` ms como
padrão. Para exportar traces, configure `OTEL_EXPORTER_OTLP_ENDPOINT` ou
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`.

As métricas da Saga incluem estados persistidos, duração terminal, compensações e
timeouts. O consumer também expõe mensagens processadas, duplicadas, falhas e enviadas
à DLQ; a outbox registra falhas de publicação. Logs de mensagens incluem
`serviceOrderId`, `eventId` e `causationId`, e o contexto W3C é propagado pelo envelope,
RabbitMQ e outbox.

## Testes da Saga

Os cenários Gherkin em `features/` percorrem o ciclo da ordem, seus desfechos e as
compensações. Eles exercitam os casos de uso e o orquestrador com dependências
controladas em memória, sem exigir Billing ou Workshop executando.

```bash
bun run bdd
```

Os testes de unidade em `src/application/saga/saga-orchestrator.bdd.test.ts` e os
testes do consumer continuam cobrindo detalhes como duplicatas e redrive da DLQ. A
integração real entre serviços fica para uma etapa posterior.

```bash
bun run test:ci
```
