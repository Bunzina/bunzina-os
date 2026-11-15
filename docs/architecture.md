# Arquitetura geral

O `bunzina-os` é o orquestrador. Este diagrama é a visão da solução completa:
quatro serviços, cada um com banco próprio, e RabbitMQ como único broker.
Nenhum serviço acessa o banco de outro.

```mermaid
flowchart LR
  Cliente(["Cliente / Bruno"])
  APIGW["API Gateway + Lambda<br/>POST /auth/login"]
  ALB["ALB público"]

  subgraph eks["EKS · namespace bunzina"]
    CAT["bunzina<br/>cadastros e auth"]
    OS["bunzina-os<br/>OS + orquestrador"]
    BILL["bunzina-billing<br/>orçamento e pagamento"]
    WS["bunzina-workshop<br/>diagnóstico e execução"]
    RMQ["RabbitMQ"]
    PGC[("PostgreSQL<br/>cadastros")]
    PGO[("PostgreSQL<br/>OS + saga")]
    PGB[("PostgreSQL<br/>billing")]
  end

  ATLAS[("MongoDB Atlas<br/>workshop")]
  GRAF["Grafana / Tempo / Loki"]

  Cliente -->|"login"| APIGW
  APIGW -->|"HTTP"| CAT
  Cliente --> ALB
  ALB --> CAT
  ALB --> OS
  ALB --> BILL
  OS -->|"REST Api-Key<br/>cliente, veículo, serviço, peça"| CAT
  OS -->|"cmd.*"| RMQ
  RMQ -->|"cmd.*"| BILL
  RMQ -->|"cmd.*"| WS
  BILL -->|"evt.*"| RMQ
  WS -->|"evt.*"| RMQ
  RMQ -->|"evt.*"| OS
  CAT --> PGC
  OS --> PGO
  BILL --> PGB
  WS --> ATLAS
  CAT -.-> GRAF
  OS -.-> GRAF
  BILL -.-> GRAF
  WS -.-> GRAF
```

O workshop **não tem Ingress/ALB**. Na demonstração:
`kubectl port-forward -n bunzina svc/bunzina-workshop 3002:80`.

## Comunicação

| De | Para | Como | Quando |
| --- | --- | --- | --- |
| Cliente | `bunzina` | HTTP no ALB (JWT ou `Api-Key`) | Cadastros e login |
| Cliente | `bunzina-os` | HTTP no ALB | CRUD da OS e entrega |
| Cliente | `bunzina-billing` | HTTP no ALB | Consultar/aprovar orçamento, webhook MP |
| Mecânico | `bunzina-workshop` | HTTP ClusterIP | Diagnóstico e execução |
| `bunzina-os` | `bunzina` | HTTP síncrono + `Api-Key` | Validar cliente/veículo/serviço/peça na criação da OS |
| `bunzina-os` | Billing / Workshop | RabbitMQ, `cmd.*` | Cada passo da saga |
| Billing / Workshop | `bunzina-os` | RabbitMQ, `evt.*` | Resultado de cada passo |

Só este serviço publica comandos. Participantes só publicam eventos. O
`serviceOrderId` é o `correlationId` de todas as mensagens.

Justificativa da saga: [README](../README.md#por-que-saga-orquestrada).
Sequências: [saga-orchestration.md](./saga-orchestration.md).
Bancos: [database.md](./database.md).
