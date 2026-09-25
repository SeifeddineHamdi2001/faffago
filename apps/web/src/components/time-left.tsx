'use client';

import { useEffect, useState } from 'react';
import { isVerifyDeadlineNear, timeLeftLabelFR, verifyTimeLeftMs } from '@faffago/shared';

/**
 * The time left before the 48-hour return (Vendeur 4.9), counted from the
 * server's clock: the page carries the server's `now`, and the countdown
 * moves on from it with the browser's clock, whatever that clock reads.
 */
export function TimeLeft({
  deadline,
  serverNow,
  prefix = 'Retour automatique dans',
}: {
  deadline: string;
  serverNow: string;
  prefix?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 30_000);
    return () => clearInterval(timer);
  }, []);
  const now = new Date(new Date(serverNow).getTime() + elapsed);
  const end = new Date(deadline);
  const left = verifyTimeLeftMs(end, now);
  const urgent = left <= 0 || isVerifyDeadlineNear(end, now);
  return (
    <span className={urgent ? 'font-bold text-red-700' : 'font-semibold text-navy'}>
      {left <= 0 ? 'Retour automatique en cours' : `${prefix} ${timeLeftLabelFR(left)}`}
    </span>
  );
}
