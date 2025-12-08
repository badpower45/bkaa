import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath);

db.all("SELECT id, name, email, role FROM users", [], (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log("Users found:", rows);
});
