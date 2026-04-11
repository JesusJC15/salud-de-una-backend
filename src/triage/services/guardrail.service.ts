import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type GuardrailResult = {
  safe: boolean;
  violations: string[];
};

type GuardrailRuleCategory = {
  id: string;
  label: string;
  patterns: string[];
};

type GuardrailRulesCatalog = {
  version: string;
  categories: GuardrailRuleCategory[];
};

const GUARDRAIL_RULES_CANDIDATE_PATHS = [
  resolve(__dirname, '../rules/guardrail-rules.json'),
  resolve(process.cwd(), 'src/triage/rules/guardrail-rules.json'),
];

function loadGuardrailRules(): GuardrailRulesCatalog {
  const rulesPath = GUARDRAIL_RULES_CANDIDATE_PATHS.find((candidatePath) =>
    existsSync(candidatePath),
  );

  if (!rulesPath) {
    throw new Error('No se encontro el catalogo de reglas de guardrail');
  }

  const rulesRaw = readFileSync(rulesPath, 'utf-8');
  return JSON.parse(rulesRaw) as GuardrailRulesCatalog;
}

@Injectable()
export class GuardrailService {
  private readonly rulesCatalog = loadGuardrailRules();

  check(text: string): GuardrailResult {
    if (!text || text.trim().length === 0) {
      return { safe: true, violations: [] };
    }

    const violations: string[] = [];

    for (const category of this.rulesCatalog.categories) {
      for (const pattern of category.patterns) {
        const regex = new RegExp(pattern, 'iu');
        if (regex.test(text)) {
          violations.push(`${category.id}:${pattern}`);
        }
      }
    }

    return {
      safe: violations.length === 0,
      violations,
    };
  }
}
