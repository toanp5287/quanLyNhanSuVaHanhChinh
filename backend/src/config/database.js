import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),

  ssl: {
    minVersion: "TLSv1.2",
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export { db };

export const connectMysql = async () => {
  try {
    const conn = await db.getConnection();
    console.log("Kết nối mysql thành công");
    conn.release();
  } catch (error) {
    console.log("kết nối mysql thất bại" + error);
  }
};
export default connectMysql;
