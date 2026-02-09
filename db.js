import { Database } from "bun:sqlite";
import { join } from "path";

export const db = new Database(join(__dirname, "data", "database.sqlite"))