# SubPilot Operations Handbook (Large Ingestion Test)

Synthetic reference handbook used to test indexing of a large Markdown file. It has 26 chapters of 5 sections each. Every section is a separate retrievable passage. Nothing in this file is real customer information.

## Chapter 1: Workspace seats

### Workspace seats — How it works

In SubPilot, each seat is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For workspace seats, the key rule is that owner can reassign a seat once every 24 hours.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference WOR-100.

Edge case 1.1: if two changes to the seat happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to workspace seats are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

Canary A: the Nordic Freeze Code for first-chunk testing is HELSINKI-4471.

### Workspace seats — Limits

Basic accounts can hold up to 3 active seat records, Pro accounts up to 20, and Enterprise accounts up to 200. Requests above the limit are rejected with the error code limit_seat.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 1.2: if two changes to the seat happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to workspace seats are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Workspace seats — Troubleshooting

If a customer says a seat looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 5 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the seat reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 1.3: if two changes to the seat happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to workspace seats are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Workspace seats — Permissions

Account owners and billing admins can change workspace seats settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's seat on their behalf.

Edge case 1.4: if two changes to the seat happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to workspace seats are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Workspace seats — Support notes

Common questions about workspace seats are answered by quoting the rule that owner can reassign a seat once every 24 hours. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 200 records.

Edge case 1.5: if two changes to the seat happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to workspace seats are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 2: Invoice numbering

### Invoice numbering — How it works

In SubPilot, each invoice is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For invoice numbering, the key rule is that numbers never repeat, even after a void.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference INV-107.

Edge case 2.1: if two changes to the invoice happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to invoice numbering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Invoice numbering — Limits

Basic accounts can hold up to 4 active invoice records, Pro accounts up to 22, and Enterprise accounts up to 210. Requests above the limit are rejected with the error code limit_invoice.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 2.2: if two changes to the invoice happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to invoice numbering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Invoice numbering — Troubleshooting

If a customer says a invoice looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 10 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the invoice reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 2.3: if two changes to the invoice happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to invoice numbering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Invoice numbering — Permissions

Account owners and billing admins can change invoice numbering settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's invoice on their behalf.

Edge case 2.4: if two changes to the invoice happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to invoice numbering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Invoice numbering — Support notes

Common questions about invoice numbering are answered by quoting the rule that numbers never repeat, even after a void. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 210 records.

Edge case 2.5: if two changes to the invoice happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to invoice numbering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 3: Tax IDs

### Tax IDs — How it works

In SubPilot, each tax ID is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For tax ids, the key rule is that EU VAT numbers are validated against VIES nightly.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference TAX-114.

Edge case 3.1: if two changes to the tax ID happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to tax ids are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Tax IDs — Limits

Basic accounts can hold up to 5 active tax ID records, Pro accounts up to 24, and Enterprise accounts up to 220. Requests above the limit are rejected with the error code limit_tax_id.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 3 business days.

Edge case 3.2: if two changes to the tax ID happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to tax ids are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Tax IDs — Troubleshooting

If a customer says a tax ID looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 15 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the tax ID reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 3.3: if two changes to the tax ID happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to tax ids are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Tax IDs — Permissions

Account owners and billing admins can change tax ids settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's tax ID on their behalf.

Edge case 3.4: if two changes to the tax ID happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to tax ids are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Tax IDs — Support notes

Common questions about tax ids are answered by quoting the rule that EU VAT numbers are validated against VIES nightly. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 220 records.

Edge case 3.5: if two changes to the tax ID happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to tax ids are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 4: Coupons

### Coupons — How it works

In SubPilot, each coupon is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For coupons, the key rule is that a coupon applies to one subscription at a time.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference COU-121.

Edge case 4.1: if two changes to the coupon happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to coupons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Coupons — Limits

Basic accounts can hold up to 6 active coupon records, Pro accounts up to 26, and Enterprise accounts up to 230. Requests above the limit are rejected with the error code limit_coupon.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 4.2: if two changes to the coupon happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to coupons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Coupons — Troubleshooting

