const express = require("express");
const path = require("path");
const expressLayouts = require("express-ejs-layouts");

const freelancerRoutes = require("./routes/freelancerRoutes");
const clientRoutes = require("./routes/clientRoutes");

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(expressLayouts);
app.set("layout", "layout");

app.use(express.urlencoded({ extended: true }));
// serve static assets from the workspace root `public` directory
// note: __dirname refers to `src`, so go up one level
app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, res, next) => {
  res.locals.title = "New Tracking Order";
  next();
});

app.use("/", freelancerRoutes);
app.use("/client", clientRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
