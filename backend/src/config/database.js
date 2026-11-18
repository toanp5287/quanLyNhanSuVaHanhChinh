import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  timezone: "+07:00",

  ssl: {
    minVersion: "TLSv1.2",
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.on("connection", (connection) => {
  connection.query("SET SESSION time_zone = '+07:00'", (error) => {
    if (error) console.error("Không thể thiết lập múi giờ MySQL:", error);
  });
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