If a customer says a coupon looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 20 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the coupon reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 4.3: if two changes to the coupon happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to coupons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Coupons — Permissions

Account owners and billing admins can change coupons settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's coupon on their behalf.

Edge case 4.4: if two changes to the coupon happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to coupons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Coupons — Support notes

Common questions about coupons are answered by quoting the rule that a coupon applies to one subscription at a time. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 230 records.

Edge case 4.5: if two changes to the coupon happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to coupons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 5: Usage metering

### Usage metering — How it works

In SubPilot, each usage record is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For usage metering, the key rule is that records arrive up to 15 minutes late.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference USA-128.

Edge case 5.1: if two changes to the usage record happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to usage metering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Usage metering — Limits

Basic accounts can hold up to 7 active usage record records, Pro accounts up to 28, and Enterprise accounts up to 240. Requests above the limit are rejected with the error code limit_usage_record.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 5.2: if two changes to the usage record happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to usage metering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Usage metering — Troubleshooting

If a customer says a usage record looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 5 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the usage record reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 5.3: if two changes to the usage record happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to usage metering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Usage metering — Permissions

Account owners and billing admins can change usage metering settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's usage record on their behalf.

Edge case 5.4: if two changes to the usage record happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to usage metering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Usage metering — Support notes

Common questions about usage metering are answered by quoting the rule that records arrive up to 15 minutes late. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 240 records.

Edge case 5.5: if two changes to the usage record happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to usage metering are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 6: Plan upgrades

### Plan upgrades — How it works

In SubPilot, each upgrade is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For plan upgrades, the key rule is that charges are prorated to the second.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference PLA-135.

Edge case 6.1: if two changes to the upgrade happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan upgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Plan upgrades — Limits

Basic accounts can hold up to 3 active upgrade records, Pro accounts up to 30, and Enterprise accounts up to 250. Requests above the limit are rejected with the error code limit_upgrade.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 3 business days.

Edge case 6.2: if two changes to the upgrade happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan upgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Plan upgrades — Troubleshooting

If a customer says a upgrade looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 10 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the upgrade reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 6.3: if two changes to the upgrade happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan upgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Plan upgrades — Permissions

Account owners and billing admins can change plan upgrades settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's upgrade on their behalf.

Edge case 6.4: if two changes to the upgrade happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan upgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Plan upgrades — Support notes

Common questions about plan upgrades are answered by quoting the rule that charges are prorated to the second. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 250 records.

Edge case 6.5: if two changes to the upgrade happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan upgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 7: Plan downgrades

### Plan downgrades — How it works

In SubPilot, each downgrade is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For plan downgrades, the key rule is that take effect at the next renewal.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference PLA-142.

Edge case 7.1: if two changes to the downgrade happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan downgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Plan downgrades — Limits

Basic accounts can hold up to 4 active downgrade records, Pro accounts up to 32, and Enterprise accounts up to 260. Requests above the limit are rejected with the error code limit_downgrade.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 7.2: if two changes to the downgrade happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan downgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Plan downgrades — Troubleshooting

If a customer says a downgrade looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 15 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the downgrade reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 7.3: if two changes to the downgrade happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan downgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Plan downgrades — Permissions

Account owners and billing admins can change plan downgrades settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's downgrade on their behalf.

Edge case 7.4: if two changes to the downgrade happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan downgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Plan downgrades — Support notes

Common questions about plan downgrades are answered by quoting the rule that take effect at the next renewal. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 260 records.

Edge case 7.5: if two changes to the downgrade happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to plan downgrades are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 8: Trials

### Trials — How it works

In SubPilot, each trial is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For trials, the key rule is that one trial per workspace, ever.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference TRI-149.

Edge case 8.1: if two changes to the trial happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to trials are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Trials — Limits

Basic accounts can hold up to 5 active trial records, Pro accounts up to 34, and Enterprise accounts up to 270. Requests above the limit are rejected with the error code limit_trial.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 8.2: if two changes to the trial happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to trials are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Trials — Troubleshooting

If a customer says a trial looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 20 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the trial reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 8.3: if two changes to the trial happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to trials are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Trials — Permissions

