# Passo a passo — testar os fluxos no EKS

Collection Bruno desta pasta (`docs/bruno`), ambiente **Academy**.

Use **duas OS**: uma no fluxo feliz, outra só para falha. Não misture.

Status esperado da saga:

`RECEIVED` → `IN_DIAGNOSTIC` → `AWAITING_APPROVAL` → `AWAITING_PAYMENT` → `IN_EXECUTION` → `COMPLETED` → `DELIVERED`

---

## 0. Preparação

### Cluster

No WSL, com o lab da Academy ativo:

```bash
aws sts get-caller-identity
aws eks update-kubeconfig --name bunzina-eks --region us-east-1
kubectl get pods -n bunzina
```

Todos os deploys (`bunzina`, `bunzina-os`, `bunzina-billing`, `bunzina-workshop`) precisam estar `Running`.

### Workshop (sem ALB)

Deixe este comando **aberto** o tempo todo. Bruno no Windows precisa do `--address 0.0.0.0`:

```bash
kubectl port-forward --address 0.0.0.0 -n bunzina svc/bunzina-workshop 3002:80
```

### Bruno

1. **Open Collection** → pasta `docs/bruno`.
2. Ambiente **Academy** (canto superior direito).
3. Se cliente/placa/e-mail do ambiente já existirem (409), mude no Academy:
   - `customerDocument` (CPF válido)
   - `customerEmail`
   - `licensePlate` (Mercosul `ABC1D23` ou antiga `ABC1234`)

Variáveis que a collection **grava sozinha** depois do request: `token`, `userId`, `customerId`, `vehicleId`, `serviceId`, `autoPartId`, `serviceOrderId`.

O **`quoteId` não vem na API da OS**. Depois do diagnóstico, copie do Postgres (passo 1.6).

---

## 1. Fluxo feliz (OS completa)

### 1.1 Saúde

Rode, nesta ordem, a pasta `00-saude`:

| Request | Esperado |
|---|---|
| Catalog / OS / Billing health e ready | `200` |
| Workshop health e ready | `200` (senão o port-forward não está no ar) |
| Grafana login page | `200` |

### 1.2 Login

Pasta `01-auth`:

1. **Login** — `52998224725` / `exemplo123` → `200` e `token` no ambiente.
2. Se der `401`, rode **Criar cliente publico** e faça login com `userDocument` / `userPassword`.

Não precisa de admin: CUSTOMER consegue criar catálogo.

### 1.3 Catálogo

Pasta `02-catalogo`, na ordem:

1. **Criar cliente** → `201` (`customerId`)
2. **Criar veiculo** → `201` (`vehicleId`)
3. **Criar servico** → `201` (`serviceId`) — preço `15000` centavos
4. **Criar peca** → `201` (`autoPartId`) — `4500` centavos, estoque `10`

Se `401`, o `token` expirou: rode Login de novo.  
Se `409`, mude documento/placa/e-mail no ambiente e repita.

### 1.4 Criar a OS

Pasta `03-os`:

1. **Criar ordem** → `201`, status `RECEIVED`, grava `serviceOrderId`.
2. Espere ~2 s.
3. **Buscar ordem** → `200`, status **`IN_DIAGNOSTIC`** (RabbitMQ entregou `cmd.workshop.start-diagnostic`).

Se a criação voltar *Catalog service is unavailable*, o OS não está falando com o catálogo (`CATALOG_SERVICE_URL` / API key). Não avance.

### 1.5 Diagnóstico (workshop)

Pasta `04-workshop`:

1. Confirme `00-saude` → **Workshop health** = `200`.
2. **Concluir diagnostico** → `200`, `"status": "DIAGNOSED"`.
3. **Buscar ordem** → **`AWAITING_APPROVAL`**.

### 1.6 Pegar o `quoteId`

O Billing emite o orçamento no evento `evt.workshop.diagnostic-completed`. Não tem listagem HTTP. No WSL:

```bash
kubectl exec -n bunzina deploy/bunzina-billing-postgres -- sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT id, status, service_order_id FROM bunzina.quotes ORDER BY created_at DESC LIMIT 5;"'
```

A linha cujo `service_order_id` é o `serviceOrderId` do Bruno é o orçamento. Cole o `id` em **Academy → quoteId**.

Espere 2–3 s depois do diagnóstico se a tabela ainda estiver vazia.

### 1.7 Orçamento e pagamento

Pasta `05-billing`:

1. **Consultar orcamento** → `200`, `ISSUED`, total `19500` (R$ 195,00). Header `X-Customer-Document` = `customerDocument`.
2. **Aprovar orcamento** → `200`, `APPROVED`.
3. **Buscar ordem** → **`AWAITING_PAYMENT`**.
4. **Consultar orcamento** de novo → campo `checkoutUrl`.
5. Abra o `checkoutUrl` no **sandbox do Mercado Pago** e pague.

