/**
 * What happens when a closed ticket is REOPENED (the same ticket brought back).
 * One place to change the rules later.
 *
 *  restartSlaClock  true  = the SLA timer starts again from the moment of reopening (new due dates).
 *  alertManagers    false = a reopened ticket does NOT send SLA warnings or "SLA exceeded" emails to line managers.
 *  notifyCustomer   false = a reopened ticket does NOT send "resolved" / "closed" email or SMS to the customer.
 *
 * (The SLA colour and countdown on screen still work, so supervisors can track it.)
 */
export const REOPEN_RULES = {
  restartSlaClock: true,
  alertManagers: false,
  notifyCustomer: false,
} as const;
