import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';
import {
  TriageQuestionSet,
  TriageQuestionSetDocument,
} from '../schemas/triage-question-set.schema';
import { TRIAGE_QUESTION_CATALOG } from './triage-question-catalog.const';

export { TRIAGE_QUESTION_TYPES } from '../triage.constants';
export type { TriageQuestionType } from '../triage.constants';
import type { TriageQuestionType } from '../triage.constants';

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
  private readonly logger = new Logger(TriageQuestionsRepository.name);

  constructor(
    @InjectModel(TriageQuestionSet.name)
    private readonly questionSetModel: Model<TriageQuestionSetDocument>,
  ) {}

  private readonly catalog: Record<Specialty, readonly TriageQuestion[]> =
    TRIAGE_QUESTION_CATALOG;

  async getQuestionsBySpecialty(
    specialty: Specialty,
  ): Promise<TriageQuestion[]> {
    try {
      const questionSet = await this.questionSetModel
        .findOne({ specialty, active: true })
        .sort({ version: -1 })
        .lean()
        .exec();

      if (questionSet?.questions && questionSet.questions.length > 0) {
        return questionSet.questions.map((q) =>
          this.cloneQuestion(q as TriageQuestion),
        );
      }
    } catch {
      this.logger.warn(
        `Failed to load questions from DB for ${specialty} — falling back to hardcoded`,
      );
    }

    return this.catalog[specialty].map((question) =>
      this.cloneQuestion(question),
    );
  }

  async getQuestionById(
    specialty: Specialty,
    questionId: string,
  ): Promise<TriageQuestion | undefined> {
    const questions = await this.getQuestionsBySpecialty(specialty);
    return questions.find((item) => item.questionId === questionId);
  }

  async isQuestionValid(
    specialty: Specialty,
    questionId: string,
  ): Promise<boolean> {
    return Boolean(await this.getQuestionById(specialty, questionId));
  }

  async getRequiredQuestionIds(specialty: Specialty): Promise<string[]> {
    const questions = await this.getQuestionsBySpecialty(specialty);
    return questions.map((question) => question.questionId);
  }

  getRequiredQuestionIdsSync(specialty: Specialty): string[] {
    return this.catalog[specialty].map((question) => question.questionId);
  }

  private cloneQuestion(question: TriageQuestion): TriageQuestion {
    return {
      ...question,
      options: question.options?.map((option) => ({ ...option })),
    };
  }
}
