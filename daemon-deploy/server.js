const fs = require("fs");
const http = require("http");

const HOST = "0.0.0.0";
const PORT = 9000;

// Get OUTPUT from file 'output.txt'
const OUTPUT = fs.readFileSync("output.txt", "utf8");

http
  .createServer(function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(OUTPUT);
  })
  .listen(PORT, HOST);

console.log(`Server running at http://${HOST}:${PORT}/`);
