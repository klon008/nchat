var port = 3000; // Указываем порт на котором у на стоит сокет
var socket = io.connect('/');
var $ = jQuery;
var intervalTyping = 7000;
var myName = '';
var usersTyping = [];
var currCliTyping = false;
var cliTypingTimeout;
var allusers = [];
var room = "no-room";
socket.on('disconnect', function () {
    location.reload();
});
socket.on('loadHistory', function (data) {
    $("#chat_box").text("");
    data.forEach(function (item) {
        var msgObjParsed = JSON.parse(item);
        var date = msgObjParsed.t;
        addUsersMessageToChat(date, msgObjParsed.n, msgObjParsed.m)
    });
});
socket.on('connect', function() {
    socket.emit('room', room);
});



socket.on('userGetName', function (data) {
    var userName = data.myname;
    myName = data.myname;
    allusers = data.users;
    addSysMessageToChat('Вам присвоено Имя - ' + userName);
    for (var i = 0; i < allusers.length; i++) {
        if (myName !== allusers[i]['uname'])
        $('#users_list').append('<div class="user" data-username="' + allusers[i]['uname'] + '"><img src="img/user-ava.png"><div class="info"><div class="user_name">' + allusers[i]['uname'] + '</div><div class="status"></div></div></div>');
    }
});
socket.on('refreshUsersInRoom', function (data) {
    allusers = data;
    $(".user:not(.my_user)").remove();
    for (var i = 0; i < allusers.length; i++) {
        if (myName !== allusers[i]['uname'])
            $('#users_list').append('<div class="user" data-username="' + allusers[i]['uname'] + '"><img src="img/user-ava.png"><div class="info"><div class="user_name">' + allusers[i]['uname'] + '</div><div class="status"></div></div></div>');
    }
});
socket.on('sysMsg', function (data) {
    addSysMessageToChat(data);
});

socket.on('sysMsgRenameMe', function (data) {
    addSysMessageToChat("Имя изменено на " + data);
    renameUser(myName, data);
    myName = data;
});
socket.on('errorAndGoToLogin', function (e) {
    alert(e);
    socket.disconnect();
    window.location.href = "/logout";
});
socket.on('sysMsgUserRename', function (data) {
    var oldName = data.oldName;
    var newName = data.newName;
    addSysMessageToChat("Пользователь " + oldName + " изменил имя на " + newName);
    renameUser(oldName, newName);
});

function renameUser(oldName, newName) {
    var index = allusers.indexOf(oldName);

    if (~index) {
        allusers[index] = newName;
    }
    $('.user[data-username="' + oldName + '"]').attr('data-username', newName).find('.user_name').text(newName);
}

socket.on('newUser', function (userName) {
    addSysMessageToChat(userName + ' Присоединился!');
    $('#users_list').append('<div class="user" data-username="' + userName + '"><img src="img/user-ava.png"><div class="info"><div class="user_name">' + userName + '</div><div class="status"></div></div></div>');
});



socket.on('messageToClients', function (msg, name, time) {
    removeTypingName(name);
    //var date = new Date(time);
    addUsersMessageToChat(time, name, msg);
});

socket.on('userLeaveName', function (userName) {
    removeTypingName(userName);
    addSysMessageToChat(userName + ' покинул чат.');
    $('#users_list').find('div.user[data-username="' + userName + '"]').remove();
    var idx = allusers.indexOf(userName);
    if (idx !== -1) {
        allusers.splice(idx, 1);
    }
});

socket.on('message_changed', function(data){
    //@FIXME добавить редактирование записи
});
socket.on('message_deleted', function(data){
    //@FIXME добавить редактирование записи
});

