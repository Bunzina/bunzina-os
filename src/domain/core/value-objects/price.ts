export class Price {
  value: number;

  constructor(value: number) {
    if (value < 0) {
      throw new Error('Price cannot be negative');
    }

    this.value = Number(value);
  }
}
