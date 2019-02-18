var http = require('http');
var fs = require('fs');
var server_mm = http.createServer(function (req, res){
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
}
  );
server_mm.listen(3000);
console.log('Server running at http://localhost:3000/');
