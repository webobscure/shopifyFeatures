const express = require("express");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const cors = require("cors");
const app = express();
const port = 3000;

dotenv.config();

const pool = mysql.createPool({
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database,
});
app.use(cors({
  origin: "https://your-shopify-store.myshopify.com", // только твой магазин
}));

app.get("/short", async (req, res) => {
    let { name, country } = req.query;
  
    if (!name || !country ) {
      return res.status(400).json({ error: "Missing name" });
    }
  
    name = decodeURIComponent(name).trim();
  
    console.log("Cleaned name:", name, "| Length:", name.length);
  
    const sql = `
      SELECT *
      FROM products_description
      WHERE products_name = ? AND language_id = ?
    `;
  
    const values = [name, country];
  
    try {
      console.log("SQL:", sql);
      console.log("Values:", values);
  
      const [rows] = await pool.query(sql, values);
  
      if (rows.length === 0) {
        return res.status(404).json({
          error: "Description not found for given name",
        });
      }
  
      res.json({
        description: rows[0].products_short_description, // вот тут!
      });
    } catch (err) {
      console.error("DB error:", err);
      return res.status(500).json({ error: "Database error" });
    }
  });
  

app.get("/chars", (req, res) => {
  res.status(501).json({ message: "Not implemented yet" });
});

app.listen(port, () => {
  console.log("Server working on:", port);
});
