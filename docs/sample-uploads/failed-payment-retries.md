# Overview

When a subscription payment fails, SubPilot retries the charge automatically on a fixed schedule. The account moves to `past_due` after the first failed attempt and stays there until a retry succeeds, the customer pays manually, or the retry schedule runs out.

Retry settings are managed per account under Settings → Billing → Failed payment retries. Only account owners and billing admins can change them.

# Default retry schedule

Each failed payment is retried up to 4 times after the original attempt:

| Attempt | When |
|---|---|
| Original charge | Billing date |
| Retry 1 | 3 days after the original charge |
| Retry 2 | 5 days after the original charge |
| Retry 3 | 7 days after the original charge |
| Retry 4 | 14 days after the original charge |

Retries run at the same time of day as the original charge, in the account's billing time zone.

# Custom retry schedules

Accounts on Pro and Enterprise can change the schedule. Basic accounts always use the default schedule.

- **Pro** — choose between 1 and 4 retries, spaced at least 1 day apart, with the last retry no later than 21 days after the original charge.
- **Enterprise** — choose between 1 and 8 retries, with the last retry no later than 30 days after the original charge.

Changes apply to payments that fail after the change is saved. Payments already in a retry schedule keep their original schedule.

# Which failures are retried

Retries only happen for failures that might succeed later.

| Failure code | Retried? |
|---|---|
| `card_declined` | Yes |
| `insufficient_funds` | Yes |
| `processing_error` | Yes |
| `expired_card` | No |
| `incorrect_number` | No |
| `card_not_supported` | No |

For failure codes that are not retried, the customer must update their payment method before the account can be charged again. SubPilot does not receive the card issuer's reason for a `card_declined` failure.

# Customer emails

SubPilot emails the customer after the original failure and after each failed retry, with a link to update their payment method. The final email is sent 3 days before the last retry and states the date the subscription will be canceled.

Customer emails can be switched off under Settings → Billing → Failed payment retries → Customer emails. Retries still run when emails are off.

# Updating the payment method during retries

If the customer updates their payment method while the account is `past_due`, SubPilot charges the new method immediately instead of waiting for the next retry. If that charge succeeds, the remaining retries are cancelled and the account returns to `active`.

# When retries run out

If the last retry fails, the subscription is handled according to the account's end-of-retries setting:

- **Cancel the subscription** (default) — the account moves to `canceled`. Access to SSO, webhooks, API access and audit logs stops at the same time.
- **Leave as past due** — the account stays `past_due` and keeps its features until an owner cancels it or the customer pays manually.

Canceled subscriptions cannot be restarted from a failed invoice. The customer must start a new subscription.

# Webhook events

Accounts with webhooks switched on receive these events:

- `payment.failed` — after the original charge and after each failed retry. The payload includes `attempt` and `next_retry_at` (`null` after the last retry).
- `payment.succeeded` — when a retry or manual payment succeeds.
- `subscription.canceled` — when the subscription is canceled after the last retry.

# Troubleshooting

## A payment was not retried

Check the failure code on the payment. Codes such as `expired_card` are not retried by design. The customer must update their payment method.

## The account is still past due after a successful payment

A successful payment returns the account to `active` within 5 minutes. If it is still `past_due` after that, check whether more than one invoice is unpaid. Every open invoice must be paid before the account returns to `active`.
