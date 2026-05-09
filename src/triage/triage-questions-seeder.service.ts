import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Specialty } from '../common/enums/specialty.enum';
import { TRIAGE_QUESTION_CATALOG } from './questions/triage-question-catalog.const';
import {
  TriageQuestionSet,
  TriageQuestionSetDocument,
} from './schemas/triage-question-set.schema';

const SEED_DATA = (Object.keys(TRIAGE_QUESTION_CATALOG) as Specialty[]).map(
  (specialty) => ({ specialty, questions: TRIAGE_QUESTION_CATALOG[specialty] }),
);

@Injectable()
export class TriageQuestionsSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TriageQuestionsSeederService.name);

  constructor(
    @InjectModel(TriageQuestionSet.name)
    private readonly questionSetModel: Model<TriageQuestionSetDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedQuestions();
  }

  private async seedQuestions(): Promise<void> {
    for (const { specialty, questions } of SEED_DATA) {
      const exists = await this.questionSetModel
        .findOne({ specialty, version: 1 })
        .lean()
        .exec();

      if (exists) {
        this.logger.debug(
          `Triage questions already seeded for ${specialty} v1 — skipping`,
        );
        continue;
      }

      await this.questionSetModel.create({
        specialty,
        version: 1,
        active: true,
        questions: [...questions],
      });

      this.logger.log(
        `Seeded ${questions.length} triage questions for ${specialty} v1`,
      );
    }
  }
}
