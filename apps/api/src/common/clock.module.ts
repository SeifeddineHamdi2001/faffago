import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';

/** The clock every service reads, replaced by a hand-moved one in tests. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