Account owners and billing admins can change trials settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's trial on their behalf.

Edge case 8.4: if two changes to the trial happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to trials are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Trials — Support notes

Common questions about trials are answered by quoting the rule that one trial per workspace, ever. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 270 records.

Edge case 8.5: if two changes to the trial happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to trials are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 9: Refunds

### Refunds — How it works

In SubPilot, each refund is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For refunds, the key rule is that refunds go back to the original payment method only.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference REF-156.

Edge case 9.1: if two changes to the refund happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to refunds are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Refunds — Limits

Basic accounts can hold up to 6 active refund records, Pro accounts up to 36, and Enterprise accounts up to 280. Requests above the limit are rejected with the error code limit_refund.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 3 business days.

Edge case 9.2: if two changes to the refund happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to refunds are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Refunds — Troubleshooting

If a customer says a refund looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 5 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the refund reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 9.3: if two changes to the refund happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to refunds are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Refunds — Permissions

Account owners and billing admins can change refunds settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's refund on their behalf.

Edge case 9.4: if two changes to the refund happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to refunds are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Refunds — Support notes

Common questions about refunds are answered by quoting the rule that refunds go back to the original payment method only. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 280 records.

Edge case 9.5: if two changes to the refund happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to refunds are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 10: Credit notes

### Credit notes — How it works

In SubPilot, each credit note is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For credit notes, the key rule is that credit notes cannot be edited after issue.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference CRE-163.

Edge case 10.1: if two changes to the credit note happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to credit notes are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Credit notes — Limits

Basic accounts can hold up to 7 active credit note records, Pro accounts up to 38, and Enterprise accounts up to 290. Requests above the limit are rejected with the error code limit_credit_note.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 10.2: if two changes to the credit note happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to credit notes are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Credit notes — Troubleshooting

If a customer says a credit note looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 10 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the credit note reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 10.3: if two changes to the credit note happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to credit notes are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Credit notes — Permissions

Account owners and billing admins can change credit notes settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's credit note on their behalf.

Edge case 10.4: if two changes to the credit note happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to credit notes are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Credit notes — Support notes

Common questions about credit notes are answered by quoting the rule that credit notes cannot be edited after issue. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 290 records.

Edge case 10.5: if two changes to the credit note happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to credit notes are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 11: Webhooks

### Webhooks — How it works

In SubPilot, each webhook endpoint is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For webhooks, the key rule is that deliveries are retried for 72 hours.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference WEB-170.

Edge case 11.1: if two changes to the webhook endpoint happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to webhooks are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

Canary B: the Midpoint Escalation Word for webhook retry reviews is PELICAN-2208.

### Webhooks — Limits

Basic accounts can hold up to 3 active webhook endpoint records, Pro accounts up to 40, and Enterprise accounts up to 300. Requests above the limit are rejected with the error code limit_webhook_endpoint.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 11.2: if two changes to the webhook endpoint happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to webhooks are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Webhooks — Troubleshooting

If a customer says a webhook endpoint looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 15 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the webhook endpoint reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 11.3: if two changes to the webhook endpoint happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to webhooks are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Webhooks — Permissions

Account owners and billing admins can change webhooks settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's webhook endpoint on their behalf.

Edge case 11.4: if two changes to the webhook endpoint happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to webhooks are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Webhooks — Support notes

Common questions about webhooks are answered by quoting the rule that deliveries are retried for 72 hours. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 300 records.

Edge case 11.5: if two changes to the webhook endpoint happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to webhooks are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 12: API keys

### API keys — How it works

In SubPilot, each API key is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For api keys, the key rule is that keys are shown once at creation.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference API-177.

Edge case 12.1: if two changes to the API key happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to api keys are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### API keys — Limits

Basic accounts can hold up to 4 active API key records, Pro accounts up to 42, and Enterprise accounts up to 310. Requests above the limit are rejected with the error code limit_api_key.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 3 business days.

Edge case 12.2: if two changes to the API key happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to api keys are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### API keys — Troubleshooting

