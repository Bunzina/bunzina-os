# Bunzina EKS — collection Bruno

Ambiente **Academy (EKS)** com os ALBs desta sessão. Workshop não tem ALB: rode o port-forward antes das requests da pasta `04-workshop`.

```bash
aws eks update-kubeconfig --name bunzina-eks --region us-east-1
kubectl port-forward -n bunzina svc/bunzina-workshop 3002:80
```

## Importar

1. Bruno → **Open Collection** → esta pasta (`docs/bruno`).
2. Selecione o ambiente **Academy**.
3. Ordem sugerida: `00-saude` → `01-auth` → `02-catalogo` → `03-os` → `04-workshop` → `05-billing`.

Passo a passo dos fluxos (feliz e falha): [FLUXOS.md](./FLUXOS.md).

## Demonstração (banca)

Use **duas OS**. Não misture o fluxo feliz com o de falha.

**Fluxo completo (saga feliz)**  
`02-catalogo` → `03-os/01-criar-ordem` → `04-workshop/01-concluir-diagnostico` → `05-billing/01-consultar-orcamento` → `05-billing/02-aprovar-orcamento` → pagar o `checkoutUrl` no sandbox MP → `04-workshop/02-concluir-execucao` → `03-os/05-entregar-ordem`.  
Entre cada passo, `03-os/03-buscar-ordem` para mostrar o status (`RECEIVED` → `IN_DIAGNOSTIC` → `AWAITING_APPROVAL` → `AWAITING_PAYMENT` → `IN_EXECUTION` → `COMPLETED` → `DELIVERED`).

**Tratamento de falhas (saga)** — escolha um, em OS separada:
- Diagnóstico: `04-workshop/03-falhar-diagnostico` (OS em `IN_DIAGNOSTIC`) → OS `CANCELED`
- Orçamento: `05-billing/03-recusar-orcamento` (OS em `AWAITING_APPROVAL`)
- Execução + estorno: `04-workshop/04-falhar-execucao` (OS em `IN_EXECUTION`, depois do pagamento)

Workshop: `kubectl port-forward -n bunzina svc/bunzina-workshop 3002:80`

Deploy e tracing **não** estão nesta collection: GitHub Actions (`deploy-k8s.yml`) e Grafana (`grafanaUrl`).

O login padrão usa o CUSTOMER criado no smoke test (`52998224725` / `exemplo123`). Cadastro de cliente, veículo, serviço e peça aceita JWT de CUSTOMER ou o header `Api-Key`.
