const express = require("express");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const cors = require("cors");

const app = express();
const port = 3000;

dotenv.config();

app.use(cors()); // разрешаем все домены

const pool = mysql.createPool({
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000, // 20 секунд
});

app.get("/short", async (req, res) => {
  let { name, country } = req.query;

  if (!name || !country) {
    return res.status(400).json({ error: "Missing name" });
  }

  name = decodeURIComponent(name).trim();

  const sql = `
    SELECT *
    FROM products_description
    WHERE products_name = ? AND language_id = ?
  `;

  const values = [name, country];

  try {
    const [rows] = await pool.query(sql, values);

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Description not found for given name",
      });
    }

    res.json({
      description: rows[0].products_short_description,
    });
  } catch (err) {
    console.error("DB error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

app.get("/chars", async (req, res) => {
  let { name, country } = req.query;

  if (!name || !country) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  name = decodeURIComponent(name).trim();

  const sql = `
    SELECT 
      b.specification_name,
      b.specification_suffix,
      a.specification
    FROM 
      products_specifications AS a
    JOIN specification_description AS b ON b.specifications_id = a.specifications_id
    JOIN specifications AS c ON c.specifications_id = a.specifications_id
    JOIN products_description AS d ON d.products_id = a.products_id
    WHERE 
      d.products_name = ? AND
      b.language_id = ? AND
      a.language_id = ? AND
      c.show_data_sheet = 'True'
    ORDER BY c.specification_sort_order ASC
  `;

  const values = [name, country, country];

  try {
    const [rows] = await pool.query(sql, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Характеристики не найдены" });
    }

    const grouped = {};
    for (const row of rows) {
      const specName = row.specification_name?.trim();
      const specValue = row.specification?.trim();
      const suffix = row.specification_suffix?.trim() || "";

      if (!specValue || specValue === "Array") continue;

      if (!grouped[specName]) {
        grouped[specName] = {
          values: new Set(),
          suffix: suffix,
        };
      }

      grouped[specName].values.add(specValue);
    }
    function formatVolume(raw, locale = 'de') {
      if (!raw) return raw;
    
      // Извлекаем только число
      let numStr = raw.replace(/[^\d.,]/g, '').replace(',', '.');
      let num = parseFloat(numStr);
    
      if (isNaN(num)) return raw;
    
      // Предположим, что значение было в кубических сантиметрах, переводим в м³
      // Пример: 22356 => 0.022356
      if (num > 1000) {
        num = num / 1_000_000;
      }
    
      // Форматируем число по локали
      const formatted = num.toLocaleString(locale === 'ru' ? 'ru-RU' : 'de-DE', {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6
      });
    
      return `${formatted} `;
    }
    

    let html = '<div class="new_listing_table">';

    for (const [name, data] of Object.entries(grouped)) {
      let valuesArray = Array.from(data.values);

      // Особая обработка объема
      if (name === "Umfang GBX" || name === "Объем индивидуальной упаковки") {
        valuesArray = valuesArray.map((val) =>
          formatVolume(val, country == 6 ? "de" : "ru")
        );
      }

      if (name === "VESA Größen") {
        // сортировка размеров, как выше
        valuesArray.sort((a, b) => {
          const parseSize = (str) => {
            let clean = str.replace(/mm/gi, "").trim();
            let [w, h] = clean.split("x").map(Number);
            return { w: w || 0, h: h || 0 };
          };
          const sizeA = parseSize(a);
          const sizeB = parseSize(b);
          if (sizeA.w !== sizeB.w) return sizeA.w - sizeB.w;
          return sizeA.h - sizeB.h;
        });
      } else {
        valuesArray.sort();
      }

      const valueString =
        valuesArray.join(", ") + (data.suffix ? " " + data.suffix : "");

      html += `
        <div class="new_listing_table_row">
          <div class="new_listing_table_left">${name}</div>
          <div class="new_listing_table_right" style="line-height: 24.4px;">
            ${valueString}
          </div>
        </div>`;
    }

    html += '<div class="clear"></div></div>';

    res.json({ table: html });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.listen(port, () => {
  console.log("Server working on:", port);
});
