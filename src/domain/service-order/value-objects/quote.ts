export class Quote {
  servicesTotal: number;
  autoPartsTotal: number;
  total: number;

  constructor(input: { servicesTotal: number; autoPartsTotal: number }) {
    if (input.servicesTotal < 0) {
      throw new Error('Services total cannot be negative');
    }

    if (input.autoPartsTotal < 0) {
      throw new Error('Auto parts total cannot be negative');
    }

    this.servicesTotal = input.servicesTotal;
    this.autoPartsTotal = input.autoPartsTotal;
    this.total = input.servicesTotal + input.autoPartsTotal;
  }
}
