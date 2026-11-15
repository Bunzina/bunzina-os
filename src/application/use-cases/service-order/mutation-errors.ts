export class ServiceOrderMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceOrderMutationConflictError';
  }
}
