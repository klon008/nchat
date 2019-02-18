const _ = require('lodash');
const express = require('express');                       // Подключаем express*/
const app = express();                                    //Подключаем Express (middleware)
const server = require('http').Server(app);               // Подключаем http через app
const Session = require('express-session');
const io = require('socket.io')(server);                  // Подключаем socket.io и указываем на сервер
const bodyParser = require('body-parser');
const sharedsession = require("express-socket.io-session"); //сессии для вебсокетов
const favicon = require('express-favicon');


const redis = require('redis');                           //Подключаем модуль взаимодействия с Redis
const redisStore = require('connect-redis')(Session);     //Модуль для работы с сессиями в redis
const session = Session({
    secret: 'secret',
    store: new redisStore(),
    resave: true,
    saveUninitialized: true
});


var redisClient = new redis.createClient(); //Настройки Redis
var dbStore = new redisStore({client: redisClient});

app.set('view engine', 'ejs');

redisClient.on('error', function (err) {                  //Обработчик ошибок Redis
    console.log("Error: " + err);
});

var story = [];                                         //Массив хранящий историю переписки
var users = [];                                         //Масив хранящий пользователей в онлайне
var usersHash = [];                                     //Массив хранящий соответствие сокетов и пользователей
var usersAndRooms = {
    'no-room': []
};
var removeFromAllroomsByUserId = function (uid) {
    for (var room in usersAndRooms) {
        for (var i = 0; i < room.length; i++) {
            if (usersAndRooms[room][i] && usersAndRooms[room][i]['uid'] == uid) {
                usersAndRooms[room].splice(i, 1);
            }
        }
    }
};

class mUser {
    constructor(uid, uname, socket) {
        this.uid = uid;
        this.uname = uname;
        this.socked = socket || null
    }

    findInLogins() {
        for (var room in usersAndRooms) {
            for (var i = 0; i < room.length; i++) {
                if (usersAndRooms[room][i] && usersAndRooms[room][i]['uid'] == this.uid) {
                    return {room: room, index: i};
                    break;
                }
            }
        }
        return false;
    }
}

//Вытаскиваем последние 30 записей
redisClient.lrange("server:rooms:no-room:messages", 0, -1, function (err, items) {
    if (err) throw err;
    story = items;
});

//Обработчик сообщений к redis
redisClient.on("message", function (channel, message) {
    if (channel === "newMsg") {
        story.push(message);    //Добавляем в массив sroty(история переписок) сообщение
    }
});
//Подписываемся на события newMsg для Redis
//очень важная составляющая управления бд из разных подключенных источников
//Через sub/pub осуществляется написание триггеров
redisClient.subscribe("newMsg");

app.use(session);
app.use(favicon(__dirname + '/public/img/favicon.ico'));
io.use(
    sharedsession(session, {
        autoSave: true
    })
);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

//Обработка гет запроса к корню сайта
app.get('/', function (req, res) {
    //Если по сессии мы залогинены
    if (req && req.session && req.session["uid"]) {
        var redisClient = new redis.createClient(6379, '127.0.0.1');
        redisClient.get('server:acess:' + req.session["uid"], (err, v) => {
            res.render('chat', {uname: req.session["uname"], acess: v});
        });


    } else {
        res.redirect("/login");
    }
});
app.get('/logout', function (req, res) {
    removeFromAllroomsByUserId(req.session.uid);
    req.session.destroy();
    res.redirect("/login");
});
//подключаем статическое содержимое папки public и подключаем модули для работы с сессиями
app.use(express.static(__dirname + '/public'));

//Гет запрос к адресу /reg (регистрация)
app.post('/reg', (request, response) => {
    var redisClient;
    if (!request.body) {
        response.sendFile(__dirname + '/public/reg.html');
    }
    redisClient = new redis.createClient(6379, '127.0.0.1');
    redisClient.incr('server:users_id');
    redisClient.get('server:users_id', function (err, id) {
        var uuname = request.body.name;
        console.log(uuname);
        redisClient.set('server:user:' + id, JSON.stringify({
            name: request.body.name,
            password: request.body.password,
            email: request.body.email
        }));
        redisClient.hmset('server:lookup:name', uuname, id);

        var userm = new mUser(request.session.uid, request.session.uanme, null);
        usersAndRooms['no-room'].push(userm);
        redisClient.set('server:acess:' + id, "{\"c\":1,\"r\":1,\"u\":0,\"d\":0}", function (err, res) {
            request.session.uname = uuname;
            request.session.uid = id;
            response.redirect("/");
            redisClient.unref();
        });
    });


});
app.get('/reg', function (req, res) {
    res.sendFile(__dirname + '/public/reg.html');
});
//Гет запрос к адресу /reg (регистрация)

