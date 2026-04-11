import { Injectable } from '@nestjs/common';
import { Specialty } from '../../common/enums/specialty.enum';

export const TRIAGE_QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'NUMERIC_SCALE',
] as const;

export type TriageQuestionType = (typeof TRIAGE_QUESTION_TYPES)[number];

export type TriageQuestionOption = {
  id: string;
  label: string;
  description?: string;
};

export type TriageQuestion = {
  id: string;
  questionId: string;
  title: string;
  questionText: string;
  description?: string;
  type: TriageQuestionType;
  options?: TriageQuestionOption[];
  minValue?: number;
  maxValue?: number;
  step?: number;
};

@Injectable()
export class TriageQuestionsRepository {
  private readonly catalog: Record<Specialty, readonly TriageQuestion[]> = {
    [Specialty.GENERAL_MEDICINE]: [
      {
        id: 'MG-Q1',
        questionId: 'MG-Q1',
        title: 'Sintoma principal',
        questionText: 'Que sintoma principal presentas hoy?',
        description: 'Selecciona el sintoma que describe mejor tu situacion.',
        type: 'SINGLE_CHOICE',
        options: [
          {
            id: 'MG-Q1-HEADACHE',
            label: 'Dolor de cabeza',
          },
          {
            id: 'MG-Q1-FEVER',
            label: 'Fiebre',
          },
          {
            id: 'MG-Q1-COUGH',
            label: 'Tos',
          },
          {
            id: 'MG-Q1-CHEST_PAIN',
            label: 'Dolor en el pecho',
            description: 'Si es intenso o repentino, requiere atencion pronta.',
          },
          {
            id: 'MG-Q1-OTHER',
            label: 'Otro',
          },
        ],
      },
      {
        id: 'MG-Q2',
        questionId: 'MG-Q2',
        title: 'Tiempo de evolucion',
        questionText: 'Desde cuando presentas el sintoma principal?',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'MG-Q2-LESS_24H', label: 'Menos de 24 horas' },
          { id: 'MG-Q2-1_3_DAYS', label: 'Entre 1 y 3 dias' },
          { id: 'MG-Q2-4_7_DAYS', label: 'Entre 4 y 7 dias' },
          { id: 'MG-Q2-MORE_WEEK', label: 'Mas de una semana' },
        ],
      },
      {
        id: 'MG-Q3',
        questionId: 'MG-Q3',
        title: 'Intensidad de sintomas',
        questionText: 'En una escala de 0 a 10, cual es la intensidad?',
        description: '0 es sin molestia y 10 es la maxima intensidad.',
        type: 'NUMERIC_SCALE',
        minValue: 0,
        maxValue: 10,
        step: 1,
      },
      {
        id: 'MG-Q4',
        questionId: 'MG-Q4',
        title: 'Fiebre o escalofrios',
        questionText: 'Presentas fiebre o escalofrios?',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'MG-Q4-YES', label: 'Si' },
          { id: 'MG-Q4-NO', label: 'No' },
        ],
      },
      {
        id: 'MG-Q5',
        questionId: 'MG-Q5',
        title: 'Signos de alarma respiratorios',
        questionText: 'Tienes dificultad para respirar o dolor en el pecho?',
        type: 'MULTI_CHOICE',
        options: [
          {
            id: 'MG-Q5-DYSPNEA',
            label: 'Dificultad para respirar',
          },
          {
            id: 'MG-Q5-CHEST_PAIN',
            label: 'Dolor en el pecho',
          },
          {
            id: 'MG-Q5-NONE',
            label: 'Ninguno',
          },
        ],
      },
    ],
    [Specialty.ODONTOLOGY]: [
      {
        id: 'OD-Q1',
        questionId: 'OD-Q1',
        title: 'Zona de molestia dental',
        questionText: 'Donde sientes la molestia dental principal?',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'OD-Q1-UPPER', label: 'Parte superior' },
          { id: 'OD-Q1-LOWER', label: 'Parte inferior' },
          { id: 'OD-Q1-JAW', label: 'Mandibula o encia' },
          { id: 'OD-Q1-GENERAL', label: 'Toda la boca' },
        ],
      },
      {
        id: 'OD-Q2',
        questionId: 'OD-Q2',
        title: 'Inicio del dolor',
        questionText: 'Desde cuando inicio el dolor dental?',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'OD-Q2-LESS_24H', label: 'Menos de 24 horas' },
          { id: 'OD-Q2-1_3_DAYS', label: 'Entre 1 y 3 dias' },
          { id: 'OD-Q2-4_7_DAYS', label: 'Entre 4 y 7 dias' },
          { id: 'OD-Q2-MORE_WEEK', label: 'Mas de una semana' },
        ],
      },
      {
        id: 'OD-Q3',
        questionId: 'OD-Q3',
        title: 'Intensidad del dolor dental',
        questionText:
          'En una escala de 0 a 10, cual es la intensidad del dolor?',
        type: 'NUMERIC_SCALE',
        minValue: 0,
        maxValue: 10,
        step: 1,
      },
      {
        id: 'OD-Q4',
        questionId: 'OD-Q4',
        title: 'Signos inflamatorios',
        questionText: 'Presentas inflamacion facial o sangrado?',
        type: 'MULTI_CHOICE',
        options: [
          { id: 'OD-Q4-INFLAMMATION', label: 'Inflamacion facial' },
          { id: 'OD-Q4-BLEEDING', label: 'Sangrado' },
          { id: 'OD-Q4-NONE', label: 'Ninguno' },
        ],
      },
      {
        id: 'OD-Q5',
        questionId: 'OD-Q5',
        title: 'Desencadenantes termicos',
        questionText: 'El dolor empeora al comer frio o caliente?',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'OD-Q5-YES', label: 'Si' },
          { id: 'OD-Q5-NO', label: 'No' },
        ],
      },
    ],
  };

  getQuestionsBySpecialty(specialty: Specialty): TriageQuestion[] {
    return this.catalog[specialty].map((question) => this.cloneQuestion(question));
  }

  getQuestionById(
    specialty: Specialty,
    questionId: string,
  ): TriageQuestion | undefined {
    const question = this.catalog[specialty].find(
      (item) => item.questionId === questionId,
    );

    return question ? this.cloneQuestion(question) : undefined;
  }

  isQuestionValid(specialty: Specialty, questionId: string): boolean {
    return Boolean(this.getQuestionById(specialty, questionId));
  }

  getRequiredQuestionIds(specialty: Specialty): string[] {
    return this.catalog[specialty].map((question) => question.questionId);
  }

  private cloneQuestion(question: TriageQuestion): TriageQuestion {
    return {
      ...question,
      options: question.options?.map((option) => ({ ...option })),
    };
  }
}
