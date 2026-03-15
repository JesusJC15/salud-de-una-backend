import { Logger } from '@nestjs/common';

const noop = () => undefined;

Logger.overrideLogger(false);

jest.spyOn(Logger.prototype, 'log').mockImplementation(noop);
jest.spyOn(Logger.prototype, 'error').mockImplementation(noop);
jest.spyOn(Logger.prototype, 'warn').mockImplementation(noop);
jest.spyOn(Logger.prototype, 'debug').mockImplementation(noop);
jest.spyOn(Logger.prototype, 'verbose').mockImplementation(noop);

jest.spyOn(console, 'log').mockImplementation(noop);
jest.spyOn(console, 'error').mockImplementation(noop);
jest.spyOn(console, 'warn').mockImplementation(noop);