Sem esse pagamento a OS **não** sai de `AWAITING_PAYMENT`. O webhook público já está no ALB do billing (`/webhooks/mercadopago`). O request **Webhook Mercado Pago** da collection só funciona com `webhookSecret` + `merchantOrderId` reais do sandbox; o caminho simples é pagar no checkout e deixar o MP chamar o webhook.

6. **Buscar ordem** até **`IN_EXECUTION`**.

### 1.8 Execução e entrega

1. `04-workshop` → **Concluir execucao** → `200`. Quando todos os serviços terminam, publica `evt.workshop.execution-completed`.
2. **Buscar ordem** → **`COMPLETED`**.
3. `03-os` → **Entregar ordem** (`direction: next`) → `200`, **`DELIVERED`**.

Entregar antes de `COMPLETED` = `409` *Only completed service orders can be delivered* (esperado).

---

## 2. Fluxo de falha (saga + compensação)

Crie **outra** OS (passos 1.3–1.4 de novo; mude placa/documento se der 409). Escolha **um** cenário.

### 2.A Falha no diagnóstico

Pré-requisito: OS em `IN_DIAGNOSTIC`.

1. `04-workshop` → **Falhar diagnostico** (`UNREPAIRABLE`).
2. **Buscar ordem** → **`CANCELED`**.
3. Não deve nascer orçamento (ou o existente não segue).

### 2.B Recusar orçamento

Pré-requisito: diagnóstico ok, OS em `AWAITING_APPROVAL`, `quoteId` preenchido.

1. `05-billing` → **Recusar orcamento** (`REJECTED`).
2. **Consultar orcamento** → `REJECTED`.
3. **Buscar ordem** — não avança para `AWAITING_PAYMENT`.

### 2.C Falha na execução (estorno)

Pré-requisito: fluxo feliz até `IN_EXECUTION` (pagamento confirmado). **Não** rode **Concluir execucao**.

1. `04-workshop` → **Falhar execucao** (`PART_UNAVAILABLE`).
2. A saga publica `evt.workshop.execution-failed`; o OS pede compensação no billing (cancelar/estornar).
3. **Buscar ordem** → `CANCELED`.

---

## 3. Deploy e observabilidade

**Deploy:** GitHub Actions, workflow `deploy-k8s.yml` (build, testes, Helm).

**Tracing:** Grafana (`grafanaUrl` no Academy). Loki = logs, Tempo = traces, Prometheus = métricas. Correlacionar pelo `serviceOrderId`.

---

## 4. Problemas comuns

| Sintoma | Causa | O que fazer |
|---|---|---|
| Workshop `ECONNREFUSED 127.0.0.1:3002` | Sem port-forward, ou só no loopback do WSL | `kubectl port-forward --address 0.0.0.0 -n bunzina svc/bunzina-workshop 3002:80` |
| Criar ordem: *Catalog service is unavailable* | OS sem URL/API key do catálogo | Conferir env do deploy `bunzina-os`; não avance a saga |
| Login `401` | Usuário não existe / senha | **Criar cliente publico** + Login |
| Catálogo `401` | Sem JWT | Rode **Login** de novo |
| Catálogo `409` | CPF/placa/e-mail repetidos | Troque as vars no Academy |
| Entregar = `409` | OS ainda não está `COMPLETED` | Falta pagamento e/ou **Concluir execucao** |
| Sem `quoteId` | Diagnóstico não rodou ou billing atrasou | Espere 3 s e consulte o Postgres (passo 1.6) |
| Trava em `AWAITING_PAYMENT` | Mercado Pago não confirmou | Pague o `checkoutUrl` no sandbox |

---

## Ordem rápida (checklist)

Fluxo feliz:

1. Port-forward workshop  
2. `00-saude`  
3. Login  
4. Criar cliente → veículo → serviço → peça  
5. Criar ordem → buscar (`IN_DIAGNOSTIC`)  
6. Concluir diagnostico → buscar (`AWAITING_APPROVAL`)  
7. Copiar `quoteId` do Postgres  
8. Consultar + aprovar orçamento → buscar (`AWAITING_PAYMENT`)  
9. Pagar checkout sandbox → buscar (`IN_EXECUTION`)  
10. Concluir execucao → buscar (`COMPLETED`)  
11. Entregar ordem (`DELIVERED`)

Falha (OS nova): **Falhar diagnostico**, ou **Recusar orcamento**, ou **Falhar execucao**.
