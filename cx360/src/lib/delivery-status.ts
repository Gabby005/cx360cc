/**
 * Is a real email / SMS provider connected? Until the channel work wires one in
 * (via the EMAIL_PROVIDER / SMS_PROVIDER environment variables), every message
 * is recorded in the Delivery log but not actually sent — the screens say so.
 */
export function deliveryStatus() {
  return {
    email: !!process.env.EMAIL_PROVIDER,
    sms: !!process.env.SMS_PROVIDER,
  };
}
