# Availability

Webhooks are available on the Pro and Enterprise plans.

# Create an endpoint

Go to Developers → Webhooks → Add endpoint, then choose the events to send, such as subscription.created and invoice.paid.

# Troubleshooting

## Authentication errors

HTTP 401 or 403 responses usually mean the receiving server rejected the request, for example because signature verification failed after the signing secret was rotated, or because the receiver requires its own authentication.

## Timeouts

Endpoints must return a 2xx response within 10 seconds. Slower responses are recorded as timeouts.

## TLS

Endpoints must use HTTPS with a valid certificate.

## Automatic disabling

An endpoint that fails every delivery for 3 days is disabled automatically. Re-enable it under Developers → Webhooks after fixing the cause.
