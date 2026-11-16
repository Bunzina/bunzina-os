# Bancos de dados

Este repositório descreve o PostgreSQL do `bunzina-os`. Os outros serviços
documentam o schema junto das próprias migrations.

## Mapa

| Serviço | Banco | Onde |
| --- | --- | --- |
| `bunzina-os` | PostgreSQL | abaixo |
| `bunzina` | PostgreSQL cadastros | [database.md](https://github.com/Bunzina/bunzina/blob/main/docs/arch/database.md) |
| `bunzina-billing` | PostgreSQL billing | [er-billing.md](https://github.com/Bunzina/bunzina/blob/main/docs/arch/diagrams/er-billing.md) |
| `bunzina-workshop` | MongoDB Atlas | [README do workshop](https://github.com/Bunzina/bunzina-workshop/blob/main/README.md#modelo-de-documentos-mongodb) |

Nenhum serviço acessa o banco de outro. Cliente e veículo entram neste banco como
**snapshot** na criação da OS.

### Por que PostgreSQL aqui e Mongo no workshop

OS, itens, `saga_instances` e outbox são relacionais: FK, transação e o estado da
saga numa tabela. Cadastros e billing seguem o mesmo critério.

No workshop o agregado muda de forma entre pedido, diagnóstico e execução. Por
isso MongoDB Atlas, não outro PostgreSQL.

## PostgreSQL deste serviço

Schema `bunzina`, migrations `001` a `007`. Sem FK para cadastro ou billing.

```mermaid
erDiagram
    SERVICE_ORDERS ||--o{ SERVICE_ORDER_SERVICE_ITEMS : contains
    SERVICE_ORDERS ||--o{ SERVICE_ORDER_AUTO_PART_ITEMS : contains
    SERVICE_ORDERS ||--|| SAGA_INSTANCES : orchestrates

    SERVICE_ORDERS {
        uuid id PK
        uuid customer_id "snapshot, sem FK"
        text customer_name
        text customer_document
        uuid vehicle_id "snapshot, sem FK"
        text vehicle_plate
        service_order_status status
        numeric quote_total
        timestamptz paid_at "nulo"
        timestamptz completed_at "nulo"
        timestamptz delivered_at "nulo"
    }
    SERVICE_ORDER_SERVICE_ITEMS {
        uuid id PK
        uuid service_order_id FK
        uuid service_id "sem FK"
        numeric price
        boolean is_completed
        bigint execution_time_ms "nulo"
    }
    SERVICE_ORDER_AUTO_PART_ITEMS {
        uuid id PK
        uuid service_order_id FK
        uuid auto_part_id "sem FK"
        integer quantity
        numeric unit_price
        numeric total_price
    }
    SAGA_INSTANCES {
        uuid service_order_id PK_FK
        saga_status status
        text current_step
        jsonb completed_steps
        timestamptz step_deadline_at "nulo"
        uuid quote_id "nulo, sem FK"
        uuid payment_id "nulo, sem FK"
    }
    PROCESSED_EVENTS {
        uuid event_id PK
        text consumer PK
        timestamptz handled_at
    }
    OUTBOX_MESSAGES {
        uuid event_id PK
        text event_type
        uuid correlation_id
        jsonb payload
        timestamptz published_at "nulo"
    }
```

`PROCESSED_EVENTS` e `OUTBOX_MESSAGES` são inbox/outbox: sem FK de domínio.
`completed_steps` lista o que já rodou — a compensação depende disso, não só de
`current_step`.

Status da OS: `RECEIVED`, `IN_DIAGNOSTIC`, `AWAITING_APPROVAL`, `AWAITING_PAYMENT`,
`IN_EXECUTION`, `COMPLETED`, `DELIVERED`, `CANCELED`.

Status da saga: `RUNNING`, `COMPENSATING`, `COMPLETED`, `FAILED`.
