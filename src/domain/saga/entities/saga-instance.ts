import { SagaStatus } from '../types/saga-status';
import { SagaStep } from '../types/saga-step';

export interface SagaInstanceProps {
  serviceOrderId: string;
  status: SagaStatus;
  currentStep: SagaStep;
  completedSteps?: SagaStep[];
  stepDeadlineAt?: Date;
  lastError?: string;
  quoteId?: string;
  paymentId?: string;
  paymentAmountCents?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class SagaInstance {
  serviceOrderId: string;
  status: SagaStatus;
  currentStep: SagaStep;
  completedSteps: SagaStep[];
  stepDeadlineAt?: Date;
  lastError?: string;
  quoteId?: string;
  paymentId?: string;
  paymentAmountCents?: number;
  createdAt: Date;
  updatedAt: Date;

  constructor({
    serviceOrderId,
    status,
    currentStep,
    completedSteps = [],
    stepDeadlineAt,
    lastError,
    quoteId,
    paymentId,
    paymentAmountCents,
    createdAt = new Date(),
    updatedAt = new Date(),
  }: SagaInstanceProps) {
    this.serviceOrderId = serviceOrderId;
    this.status = status;
    this.currentStep = currentStep;
    this.completedSteps = [...completedSteps];
    this.stepDeadlineAt = stepDeadlineAt;
    this.lastError = lastError;
    this.quoteId = quoteId;
    this.paymentId = paymentId;
    this.paymentAmountCents = paymentAmountCents;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  completeStep(step: SagaStep, nextStep: SagaStep): void {
    if (!this.completedSteps.includes(step)) {
      this.completedSteps.push(step);
    }

    this.currentStep = nextStep;
    this.updatedAt = new Date();
  }

  startCompensation(reason: string): void {
    this.status = SagaStatus.COMPENSATING;
    this.lastError = reason;
    this.updatedAt = new Date();
  }

  complete(): void {
    this.status = SagaStatus.COMPLETED;
    this.updatedAt = new Date();
  }

  fail(reason: string): void {
    this.status = SagaStatus.FAILED;
    this.lastError = reason;
    this.updatedAt = new Date();
  }

  setQuote(quoteId: string): void {
    this.quoteId = quoteId;
    this.updatedAt = new Date();
  }

  setPayment(paymentId: string, amountCents: number): void {
    this.paymentId = paymentId;
    this.paymentAmountCents = amountCents;
    this.updatedAt = new Date();
  }
}
