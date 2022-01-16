/**
 * Database ingest script for overhide-ledger.
 * 
 * node db-import-stripe-tx-csv.js <file-name> <?true>
 * 
 * `true` above to do the ingest not just trace out.
 * 
 * need a file name as parameter :: csv file in the 
 * format "tx,account,from,to,cents,PST timestamp,transferid,email" 
 * from Stripe CSV export of ""description", "PST timestamp", "transferId", "email"
 * 
 * ensure header line is: "tx,account,from,to,cents,pst,transferid,email"
 */

const POSTGRES_HOST = process.env.POSTGRES_HOST || process.env.npm_config_POSTGRES_HOST || process.env.npm_package_config_POSTGRES_HOST || 'localhost'
const POSTGRES_PORT = process.env.POSTGRES_PORT || process.env.npm_config_POSTGRES_PORT || process.env.npm_package_config_POSTGRES_PORT || 5432
const POSTGRES_DB = process.env.POSTGRES_DB || process.env.npm_config_POSTGRES_DB || process.env.npm_package_config_POSTGRES_DB;
const POSTGRES_USER = process.env.POSTGRES_USER || process.env.npm_config_POSTGRES_USER || process.env.npm_package_config_POSTGRES_USER;
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || process.env.npm_config_POSTGRES_PASSWORD || process.env.npm_package_config_POSTGRES_PASSWORD;
const POSTGRES_SSL = process.env.POSTGRES_SSL || process.env.npm_config_POSTGRES_SSL || process.env.npm_package_config_POSTGRES_SSL;
const SALT = process.env.SALT || process.env.npm_config_SALT || process.env.npm_package_config_SALT;

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
const csv = require('csv-parse/lib/sync')
const fs = require('fs');
const { exit } = require('process');
const crypto = require('../../main/js/lib/crypto.js').init();

const args = process.argv.slice(2)
if (args.length < 1) {
  console.out('need a file name as parameter :: csv file in the format "tx,account,from,to,cents,PTS timestamp,transferid,email" from Stripe CSV export of ""description" and "email"');
  console.out('ensure header line is: "tx,account,from,to,cents,pts,transferid,email"');
}
const fileName = args[0];
const upsert = args.length > 1;

var values = [];

try {
  if (!fs.existsSync(fileName)) {
    console.log(`file doesn't exist: ${fileName}`);
    process.exit(0);    
  }
  const input = fs.readFileSync(fileName, 'utf8');
  values = csv(input, {
    columns: true,
    skip_empty_lines: true
  })
} catch (err) {
  console.log(err);
}

values = values.map(r => `(decode('${r.from}','hex'),decode('${r.to}','hex'),'${(new Date(r.pts)).toUTCString()}',${r.cents},'${r.transferid}',decode('${crypto.hash(r.email, SALT)}','hex'))`);
values = values.join(',');

db.connect();

const query = `INSERT transactions (fromaddress,toaddress,transactionts,amountusdcents,transferid,emailhash) VALUES ${values}`;
console.log(query);

if (upsert) {
  (async () =>  {
    await db.query(query);
    exit(0);

  })().catch((err) => {
    console.log(`ERROR: ${err}\n${JSON.stringify(err,null,2)}`);
  });
}

exit(0);