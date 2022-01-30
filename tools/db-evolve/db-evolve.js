/**
 * Database evolution script for overhide-ledger.
 */

const POSTGRES_HOST = process.env.POSTGRES_HOST || process.env.npm_config_POSTGRES_HOST || process.env.npm_package_config_POSTGRES_HOST || 'localhost'
const POSTGRES_PORT = process.env.POSTGRES_PORT || process.env.npm_config_POSTGRES_PORT || process.env.npm_package_config_POSTGRES_PORT || 5432
const POSTGRES_DB = process.env.POSTGRES_DB || process.env.npm_config_POSTGRES_DB || process.env.npm_package_config_POSTGRES_DB;
const POSTGRES_USER = process.env.POSTGRES_USER || process.env.npm_config_POSTGRES_USER || process.env.npm_package_config_POSTGRES_USER;
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || process.env.npm_config_POSTGRES_PASSWORD || process.env.npm_package_config_POSTGRES_PASSWORD;
const POSTGRES_SSL = process.env.POSTGRES_SSL || process.env.npm_config_POSTGRES_SSL || process.env.npm_package_config_POSTGRES_SSL;

let conn_details = {
  host: POSTGRES_HOST,
  port: POSTGRES_PORT,
  database: POSTGRES_DB,
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  ssl: POSTGRES_SSL
};

console.log(JSON.stringify(conn_details,null,2));

const db = new (require('pg').Client)(conn_details);

db.connect();

(async () =>  {
  let result = null;

//  result = await db.query(`CREATE SCHEMA IF NOT EXISTS ohledger`);

//  result = await db.query(`ALTER ROLE ${POSTGRES_USER} SET search_path TO ohledger`);
  
  result = await db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'providers'`);
  if (result.rowCount == 0) {
    await db.query(`CREATE TABLE providers (id SERIAL PRIMARY KEY,
                                            paymentgatewayid varchar(100) NOT NULL,
                                            address bytea NOT NULL,
                                            emailhash bytea)`);
    console.log(`created 'providers' table.`);
  }
  await db.query('CREATE INDEX IF NOT EXISTS address_index ON providers (address);');
  
  result = await db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions'`);
  if (result.rowCount == 0) {
    await db.query(`CREATE TABLE transactions (id SERIAL PRIMARY KEY,
                                              fromaddress bytea NOT NULL,
                                              toaddress bytea NOT NULL,
                                              transactionts timestamptz NOT NULL,
                                              amountusdcents integer NOT NULL,
                                              transferid varchar(100) NOT NULL,
                                              emailhash bytea,
                                              void boolean DEFAULT false NOT NULL,
                                              private boolean DEFAULT false NOT NULL)`);
    console.log(`created 'transactions' table.`);
  }                                                                      
  await db.query('CREATE INDEX IF NOT EXISTS ledger_index ON transactions (fromaddress, transactionts);');
  await db.query('CREATE INDEX IF NOT EXISTS subscription_index ON transactions (fromaddress, toaddress, transactionts);');

  process.exit(0);

})().catch((err) => {
  console.log(`ERROR: ${err}\n${JSON.stringify(err,null,2)}`);
});