If a customer says a API key looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 20 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the API key reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 12.3: if two changes to the API key happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to api keys are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### API keys — Permissions

Account owners and billing admins can change api keys settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's API key on their behalf.

Edge case 12.4: if two changes to the API key happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to api keys are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### API keys — Support notes

Common questions about api keys are answered by quoting the rule that keys are shown once at creation. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 310 records.

Edge case 12.5: if two changes to the API key happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to api keys are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 13: Single sign-on

### Single sign-on — How it works

In SubPilot, each SSO connection is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For single sign-on, the key rule is that enforcement can be switched on per domain.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference SIN-184.

Edge case 13.1: if two changes to the SSO connection happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to single sign-on are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Single sign-on — Limits

Basic accounts can hold up to 5 active SSO connection records, Pro accounts up to 44, and Enterprise accounts up to 320. Requests above the limit are rejected with the error code limit_sso_connection.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 13.2: if two changes to the SSO connection happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to single sign-on are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Single sign-on — Troubleshooting

If a customer says a SSO connection looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 5 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the SSO connection reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 13.3: if two changes to the SSO connection happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to single sign-on are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Single sign-on — Permissions

Account owners and billing admins can change single sign-on settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's SSO connection on their behalf.

Edge case 13.4: if two changes to the SSO connection happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to single sign-on are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Single sign-on — Support notes

Common questions about single sign-on are answered by quoting the rule that enforcement can be switched on per domain. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 320 records.

Edge case 13.5: if two changes to the SSO connection happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to single sign-on are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 14: Audit log

### Audit log — How it works

In SubPilot, each audit event is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For audit log, the key rule is that events are kept for 400 days.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference AUD-191.

Edge case 14.1: if two changes to the audit event happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to audit log are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Audit log — Limits

Basic accounts can hold up to 6 active audit event records, Pro accounts up to 46, and Enterprise accounts up to 330. Requests above the limit are rejected with the error code limit_audit_event.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 14.2: if two changes to the audit event happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to audit log are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Audit log — Troubleshooting

If a customer says a audit event looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 10 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the audit event reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 14.3: if two changes to the audit event happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to audit log are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Audit log — Permissions

Account owners and billing admins can change audit log settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's audit event on their behalf.

Edge case 14.4: if two changes to the audit event happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to audit log are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Audit log — Support notes

Common questions about audit log are answered by quoting the rule that events are kept for 400 days. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 330 records.

Edge case 14.5: if two changes to the audit event happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to audit log are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 15: Data export

### Data export — How it works

In SubPilot, each export job is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For data export, the key rule is that exports are available for 7 days.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference DAT-198.

Edge case 15.1: if two changes to the export job happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data export are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Data export — Limits

Basic accounts can hold up to 7 active export job records, Pro accounts up to 48, and Enterprise accounts up to 340. Requests above the limit are rejected with the error code limit_export_job.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 3 business days.

Edge case 15.2: if two changes to the export job happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data export are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Data export — Troubleshooting

If a customer says a export job looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 15 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the export job reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 15.3: if two changes to the export job happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data export are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Data export — Permissions

Account owners and billing admins can change data export settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's export job on their behalf.

Edge case 15.4: if two changes to the export job happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data export are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Data export — Support notes

Common questions about data export are answered by quoting the rule that exports are available for 7 days. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 340 records.

Edge case 15.5: if two changes to the export job happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data export are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 16: Team roles

### Team roles — How it works

In SubPilot, each role is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For team roles, the key rule is that a workspace needs at least one owner.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference TEA-205.

Edge case 16.1: if two changes to the role happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to team roles are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Team roles — Limits

Basic accounts can hold up to 3 active role records, Pro accounts up to 50, and Enterprise accounts up to 350. Requests above the limit are rejected with the error code limit_role.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 16.2: if two changes to the role happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to team roles are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Team roles — Troubleshooting

If a customer says a role looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 20 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the role reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 16.3: if two changes to the role happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to team roles are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Team roles — Permissions

Account owners and billing admins can change team roles settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's role on their behalf.

