# Testar a criação de OS com o Workshop

Este fluxo usa os containers locais de Cadastros, `bunzina-os` e Workshop. As portas
ficam em `3000` (Cadastros), `3001` (OS) e `3002` (Workshop). O RabbitMQ compartilhado
é o do `bunzina-os`; o MongoDB local pertence ao Workshop. Não precisa do Atlas nem do
Billing.

## 1. Subir Cadastros

No PowerShell, no diretório `bunzina`:

```powershell
docker compose up --build -d
```

## 2. Subir a OS e o RabbitMQ compartilhado

No diretório `bunzina-os`:

```powershell
docker compose up --build -d db rabbitmq
docker compose run --build --rm app bun run migration
docker compose up --build -d app
```

## 3. Subir o Workshop

No diretório `bunzina-workshop`:

```powershell
docker compose --env-file compose.integration.env run --build --rm app bun run ensure-indexes
docker compose --env-file compose.integration.env up --build -d mongo rabbitmq app
```

O arquivo `compose.integration.env` conecta o Workshop ao RabbitMQ do `bunzina-os`. O RabbitMQ
próprio do Workshop fica em `5673` e não é usado nesse fluxo.

Confirme que as APIs estão prontas:

```powershell
curl.exe http://localhost:3000/health
curl.exe http://localhost:3001/health
curl.exe http://localhost:3002/health
```

## 4. Criar os dados de teste

Cadastros usa a chave local `local-dev-catalog-key`. Os endpoints abaixo retornam o
objeto criado diretamente; copie o `id` de cada resposta para o próximo comando. Se já
tiver cliente, veículo e serviço, pode reutilizar os IDs.

```powershell
curl.exe -X POST http://localhost:3000/customers `
  -H "Api-Key: local-dev-catalog-key" `
  -H "Content-Type: application/json" `
  --data-raw '{"name":"Ana Souza","document":"52998224725","email":"ana.local@example.com","phone":"+5511999999999","address":{"street":"Rua das Flores","number":"42","city":"São Paulo","state":"SP","zipCode":"01310-100","neighborhood":"Centro"}}'
```

```powershell
curl.exe -X POST http://localhost:3000/vehicles `
  -H "Api-Key: local-dev-catalog-key" `
  -H "Content-Type: application/json" `
  --data-raw '{"customerId":"<CUSTOMER_ID>","licensePlate":"ABC1D23","model":"Gol","brand":"Volkswagen","year":2022}'
```

```powershell
curl.exe -X POST http://localhost:3000/services `
  -H "Api-Key: local-dev-catalog-key" `
  -H "Content-Type: application/json" `
  --data-raw '{"name":"Revisão básica","description":"Revisão para teste local","price":150,"durationInMinutes":60}'
```

Troque `<CUSTOMER_ID>` pelo ID do cliente retornado. Copie também os IDs de veículo e
serviço para o próximo comando.

## 5. Criar a OS

```powershell
curl.exe -X POST http://localhost:3001/service-orders `
  -H "Content-Type: application/json" `
  --data-raw '{"customerId":"<CUSTOMER_ID>","vehicleId":"<VEHICLE_ID>","serviceItems":[{"serviceId":"<SERVICE_ID>","price":150,"description":"Revisão básica"}]}'
```

Substitua os três IDs pelos valores retornados por Cadastros. A criação deve retornar
`201` e um `id` para a OS. Para confirmar o recebimento pelo Workshop, consulte o Mongo:

```powershell
$osId = "<OS_ID>"
docker compose --env-file compose.integration.env exec -e "OS_ID=$osId" mongo mongosh -u bun -p bun --authenticationDatabase admin bunzina-workshop --eval 'db.execution_queue.findOne({serviceOrderId: process.env.OS_ID})'
```

O documento deve aparecer com status `IN_DIAGNOSTIC`. `<OS_ID>` é o ID retornado pela OS.

## 6. Concluir o diagnóstico e verificar o retorno à OS

Use uma OS nova e faça este passo antes do timeout de cinco minutos. A OS que já está
`ABORTED` não pode avançar. Reutilize `$osId` definido no passo anterior.

Envie o diagnóstico ao Workshop. Use o ID do serviço retornado por Cadastros e o preço
em centavos:

```powershell
curl.exe -X PATCH "http://localhost:3002/diagnostics/$osId" `
  -H "Content-Type: application/json" `
  --data-raw '{"diagnosedItems":{"services":[{"serviceId":"<SERVICE_ID>","description":"Revisão básica","priceCents":15000}],"autoParts":[]},"diagnosedBy":"Mecânico de teste","notes":"Diagnóstico concluído"}'
```

A resposta do Workshop deve indicar que o diagnóstico foi concluído. Em seguida, consulte
a OS:

```powershell
curl.exe "http://localhost:3001/service-orders/$osId"
```

Ela deve avançar para `AWAITING_APPROVAL` e publicar o pedido de cotação. O fluxo para
nesse ponto porque o Billing ainda não está integrado.

## Encerrar

Em cada projeto, rode `docker compose down`. No Workshop, use o mesmo argumento
`--env-file compose.integration.env`.
