# bunzina-os

Microsserviço responsável por ordens de serviço e pela orquestração da Saga de
diagnóstico, orçamento, pagamento e execução. O serviço mantém seus dados no
PostgreSQL e publica comandos por uma outbox no RabbitMQ.

## Responsabilidades

- Criar, consultar, listar, editar e excluir ordens de serviço.
- Registrar a entrega de uma ordem concluída.
- Persistir o estado da ordem, da Saga e dos eventos processados.
- Decidir o próximo comando a partir dos eventos de Billing e Workshop.
- Compensar falhas na ordem inversa: abortar a execução e, depois, estornar o pagamento.
- Detectar prazos vencidos e expor health checks, métricas e traces.

Billing é dono de orçamentos e pagamentos. Workshop é dono de diagnóstico e execução.
O `bunzina-os` integra esses serviços pelos contratos de eventos; ele não acessa os
bancos deles. O contrato compartilhado está em
[events-saga-contracts.md](https://github.com/Bunzina/bunzina/blob/main/docs/contracts/events-saga-contracts.md).
Swagger: `GET /swagger`.

## Por que saga orquestrada

O ciclo da OS atravessa três serviços e não cabe numa transação. A estratégia é
**saga orquestrada**, com este serviço no comando
([ADR 0013](https://github.com/Bunzina/bunzina/blob/main/docs/arch/adrs/0013-orchestrated-saga.md)).

- O estado de cada instância fica em `saga_instances`. A PK é o `service_order_id`,
  também usado como `correlationId` de todas as mensagens.
- A tabela guarda os passos já concluídos, não só o passo atual. A compensação
  depende de até onde a saga chegou.
- Só o orquestrador publica comandos (`cmd.*`). Billing e Workshop publicam
  eventos (`evt.*`).
- Todo passo tem prazo em `step_deadline_at`. Prazo vencido usa a mesma compensação
  de uma falha explícita (`reason: TIMEOUT`).
- Recusa de orçamento não é falha: a OS volta para `RECEIVED` e nada é compensado.

Coreografia deixaria o estado do fluxo espalhado nos três serviços. A máquina em
`src/domain/service-order/state-machines/status-machine.ts` já descrevia o ciclo da
OS e passou a ser o modelo da saga.

Diagramas de caminho feliz e compensação: [docs/saga-orchestration.md](docs/saga-orchestration.md).
RFC de implementação: [docs/rfc-saga-orchestration-implementation.md](docs/rfc-saga-orchestration-implementation.md).
Arquitetura geral (quatro serviços, bancos, broker): [docs/architecture.md](docs/architecture.md).
Banco deste serviço e mapa dos outros: [docs/database.md](docs/database.md).

## Fluxos

O `serviceOrderId` é o `correlationId` de toda a Saga.

Veja os diagramas de [caminho feliz e compensação](docs/saga-orchestration.md).
A collection Bruno do EKS e o passo a passo dos fluxos estão em [docs/bruno](docs/bruno/FLUXOS.md).

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

O Compose publica a API em `http://localhost:3001`, o PostgreSQL em `localhost:5432`
e a interface de gerenciamento do RabbitMQ em `http://localhost:15672`.

## API e operação

- `GET /health`: verifica se o processo HTTP está respondendo.
- `GET /ready`: verifica a conexão com o PostgreSQL.
- `GET /metrics`: métricas no formato Prometheus.
- `GET /swagger`: documentação OpenAPI.
- `POST /service-orders`: cria a ordem e inicia o diagnóstico.
- `GET /service-orders/:id`: consulta uma ordem.
- `GET /service-orders`: lista ordens com paginação e filtros.
- `GET /service-orders/customer/:documentNumber`: consulta ordens ativas pelo documento salvo no snapshot do cliente.
- `PUT /service-orders/:id`: atualiza itens e orçamento antes do início da Saga.
- `DELETE /service-orders/:id`: exclui uma ordem antes do início da Saga.
- `PATCH /service-orders/:id/status`: registra a entrega (`COMPLETED` para `DELIVERED`).

As rotas de edição e exclusão retornam conflito quando a Saga já foi criada. A API
não permite alterar manualmente os estados controlados pela Saga. A conclusão dos
itens de execução pertence ao Workshop.

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
