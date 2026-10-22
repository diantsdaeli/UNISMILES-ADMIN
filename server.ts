import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import mysql from "mysql2/promise";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, "db.json");

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "haloadmin",
  database: process.env.DB_NAME || "unismile_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper to safely parse JSON columns from MySQL
function parseJsonColumn(val: any) {
  if (val === null || val === undefined) return [];
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}

// Inisialisasi Database (Auto-migration & Auto-seeding)
async function initializeDatabase() {
  console.log("Checking MySQL database connection and schema...");
  try {
    // 0. Create database if it doesn't exist using a direct temporary connection
    const tempConn = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "haloadmin"
    });
    await tempConn.query(`
      CREATE DATABASE IF NOT EXISTS unismile_db
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
    `);
    await tempConn.end();

    // 1. Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL,
        partner VARCHAR(100) NOT NULL,
        serviceMode VARCHAR(100) NOT NULL,
        assignedKiosks JSON NOT NULL,
        status VARCHAR(50) NOT NULL,
        lastActive VARCHAR(100) NOT NULL,
        notes TEXT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS kiosks (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        health JSON NOT NULL,
        config JSON NOT NULL,
        createdAt VARCHAR(100) NOT NULL,
        lastHeartbeat VARCHAR(100) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS frame_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT 'Nama template frame',
        slot_count INT NOT NULL DEFAULT 1 COMMENT 'Jumlah slot foto dalam frame',
        layout_config TEXT NULL COMMENT 'JSON konfigurasi posisi layout slot',
        is_active TINYINT(1) DEFAULT 1 COMMENT 'Status aktif (1) atau tidak aktif (0)',
        category VARCHAR(100) NULL COMMENT 'Kategori template',
        imageUrl LONGTEXT NULL COMMENT 'URL gambar template',
        usage_count INT NOT NULL DEFAULT 0 COMMENT 'Jumlah penggunaan',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(100) PRIMARY KEY COMMENT 'ID Sesi (menggunakan timestamp/UUID)',
        session_code VARCHAR(100) NULL COMMENT 'Kode sesi unik alternatif',
        frame_template_id INT NULL COMMENT 'Template frame yang digunakan',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        status VARCHAR(50) DEFAULT 'active' COMMENT 'status: active, completed, abandoned',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        amount INT NOT NULL DEFAULT 0,
        CONSTRAINT fk_session_frame FOREIGN KEY (frame_template_id) REFERENCES frame_templates(id) 
          ON DELETE SET NULL 
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL COMMENT 'Nama file PNG di disk',
        url VARCHAR(500) NOT NULL COMMENT 'URL lengkap untuk download',
        session_id VARCHAR(100) NULL COMMENT 'Timestamp sesi foto',
        file_size INT NULL COMMENT 'Ukuran file dalam bytes',
        layout_id VARCHAR(20) NULL COMMENT 'Layout yang dipilih (1x1, 4x1, dll)',
        email_sent_to VARCHAR(255) NULL COMMENT 'Email tujuan pengiriman (jika dikirim via email)',
        email_sent_at TIMESTAMP NULL COMMENT 'Waktu pengiriman email',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Waktu foto dibuat',
        CONSTRAINT fk_photo_session FOREIGN KEY (session_id) REFERENCES sessions(id) 
          ON DELETE SET NULL 
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gesture_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL COMMENT 'Relasi ke sesi',
        gesture_type VARCHAR(50) NOT NULL COMMENT 'Tipe gesture (wave, fist, thumbs_up, dll)',
        confidence_score FLOAT NOT NULL COMMENT 'Tingkat akurasi deteksi (0.0 - 1.0)',
        action_triggered VARCHAR(100) NOT NULL COMMENT 'Aksi yang dijalankan (trigger_photo, next_filter, dll)',
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_gesture_session FOREIGN KEY (session_id) REFERENCES sessions(id) 
          ON DELETE CASCADE 
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS filters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT 'Nama filter',
        type VARCHAR(50) NOT NULL COMMENT 'Tipe filter (color, overlay, sticker)',
        preview_url VARCHAR(500) NULL COMMENT 'Preview url untuk icon filter',
        is_active TINYINT(1) DEFAULT 1 COMMENT 'Status aktif',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS photo_filters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        photo_id INT NOT NULL,
        filter_id INT NOT NULL,
        applied_order INT DEFAULT 1 COMMENT 'Urutan penerapan filter',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_pf_photo FOREIGN KEY (photo_id) REFERENCES photos(id) 
          ON DELETE CASCADE 
          ON UPDATE CASCADE,
        CONSTRAINT fk_pf_filter FOREIGN KEY (filter_id) REFERENCES filters(id) 
          ON DELETE CASCADE 
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log("Database tables verified successfully.");

    // 2. Perform auto-seeding if users table is empty
    const [userRows]: any = await pool.query("SELECT COUNT(*) as count FROM users");
    if (userRows[0].count === 0) {
      console.log("Users table is empty. Seeding from db.json...");
      if (fs.existsSync(DB_FILE)) {
        const fileData = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
        
        // Seed users
        if (fileData.users && fileData.users.length > 0) {
          for (const user of fileData.users) {
            await pool.query(
              `INSERT INTO users (id, name, email, role, partner, serviceMode, assignedKiosks, status, lastActive, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                user.id,
                user.name,
                user.email,
                user.role,
                user.partner,
                user.serviceMode,
                JSON.stringify(user.assignedKiosks || []),
                user.status,
                user.lastActive,
                user.notes || ""
              ]
            );
          }
          console.log(`Seeded ${fileData.users.length} users successfully.`);
        }

        // Seed kiosks
        if (fileData.kiosks && fileData.kiosks.length > 0) {
          for (const kiosk of fileData.kiosks) {
            await pool.query(
              `INSERT INTO kiosks (id, name, location, status, health, config, createdAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                kiosk.id,
                kiosk.name,
                kiosk.location,
                kiosk.status,
                JSON.stringify(kiosk.health || {}),
                JSON.stringify(kiosk.config || {}),
                kiosk.createdAt || new Date().toISOString()
              ]
            );
          }
          console.log(`Seeded ${fileData.kiosks.length} kiosks successfully.`);
        }
      } else {
        console.log("db.json not found, skipping user/kiosk seeding.");
      }
    }

    // Set default lastHeartbeat values if null
    await pool.query(`
      UPDATE kiosks SET lastHeartbeat = ? WHERE id = 'dummy-kiosk-1' AND lastHeartbeat IS NULL
    `, [new Date(Date.now() - 3 * 60 * 1000).toISOString()]);
    await pool.query(`
      UPDATE kiosks SET lastHeartbeat = ? WHERE id = 'dummy-kiosk-2' AND lastHeartbeat IS NULL
    `, [new Date(Date.now() - 45 * 60 * 1000).toISOString()]);
    await pool.query(`
      UPDATE kiosks SET lastHeartbeat = ? WHERE id = 'dummy-kiosk-3' AND lastHeartbeat IS NULL
    `, [new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()]);

    // Seed default frame templates
    const requiredTemplates = [
      { id: 1, name: "Gold Birthday Frame", slot_count: 4, is_active: 1, category: "Birthday", imageUrl: "https://picsum.photos/seed/bdayframe/300/450" },
      { id: 2, name: "Classic Wedding Rose", slot_count: 3, is_active: 1, category: "Wedding", imageUrl: "https://picsum.photos/seed/wedding/300/450" },
      { id: 3, name: "Graduation Class of 2026", slot_count: 4, is_active: 1, category: "Graduation", imageUrl: "https://picsum.photos/seed/graduation/300/450" },
      { id: 4, name: "Corporate Gala Night", slot_count: 4, is_active: 1, category: "Corporate", imageUrl: "https://picsum.photos/seed/corporate/300/450" },
      { id: 5, name: "Retro Fun Frame", slot_count: 2, is_active: 1, category: "General", imageUrl: "https://picsum.photos/seed/retro/300/450" }
    ];

    for (const t of requiredTemplates) {
      const [exists]: any = await pool.query("SELECT COUNT(*) as count FROM frame_templates WHERE id = ?", [t.id]);
      if (exists[0].count === 0) {
        await pool.query(
          `INSERT INTO frame_templates (id, name, slot_count, is_active, category, imageUrl, usage_count)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
          [t.id, t.name, t.slot_count, t.is_active, t.category, t.imageUrl]
        );
      }
    }

    // Seed default filters
    const defaultFilters = [
      { id: 1, name: "Original", type: "color", preview_url: "https://picsum.photos/seed/original/100/100", is_active: 1 },
      { id: 2, name: "Black & White", type: "color", preview_url: "https://picsum.photos/seed/bw/100/100", is_active: 1 },
      { id: 3, name: "Vintage", type: "color", preview_url: "https://picsum.photos/seed/vintage/100/100", is_active: 1 },
      { id: 4, name: "Warm Tone", type: "color", preview_url: "https://picsum.photos/seed/warm/100/100", is_active: 1 },
      { id: 5, name: "Cool Tone", type: "color", preview_url: "https://picsum.photos/seed/cool/100/100", is_active: 1 },
      { id: 6, name: "Cinematic", type: "color", preview_url: "https://picsum.photos/seed/cinematic/100/100", is_active: 1 }
    ];

    for (const f of defaultFilters) {
      const [exists]: any = await pool.query("SELECT COUNT(*) as count FROM filters WHERE id = ?", [f.id]);
      if (exists[0].count === 0) {
        await pool.query(
          `INSERT INTO filters (id, name, type, preview_url, is_active)
           VALUES (?, ?, ?, ?, ?)`,
          [f.id, f.name, f.type, f.preview_url, f.is_active]
        );
      }
    }

    // Seed sessions history if empty/small or not exactly 20 or missing target ID
    const [sessRows]: any = await pool.query("SELECT COUNT(*) as count FROM sessions");
    const [hasTarget]: any = await pool.query("SELECT COUNT(*) as count FROM sessions WHERE id = '#US-117391'");
    if (sessRows[0].count !== 20 || hasTarget[0].count === 0) {
      console.log("Generating exactly 20 mock sessions with diverse templates and statuses...");
      await pool.query("DELETE FROM photo_filters");
      await pool.query("DELETE FROM gesture_logs");
      await pool.query("DELETE FROM photos");
      await pool.query("DELETE FROM sessions");
      
      const templatesList = [
        { id: 1, name: "Gold Birthday Frame", amount: 35000 },
        { id: 2, name: "Classic Wedding Rose", amount: 50000 },
        { id: 3, name: "Graduation Class of 2026", amount: 45000 },
        { id: 4, name: "Corporate Gala Night", amount: 40000 },
        { id: 5, name: "Retro Fun Frame", amount: 25000 }
      ];
      
      const nowMs = Date.now();
      const oneHour = 60 * 60 * 1000;
      
      for (let i = 0; i < 20; i++) {
        // Cycle templates evenly so we have diverse templates, including Corporate Gala Night
        const randTemplate = templatesList[i % templatesList.length];
        const sessId = i === 0 ? "#US-117391" : `#US-${117000 + i}`; // Sequential but realistic looking IDs, first one is target ID
        const sessTime = new Date(nowMs - i * 3 * oneHour);
        const endedTime = new Date(sessTime.getTime() + 5 * 60 * 1000);
        
        // Distribute statuses: 7 Success, 7 Failed, 6 Pending
        let displayStatus = "Success";
        if (i >= 7 && i < 14) {
          displayStatus = "Failed (Paper Jam)";
        } else if (i >= 14) {
          displayStatus = "Pending";
        }
        
        await pool.query(
          `INSERT INTO sessions (id, session_code, frame_template_id, started_at, ended_at, status, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            sessId,
            sessId,
            randTemplate.id,
            sessTime,
            endedTime,
            displayStatus,
            randTemplate.amount
          ]
        );

        await pool.query(
          `UPDATE frame_templates SET usage_count = usage_count + 1 WHERE id = ?`,
          [randTemplate.id]
        );
        
        if (displayStatus === "Success") {
          const photosCount = 2; // Fixed number of photos for success sessions to keep it clean
          for (let idx = 0; idx < photosCount; idx++) {
            const url = `https://picsum.photos/seed/photo-${i}-${idx}/200/300`;
            const filename = `photo-${i}-${idx}.png`;
            const fileSize = 250000;
            const layoutId = "4x1";
            
            const [photoResult]: any = await pool.query(
              `INSERT INTO photos (filename, url, session_id, file_size, layout_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                filename,
                url,
                sessId,
                fileSize,
                layoutId,
                endedTime
              ]
            );
            const photoId = photoResult.insertId;

            const randomFilterId = (idx % 6) + 1;
            await pool.query(
              `INSERT INTO photo_filters (photo_id, filter_id, applied_order)
               VALUES (?, ?, 1)`,
              [photoId, randomFilterId]
            );
          }
        }
        
        // Insert gesture logs to make it look active
        const gestures = ["wave", "fist", "thumbs_up"];
        const actions = ["trigger_photo", "next_filter", "confirm_print"];
        const randIdx = i % gestures.length;
        await pool.query(
          `INSERT INTO gesture_logs (session_id, gesture_type, confidence_score, action_triggered, detected_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            sessId,
            gestures[randIdx],
            0.85,
            actions[randIdx],
            sessTime
          ]
        );
      }
      console.log("Mock session history generated successfully with exactly 20 sessions.");
    }
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
}

// Initialize Gemini AI SDK securely on the backend
const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in the environment. AI Generator will fall back to smart simulated responses.");
}
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json({ limit: "50mb" })); // Increase limit for template image uploads

  // Initialize DB before starting backend routes
  await initializeDatabase();

  // --- API Routes ---

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "UniSmiles backend with MySQL is fully operational." });
  });

  // --- Users API ---
  app.get("/api/users", async (req, res) => {
    try {
      const [rows]: any = await pool.query("SELECT * FROM users");
      const mapped = rows.map((u: any) => ({
        ...u,
        assignedKiosks: parseJsonColumn(u.assignedKiosks)
      }));
      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch users", details: err.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    const newUser = {
      id: Date.now().toString(),
      name: req.body.name,
      email: req.body.email,
      role: req.body.role,
      partner: req.body.partner || "All Partners",
      serviceMode: req.body.serviceMode || "Self-managed",
      assignedKiosks: req.body.assignedKiosks || [],
      status: req.body.status || "Active",
      lastActive: "New",
      notes: req.body.notes || ""
    };

    try {
      await pool.query(
        `INSERT INTO users (id, name, email, role, partner, serviceMode, assignedKiosks, status, lastActive, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newUser.id,
          newUser.name,
          newUser.email,
          newUser.role,
          newUser.partner,
          newUser.serviceMode,
          JSON.stringify(newUser.assignedKiosks),
          newUser.status,
          newUser.lastActive,
          newUser.notes
        ]
      );
      res.status(201).json(newUser);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create user", details: err.message });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [rows]: any = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const existingUser = rows[0];
      const updatedUser = {
        name: req.body.name !== undefined ? req.body.name : existingUser.name,
        email: req.body.email !== undefined ? req.body.email : existingUser.email,
        role: req.body.role !== undefined ? req.body.role : existingUser.role,
        partner: req.body.partner !== undefined ? req.body.partner : existingUser.partner,
        serviceMode: req.body.serviceMode !== undefined ? req.body.serviceMode : existingUser.serviceMode,
        assignedKiosks: req.body.assignedKiosks !== undefined ? req.body.assignedKiosks : parseJsonColumn(existingUser.assignedKiosks),
        status: req.body.status !== undefined ? req.body.status : existingUser.status,
        lastActive: req.body.lastActive !== undefined ? req.body.lastActive : existingUser.lastActive,
        notes: req.body.notes !== undefined ? req.body.notes : existingUser.notes
      };

      await pool.query(
        `UPDATE users SET name = ?, email = ?, role = ?, partner = ?, serviceMode = ?, assignedKiosks = ?, status = ?, lastActive = ?, notes = ? WHERE id = ?`,
        [
          updatedUser.name,
          updatedUser.email,
          updatedUser.role,
          updatedUser.partner,
          updatedUser.serviceMode,
          JSON.stringify(updatedUser.assignedKiosks),
          updatedUser.status,
          updatedUser.lastActive,
          updatedUser.notes,
          id
        ]
      );

      res.json({ ...updatedUser, id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update user", details: err.message });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [result]: any = await pool.query("DELETE FROM users WHERE id = ?", [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true, message: "User deleted successfully." });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete user", details: err.message });
    }
  });

  // --- Kiosks API ---
  app.get("/api/kiosks", async (req, res) => {
    try {
      const [rows]: any = await pool.query("SELECT * FROM kiosks");
      const mapped = rows.map((k: any) => ({
        ...k,
        health: parseJsonColumn(k.health),
        config: parseJsonColumn(k.config)
      }));
      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch kiosks", details: err.message });
    }
  });

  app.post("/api/kiosks", async (req, res) => {
    const newKiosk = {
      id: Date.now().toString(),
      name: req.body.name,
      location: req.body.location,
      status: "offline",
      health: {
        printerInk: 100,
        storage: 0,
        camera: "good"
      },
      config: req.body.config || { brightness: 80, volume: 50, maintenanceMode: false },
      createdAt: new Date().toISOString()
    };

    try {
      await pool.query(
        `INSERT INTO kiosks (id, name, location, status, health, config, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newKiosk.id,
          newKiosk.name,
          newKiosk.location,
          newKiosk.status,
          JSON.stringify(newKiosk.health),
          JSON.stringify(newKiosk.config),
          newKiosk.createdAt
        ]
      );
      res.status(201).json(newKiosk);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create kiosk", details: err.message });
    }
  });

  app.put("/api/kiosks/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [rows]: any = await pool.query("SELECT * FROM kiosks WHERE id = ?", [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Kiosk not found" });
      }

      const existingKiosk = rows[0];
      const updatedKiosk = {
        name: req.body.name !== undefined ? req.body.name : existingKiosk.name,
        location: req.body.location !== undefined ? req.body.location : existingKiosk.location,
        status: req.body.status !== undefined ? req.body.status : existingKiosk.status,
        health: req.body.health !== undefined ? req.body.health : parseJsonColumn(existingKiosk.health),
        config: req.body.config !== undefined ? req.body.config : parseJsonColumn(existingKiosk.config),
        createdAt: existingKiosk.createdAt
      };

      await pool.query(
        `UPDATE kiosks SET name = ?, location = ?, status = ?, health = ?, config = ? WHERE id = ?`,
        [
          updatedKiosk.name,
          updatedKiosk.location,
          updatedKiosk.status,
          JSON.stringify(updatedKiosk.health),
          JSON.stringify(updatedKiosk.config),
          id
        ]
      );

      res.json({ ...updatedKiosk, id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update kiosk", details: err.message });
    }
  });

  app.post("/api/kiosks/:id/restart", async (req, res) => {
    const { id } = req.params;
    try {
      const [rows]: any = await pool.query("SELECT * FROM kiosks WHERE id = ?", [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Kiosk not found" });
      }

      // Set to restarting
      await pool.query("UPDATE kiosks SET status = 'restarting' WHERE id = ?", [id]);

      // Simulate 3-second reboot, then switch to online
      setTimeout(async () => {
        try {
          await pool.query("UPDATE kiosks SET status = 'online' WHERE id = ?", [id]);
          console.log(`Kiosk ${id} finished restarting and is now online.`);
        } catch (errTimeout) {
          console.error(`Error completing restart for kiosk ${id}:`, errTimeout);
        }
      }, 3000);

      res.json({ success: true, message: "Kiosk reboot sequence initiated." });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to restart kiosk", details: err.message });
    }
  });

  app.delete("/api/kiosks/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [result]: any = await pool.query("DELETE FROM kiosks WHERE id = ?", [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Kiosk not found" });
      }
      res.json({ success: true, message: "Kiosk deleted successfully." });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete kiosk", details: err.message });
    }
  });

  // --- Templates API ---
  app.get("/api/templates", async (req, res) => {
    try {
      const [rows]: any = await pool.query("SELECT * FROM frame_templates ORDER BY created_at DESC");
      const mapped = rows.map((r: any) => ({
        id: String(r.id),
        name: r.name,
        category: r.category || "General",
        imageUrl: r.imageUrl || "",
        status: r.is_active ? "active" : "inactive",
        usageCount: r.usage_count || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch templates", details: err.message });
    }
  });

  app.post("/api/templates", async (req, res) => {
    const name = req.body.name;
    const category = req.body.category || "General";
    const imageUrl = req.body.imageUrl || "";
    const isActive = req.body.status === "active" ? 1 : 0;

    try {
      const [result]: any = await pool.query(
        `INSERT INTO frame_templates (name, category, imageUrl, is_active, slot_count, usage_count)
         VALUES (?, ?, ?, ?, 4, 0)`,
        [name, category, imageUrl, isActive]
      );
      
      const newId = result.insertId;
      res.status(201).json({
        id: String(newId),
        name,
        category,
        imageUrl,
        status: isActive ? "active" : "inactive",
        usageCount: 0,
        createdAt: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create template", details: err.message });
    }
  });

  app.put("/api/templates/:id", async (req, res) => {
    const { id } = req.params;
    const numericId = parseInt(id);
    try {
      const [rows]: any = await pool.query("SELECT * FROM frame_templates WHERE id = ?", [numericId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Template not found" });
      }

      const existing = rows[0];
      const name = req.body.name !== undefined ? req.body.name : existing.name;
      const category = req.body.category !== undefined ? req.body.category : existing.category;
      const imageUrl = req.body.imageUrl !== undefined ? req.body.imageUrl : existing.imageUrl;
      const isActive = req.body.status !== undefined ? (req.body.status === "active" ? 1 : 0) : existing.is_active;
      const usageCount = req.body.usageCount !== undefined ? req.body.usageCount : existing.usage_count;

      await pool.query(
        `UPDATE frame_templates SET name = ?, category = ?, imageUrl = ?, is_active = ?, usage_count = ? WHERE id = ?`,
        [name, category, imageUrl, isActive, usageCount, numericId]
      );

      res.json({
        id: String(numericId),
        name,
        category,
        imageUrl,
        status: isActive ? "active" : "inactive",
        usageCount,
        createdAt: existing.created_at,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update template", details: err.message });
    }
  });

  app.delete("/api/templates/:id", async (req, res) => {
    const { id } = req.params;
    const numericId = parseInt(id);
    try {
      const [result]: any = await pool.query("DELETE FROM frame_templates WHERE id = ?", [numericId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json({ success: true, message: "Template deleted successfully." });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete template", details: err.message });
    }
  });

  // --- Sessions API ---
  app.get("/api/sessions", async (req, res) => {
    try {
      const [sessionRows]: any = await pool.query(`
        SELECT 
          s.id,
          s.started_at as timestamp,
          t.name as template,
          s.amount,
          s.status
        FROM sessions s
        LEFT JOIN frame_templates t ON s.frame_template_id = t.id
        ORDER BY s.started_at DESC
      `);

      if (sessionRows.length === 0) {
        return res.json([]);
      }

      const sessionIds = sessionRows.map((s: any) => s.id);
      const [photoRows]: any = await pool.query(
        `SELECT session_id, url FROM photos WHERE session_id IN (?)`,
        [sessionIds]
      );

      const photosBySession: Record<string, string[]> = {};
      photoRows.forEach((p: any) => {
        if (!photosBySession[p.session_id]) {
          photosBySession[p.session_id] = [];
        }
        photosBySession[p.session_id].push(p.url);
      });

      const mapped = sessionRows.map((s: any) => ({
        id: s.id,
        timestamp: s.timestamp instanceof Date ? s.timestamp.toISOString() : s.timestamp,
        template: s.template || "Retro Fun Frame",
        photos: photosBySession[s.id] || [],
        amount: s.amount || 0,
        status: s.status || "Success"
      }));

      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch sessions", details: err.message });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    const id = req.body.id || "#US-" + Math.floor(1000 + Math.random() * 9000);
    const timestamp = req.body.timestamp || new Date().toISOString();
    const templateName = req.body.template;
    const photos = req.body.photos || [];
    const amount = req.body.amount || 0;
    const status = req.body.status || "Success";

    try {
      let templateId: number | null = null;
      if (templateName) {
        const [tRows]: any = await pool.query("SELECT id FROM frame_templates WHERE name = ?", [templateName]);
        if (tRows.length > 0) {
          templateId = tRows[0].id;
        }
      }

      await pool.query(
        `INSERT INTO sessions (id, session_code, frame_template_id, started_at, status, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          id,
          templateId,
          new Date(timestamp),
          status,
          amount
        ]
      );

      if (templateId) {
        await pool.query(
          `UPDATE frame_templates SET usage_count = usage_count + 1 WHERE id = ?`,
          [templateId]
        );
      }

      for (const url of photos) {
        const filename = path.basename(url) || "photo.png";
        const fileSize = 250000;
        await pool.query(
          `INSERT INTO photos (filename, url, session_id, file_size, layout_id)
           VALUES (?, ?, ?, ?, ?)`,
          [filename, url, id, fileSize, "4x1"]
        );
      }

      res.status(201).json({
        id,
        timestamp,
        template: templateName,
        photos,
        amount,
        status
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create session", details: err.message });
    }
  });

  // Helper for formatting last active relative time in Indonesian
  function formatLastSeen(isoString: string | null | undefined) {
    if (!isoString) return "Belum terhubung";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return "Baru saja";
    if (diffMins < 60) return `${diffMins} menit lalu`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Kemarin";
    return `${diffDays} hari lalu`;
  }

  // --- Analytics API Endpoint ---
  app.get("/api/analytics", async (req, res) => {
    try {
      const rangeDays = parseInt((req.query.range as string) || "7");
      
      const now = new Date();
      const currentStart = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
      const prevStart = new Date(now.getTime() - 2 * rangeDays * 24 * 60 * 60 * 1000).toISOString();
      const nowStr = now.toISOString();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStartStr = today.toISOString();
      
      // 1. Fetch current and previous KPI metrics
      const [currentSessionsAndRevenue]: any = await pool.query(`
        SELECT 
          COUNT(id) as totalSessions,
          COALESCE(SUM(amount), 0) as totalRevenue
        FROM sessions
        WHERE started_at >= ? AND started_at <= ?
      `, [currentStart, nowStr]);

      const [currentPhotos]: any = await pool.query(`
        SELECT COUNT(p.id) as photosPrinted
        FROM photos p
        JOIN sessions s ON p.session_id = s.id
        WHERE s.started_at >= ? AND s.started_at <= ?
      `, [currentStart, nowStr]);

      const [prevSessionsAndRevenue]: any = await pool.query(`
        SELECT 
          COUNT(id) as totalSessions,
          COALESCE(SUM(amount), 0) as totalRevenue
        FROM sessions
        WHERE started_at >= ? AND started_at < ?
      `, [prevStart, currentStart]);

      const [prevPhotos]: any = await pool.query(`
        SELECT COUNT(p.id) as photosPrinted
        FROM photos p
        JOIN sessions s ON p.session_id = s.id
        WHERE s.started_at >= ? AND s.started_at < ?
      `, [prevStart, currentStart]);

      const [todayRevenueRows]: any = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM sessions
        WHERE started_at >= ? AND started_at <= ?
      `, [todayStartStr, nowStr]);

      const currentMetrics = {
        totalSessions: Number(currentSessionsAndRevenue[0]?.totalSessions) || 0,
        totalRevenue: Number(currentSessionsAndRevenue[0]?.totalRevenue) || 0,
        photosPrinted: Number(currentPhotos[0]?.photosPrinted) || 0
      };

      const prevMetrics = {
        totalSessions: Number(prevSessionsAndRevenue[0]?.totalSessions) || 0,
        totalRevenue: Number(prevSessionsAndRevenue[0]?.totalRevenue) || 0,
        photosPrinted: Number(prevPhotos[0]?.photosPrinted) || 0
      };

      const revenueToday = Number(todayRevenueRows[0]?.total) || 0;

      const calcGrowth = (curr: any, prev: any) => {
        const c = Number(curr) || 0;
        const p = Number(prev) || 0;
        if (p === 0) return c > 0 ? 100 : 0;
        const growthVal = ((c - p) / p) * 100;
        return Number.isFinite(growthVal) ? parseFloat(growthVal.toFixed(1)) : 0;
      };

      const stats = {
        totalSessions: {
          value: currentMetrics.totalSessions,
          growth: calcGrowth(currentMetrics.totalSessions, prevMetrics.totalSessions),
          trend: currentMetrics.totalSessions >= prevMetrics.totalSessions ? 'up' : 'down'
        },
        photosPrinted: {
          value: currentMetrics.photosPrinted,
          growth: calcGrowth(currentMetrics.photosPrinted, prevMetrics.photosPrinted),
          trend: currentMetrics.photosPrinted >= prevMetrics.photosPrinted ? 'up' : 'down'
        },
        revenue: {
          value: currentMetrics.totalRevenue,
          growth: calcGrowth(currentMetrics.totalRevenue, prevMetrics.totalRevenue),
          trend: currentMetrics.totalRevenue >= prevMetrics.totalRevenue ? 'up' : 'down'
        },
        revenueToday: {
          value: revenueToday
        }
      };

      // 2. Kiosk status count and details
      const [kiosksRows]: any = await pool.query("SELECT id, name, location, status, lastHeartbeat FROM kiosks");
      const totalKiosks = kiosksRows.length;
      const onlineKiosks = kiosksRows.filter((k: any) => k.status === 'online').length;

      // 3. Revenue Overview Chart data
      const [revenueChartRows]: any = await pool.query(`
        SELECT 
          DATE_FORMAT(started_at, '%Y-%m-%d') as date,
          COALESCE(SUM(amount), 0) as value
        FROM sessions
        WHERE started_at >= ? AND started_at <= ?
        GROUP BY DATE_FORMAT(started_at, '%Y-%m-%d')
        ORDER BY date ASC
      `, [currentStart, nowStr]);

      const chartMap = new Map();
      for (let i = 0; i < rangeDays; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().substring(0, 10);
        chartMap.set(dateStr, 0);
      }
      revenueChartRows.forEach((row: any) => {
        if (chartMap.has(row.date)) {
          chartMap.set(row.date, row.value);
        }
      });
      const revenueChart = Array.from(chartMap.entries())
        .map(([name, value]) => ({ name, value }))
        .reverse();

      // 4. Popularity Chart data
      const [popularityRows]: any = await pool.query(`
        SELECT 
          t.category,
          COUNT(s.id) as count
        FROM sessions s
        JOIN frame_templates t ON s.frame_template_id = t.id
        WHERE s.started_at >= ? AND s.started_at <= ?
        GROUP BY t.category
      `, [currentStart, nowStr]);

      const totalCategorySessions = popularityRows.reduce((sum: number, r: any) => sum + r.count, 0);
      const popularityChart = popularityRows.map((r: any) => ({
        name: r.category || "General",
        value: totalCategorySessions > 0 ? Math.round((r.count / totalCategorySessions) * 100) : 0
      }));

      // 5. Top Template details
      const [topTemplateRows]: any = await pool.query(`
        SELECT 
          t.name,
          t.category,
          COUNT(s.id) as usageCount
        FROM sessions s
        JOIN frame_templates t ON s.frame_template_id = t.id
        WHERE s.started_at >= ? AND s.started_at <= ?
        GROUP BY t.name, t.category
        ORDER BY usageCount DESC
        LIMIT 1
      `, [currentStart, nowStr]);

      const topTemplate = topTemplateRows.length > 0 ? {
        name: topTemplateRows[0].name,
        category: topTemplateRows[0].category || "General",
        usageCount: topTemplateRows[0].usageCount
      } : null;

      const [allSessionsCount]: any = await pool.query("SELECT COUNT(*) as count FROM sessions");
      const hasData = allSessionsCount[0].count > 0;

      res.json({
        stats,
        activeKiosks: {
          online: onlineKiosks,
          total: totalKiosks
        },
        revenueChart,
        popularityChart,
        kioskStatus: kiosksRows.map((k: any) => ({
          id: k.id,
          name: k.name,
          location: k.location,
          status: k.status,
          lastSeen: formatLastSeen(k.lastHeartbeat)
        })),
        topTemplate,
        hasData
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate analytics", details: err.message });
    }
  });

  // --- Secure Gemini AI API Endpoints ---
  app.post("/api/ai/marketing", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    if (!ai) {
      return res.json({
        text: `[SIMULASI AI - Kunci API Gemini tidak dikonfigurasi]\n\nSaya merekomendasikan ide berikut untuk "${prompt}":\n"Yuk datang ke Smart Photo Booth terdekat! 📸✨ Ekspresikan gayamu bersama UniSmiles dan buat kenangan manis tak terlupakan bareng bestie-mu! Gunakan promo akhir pekan gratis 1 cetak tambahan! 🌈💖 #UniSmiles #PhotoBoothBandung"`
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are UniSmiles AI, a marketing assistant for a Smart Photo Booth business in Indonesia. Your tone is fun, youthful, and professional. Help generate captions, promo text, and pose ideas.",
        }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini AI API error:", error);
      res.status(500).json({ error: "Failed to generate AI content.", details: error.message });
    }
  });

  app.post("/api/ai/layout", async (req, res) => {
    const { eventType } = req.body;
    if (!eventType) {
      return res.status(400).json({ error: "eventType is required." });
    }

    if (!ai) {
      return res.json({
        layout: { photosCount: 4, textOverlays: [`Simulated ${eventType} Event`, new Date().toLocaleDateString()] }
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Suggest a photo strip layout for a ${eventType} event. Include number of photos (2, 3, 4, or 6) and suggested text overlays. Return as JSON.`,
        config: {
          responseMimeType: "application/json",
        }
      });
      res.json({ layout: JSON.parse(response.text || "{}") });
    } catch (error: any) {
      console.error("Gemini AI Layout API error:", error);
      res.status(500).json({ error: "Failed to suggest AI layout.", details: error.message });
    }
  });

  // --- Vite Middleware (Development vs Production) ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`===================================================`);
    console.log(`🚀 Server successfully launched on http://localhost:${PORT}`);
    console.log(`⚙️  Running in ${process.env.NODE_ENV !== "production" ? "development" : "production"} mode`);
    console.log(`===================================================`);
  });
}

startServer();