$(function () {
    if (v) {
        if (v.c == 0) {
            $("#text_for_sending").prop('disabled', true);
            $("#text_for_sending").prop('placeholder', 'У вас недостаточно прав для отправки сообщений');
        }
    }

    $(".do-nicescrol").niceScroll();
    $('#text_for_sending').keypress(function (e) {
        if (e.keyCode === 13) {
            $("#btn_send").click();
        }
        if (!currCliTyping) {
            socket.emit('typing', 500);
            clearTimeout(cliTypingTimeout);
            cliTypingTimeout = setTimeout(currCliTypingTimeoutFunction, intervalTyping);
            currCliTyping = true;
        } else {

        }

    });
    $("#type_indicator").hide();

    $("#btn_send").on('click', function (e) { // Прослушка кнопки на клик
        var message = $('#text_for_sending').val(); // Все что в поле для ввода записываем в переменную
        socket.emit('message', message); // Отправляем событие 'message' на сервер c самим текстом (message)- как переменная
        $('#text_for_sending').val(null); // Заполняем поле для ввода 'пустотой'
    });

    $("#button_change_msg").on('click', function (e) {
        var val = $("#modal-body .message").text();
        $("#modal-body .message").addClass("d-none");
        $("#modal-body .msg_wrap").append("<textarea id='changed_message'>"+val+"</textarea>");
        $("#button_change_msg_save").removeClass('d-none');
        $("#button_change_msg").addClass('d-none');
    });
    $("#button_change_msg_save").on('click', function (e) {
        var msg_val = $("#changed_message").val();
        var time_val = $("#modal-body .time").data('time');
        var user_val = $("#modal-body .name").text();
        $("#modal-body .message").addClass("d-none");
        var old_val = $("#modal-body .message").text();
        var obj = {
            user: user_val,
            time: time_val,
            msg: old_val,
            new_msg: msg_val
        };
        console.log(obj);
        socket.emit('change_message', obj);
        $('#exampleModalCenter').modal('hide');
    })
    $("#button_del_msg").on('click', function(e){
        var msg_val = $("#modal-body .message").text();
        var time_val = $("#modal-body .time").data('time');
        var user_val = $("#modal-body .name").text();
        var obj = {
            user: user_val,
            time: time_val,
            msg: msg_val
        };
        socket.emit('delete_message', obj);
        $('#exampleModalCenter').modal('hide');
    });
});

function currCliTypingTimeoutFunction() {
    currCliTyping = false;
}


socket.on('typing', function (data) {

    doWriteIndicator(data);

});

function doWriteIndicator(dd) {
    if (usersTyping.indexOf(dd) == -1) {

        usersTyping.push(dd);
        $("#type_indicator").show();

    } else {

        clearTimeout(cliTypingTimeout);
        cliTypingTimeout = setTimeout(currCliTypingTimeoutFunction, intervalTyping);

    }
    $('#typing_names').text(usersTyping.join(' ,'));
    if (usersTyping.length == 1) {
        $('#typing_numbers').text(' Печатает сообщение');
    } else if (usersTyping.length > 1) {
        $('#typing_numbers').text(' Печатают сообщение');
    }
    setTimeout(removeTypingName, intervalTyping + 100, dd);

};

function removeTypingName(dd) {
    if (usersTyping.indexOf(dd) >= 0) {

        usersTyping.splice(usersTyping.indexOf(dd), 1);

        if (usersTyping.length == 1) {
            $('#typing_numbers').text(' Печатает сообщение');
        } else if (usersTyping.length > 1) {
            $('#typing_numbers').text(' Печатают сообщение');
        } else {
            $("#type_indicator").hide();
        }
    }
}

function addSysMessageToChat(msg) {
    $('#chat_box').append('<div class="sys_message"><span>' + msg + '</div>');
    var objDiv = document.getElementById("chat_box");
    objDiv.scrollTop = objDiv.scrollHeight;
}

function addUsersMessageToChat(time, user, msg) {
    var date = new Date(time);
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var seconds = date.getSeconds();
    if (myName !== user) {
        $('#chat_box').append('<div><div class="msg_wrap"><span class="name">' + user +
            '</span><span class="message">' + msg + '</span></div><span class="time" data-time=\"'+time+'\">' + hours + ':' + minutes + ':' + seconds + '</span></div>');
    } else {
        $('#chat_box').append('<div class="myownmessage"><div class="msg_wrap"><span class="name"><b>' + user + '</b></span><span class="message">' + msg + '</span></div><div class="time" data-time=\"'+time+'\">' + hours + ':' + minutes + ':' + seconds + '</div></div>');
    }
    var objDiv = document.getElementById("chat_box");
    objDiv.scrollTop = objDiv.scrollHeight;

    $('.msg_wrap').prop("onclick", null).off("click").on('click', function (e) {
        if (v.u == 1 || v.d == 1) {
            $(".modal-body").html($(e.currentTarget).parent().html());
            $('.modal').modal('show');
            $("#button_change_msg_save").addClass('d-none');
            $("#button_change_msg").removeClass('d-none');
        }
    });
}

