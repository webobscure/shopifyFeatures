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
  connectTimeout: 20000,
 
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
    console.error("DB error:", err, values);
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
      a.specification,
      a.specifications_id
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

  // Соответствие language_id → locale
  const LANGUAGE_LOCALE_MAP = {
    1: "ru-RU",
    2: "en-US",
    3: "fr-FR",
    4: "it-IT",
    5: "es-ES",
    6: "de-DE",
    7: "pl-PL",
  };

  const locale = LANGUAGE_LOCALE_MAP[country] || "en-US";

  // ID-шники для специальных полей
  const VOLUME_IDS = new Set([763]); // Объем индивидуальной упаковки, Umfang GBX и др.
  const VESA_IDS = new Set([24]); // VESA sizes

  // Функция форматирования объема
  function formatVolume(raw, locale = "en-US") {
    if (!raw) return raw;

    let numStr = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    let num = parseFloat(numStr);

    if (isNaN(num)) return raw;

    // Преобразуем из см³ в м³, если значение больше 1000
    if (num > 1000) {
      num = num / 1_000_000;
    }

    return num.toLocaleString(locale, {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });
  }

  try {
    const [rows] = await pool.query(sql, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Характеристики не найдены" });
    }

    // Группируем данные по названию характеристики
    const grouped = {};
    const specIdMap = {}; // название характеристики → ID

    for (const row of rows) {
      const specName = row.specification_name?.trim();
      const specValue = row.specification?.trim();
      const suffix = row.specification_suffix?.trim() || "";
      const specId = row.specifications_id;

      if (!specValue || specValue === "Array") continue;

      if (!grouped[specName]) {
        grouped[specName] = {
          values: new Set(),
          suffix: suffix,
          specId: specId,
        };
        specIdMap[specName] = specId;
      }

      grouped[specName].values.add(specValue);
    }

    let html = '<div class="new_listing_table">';

    for (const [name, data] of Object.entries(grouped)) {
      let valuesArray = Array.from(data.values);
      const specId = data.specId;

      // Обработка объема
      if (VOLUME_IDS.has(specId)) {
        valuesArray = valuesArray.map((val) => formatVolume(val, locale));
      }

      // Сортировка VESA размеров
      if (VESA_IDS.has(specId)) {
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
    // console.log("Запрос к базе c данными:", values);
  } catch (err) {
    console.error("DB error:", err, values);
    res.status(500).json({ error: "Database error" });
  }
});

app.listen(port, () => {
  console.log("Server working on:", port);
});