app.post('/login', (request, response, next) => {
    if (!request.body) return response.sendStatus(400);
    var redisClient = new redis.createClient(6379, '127.0.0.1');
    var getUser = function (err, val) {

        var user_obj = JSON.parse(val);

        if (user_obj["password"] === request.body.password) {

            request.session.uname = user_obj.name;


            var userm = new mUser(request.session.uid, user_obj.name, null);
            var alrdyLogged = userm.findInLogins();

            if (!alrdyLogged) {
                usersAndRooms['no-room'].push(userm);
            } else {
                response.render('error', {errorMsg: "Такой пользователь уже Авторизован в комнате " + alrdyLogged["room"] + " !"});
                next();
                return;
            }

        }
        else {
            request.session.uid = null;
            response.render('error', {errorMsg: "Неверный пароль"});
            next();
            return;
        }
        response.redirect("/");
        redisClient.unref();

    };
    var getUserId = function (err, val) {

        var id = val;
        if (!id) {
            response.render('error', {errorMsg: "Такого пользователя не существует"});
            next();
            return;
        }
        request.session.uid = id;
        redisClient.get("server:user:" + id, getUser);

    };
    redisClient.hget("server:lookup:name", request.body.name, getUserId);
});
app.get('/login', (request, response, next) => {
    response.sendFile(__dirname + '/public/login.html');
});
app.get('/error', (request, response, next) => {
    response.render('error', {errorMsg: 'Произошла непредвиденная ошибка!'});
});

