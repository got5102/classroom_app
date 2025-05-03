// db.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * SQL クエリを実行します。
 * @param {string} text - SQL テキスト
 * @param {any[]} params - パラメータ配列
 * @returns {Promise<import('pg').QueryResult<any>>}
 */
export async function query(text, params) {
  return pool.query(text, params);
}
