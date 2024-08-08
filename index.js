const express = require("express");
const cors = require("cors");
const imageDownloader = require("image-downloader");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const User = require("./models/Users.js");
const Service = require("./models/Service.js");
const Booking = require("./models/Booking.js");
const bcrypt = require("bcrypt");
const multer = require("multer");
const fs = require("fs");
require("dotenv").config();
const app = express();

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = "abcdefgh";

app.use(cors({
  origin:"https://exquisite-mousse-7a4519.netlify.app"
}));

app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));
app.use(express.json());

function getUserDataFromReq(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      resolve(userData);
    });
  });
}
app.get("/test", (req, res) => {
  mongoose.connect(process.env.MONGO_URL).catch((error) => {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  });
  res.json({ message: "Hello World!" });
});

app.post("/register", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log("mongoose connected!");
  const { name, email, password } = req.body;
  try {
    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(userDoc);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});
app.post("/login", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log("mongoose connected");
  const { email, password } = req.body;
  const userDoc = await User.findOne({ email });
  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign(
        { email: userDoc.email, _id: userDoc._id, name: userDoc.name },
        jwtSecret,
        {},
        (err, token) => {
          if (err) throw err;
          res.cookie("token", token).json(userDoc);
        }
      );
    } else {
      res.status(422).json("invalid password");
    }
  } else {
    res.json("not found");
  }
});
app.get("/profile", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log("mongoose connected");
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      let { name, email, _id } = await User.findById(userData._id).exec();
      res.json({ name, email, _id });
    });
  } else {
    res.json(null);
  }
});

app.post("/logout", (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log("mongoose connected");
  res.cookie("token", "").json(true);
});
app.post("/upload-by-link", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log("mongoose connected");
  const { link } = req.body;
  const newName = "photo" + Date.now() + ".jpg";
  await imageDownloader.image({
    url: link,
    dest: __dirname + "/uploads/" + newName,
  });
  res.json(newName);
});

const photosMiddleware = multer({ dest: "uploads" });
app.post("/upload", photosMiddleware.array("photos", 100), (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log("mongoose connected");
  const uploadedFiles = [];
  for (let i = 0; i < req.files.length; i++) {
    const { path, originalname } = req.files[i];
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    const newPath = path + "." + ext;
    fs.renameSync(path, newPath);
    uploadedFiles.push(newPath.replace("uploads", ""));
  }
  res.json(uploadedFiles);
});

app.post("/services", (req, res) => {
  try {
    mongoose.connect(process.env.MONGO_URL);
    const { token } = req.cookies;
    const {
      name,
      address,
      addedPhotos,
      description,
      perks,
      checkIn,
      checkOut,
      price,
    } = req.body;

    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        console.error("JWT verification error:", err);
        return res.status(401).json({ error: "Unauthorized" });
      }
      const serviceDoc = await Service.create({
        name,
        address,
        photos: addedPhotos,
        description,
        perks,
        checkIn,
        checkOut,
        price,
        owner: userData._id,
      });
      console.log(serviceDoc.owner);
      res.json(serviceDoc);
    });
  } catch (error) {
    console.error("Error in POST /services:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/user-services", (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log("mongoose connected");
  const { token } = req.cookies;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const { _id } = userData;
    res.json(await Service.find({ owner: _id }));
  });
});
app.get("/services/:_id", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log("mongoose connected");
  const { _id } = req.params;
  res.json(await Service.findById(_id));
});
app.put("/services", async (req, res) => {
  try {
    mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const { token } = req.cookies;
    const {
      _id,
      name,
      address,
      addedPhotos,
      description,
      perks,
      checkIn,
      checkOut,
      price,
    } = req.body;

    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        console.error("JWT verification error:", err);
        return res.status(401).json({ error: "Unauthorized" });
      }

      const serviceDoc = await Service.findById(_id);
      console.log(userData._id);
      console.log(serviceDoc);
      if (!serviceDoc) {
        return res.status(404).json({ error: "Service not found" });
      }

      if (userData._id === serviceDoc.owner) {
        serviceDoc.set({
          name,
          address,
          photos: addedPhotos,
          description,
          perks,
          checkIn,
          checkOut,
          price,
        });
        await serviceDoc.save();
        res.json("ok");
      } else {
        res.status(403).json({ error: "Forbidden" });
      }
    });
  } catch (error) {
    console.error("Error in PUT /services:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/services", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  res.json(await Service.find());
});

app.post("/bookings", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const userData = await getUserDataFromReq(req);
  const { service, checkIn, checkOut, name, phone, price } = req.body;

  Booking.create({
    service,
    checkIn,
    checkOut,
    name,
    phone,
    price,
    user: userData._id,
  })
    .then((doc) => {
      res.json(doc);
    })
    .catch((err) => {
      throw err;
    });
});

app.get("/bookings", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const userData = await getUserDataFromReq(req);
  res.json(await Booking.find({ user: userData._id }).populate("service"));
});

app.listen(4000, () => {
  console.log("Server is running on port 4000");
});