//подхватываем событие вебсокета "connection"
io.on('connection', socket => {
    var publisher = redis.createClient(6379, '127.0.0.1');
    var room = 'no-room';
    var uname = null;
    var uid = null;
    var acess = null;
    var curMUser = null;

    socket.on('room', function(in_room) {
        socket.join(in_room);
        room = in_room;
    });
    console.log(socket.handshake.session.uname);
    console.log(socket.handshake.session.uid);
    if (socket.handshake.session.uname && socket.handshake.session.uid) {
        uname = socket.handshake.session.uname;
        uid = socket.handshake.session.uid;
        var userm = new mUser(uid, uname, null);
        var alrdyLogged = userm.findInLogins();

        if (!alrdyLogged) {
            usersAndRooms['no-room'].push(userm);
        } else if (!userm.room) {
            userm.room = room;
        }
        publisher.get("server:acess:" + uid, (err, msg) => {
            acess = JSON.parse(msg);
            if (!acess.r || acess.r === 0) {
                socket.emit('errorAndGoToLogin', 'Вы были забанены или у вас нет прав на чтение чата');
                delete socket.handshake.session;
                socket.disconnect();
            } else {
                curMUser = new mUser(uid,uname, null);
                socket.emit('userGetName', {myname: name, users: usersAndRooms[room]});
                socket.emit("loadHistory", story);
                socket.broadcast.in(room).emit('newUser', uname);
                //users.push(uname);
                usersHash.push({name: uname, socket: socket.id});
            }
        });
    } else {
        socket.emit('errorAndGoToLogin', 'вы не авторизованы, соединение автоматически разорвано');
        socket.disconnect();
    }

    var name = uname;

    socket.on('message', function (msg) {
        if (msg[0] === "/") {
            msg_cmd = msg.split(' ');
            if (msg_cmd[0] && msg_cmd[0] === '/rename') {
                var oldName = name;
                var newName = msg_cmd[1];
                if (oldName === newName) {
                    socket.emit('sysMsg', "Старое имя соответсвует новому");
                }
                socket.emit('sysMsgRenameMe', newName);
                socket.in(room).broadcast.emit('sysMsgUserRename', {oldName: oldName, newName: newName});
                var index = users.indexOf(oldName);

                if (~index) {
                    users[index] = newName;
                }
                usersHash = usersHash.map(function (item) {
                    if (item.name === oldName) item.name = newName;
                    return item;
                });
                name = newName;
            }
            if (msg_cmd[0] && msg_cmd[0] === '/room') {
                socket.broadcast.in(room).emit('sysMsg', "Пользователь " + uname + "покинул канал");
                removeFromAllroomsByUserId(uid);
                (usersAndRooms[msg_cmd[1]] = usersAndRooms[msg_cmd[1]] || []);
                usersAndRooms[msg_cmd[1]].push(curMUser);
                socket.broadcast.in(room).emit('refreshUsersInRoom', usersAndRooms[room]);
                socket.leave(room);
                room = msg_cmd[1];
                socket.join(room);
                publisher.lrange("server:rooms:"+room+":messages", 0, -1, function (err, items) {
                    if (err) throw err;
                    story = items;
                    socket.emit("loadHistory", story);
                    socket.emit('sysMsg', "Вы вошли в комнату" + msg_cmd[1]);
                    socket.emit('refreshUsersInRoom', usersAndRooms[room]);
                });
                socket.broadcast.in(room).emit('refreshUsersInRoom', usersAndRooms[room]);
            }
            if (msg_cmd[0] && msg_cmd[0] === '/myroom') {
                socket.emit('sysMsg', "Вы в комнате "+room);
            } else {
                socket.emit('sysMsg', "Неизвестная команда");
            }

        } else if (msg.length > 0) {
            if (acess.c) {
                msg = _.escape(msg);
                var time = new Date().getTime();
                io.sockets.in(room).emit('messageToClients', msg, name, time);
                var msgC = JSON.stringify({"t": new Date().valueOf(), "n": name, "m": msg});
                publisher.rpush('server:rooms:'+room+':messages', msgC, redis.print);
                publisher.publish("newMsg", msgC);
            }
        }
    });

    socket.on('disconnect', function () {
        socket.broadcast.in(room).emit('userLeaveName', name);

        var idx = users.indexOf(name);
        if (idx !== -1) {
            users.splice(idx, 1);
        }
        publisher.quit();
    });

    socket.on('typing', function (data) {
        socket.broadcast.in(room).emit('typing', name);
    });
    socket.on('change_message', function (data) {
        if (acess.u) {
            var msg_val = data["msg"];
            var time_val = data["time"];
            var user_val = data["user"];
            var new_msg_val = data["new_msg"];
            var msgCa = JSON.stringify({"t": new Date(time_val).valueOf(), "n": user_val, "m": msg_val});
            publisher.lrange('server:rooms:'+room+':messages', 0, -1, function (err, data) {
                for (var i = data.length - 1; i >= 0; i--) {
                    var item = data[i];

                    if (item === msgCa) {
                        var msgCNW = JSON.stringify({
                            "t": new Date(time_val).valueOf(),
                            "n": user_val,
                            "m": new_msg_val
                        });
                        publisher.lset('server:rooms:'+room+':messages', i, msgCNW, function (err, res) {
                            publisher.lrange("server:rooms:"+room+":messages", 0, -1, function (err, items) {
                                if (err) throw err;
                                story = items;
                                io.sockets.in(room).emit("loadHistory", story);
                            });
                        });
                        break;
                    }
                }
            });
        }
    });
    socket.on('delete_message', function (data) {
        if (acess.d) {
            var msg_val = data["msg"];
            var time_val = data["time"];
            var user_val = data["user"];
            var msgC = JSON.stringify({"t": new Date(time_val).valueOf(), "n": user_val, "m": msg_val});
            publisher.lrem('server:rooms:'+room+':messages', 0, msgC, function (err, data) {
                publisher.lrange("server:rooms:"+room+":messages", 0, -1, function (err, items) {
                    if (err) throw err;
                    story = items;
                    io.sockets.in(room).emit("loadHistory", story);
                });
            });
            io.sockets.in(room).emit('message_deleted', data);
        }
    });
});

function broadcastSysMsg(msg) {

}

process.on("exit", function () {
    redisClient.quit();
});

var port = 3000; // Порт который будет слушать сервер node.js
server.listen(port); // Теперь мы можем подключиться к нашему серверу через localhost:3000 при запущенном скрипте