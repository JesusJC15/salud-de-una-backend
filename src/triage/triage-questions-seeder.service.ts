import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Specialty } from '../common/enums/specialty.enum';
import { TriageQuestion } from './questions/triage-questions.repository';
import {
  TriageQuestionSet,
  TriageQuestionSetDocument,
} from './schemas/triage-question-set.schema';

const GENERAL_MEDICINE_QUESTIONS: TriageQuestion[] = [
  {
    id: 'MG-Q1',
    questionId: 'MG-Q1',
    title: 'Sintoma principal',
    questionText: 'Que sintoma principal presentas hoy?',
    description: 'Selecciona el sintoma que describe mejor tu situacion.',
    type: 'SINGLE_CHOICE',
    options: [
      { id: 'MG-Q1-HEADACHE', label: 'Dolor de cabeza' },
      { id: 'MG-Q1-FEVER', label: 'Fiebre' },
      { id: 'MG-Q1-COUGH', label: 'Tos' },
      {
        id: 'MG-Q1-CHEST_PAIN',
        label: 'Dolor en el pecho',
        description: 'Si es intenso o repentino, requiere atencion pronta.',
      },
      { id: 'MG-Q1-OTHER', label: 'Otro' },
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
      { id: 'MG-Q5-DYSPNEA', label: 'Dificultad para respirar' },
      { id: 'MG-Q5-CHEST_PAIN', label: 'Dolor en el pecho' },
      { id: 'MG-Q5-NONE', label: 'Ninguno' },
    ],
  },
];

const ODONTOLOGY_QUESTIONS: TriageQuestion[] = [
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
    questionText: 'En una escala de 0 a 10, cual es la intensidad del dolor?',
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
];

const URGENT_CARE_QUESTIONS: TriageQuestion[] = [
  {
    id: 'UR-Q1',
    questionId: 'UR-Q1',
    title: 'Situacion de urgencia',
    questionText: 'Que situacion estas experimentando?',
    description: 'Selecciona la opcion que mejor describe tu urgencia.',
    type: 'SINGLE_CHOICE',
    options: [
      { id: 'UR-Q1-PAIN', label: 'Dolor muy intenso' },
      { id: 'UR-Q1-BREATHING', label: 'Dificultad para respirar' },
      { id: 'UR-Q1-BLEEDING', label: 'Sangrado activo' },
      { id: 'UR-Q1-FAINTING', label: 'Perdida del conocimiento' },
      { id: 'UR-Q1-OTHER', label: 'Otro' },
    ],
  },
  {
    id: 'UR-Q2',
    questionId: 'UR-Q2',
    title: 'Tiempo de evolucion',
    questionText: 'Cuanto tiempo llevas asi?',
    type: 'SINGLE_CHOICE',
    options: [
      { id: 'UR-Q2-LESS_15M', label: 'Menos de 15 minutos' },
      { id: 'UR-Q2-15_60M', label: 'Entre 15 y 60 minutos' },
      { id: 'UR-Q2-MORE_1H', label: 'Mas de 1 hora' },
    ],
  },
  {
    id: 'UR-Q3',
    questionId: 'UR-Q3',
    title: 'Capacidad respiratoria',
    questionText: 'Puedes respirar con normalidad?',
    type: 'SINGLE_CHOICE',
    options: [
      { id: 'UR-Q3-YES', label: 'Si, con normalidad' },
      { id: 'UR-Q3-SOME', label: 'Con cierta dificultad' },
      { id: 'UR-Q3-NO', label: 'No puedo respirar bien' },
    ],
  },
  {
    id: 'UR-Q4',
    questionId: 'UR-Q4',
    title: 'Sangrado activo',
    questionText: 'Hay sangrado visible activo?',
    type: 'SINGLE_CHOICE',
    options: [
      { id: 'UR-Q4-NONE', label: 'No hay sangrado' },
      { id: 'UR-Q4-MILD', label: 'Si, sangrado leve' },
      { id: 'UR-Q4-SEVERE', label: 'Si, sangrado abundante' },
    ],
  },
  {
    id: 'UR-Q5',
    questionId: 'UR-Q5',
    title: 'Intensidad del malestar',
    questionText: 'Del 0 al 10, que tan intenso es el malestar?',
    description: '0 es sin molestia y 10 es la maxima intensidad.',
    type: 'NUMERIC_SCALE',
    minValue: 0,
    maxValue: 10,
    step: 1,
  },
];

const SEED_DATA: Array<{ specialty: Specialty; questions: TriageQuestion[] }> =
  [
    { specialty: Specialty.GENERAL_MEDICINE, questions: GENERAL_MEDICINE_QUESTIONS },
    { specialty: Specialty.ODONTOLOGY, questions: ODONTOLOGY_QUESTIONS },
    { specialty: Specialty.URGENT_CARE, questions: URGENT_CARE_QUESTIONS },
  ];

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
        questions,
      });

      this.logger.log(
        `Seeded ${questions.length} triage questions for ${specialty} v1`,
      );
    }
  }
}
