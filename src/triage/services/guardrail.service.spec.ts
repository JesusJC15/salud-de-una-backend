import { GuardrailService } from './guardrail.service';

describe('GuardrailService', () => {
  const service = new GuardrailService();

  it('detects diagnosis and prescription language in at least 10 unsafe samples', () => {
    const unsafeSamples = [
      'Se realiza diagnostico de migraña.',
      'El paciente padece de bronquitis.',
      'Tiene una neumonia adquirida.',
      'Presenta cuadro de gastroenteritis.',
      'Es compatible con influenza.',
      'Debe tomar ibuprofeno cada 8 horas.',
      'Se recomienda administrar antibiotico.',
      'Se debe recetar paracetamol.',
      'Es asma moderada.',
      'Sufre de hipertension arterial.',
    ];

    for (const text of unsafeSamples) {
      const result = service.check(text);
      expect(result.safe).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  it('classifies urgency-only summaries as safe', () => {
    const safeSamples = [
      'Prioridad alta por sintomas de alarma, acudir a urgencias hoy.',
      'Prioridad moderada, se recomienda valoracion medica en las proximas horas.',
      'Prioridad baja, continuar observacion y seguimiento de sintomas.',
    ];

    for (const text of safeSamples) {
      const result = service.check(text);
      expect(result).toEqual({ safe: true, violations: [] });
    }
  });

  it('returns safe for empty content', () => {
    expect(service.check('')).toEqual({ safe: true, violations: [] });
    expect(service.check('   ')).toEqual({ safe: true, violations: [] });
  });
});
