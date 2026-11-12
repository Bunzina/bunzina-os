# language: pt
Funcionalidade: Orquestrar o ciclo de uma ordem de serviço
  Para coordenar diagnóstico, orçamento, pagamento e execução
  Como orquestrador da oficina
  Quero avançar a ordem e compensar etapas quando necessário

  Regra: A execução começa somente depois da confirmação do pagamento

    Cenário: Concluir uma ordem de serviço
      Dado que uma ordem iniciou o diagnóstico
      Quando a oficina conclui o diagnóstico
      Então Billing recebe o pedido de orçamento
      Quando Billing emite o orçamento
      E o cliente aprova o orçamento
      Então Billing recebe o pedido de cobrança
      Quando o pagamento é confirmado
      Então Workshop recebe o pedido de execução
      Quando Workshop conclui a execução
      Então a ordem fica concluída

  Regra: Recusar um orçamento é um desfecho válido sem compensação

    Cenário: Cliente recusa o orçamento
      Dado que uma ordem iniciou o diagnóstico
      Quando a oficina conclui o diagnóstico
      E o cliente recusa o orçamento
      Então a ordem volta a recebida sem compensação

  Regra: Uma cobrança recusada cancela o orçamento antes de encerrar a ordem

    Cenário: Pagamento não é confirmado
      Dado que o orçamento de uma ordem foi aprovado
      Quando Billing informa que o pagamento falhou
      Então Billing recebe o pedido de cancelamento do orçamento
      Quando Billing confirma o cancelamento do orçamento
      Então a ordem fica cancelada

  Regra: Uma falha no diagnóstico interrompe a ordem sem estorno

    Cenário: Diagnóstico não pode ser concluído
      Dado que uma ordem iniciou o diagnóstico
      Quando a oficina informa que o veículo não pode ser reparado
      Então Workshop recebe o pedido de aborto
      Quando Workshop confirma o aborto da execução
      Então a ordem fica cancelada

  Regra: Uma falha de execução aborta a oficina antes de estornar o pagamento

    Cenário: Estornar o pagamento após falha na execução
      Dado que o pagamento de uma ordem foi confirmado e a execução começou
      Quando a oficina informa que a execução falhou
      Então Workshop recebe o pedido de aborto
      Quando Workshop confirma o aborto da execução
      Então Billing recebe o pedido de estorno pelo valor pago
      Quando Billing confirma o estorno
      Então a ordem fica cancelada

  Regra: Uma etapa expirada inicia a compensação adequada

    Cenário: Expirar o prazo durante a execução
      Dado que o pagamento de uma ordem foi confirmado e a execução começou
      Quando o prazo da etapa atual expira
      Então o prazo dispara o aborto da execução na oficina

    Cenário: Expirar o prazo do orçamento
      Dado que Billing emitiu um orçamento para uma ordem
      Quando o prazo da etapa atual expira
      Então o prazo dispara o cancelamento do orçamento

    Cenário: Expirar o prazo do pagamento
      Dado que o orçamento de uma ordem foi aprovado
      Quando o prazo da etapa atual expira
      Então o prazo dispara o cancelamento do orçamento

