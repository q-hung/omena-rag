# Security overview

SubPilot is operated by Omena. This document describes how customer data is protected.

## Encryption in transit

All traffic between browsers, the API and webhook deliveries uses TLS 1.2 or newer. Plain HTTP requests are redirected to HTTPS. Webhook endpoints must present a valid HTTPS certificate.

## Encryption at rest

Customer data in the primary database and in backups is encrypted at rest with AES-256. Uploaded files are stored in encrypted object storage.

## Key management

Encryption keys are held in a managed key service, separate from the data they protect. Keys are rotated every 12 months, and immediately if a key is suspected to be exposed. Engineers cannot read key material.

## Vulnerability handling

Dependencies are scanned on every build. Critical vulnerabilities are patched within 7 days of a fix being available.
