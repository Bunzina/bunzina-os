import { describe, expect, test } from 'bun:test';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { determineStatusTransition, StatusDirection } from './status-machine';

describe('service order status machine', () => {
  const cases: Array<
    [ServiceOrderStatus, StatusDirection, ServiceOrderStatus | undefined]
  > = [
    [
      ServiceOrderStatus.RECEIVED,
      StatusDirection.NEXT,
      ServiceOrderStatus.IN_DIAGNOSTIC,
    ],
    [
      ServiceOrderStatus.IN_DIAGNOSTIC,
      StatusDirection.NEXT,
      ServiceOrderStatus.AWAITING_APPROVAL,
    ],
    [
      ServiceOrderStatus.AWAITING_APPROVAL,
      StatusDirection.NEXT,
      ServiceOrderStatus.AWAITING_PAYMENT,
    ],
    [
      ServiceOrderStatus.AWAITING_APPROVAL,
      StatusDirection.BACK,
      ServiceOrderStatus.RECEIVED,
    ],
    [
      ServiceOrderStatus.AWAITING_PAYMENT,
      StatusDirection.NEXT,
      ServiceOrderStatus.IN_EXECUTION,
    ],
    [
      ServiceOrderStatus.IN_EXECUTION,
      StatusDirection.NEXT,
      ServiceOrderStatus.COMPLETED,
    ],
    [
      ServiceOrderStatus.COMPLETED,
      StatusDirection.NEXT,
      ServiceOrderStatus.DELIVERED,
    ],
    [ServiceOrderStatus.DELIVERED, StatusDirection.NEXT, undefined],
    [ServiceOrderStatus.RECEIVED, StatusDirection.BACK, undefined],
    [ServiceOrderStatus.CANCELED, StatusDirection.NEXT, undefined],
    [ServiceOrderStatus.CANCELED, StatusDirection.BACK, undefined],
  ];

  test.each(cases)(
    'should return %s when %s from %s',
    (currentStatus, direction, expected) => {
      expect(determineStatusTransition(currentStatus, direction)).toBe(
        expected,
      );
    },
  );
});
