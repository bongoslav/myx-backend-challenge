const express = require("express");
const multer = require("multer");
const ExifParser = require("exif-parser");
const sqlite3 = require("sqlite3").verbose();
const imageThumbnail = require("image-thumbnail");

const app = express();

app.use(express.urlencoded({ extended: true }));

const port = 3000;

// connecting to db
const db = new sqlite3.Database("database.sqlite");
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS images_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
          originalName TEXT NOT NULL,
          latitude FLOAT,
          longitude FLOAT,
          image BLOB
          )`,
    (err) => {
      if (err) {
        throw err;
      }
    }
  );
});

// setup multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
});

// routes
app.get("/images", (req, res) => {
  const maxLat = req.query.maxLat;
  const minLat = req.query.minLat;
  const maxLong = req.query.maxLong;
  const minLong = req.query.minLong;

  const query = `SELECT
  id, originalName, latitude, longitude
  FROM images_info WHERE
  latitude BETWEEN ? AND ? AND
  longitude BETWEEN ? AND ? ;`;

  db.all(query, [minLat, maxLat, minLong, maxLong], (err, rows) => {
    if (err) {
      throw err;
    }
    if (rows.length === 0) {
      return res.status(404).json({ message: "No images found." });
    }
    res.status(200).json(rows);
  });
});

app.get("/images/:id/:thumbnail?", async (req, res) => {
  id = req.params.id;
  let thumbnail;
  const thumbnailOptions = { width: 256, height: 256 };

  const query =
    "SELECT id, originalName, latitude, longitude, image FROM images_info WHERE id = ?";
  db.get(query, id, async (err, row) => {
    if (err) {
      throw err;
    }
    if (row === undefined) {
      return res.status(404).json({ message: `No image found with id: ${id}` });
    }

    if (req.params.thumbnail) {
      try {
        thumbnail = await imageThumbnail(row.image, thumbnailOptions);
      } catch (err) {
        throw err;
      }
      return res.header("Content-Type", "image/jpeg").send(thumbnail);
    }

    // returning images' data, not the images themselves
    res.status(200).json({
      id: row.id,
      originalName: row.originalName,
      latitude: row.latitude,
      longitude: row.longitude,
    });
  });
});

app.post("/upload", upload.single("image"), (req, res) => {
  const { buffer, originalname } = req.file;
  let exif;
  let latitude = null;
  let longitude = null;

  // get lat/long
  const parser = ExifParser.create(buffer);
  try {
    exifData = parser.parse();
    latitude = exifData["tags"]["GPSLatitude"];
    longitude = exifData["tags"]["GPSLongitude"];
  } catch (err) {
    console.log("exif parse error: " + err.message);
  }

  const query =
    "INSERT INTO images_info (originalName, latitude, longitude, image) VALUES(?, ?, ?, ?);";

  db.run(query, [originalname, latitude, longitude, buffer], (err, row) => {
    if (err) {
      throw err;
    }
    res
      .status(201)
      .json({ message: `Image ${originalname} has been uploaded` });
  });
});

app.delete("/images/:id", (req, res) => {
  const id = req.params.id;

  const query = "DELETE FROM images_info WHERE id = ?";
  db.run(query, id, (err) => {
    if (err) {
      throw err;
    }
  });
  return res
    .status(200)
    .json(`Image with id: ${id} has been deleted if such ID exists.`);
});

app.get("/all-images-info", (req, res) => {
  db.all(
    "SELECT id, originalName, latitude, longitude FROM images_info;",
    (err, rows) => {
      if (err) {
        throw err;
      }
      if (rows.length === 0) {
        res.status(404).json("No images found.");
        return;
      }
      res.send(rows);
    }
  );
});

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});

// closing the db after termination
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.log("DB CLOSE ERROR: " + err);
    } else {
      console.log("Closed database connection");
    }
    process.exit(0);
  });
});
