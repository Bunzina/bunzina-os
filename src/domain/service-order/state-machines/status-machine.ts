import { ServiceOrderStatus } from '../types/service-order-status';

export enum StatusDirection {
  NEXT = 'next',
  BACK = 'back',
}

const statusTransitionMap: Record<
  ServiceOrderStatus,
  Partial<Record<StatusDirection, ServiceOrderStatus>>
> = {
  [ServiceOrderStatus.RECEIVED]: {
    [StatusDirection.NEXT]: ServiceOrderStatus.IN_DIAGNOSTIC,
  },
  [ServiceOrderStatus.IN_DIAGNOSTIC]: {
    [StatusDirection.NEXT]: ServiceOrderStatus.AWAITING_APPROVAL,
  },
  [ServiceOrderStatus.AWAITING_APPROVAL]: {
    [StatusDirection.NEXT]: ServiceOrderStatus.AWAITING_PAYMENT,
    [StatusDirection.BACK]: ServiceOrderStatus.RECEIVED,
  },
  [ServiceOrderStatus.AWAITING_PAYMENT]: {
    [StatusDirection.NEXT]: ServiceOrderStatus.IN_EXECUTION,
  },
  [ServiceOrderStatus.IN_EXECUTION]: {
    [StatusDirection.NEXT]: ServiceOrderStatus.COMPLETED,
  },
  [ServiceOrderStatus.COMPLETED]: {
    [StatusDirection.NEXT]: ServiceOrderStatus.DELIVERED,
  },
  [ServiceOrderStatus.DELIVERED]: {},
  [ServiceOrderStatus.CANCELED]: {},
};

export const determineStatusTransition = (
  currentStatus: ServiceOrderStatus,
  direction: StatusDirection,
): ServiceOrderStatus | undefined =>
  statusTransitionMap[currentStatus]?.[direction];