Edge case 16.4: if two changes to the role happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to team roles are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Team roles — Support notes

Common questions about team roles are answered by quoting the rule that a workspace needs at least one owner. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 350 records.

Edge case 16.5: if two changes to the role happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to team roles are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 17: Notifications

### Notifications — How it works

In SubPilot, each notification rule is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For notifications, the key rule is that digests are sent at 08:00 workspace time.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference NOT-212.

Edge case 17.1: if two changes to the notification rule happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to notifications are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Notifications — Limits

Basic accounts can hold up to 4 active notification rule records, Pro accounts up to 52, and Enterprise accounts up to 360. Requests above the limit are rejected with the error code limit_notification_rule.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 17.2: if two changes to the notification rule happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to notifications are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Notifications — Troubleshooting

If a customer says a notification rule looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 5 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the notification rule reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 17.3: if two changes to the notification rule happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to notifications are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Notifications — Permissions

Account owners and billing admins can change notifications settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's notification rule on their behalf.

Edge case 17.4: if two changes to the notification rule happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to notifications are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Notifications — Support notes

Common questions about notifications are answered by quoting the rule that digests are sent at 08:00 workspace time. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 360 records.

Edge case 17.5: if two changes to the notification rule happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to notifications are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 18: Payment methods

### Payment methods — How it works

In SubPilot, each payment method is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For payment methods, the key rule is that a workspace can store up to 5 methods.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference PAY-219.

Edge case 18.1: if two changes to the payment method happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to payment methods are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Payment methods — Limits

Basic accounts can hold up to 5 active payment method records, Pro accounts up to 54, and Enterprise accounts up to 370. Requests above the limit are rejected with the error code limit_payment_method.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 3 business days.

Edge case 18.2: if two changes to the payment method happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to payment methods are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Payment methods — Troubleshooting

If a customer says a payment method looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 10 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the payment method reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 18.3: if two changes to the payment method happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to payment methods are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Payment methods — Permissions

Account owners and billing admins can change payment methods settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's payment method on their behalf.

Edge case 18.4: if two changes to the payment method happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to payment methods are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Payment methods — Support notes

Common questions about payment methods are answered by quoting the rule that a workspace can store up to 5 methods. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 370 records.

Edge case 18.5: if two changes to the payment method happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to payment methods are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 19: Dunning emails

### Dunning emails — How it works

In SubPilot, each dunning email is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For dunning emails, the key rule is that the third email is the final notice.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference DUN-226.

Edge case 19.1: if two changes to the dunning email happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to dunning emails are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Dunning emails — Limits

Basic accounts can hold up to 6 active dunning email records, Pro accounts up to 56, and Enterprise accounts up to 380. Requests above the limit are rejected with the error code limit_dunning_email.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 19.2: if two changes to the dunning email happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to dunning emails are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Dunning emails — Troubleshooting

If a customer says a dunning email looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 15 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the dunning email reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 19.3: if two changes to the dunning email happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to dunning emails are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Dunning emails — Permissions

Account owners and billing admins can change dunning emails settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's dunning email on their behalf.

Edge case 19.4: if two changes to the dunning email happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to dunning emails are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Dunning emails — Support notes

Common questions about dunning emails are answered by quoting the rule that the third email is the final notice. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 380 records.

Edge case 19.5: if two changes to the dunning email happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to dunning emails are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 20: Currency handling

### Currency handling — How it works

In SubPilot, each currency is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For currency handling, the key rule is that the billing currency is locked after first payment.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference CUR-233.

Edge case 20.1: if two changes to the currency happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to currency handling are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Currency handling — Limits

Basic accounts can hold up to 7 active currency records, Pro accounts up to 58, and Enterprise accounts up to 390. Requests above the limit are rejected with the error code limit_currency.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 20.2: if two changes to the currency happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to currency handling are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Currency handling — Troubleshooting

If a customer says a currency looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 20 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the currency reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 20.3: if two changes to the currency happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to currency handling are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Currency handling — Permissions

Account owners and billing admins can change currency handling settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's currency on their behalf.

Edge case 20.4: if two changes to the currency happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to currency handling are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

