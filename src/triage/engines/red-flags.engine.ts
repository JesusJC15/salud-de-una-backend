import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Specialty } from '../../common/enums/specialty.enum';
import {
  RedFlag,
  TriageAnswer,
  TriageRedFlagSeverity,
} from '../schemas/triage-session.schema';

type RuleGroup = {
  anyOf: string[];
};

type MgRule = {
  code: string;
  severity: TriageRedFlagSeverity;
  evidence: string;
  questionScope?: string[];
  allOf: RuleGroup[];
};

type MgCatalog = {
  version: string;
  specialty: Specialty;
  rules: MgRule[];
};

const CATALOG_CANDIDATE_PATHS = [
  resolve(__dirname, '../rules/red-flags-mg.json'),
  resolve(process.cwd(), 'src/triage/rules/red-flags-mg.json'),
];

function loadMgCatalog(): MgCatalog {
  const catalogPath = CATALOG_CANDIDATE_PATHS.find((candidatePath) =>
    existsSync(candidatePath),
  );

  if (!catalogPath) {
    throw new Error(
      'No se encontro el catalogo de red flags de Medicina General',
    );
  }

  const catalogRaw = readFileSync(catalogPath, 'utf-8');
  return JSON.parse(catalogRaw) as MgCatalog;
}

function normalizeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'si' : 'no';
  }

  return '';
}

function evaluateCatalogRule(rule: MgRule, answers: TriageAnswer[]): boolean {
  const scopedAnswers =
    rule.questionScope && rule.questionScope.length > 0
      ? answers.filter((answer) =>
          rule.questionScope!.includes(answer.questionId),
        )
      : answers;

  const normalizedValues = scopedAnswers
    .map((answer) => normalizeValue(answer.answerValue))
    .filter((value) => value.length > 0);

  if (normalizedValues.length === 0) {
    return false;
  }

  return rule.allOf.every((group) =>
    group.anyOf.some((pattern) => {
      const regex = new RegExp(pattern, 'iu');
      return normalizedValues.some((value) => regex.test(value));
    }),
  );
}

export class RedFlagsEngine {
  private static readonly mgCatalog = loadMgCatalog();

  static evaluate(answers: TriageAnswer[], specialty: Specialty): RedFlag[] {
    if (specialty === Specialty.GENERAL_MEDICINE) {
      const matches = this.mgCatalog.rules
        .filter((rule) => evaluateCatalogRule(rule, answers))
        .map<RedFlag>((rule) => ({
          code: rule.code,
          specialty,
          severity: rule.severity,
          evidence: rule.evidence,
        }));

      return this.deduplicateByCode(matches);
    }

    if (specialty === Specialty.ODONTOLOGY) {
      return this.deduplicateByCode(this.evaluateOdontology(answers));
    }

    return [];
  }

  private static evaluateOdontology(answers: TriageAnswer[]): RedFlag[] {
    const redFlags: RedFlag[] = [];

    if (this.isAffirmative(this.getAnswerValue(answers, 'OD-Q4'))) {
      redFlags.push({
        code: 'RF-OD-001',
        specialty: Specialty.ODONTOLOGY,
        severity: 'WARNING',
        evidence: 'Paciente reporta inflamacion facial o sangrado',
      });
    }

    const intensity = this.toNumber(this.getAnswerValue(answers, 'OD-Q3'));
    if (intensity >= 8) {
      redFlags.push({
        code: 'RF-OD-002',
        specialty: Specialty.ODONTOLOGY,
        severity: 'WARNING',
        evidence: `Dolor dental severo reportado: ${intensity}/10`,
      });
    }

    if (this.isAffirmative(this.getAnswerValue(answers, 'OD-Q5'))) {
      redFlags.push({
        code: 'RF-OD-003',
        specialty: Specialty.ODONTOLOGY,
        severity: 'INFO',
        evidence: 'Paciente reporta sensibilidad termica dental',
      });
    }

    return redFlags;
  }

  private static getAnswerValue(
    answers: TriageAnswer[],
    questionId: string,
  ): unknown {
    return answers.find((answer) => answer.questionId === questionId)
      ?.answerValue;
  }

  private static isAffirmative(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    return ['si', 'sí', 'yes', 'true', '1'].includes(normalized);
  }

  private static toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  private static deduplicateByCode(flags: RedFlag[]): RedFlag[] {
    const seen = new Set<string>();
    return flags.filter((flag) => {
      if (seen.has(flag.code)) {
        return false;
      }
      seen.add(flag.code);
      return true;
    });
  }
}
