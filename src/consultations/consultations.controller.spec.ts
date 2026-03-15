import { ConsultationsController } from './consultations.controller';

describe('ConsultationsController', () => {
  it('getQueue should return empty items', () => {
    const controller = new ConsultationsController();
    expect(controller.getQueue()).toEqual({ items: [] });
  });
});