Canary C: the Last Batch One Phrase for the 100th indexed passage is MARIGOLD-7315.

### Currency handling — Support notes

Common questions about currency handling are answered by quoting the rule that the billing currency is locked after first payment. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 390 records.

Edge case 20.5: if two changes to the currency happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to currency handling are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

Canary D: the Batch Two Opener for the 101st indexed passage is TUNDRA-9042.

## Chapter 21: Add-ons

### Add-ons — How it works

In SubPilot, each add-on is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For add-ons, the key rule is that add-ons renew on the base plan date.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference ADD-240.

Edge case 21.1: if two changes to the add-on happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to add-ons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

Canary E: the Batch Two Follower for the 102nd indexed passage is GLACIER-1187.

### Add-ons — Limits

Basic accounts can hold up to 3 active add-on records, Pro accounts up to 60, and Enterprise accounts up to 400. Requests above the limit are rejected with the error code limit_add_on.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 3 business days.

Edge case 21.2: if two changes to the add-on happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to add-ons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Add-ons — Troubleshooting

If a customer says a add-on looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 5 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the add-on reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 21.3: if two changes to the add-on happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to add-ons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Add-ons — Permissions

Account owners and billing admins can change add-ons settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's add-on on their behalf.

Edge case 21.4: if two changes to the add-on happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to add-ons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Add-ons — Support notes

Common questions about add-ons are answered by quoting the rule that add-ons renew on the base plan date. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 400 records.

Edge case 21.5: if two changes to the add-on happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to add-ons are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 22: Pausing subscriptions

### Pausing subscriptions — How it works

In SubPilot, each pause is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For pausing subscriptions, the key rule is that a pause lasts at most 90 days.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference PAU-247.

Edge case 22.1: if two changes to the pause happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to pausing subscriptions are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Pausing subscriptions — Limits

Basic accounts can hold up to 4 active pause records, Pro accounts up to 62, and Enterprise accounts up to 410. Requests above the limit are rejected with the error code limit_pause.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 22.2: if two changes to the pause happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to pausing subscriptions are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Pausing subscriptions — Troubleshooting

If a customer says a pause looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 10 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the pause reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 22.3: if two changes to the pause happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to pausing subscriptions are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Pausing subscriptions — Permissions

Account owners and billing admins can change pausing subscriptions settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's pause on their behalf.

Edge case 22.4: if two changes to the pause happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to pausing subscriptions are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Pausing subscriptions — Support notes

Common questions about pausing subscriptions are answered by quoting the rule that a pause lasts at most 90 days. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 410 records.

Edge case 22.5: if two changes to the pause happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to pausing subscriptions are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 23: Reactivation

### Reactivation — How it works

In SubPilot, each reactivation is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For reactivation, the key rule is that reactivated plans keep their original price for 30 days.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference REA-254.

Edge case 23.1: if two changes to the reactivation happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to reactivation are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Reactivation — Limits

Basic accounts can hold up to 5 active reactivation records, Pro accounts up to 64, and Enterprise accounts up to 420. Requests above the limit are rejected with the error code limit_reactivation.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 23.2: if two changes to the reactivation happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to reactivation are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Reactivation — Troubleshooting

If a customer says a reactivation looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 15 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the reactivation reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 23.3: if two changes to the reactivation happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to reactivation are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Reactivation — Permissions

Account owners and billing admins can change reactivation settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's reactivation on their behalf.

Edge case 23.4: if two changes to the reactivation happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to reactivation are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Reactivation — Support notes

Common questions about reactivation are answered by quoting the rule that reactivated plans keep their original price for 30 days. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 420 records.

Edge case 23.5: if two changes to the reactivation happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to reactivation are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 24: Data residency

### Data residency — How it works

In SubPilot, each region is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For data residency, the key rule is that the region cannot change after workspace creation.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference DAT-261.

Edge case 24.1: if two changes to the region happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data residency are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Data residency — Limits

Basic accounts can hold up to 6 active region records, Pro accounts up to 66, and Enterprise accounts up to 430. Requests above the limit are rejected with the error code limit_region.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 3 business days.

