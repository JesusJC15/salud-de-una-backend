import { ConsultationsController } from './consultations.controller';

describe('ConsultationsController', () => {
  it('getQueue should return empty items', () => {
    const controller = new ConsultationsController({
      getQueue: jest.fn().mockReturnValue({ items: [] }),
    } as never);

    expect(controller.getQueue()).toEqual({ items: [] });
  });
});
