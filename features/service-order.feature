# language: pt
Funcionalidade: Abrir uma ordem de serviço
  Para iniciar o atendimento de um veículo
  Como cliente da oficina
  Quero registrar os serviços e peças solicitados

  Regra: A ordem começa recebida e apresenta um orçamento preliminar

    Cenário: Calcular o orçamento preliminar dos itens informados
      Dado que o cliente e o veículo são conhecidos pelo catálogo
      Quando o cliente abre uma ordem com um serviço de 150 reais e uma peça de 2 unidades a 50 reais cada
      Então a ordem fica recebida com orçamento preliminar de 250 reais