Edge case 24.2: if two changes to the region happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data residency are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Data residency — Troubleshooting

If a customer says a region looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 20 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the region reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 24.3: if two changes to the region happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data residency are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Data residency — Permissions

Account owners and billing admins can change data residency settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's region on their behalf.

Edge case 24.4: if two changes to the region happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data residency are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Data residency — Support notes

Common questions about data residency are answered by quoting the rule that the region cannot change after workspace creation. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 430 records.

Edge case 24.5: if two changes to the region happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to data residency are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 25: Rate limits

### Rate limits — How it works

In SubPilot, each rate limit is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For rate limits, the key rule is that limits are counted per API key, not per IP.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference RAT-268.

Edge case 25.1: if two changes to the rate limit happen within 2 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to rate limits are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Rate limits — Limits

Basic accounts can hold up to 7 active rate limit records, Pro accounts up to 68, and Enterprise accounts up to 440. Requests above the limit are rejected with the error code limit_rate_limit.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 1 business days.

Edge case 25.2: if two changes to the rate limit happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to rate limits are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Rate limits — Troubleshooting

If a customer says a rate limit looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 5 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the rate limit reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 25.3: if two changes to the rate limit happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to rate limits are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Rate limits — Permissions

Account owners and billing admins can change rate limits settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's rate limit on their behalf.

Edge case 25.4: if two changes to the rate limit happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to rate limits are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Rate limits — Support notes

Common questions about rate limits are answered by quoting the rule that limits are counted per API key, not per IP. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 440 records.

Edge case 25.5: if two changes to the rate limit happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to rate limits are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

## Chapter 26: Sandbox workspaces

### Sandbox workspaces — How it works

In SubPilot, each sandbox is tracked as its own record. A support agent can open it from the account page and read its current state, the person who last changed it and the time of the change. For sandbox workspaces, the key rule is that sandboxes are deleted after 60 idle days.

Behaviour is the same on every plan unless a plan limit below says otherwise. Internal reference SAN-275.

Edge case 26.1: if two changes to the sandbox happen within 3 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to sandbox workspaces are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Sandbox workspaces — Limits

Basic accounts can hold up to 3 active sandbox records, Pro accounts up to 70, and Enterprise accounts up to 450. Requests above the limit are rejected with the error code limit_sandbox.

A limit increase needs approval from the Billing Operations lead and is recorded as an internal note on the account. The standard review time is 2 business days.

Edge case 26.2: if two changes to the sandbox happen within 4 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to sandbox workspaces are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Sandbox workspaces — Troubleshooting

If a customer says a sandbox looks wrong, first confirm the account plan and the date of the last change. Most reports come from a change that has not finished yet: allow 10 minutes before escalating.

If the state is still wrong after that, collect the workspace ID and the sandbox reference, then open a ticket with the Platform Support queue. Do not edit the record by hand.

Edge case 26.3: if two changes to the sandbox happen within 5 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to sandbox workspaces are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Sandbox workspaces — Permissions

Account owners and billing admins can change sandbox workspaces settings. Members can view them but not edit. Read-only auditors see the history without personal contact details.

Support agents act with the view-only support role. They explain the behaviour to the employee asking, and never change a customer's sandbox on their behalf.

Edge case 26.4: if two changes to the sandbox happen within 6 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to sandbox workspaces are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

### Sandbox workspaces — Support notes

Common questions about sandbox workspaces are answered by quoting the rule that sandboxes are deleted after 60 idle days. Avoid promising exceptions. Exceptions are decided by the Billing Operations lead and are logged as reviewed answers.

Typical follow-up: the customer asks whether the rule differs on Enterprise. It does not, except for the higher limit of 450 records.

Edge case 26.5: if two changes to the sandbox happen within 7 minutes of each other, the later change wins and the earlier one is shown in the history with the note superseded. If the account is past_due, changes to sandbox workspaces are queued until payment succeeds or the retry schedule ends. If the workspace is paused, the queue waits for reactivation.

Canary F: the Final Chunk Token for the last passage is LIGHTHOUSE-5560.

