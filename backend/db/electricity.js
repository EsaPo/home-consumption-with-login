// db/electricity.js
const express = require('express');
const router = express.Router();
const db = require('./dbconfig');

// ── Ensure mittarinvaihto columns exist (safe migration) ──────────────────────
db.run(`ALTER TABLE sahko ADD COLUMN mittarinvaihto INTEGER DEFAULT 0`, () => {});
db.run(`ALTER TABLE sahko ADD COLUMN vanha_lukema REAL`, () => {});

// Recreate view to handle mittarinvaihto in consumption calculation
db.run('DROP VIEW IF EXISTS sahko_with_consumption', () => {
  db.run(`
    CREATE VIEW sahko_with_consumption AS
    SELECT
      current.*,
      CASE
        WHEN current.mittarinvaihto = 1 AND current.vanha_lukema IS NOT NULL
          THEN COALESCE(current.vanha_lukema - prev.sahkolukema, 0) + current.sahkolukema
        ELSE COALESCE(current.sahkolukema - prev.sahkolukema, 0)
      END as kulutus_sahko
    FROM (
      SELECT l.* FROM sahko l
      INNER JOIN (
        SELECT kiinteistotunnus, vuosi, kuukausi_num, MAX(id) as latest_id
        FROM sahko GROUP BY kiinteistotunnus, vuosi, kuukausi_num
      ) latest ON (
        l.kiinteistotunnus = latest.kiinteistotunnus
        AND l.vuosi = latest.vuosi
        AND l.kuukausi_num = latest.kuukausi_num
        AND l.id = latest.latest_id
      )
    ) current
    LEFT JOIN (
      SELECT l.* FROM sahko l
      INNER JOIN (
        SELECT kiinteistotunnus, vuosi, kuukausi_num, MAX(id) as latest_id
        FROM sahko GROUP BY kiinteistotunnus, vuosi, kuukausi_num
      ) latest ON (
        l.kiinteistotunnus = latest.kiinteistotunnus
        AND l.vuosi = latest.vuosi
        AND l.kuukausi_num = latest.kuukausi_num
        AND l.id = latest.latest_id
      )
    ) prev ON (
      current.kiinteistotunnus = prev.kiinteistotunnus AND (
        (current.vuosi = prev.vuosi AND current.kuukausi_num = prev.kuukausi_num + 1) OR
        (current.vuosi = prev.vuosi + 1 AND current.kuukausi_num = 1 AND prev.kuukausi_num = 12)
      )
    )
    ORDER BY current.kiinteistotunnus, current.vuosi, current.kuukausi_num
  `, (err) => {
    if (err) console.error('Error recreating sahko view:', err.message);
    else console.log('sahko_with_consumption view updated with mittarinvaihto support.');
  });
});

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const query = `
    SELECT l.*, k.kiinteisto, k.osoite, k.omistajanimi
    FROM sahko_with_consumption l
    LEFT JOIN kiinteisto k ON l.kiinteistotunnus = k.kiinteistotunnus
    ORDER BY lukemapva DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error', details: err.message });

    const transformed = rows.map(row => ({
      id:               row.id,
      kiinteistotunnus: row.kiinteistotunnus,
      kiinteisto:       row.kiinteisto,
      osoite:           row.osoite,
      omistajanimi:     row.omistajanimi,
      vuosi:            row.vuosi,
      kuukausi:         row.kuukausi,
      kuukausi_num:     row.kuukausi_num,
      lukemapva:        row.lukemapva,
      sahkolukema:      parseFloat(row.sahkolukema).toFixed(0),
      kulutus_sahko:    parseFloat(row.kulutus_sahko || 0).toFixed(0),
      mittarinvaihto:   row.mittarinvaihto || 0,
      vanha_lukema:     row.vanha_lukema,
      muuta:            row.muuta,
    }));

    res.json(transformed);
  });
});

// ── POST / ────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { kiinteistotunnus, vuosi, kuukausi, lukemapva,
          sahkolukema, mittarinvaihto, vanha_lukema, muuta } = req.body;

  if (!kiinteistotunnus || !vuosi || !kuukausi || !lukemapva || sahkolukema === undefined) {
    return res.status(400).json({ error: 'Pakolliset kentät puuttuvat.' });
  }

  if (mittarinvaihto && (vanha_lukema === undefined || vanha_lukema === null || vanha_lukema === '')) {
    return res.status(400).json({ error: 'Mittarinvaihdossa vanhan mittarin lukema on pakollinen.' });
  }

  db.run(
    `INSERT INTO sahko (kiinteistotunnus, vuosi, kuukausi, lukemapva,
      sahkolukema, mittarinvaihto, vanha_lukema, muuta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [kiinteistotunnus, vuosi, kuukausi, lukemapva,
     sahkolukema, mittarinvaihto ? 1 : 0,
     mittarinvaihto ? vanha_lukema : null, muuta],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM sahko WHERE id = ?', [this.lastID], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json(row);
      });
    }
  );
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { kiinteistotunnus, vuosi, kuukausi, lukemapva,
          sahkolukema, mittarinvaihto, vanha_lukema, muuta } = req.body;

  if (mittarinvaihto && (vanha_lukema === undefined || vanha_lukema === null || vanha_lukema === '')) {
    return res.status(400).json({ error: 'Mittarinvaihdossa vanhan mittarin lukema on pakollinen.' });
  }

  db.run(
    `UPDATE sahko SET
      kiinteistotunnus = ?, vuosi = ?, kuukausi = ?, lukemapva = ?,
      sahkolukema = ?, mittarinvaihto = ?, vanha_lukema = ?, muuta = ?
     WHERE id = ?`,
    [kiinteistotunnus, vuosi, kuukausi, lukemapva,
     sahkolukema, mittarinvaihto ? 1 : 0,
     mittarinvaihto ? vanha_lukema : null,
     muuta, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to update electricity data' });
      if (this.changes === 0) return res.status(404).json({ error: 'Electricity data not found' });
      db.get('SELECT * FROM sahko WHERE id = ?', [req.params.id], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ message: 'Electricity updated successfully', data: row });
      });
    }
  );
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM sahko WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete electricity data' });
    if (this.changes === 0) return res.status(404).json({ error: 'Electricity data not found' });
    res.json({ message: 'Electricity data deleted successfully', id: req.params.id });
  });
});

module.exports = router;
