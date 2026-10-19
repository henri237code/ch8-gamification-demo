import { openDatabase } from './db.js';
import { Engine } from './engine.js';
const db=openDatabase(process.env.CH8_DB_PATH), engine=new Engine(db);
engine.initialize();
console.log(JSON.stringify(engine.snapshot(),null,2));
db.close();
