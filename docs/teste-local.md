# Testar o `bunzina-os` localmente

Pré-requisitos: Bun 1.4.4 e Docker Desktop em execução.

## 1. Rodar a suíte local

No terminal, dentro da pasta `bunzina-os`:

```bash
bun install
bun test
```

Para rodar também com o limite de cobertura usado no CI:

```bash
bun run test:ci
```

Os cenários da Saga usam repositórios em memória e simulam eventos de Billing e
Workshop; não é preciso subir esses serviços.

## 2. Subir a API e suas dependências

Em outro terminal, dentro de `bunzina-os`:

```bash
docker compose up --build -d db rabbitmq
docker compose run --build --rm app bun run migration
docker compose up --build app
```

Confira no navegador:

- API: <http://localhost:3000/health>
- Banco pronto: <http://localhost:3000/ready>
- Swagger: <http://localhost:3000/swagger>

Para encerrar, pressione `Ctrl+C` e rode `docker compose down`.

## Primeiro fluxo integrado: OS → Workshop

O objetivo é criar uma OS pela API e confirmar que o Workshop recebeu o comando
`cmd.workshop.start-diagnostic`. Billing ainda não participa deste primeiro teste.

Para isso, os dois serviços precisam usar o mesmo RabbitMQ. A configuração padrão de
cada `docker-compose.yml` sobe um broker separado; o Workshop deve apontar para o broker
do `bunzina-os`. O Workshop também precisa de MongoDB. Para este teste local, use o
MongoDB do Docker Compose do Workshop; o link do Atlas não é necessário. O `MONGODB_URI`
é configuração do `bunzina-workshop`; o `bunzina-os` usa PostgreSQL.

No Cadastros (`bunzina`), crie ou reutilize:

1. Um cliente.
2. Um veículo vinculado ao cliente.
3. Um serviço ativo para incluir na OS.

Não é necessário criar um usuário para a OS. As rotas protegidas do Cadastros podem ser
acessadas com o `Api-Key` de serviço configurado no Cadastros. Use a mesma chave em
`CATALOG_SERVICE_API_KEY` no OS.

Use os IDs retornados para enviar `POST /service-orders` ao OS com `customerId`,
`vehicleId` e pelo menos um item em `serviceItems` (com `serviceId` e `price`). A
confirmação esperada é um registro da OS no Mongo do Workshop, em `execution_queue`, com
o mesmo `serviceOrderId` e status `IN_DIAGNOSTIC`.

O cliente REST do OS busca o cliente por UUID em `GET /customers/id/{customerId}`.
Essa rota foi adicionada ao Cadastros para manter a busca existente por documento sem
alterar seu contrato. O fluxo integrado ainda precisa ser executado localmente para
confirmar o consumo do comando pelo Workshop.

Depois que Billing estiver pronto, o teste poderá continuar pelo orçamento, pagamento,
execução e pelos cenários de compensação.
