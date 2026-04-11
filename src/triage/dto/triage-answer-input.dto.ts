import {
  IsDefined,
  IsString,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

function IsAllowedAnswerValue(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllowedAnswerValue',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value === 'string') {
            return value.trim().length > 0;
          }

          if (typeof value === 'boolean') {
            return true;
          }

          if (typeof value === 'number') {
            return Number.isFinite(value);
          }

          if (Array.isArray(value)) {
            return (
              value.length > 0 &&
              value.every(
                (item) => typeof item === 'string' && item.trim().length > 0,
              )
            );
          }

          return false;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a non-empty string, a boolean, a finite number, or a non-empty array of non-empty strings`;
        },
      },
    });
  };
}

export class TriageAnswerInputDto {
  @IsString()
  questionId!: string;

  @IsDefined()
  @IsAllowedAnswerValue()
  answerValue!: string | boolean | number | string[];
}
