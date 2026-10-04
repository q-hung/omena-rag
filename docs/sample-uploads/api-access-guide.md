# Availability

API access is available on the Pro and Enterprise plans. It is not included in Basic; accounts on Basic must upgrade to Pro before they can create API keys.

API access must also be switched on for the account. An account on Pro or Enterprise with API access switched off cannot create or use keys until an account owner switches it on under Settings → Features.

# Create an API key

Go to Developers → API keys → Create key, give the key a name and choose its scope:

- **Read only** — can read customers, subscriptions, invoices and payments.
- **Read and write** — can also create and update customers and subscriptions, and issue refunds.

The full key is shown once, when it is created. Store it in a secret manager; SubPilot cannot show it again. Each account can have up to 10 active keys.

# Authenticate requests

Send the key in the Authorization header as a bearer token:

```
Authorization: Bearer sp_live_...
```

All requests must use HTTPS. Requests over plain HTTP are rejected.

Test keys start with `sp_test_` and only see test-mode data. Live keys start with `sp_live_`.

# Rotate or revoke a key

To rotate a key, create a new key, update your integration, then revoke the old key under Developers → API keys. Revoked keys stop working immediately and cannot be restored.

Keys that have not been used for 180 days are revoked automatically. The account owner receives an email 14 days before this happens.

# Rate limits

| Plan | Requests per minute |
|---|---|
| Pro | 100 |
| Enterprise | 1,000 |

Limits apply per account, not per key. When the limit is exceeded, the API responds with HTTP 429 and a `Retry-After` header giving the number of seconds to wait.

# Troubleshooting

## 401 Unauthorized

The key is missing, malformed, revoked or expired. Check that the header uses the `Bearer` prefix and that the key is still listed as active under Developers → API keys.

## 403 Forbidden

The key is valid but not allowed to perform the request, for example a read-only key calling a write endpoint, or a test key requesting live data. A 403 is also returned for every request when API access has been switched off for the account.

## 429 Too Many Requests

The account exceeded its rate limit. Wait for the time given in `Retry-After`, then retry with exponential backoff. Upgrading from Pro to Enterprise raises the limit.

## Plan downgrade

When an account downgrades from Pro or Enterprise to Basic, all of its API keys are revoked at the end of the current billing period.
