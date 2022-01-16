# overhide-ledger

Orchestrate payments between payers and payees known only to this service--not to eachother--but exposing said payments in this centralized public ledger as payments between verifiable pseudonymous parties.

> For help, reach out on [r/overhide](https://www.reddit.com/r/overhide/).

# Quick Start Docker

1. `npm install`
1. create a valid `.npmrc.dev` (from `.npmrc.sample` template)
1. `npm run compose-dev`
1. jump to "First Time DB Setup" section for the first-time DB setup
1. jump to "Database Evolutions" section, especially the "For Docker" subsection
1. your *oh-ledger* container failed since your DB wasn't setup--now it is--find your *oh-ledger* container name: `docker ps -a`; look for *oh-ledger* with an "Exited" status.
1. start it again: `docker start <container name>`
1. do a `docker logs <container name>` to make sure it's up
1. browse to http://localhost:8090/reap

# Quick Start Non-Docker

1. `npm install`
1. jump to "First Time DB Setup" section for the first-time DB setup
1. `npm run start`

# Configuration

| *Configuration Point* | *Description* | *Sample Value* |
| --- | --- | --- |
| KEYV_URI | if not set, use in-memory--this is fine except node recycle means users will need to intiate re-target again; redis is needed for running tests | redis://localhost:6379 |
| KEYV_RETARGET_NAMESPACE | namespace in key-varlue store (keyv) to use for retarget info | retarget |
| KEYV_RETARGET_TTL_MILLIS | period of time to store retarget info (in millis) | 3600000 |
| INSTRUMENTED_FOR_TEST | set to 'true' if server should run instrumented for running tests: see below | false |
| INTERNAL_TOKEN | Token to use with internal services to avoid rate-limiting (just set once from https://token.overhide.io/register in all services) | ... |
| KEYV_TALLY_CACHE_URI | URI of cache (redis) to tally requests (back-end) | redis://localhost:6379 |
| RATE_LIMIT_FE_WINDOW_MS | Duration of API rate limiting window (milliseconds) (frontend) | 60000 |
| RATE_LIMIT_FE_MAX_REQUESTS_PER_WINDOW | Number of API calls per rate limiting window | 30 |
| RATE_LIMIT_BE_WINDOW_MS | Duration of API rate limiting window (milliseconds) (backend) | 60000 |
| RATE_LIMIT_BE_MAX_REQUESTS_PER_WINDOW | Number of API calls per rate limiting window | 600 |

## Instrumenting For Test

If *INSTRUMENTED_FOR_TEST* configuration point is being used the following server behaviours will be in effect:

1. the most recent retarget ID will be stored in KEYV at key `LATEST_ID`.  This allows retrieval of the ID in tests.  Requires use of Redis or some other persistent KEYV provider: not empty *KEYV_URI* (in-memory).

# First Time DB Setup

All the DB connectivity configuration points assume that the DB and DB user are setup.

The setup differs whether using the Docker image or doing something with cloud/hosting provider.  

For localhost Docker, `psql` into the container:

`npm run psql-dev`

The 'adam' role and 'ohledger' DB should already be created and connected to with the above command (as per `.npmrc.dev` environment passed into docker-compose).

If not, to manually create:

```
docker run -it --rm --link postgres:postgres --network oh_default postgres psql -h postgres -U adam -d postgres
\l
postgres=# create database ohledger;
postgres=# create user adam with encrypted password 'c0c0nut';
postgres=# grant all privileges on database ohledger to adam;
\c ohledger
```

Make sure to set the configuration points in your *.npmrc* appropriately.

Now you're ready to run database evolutions on the new database.

# Database Evolutions

There is a single Node file to check for and perform database evolutions.

Run it from the application node with `npm run db-evolve`.

It will evolve the database to whatever it needs to be for the particular application version.

The *main/js/lib/database.js* has an *init(..)* method which should check that the database is at the right evolution for that version of the app.

Consider currently running nodes before evolving: will they be able to run with the evolved DB?  Perhaps stop them all before evolving.

## Check

To check the database pre/post evolution (first time DB setup already done):

- log into DB
- list tables

```
npm run psql-dev
\dt ohledger.*
```

If you need to select role and DB:

```
set role ohledger;
\c ohledger;
```

More commands:  https://gist.github.com/apolloclark/ea5466d5929e63043dcf

## Evolve

If running using Docker, jump into a container to run the evolution:

`docker run -it --rm --link postgres:postgres --network oh_default oh-ledger /bin/sh`

Then run the evolution:

`npm run db-evolve`

# Database Backup -- Lost Data Recovery

Everything is written out to Stripe as `description` fields in combination with email/timestamp from Stripe.



**Transactions**:  written out to `jakub_ner@hotmail.com` account with the `description` format:

```
`tx,${accountId},${subscriberAddress},${providerAddress},${amountCents}`
```



**Retarget**: written out to `jakub.ner@gmail.com` account with the `description` format:

```
`retarget,${accountId},${email},${emailHash},${address},${amountCents}`
```



### Data Recovery

1. Export the CSV files from Stripe:

   - `tx` CSV file with fields `description`, `PST timestamp`, `transferId`, `email`

   ```
   tx,account,from,to,cents,pts,transferid,email
   tx,acct_1DotNSLUt8hWkxPy,0x027455faf4c2961d062115d9b528d708cb6b9f87,0x049945e9d3fee5fdfa06e084b9a3ca88594c6dab,300,2021-04-04 16:44,xyz,foo
   ```

   - `retarget` CSV file with fields `description`,`transferId`

   ```
   retarget,accountId,email,emailHash,address,amountCents,transferId
   retarget,,foo@bar.com,xyz,0x027455faf4c2961d062115d9b528d708cb6b9f87,50,foo
   ```

   - cleanup the export, remove extraneous `"` on the `description`

2. Copy the CSV files to an `oh-ledger` instance `kubectl cp payments.csv ${POD}:/`

3. run the ingest, either:

   1. `npm run db-import-stripe-tx-csv /payments.csv` for `txs`
   2. `npm run db-import-stripe-retarget-csv /payments.csv` for `retarget`
   3. re-run above appending a `true` on the command line.



# Stripe Setup

Setup the redirect URI to ${URI}/v1/provider

# Testing

See *test/*.

Ensure `.npmrc` is configured.

Run `npm run start` in one console.

Run `npm test` in another console.

## Prerequisites

Ensure at least one provider is registered for `jakub.at.work@gmail.com` before running.  

This line is used in tests that depends on that:

```
TEST_PROVIDER_ACCOUNT_ID_WITH_EMAIL = 'acct_1DymWuHnm2jVFR4M';  // account for 'jakub.at.work@gmail.com';
```

## Adhoc

Files in *test/html* are basic HTML pages for adhoc testing of the server: main/js/index.js

## `npm run test`

These tests need the *INSTRUMENTED_FOR_TEST* to be set to `true` and need the *KEYV_URI* configuration point to use Redis.

Files in *test/js* are are mocha scripts--and support modules--started by `npm test`: to test the server
and libraries:

* main/js/index.js
* main/js/lib/*.js

Run `npm run test`.

## Load

Files in *test/load* are standalone tools to load test.

# Tooling

## VSCode & *run-current-test*

To run our tests from *VSCode* we use this extension:  https://marketplace.visualstudio.com/items?itemName=asvetliakov.run-current-test

Configure above *VSCode* extension in *settings.json*: 

```
  "runCurrentTest.run": "npm run test -- -g \"^${fullTestName}$\"",
  "runCurrentTest.runAndUpdateSnapshots": "npm run test -- --inspect-brk -g \"^${fullTestName}$\""
```

This uses our *package.json* "test" script for a single test run.

The first *run* script we map to CTRL-ALT-R
THe second *run* script--*runAndUpdateSnapshot*--is our debug script and we map to CTRL-ALT-D

### Debugging

https://github.com/asvetliakov/run-current-test/issues/3#issuecomment-462079620

Configure *launch.json* with an "attach" launch configuration:

```
{
  "type": "node",
  "request": "attach",
  "name": "ATTACH",
  "port": 9229
}
```

Put a breakpoint, run test from command line using the "runAndUpdateSnapshots" command: which starts mocha with an --inspect-brk.

Attach to the remote debugging session.  Press F9 to forward to your breakpoints.

# Rate Limiting

Access to these APIs is gated via config points:

- `RATE_LIMIT_FE_MAX_REQUESTS_PER_WINDOW`
- `RATE_LIMIT_FE_WINDOW_MS`

This only applies to requests with a token other than the `INTERNAL_TOKEN` (if set).  `INTERNAL_TOKEN` requests are not rate-limited.

All front-end rate-limits are shared across nodes sharing the same `RATE_LIMIT_FE_REDIS_NAMESPACE` if `RATE_LIMIT_FE_REDIS_URI` is set to a redis instance.  These are expected rate-limits for user client access.

All back-end rate-limits are shared across nodes sharing the same `RATE_LIMIT_BE_REDIS_NAMESPACE` if `RATE_LIMIT_BE_REDIS_URI` is set to a redis instance.  These are expected rate-limits for developer's back-end access.
