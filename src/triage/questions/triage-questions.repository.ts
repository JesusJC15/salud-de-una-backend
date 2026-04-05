import { Injectable } from '@nestjs/common';
import { Specialty } from '../../common/enums/specialty.enum';

export type TriageQuestion = {
  questionId: string;
  questionText: string;
};

@Injectable()
export class TriageQuestionsRepository {
  private readonly catalog: Record<Specialty, readonly TriageQuestion[]> = {
    [Specialty.GENERAL_MEDICINE]: [
      {
        questionId: 'MG-Q1',
        questionText: 'Que sintoma principal presentas hoy?',
      },
      {
        questionId: 'MG-Q2',
        questionText: 'Desde cuando presentas el sintoma principal?',
      },
      {
        questionId: 'MG-Q3',
        questionText: 'En una escala de 0 a 10, cual es la intensidad?',
      },
      {
        questionId: 'MG-Q4',
        questionText: 'Presentas fiebre o escalofrios?',
      },
      {
        questionId: 'MG-Q5',
        questionText: 'Tienes dificultad para respirar o dolor en el pecho?',
      },
    ],
    [Specialty.ODONTOLOGY]: [
      {
        questionId: 'OD-Q1',
        questionText: 'Donde sientes la molestia dental principal?',
      },
      {
        questionId: 'OD-Q2',
        questionText: 'Desde cuando inicio el dolor dental?',
      },
      {
        questionId: 'OD-Q3',
        questionText:
          'En una escala de 0 a 10, cual es la intensidad del dolor?',
      },
      {
        questionId: 'OD-Q4',
        questionText: 'Presentas inflamacion facial o sangrado?',
      },
      {
        questionId: 'OD-Q5',
        questionText: 'El dolor empeora al comer frio o caliente?',
      },
    ],
  };

  getQuestionsBySpecialty(specialty: Specialty): TriageQuestion[] {
    return this.catalog[specialty].map((question) => ({ ...question }));
  }

  getQuestionById(
    specialty: Specialty,
    questionId: string,
  ): TriageQuestion | undefined {
    return this.catalog[specialty].find(
      (question) => question.questionId === questionId,
    );
  }

  isQuestionValid(specialty: Specialty, questionId: string): boolean {
    return Boolean(this.getQuestionById(specialty, questionId));
  }

  getRequiredQuestionIds(specialty: Specialty): string[] {
    return this.catalog[specialty].map((question) => question.questionId);
  }
}
